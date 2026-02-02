import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { todayInPT, isSkipEligibleForReimbursement } from '$lib/utils/timezone';
import { sha256, timingSafeEqual } from '$lib/utils/crypto';
import { getEnv, type ServerEnv } from '$lib/server/env';
import Stripe from 'stripe';
import { checkRateLimit } from '$lib/utils/rate-limit';
import { sendEmail } from '$lib/email/send';
import { renderTemplate } from '$lib/email/templates';

// Request-scoped context for clients and env
interface RequestContext {
  supabase: SupabaseClient;
  stripe: Stripe;
  env: ServerEnv;
}

// Session storage for multi-select skip flow (database-backed)
interface SkipSession {
  customer_id: string;
  selected_dates: Set<string>;
  message_id: number;
  expires_at: Date;
}

// Database helpers for skip sessions
async function getSkipSession(ctx: RequestContext, telegramUserId: number): Promise<SkipSession | null> {
  const { data, error } = await ctx.supabase
    .from('telegram_skip_sessions')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (error || !data) {
    return null;
  }

  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    await deleteSkipSession(ctx, telegramUserId);
    return null;
  }

  return {
    customer_id: data.customer_id,
    selected_dates: new Set(data.selected_dates),
    message_id: data.message_id,
    expires_at: new Date(data.expires_at)
  };
}

async function setSkipSession(ctx: RequestContext, telegramUserId: number, session: SkipSession): Promise<void> {
  const { error } = await ctx.supabase
    .from('telegram_skip_sessions')
    .upsert({
      telegram_user_id: telegramUserId,
      customer_id: session.customer_id,
      selected_dates: Array.from(session.selected_dates),
      message_id: session.message_id,
      expires_at: session.expires_at.toISOString(),
      updated_at: new Date().toISOString()
    });

  if (error) {
    console.error('[DB ERROR] Failed to set skip session:', error);
    throw error;
  }
}

async function deleteSkipSession(ctx: RequestContext, telegramUserId: number): Promise<void> {
  const { error } = await ctx.supabase
    .from('telegram_skip_sessions')
    .delete()
    .eq('telegram_user_id', telegramUserId);

  if (error) {
    console.error('[DB ERROR] Failed to delete skip session:', error);
  }
}

// ============================================================================
// TELEGRAM LINK VERIFICATION HELPERS (C1 Security Fix)
// ============================================================================

/**
 * Generate a cryptographically secure 6-digit verification code
 */
function generateVerificationCode(): string {
  // Use crypto.getRandomValues for cryptographic randomness
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  // Generate a 6-digit code (100000-999999)
  const code = 100000 + (array[0] % 900000);
  return code.toString();
}

/**
 * Verification state for pending Telegram link
 */
interface PendingVerification {
  customer_id: string;
  telegram_user_id: number;
  telegram_username: string | null;
  token_hash: string;
  chat_id: number;
  attempts: number;
  max_attempts: number;
  expires_at: Date;
}

/**
 * Get pending verification for a Telegram user
 */
async function getPendingVerification(
  ctx: RequestContext,
  telegramUserId: number
): Promise<PendingVerification | null> {
  const { data, error } = await ctx.supabase
    .from('telegram_link_verifications')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .is('verified_at', null)
    .single();

  if (error || !data) {
    return null;
  }

  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    // Delete expired verification
    await ctx.supabase
      .from('telegram_link_verifications')
      .delete()
      .eq('id', data.id);
    return null;
  }

  // Check if max attempts exceeded
  if (data.attempts >= data.max_attempts) {
    // Delete exhausted verification
    await ctx.supabase
      .from('telegram_link_verifications')
      .delete()
      .eq('id', data.id);
    return null;
  }

  return {
    customer_id: data.customer_id,
    telegram_user_id: data.telegram_user_id,
    telegram_username: data.telegram_username,
    token_hash: data.token_hash,
    chat_id: data.chat_id,
    attempts: data.attempts,
    max_attempts: data.max_attempts,
    expires_at: new Date(data.expires_at)
  };
}

/**
 * Create a pending verification for Telegram account linking
 * Returns the plaintext verification code to send via email
 */
async function createPendingVerification(
  ctx: RequestContext,
  customerId: string,
  telegramUserId: number,
  telegramUsername: string | null,
  tokenHash: string,
  chatId: number
): Promise<string> {
  // Generate 6-digit code
  const code = generateVerificationCode();
  const codeHash = await sha256(code);

  // Delete any existing pending verification for this user
  await ctx.supabase
    .from('telegram_link_verifications')
    .delete()
    .eq('telegram_user_id', telegramUserId);

  // Create new verification record
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  const { error } = await ctx.supabase
    .from('telegram_link_verifications')
    .insert({
      customer_id: customerId,
      telegram_user_id: telegramUserId,
      telegram_username: telegramUsername,
      code_hash: codeHash,
      token_hash: tokenHash,
      chat_id: chatId,
      attempts: 0,
      max_attempts: 3,
      expires_at: expiresAt.toISOString()
    });

  if (error) {
    console.error('[DB ERROR] Failed to create verification:', error);
    throw error;
  }

  return code;
}

/**
 * Verify a code and complete the Telegram link if valid
 * Returns: { success: true, customer_name } on success
 *          { success: false, reason: string } on failure
 */
async function verifyCodeAndLink(
  ctx: RequestContext,
  telegramUserId: number,
  code: string
): Promise<{ success: true; customer_name: string } | { success: false; reason: string; attemptsRemaining?: number }> {
  // Get pending verification
  const { data: verification, error: fetchError } = await ctx.supabase
    .from('telegram_link_verifications')
    .select('*, customers(id, name, email)')
    .eq('telegram_user_id', telegramUserId)
    .is('verified_at', null)
    .single();

  if (fetchError || !verification) {
    return { success: false, reason: 'no_pending_verification' };
  }

  // Check expiration
  if (new Date(verification.expires_at) < new Date()) {
    await ctx.supabase
      .from('telegram_link_verifications')
      .delete()
      .eq('id', verification.id);
    return { success: false, reason: 'code_expired' };
  }

  // Check attempts
  if (verification.attempts >= verification.max_attempts) {
    await ctx.supabase
      .from('telegram_link_verifications')
      .delete()
      .eq('id', verification.id);
    return { success: false, reason: 'max_attempts_exceeded' };
  }

  // Verify code hash
  const codeHash = await sha256(code);
  if (codeHash !== verification.code_hash) {
    // Increment attempt count
    const newAttempts = verification.attempts + 1;
    await ctx.supabase
      .from('telegram_link_verifications')
      .update({ attempts: newAttempts })
      .eq('id', verification.id);

    if (newAttempts >= verification.max_attempts) {
      await ctx.supabase
        .from('telegram_link_verifications')
        .delete()
        .eq('id', verification.id);
      return { success: false, reason: 'max_attempts_exceeded' };
    }

    return {
      success: false,
      reason: 'invalid_code',
      attemptsRemaining: verification.max_attempts - newAttempts
    };
  }

  // Code is valid! Complete the linking process
  const customerId = verification.customer_id;
  const telegramUsername = verification.telegram_username;
  const extractedHandle = telegramUsername ? `@${telegramUsername}` : null;

  // Link the account
  const { error: linkError } = await ctx.supabase
    .from('customers')
    .update({
      telegram_user_id: telegramUserId,
      telegram_handle: extractedHandle
    })
    .eq('id', customerId);

  if (linkError) {
    console.error('[DB ERROR] Failed to link telegram account:', linkError);
    return { success: false, reason: 'link_failed' };
  }

  // Mark token as used
  await ctx.supabase
    .from('telegram_deep_link_tokens')
    .update({ used: true, used_at: new Date().toISOString() })
    .eq('token_hash', verification.token_hash);

  // Update telegram_link_status
  await ctx.supabase
    .from('telegram_link_status')
    .upsert({
      customer_id: customerId,
      is_linked: true,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    });

  // Mark verification as complete
  await ctx.supabase
    .from('telegram_link_verifications')
    .update({ verified_at: new Date().toISOString() })
    .eq('id', verification.id);

  // Log audit event
  await ctx.supabase.from('audit_log').insert({
    actor: `customer:${customerId}`,
    action: 'telegram_linked',
    subject: `customer:${customerId}`,
    metadata: {
      telegram_user_id: telegramUserId,
      telegram_username: telegramUsername,
      telegram_handle: extractedHandle,
      source: 'deep_link_verified'
    }
  });

  // Get customer name for response
  const customerName = verification.customers?.name || 'there';

  return { success: true, customer_name: customerName };
}

interface TelegramUpdate {
  update_id: number;
  message?: TelegramMessage;
  callback_query?: TelegramCallbackQuery;
}

interface TelegramMessage {
  message_id: number;
  from: TelegramUser;
  chat: TelegramChat;
  text?: string;
  entities?: Array<{ offset: number; length: number; type: string }>;
}

interface TelegramCallbackQuery {
  id: string;
  from: TelegramUser;
  message: TelegramMessage;
  data: string;
}

interface TelegramUser {
  id: number;
  first_name: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
}

export const POST: RequestHandler = async (event) => {
  const { request } = event;

  // Get environment (works in both Cloudflare and local dev)
  const env = await getEnv(event);

  // Verify secret token using constant-time comparison to prevent timing attacks
  const secretToken = request.headers.get('x-telegram-bot-api-secret-token');

  if (!secretToken || !timingSafeEqual(secretToken, env.TELEGRAM_SECRET_TOKEN)) {
    console.error('[Telegram Webhook] Unauthorized request rejected');
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  // Create request-scoped context with clients
  const ctx: RequestContext = {
    env,
    supabase: createClient(PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY),
    stripe: new Stripe(env.STRIPE_SECRET_KEY, {
      apiVersion: '2025-12-15.clover',
      typescript: true
    })
  };

  const update: TelegramUpdate = await request.json();

  try {
    if (update.message) {
      await handleMessage(ctx, update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(ctx, update.callback_query);
    }

    return json({ ok: true });
  } catch (error) {
    console.error('[Telegram Webhook] Error processing update:', error);
    // Return 200 even on error to prevent Telegram from retrying
    // The error is logged, but we acknowledge receipt to avoid retry loops
    return json({ ok: true });
  }
};

async function handleMessage(ctx: RequestContext, message: TelegramMessage) {
  const text = message.text || '';
  const chatId = message.chat.id;
  const telegramUserId = message.from.id;

  // Auto-update telegram_handle if username changed (EC-5)
  // Rate-limited to once per hour per user to prevent excessive DB queries
  // Username changes are rare (maybe once per user per year), so this is sufficient
  if (message.from.id && message.from.username) {
    // Check rate limit: only sync handle once per hour (60 minutes)
    const rateLimitResult = await checkRateLimit(ctx.supabase, {
      key: `handle_check:${telegramUserId}`,
      maxRequests: 1,
      windowMinutes: 60
    });

    if (rateLimitResult.allowed) {
      const currentUsername = message.from.username;
      const currentHandle = `@${currentUsername}`;

      // Check if user is linked and if handle differs
      const { data: customer } = await ctx.supabase
        .from('customers')
        .select('id, telegram_handle, dietary_flags, allergies')
        .eq('telegram_user_id', telegramUserId)
        .single();

      // Update handle only if: 1) customer is linked, and 2) handle has changed
      if (customer && customer.telegram_handle !== currentHandle) {
        const { error: updateError } = await ctx.supabase
          .from('customers')
          .update({ telegram_handle: currentHandle })
          .eq('id', customer.id);

        if (updateError) {
          console.error('[Telegram] Failed to update telegram_handle:', {
            customer_id: customer.id,
            error: updateError
          });
        } else {
          console.log('[Telegram] Auto-updated telegram_handle for customer:', customer.id);

          // Log audit event
          await ctx.supabase.from('audit_log').insert({
            actor: `customer:${customer.id}`,
            action: 'telegram_handle_updated',
            subject: `customer:${customer.id}`,
            metadata: {
              old_handle: customer.telegram_handle,
              new_handle: currentHandle,
              source: 'auto_sync'
            }
          });
        }
      } else if (customer) {
        // Customer found but handle unchanged - log at debug level
        console.log('[Telegram] Handle check: no change needed for customer:', customer.id);
      }
    } else {
      // Rate limited - skip check silently
      // Next check will be available at: rateLimitResult.resetAt
      console.log('[Telegram] Handle check rate-limited, next check at:', rateLimitResult.resetAt);
    }
  }

  // Check if it's a command
  const isCommand = message.entities?.some(e => e.type === 'bot_command');

  if (isCommand) {
    const command = text.split(' ')[0].toLowerCase();

    switch (command) {
      case '/start':
        await handleStartCommand(ctx, message);
        break;
      case '/diet':
        await handleDietCommand(ctx, chatId);
        break;
      case '/skip':
        await handleSkipCommand(ctx, chatId);
        break;
      case '/status':
        await handleStatusCommand(ctx, chatId);
        break;
      case '/billing':
        await handleBillingCommand(ctx, chatId);
        break;
      case '/help':
        await handleHelpCommand(ctx, chatId);
        break;
      case '/undo':
        await handleUndoCommand(ctx, chatId);
        break;
      case '/unskip':
        await handleUnskipCommand(ctx, chatId);
        break;
      case '/resend':
        await handleResendCommand(ctx, chatId, telegramUserId);
        break;
      default:
        await sendMessage(ctx, chatId, 'Not sure what that is. Try /help to see what\'s available.');
    }
  } else {
    // C1 Security Fix: Check if this is a verification code (6 digits)
    const trimmedText = text.trim();
    const isVerificationCode = /^\d{6}$/.test(trimmedText);

    if (isVerificationCode) {
      await handleVerificationCode(ctx, chatId, telegramUserId, trimmedText, message.from.username);
    } else {
      // UX-2: Check for abandoned onboarding when user sends non-command message
      await checkAbandonedOnboarding(ctx, chatId, telegramUserId);
    }
  }
}

/**
 * Handle verification code input for Telegram account linking (C1 Security Fix)
 */
async function handleVerificationCode(
  ctx: RequestContext,
  chatId: number,
  telegramUserId: number,
  code: string,
  telegramUsername: string | undefined
) {
  // C3/C4: Don't log telegram_user_id (PII)
  console.log('[Telegram] Verification code received');

  const result = await verifyCodeAndLink(ctx, telegramUserId, code);

  if (result.success) {
    console.log('[Telegram] Verification successful, account linked');
    // Send onboarding - diet selection (same as before)
    await sendDietSelectionKeyboard(ctx, chatId);
    return;
  }

  // Handle different failure reasons (result.success is false here)
  const failureResult = result as { success: false; reason: string; attemptsRemaining?: number };

  switch (failureResult.reason) {
    case 'no_pending_verification':
      await sendMessage(
        ctx,
        chatId,
        'No pending verification found.\n\n' +
        'If you\'re trying to connect your account, click the link in your welcome email first.'
      );
      break;
    case 'code_expired':
      await sendMessage(
        ctx,
        chatId,
        'That code has expired.\n\n' +
        'Click the link in your welcome email to get a new verification code.'
      );
      break;
    case 'max_attempts_exceeded':
      await sendMessage(
        ctx,
        chatId,
        'Too many incorrect attempts.\n\n' +
        'Click the link in your welcome email to get a new verification code.'
      );
      break;
    case 'invalid_code': {
      const attemptsLeft = failureResult.attemptsRemaining || 0;
      await sendMessage(
        ctx,
        chatId,
        `That code isn't right.\n\n` +
        `You have ${attemptsLeft} attempt${attemptsLeft === 1 ? '' : 's'} remaining. ` +
        `Check your email for the 6-digit code and try again.`
      );
      break;
    }
    case 'link_failed':
      await sendMessage(
        ctx,
        chatId,
        'Something went wrong linking your account.\n\n' +
        'Please try again or message @noahchonlee for help.'
      );
      break;
    default:
      await sendMessage(
        ctx,
        chatId,
        'Something went wrong.\n\n' +
        'Please try again or message @noahchonlee for help.'
      );
  }
}

async function handleStartCommand(ctx: RequestContext, message: TelegramMessage) {
  const text = message.text || '';
  const parts = text.split(' ');
  const token = parts.length > 1 ? parts[1] : null;
  const telegramUserId = message.from.id;
  const telegramUsername = message.from.username;
  const telegramFirstName = message.from.first_name;
  const chatId = message.chat.id;

  // Check if already linked
  console.log('[Telegram Webhook] Checking if user already linked');
  const { data: existingCustomer, error: existingError } = await ctx.supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  console.log('[Telegram Webhook] Existing customer check:', {
    found: !!existingCustomer,
    error: existingError ? { code: existingError.code, message: existingError.message } : null
  });

  if (existingCustomer) {
    // Already linked - update last seen and potentially update telegram_handle if it was missing
    // (This handles PayPal customers who didn't have handle at signup)
    const updateData: { is_linked: boolean; last_seen_at: string } = {
      is_linked: true,
      last_seen_at: new Date().toISOString()
    };

    await ctx.supabase
      .from('telegram_link_status')
      .upsert({
        customer_id: existingCustomer.id,
        ...updateData
      });

    // If telegram_handle was null (PayPal customer), update it now
    if (!existingCustomer.telegram_handle && telegramUsername) {
      const extractedHandle = `@${telegramUsername}`;
      await ctx.supabase
        .from('customers')
        .update({ telegram_handle: extractedHandle })
        .eq('id', existingCustomer.id);
      console.log('[Telegram] Updated missing telegram_handle for existing customer:', existingCustomer.id);
    }

    await sendMessage(ctx, chatId, 'Hey again! You\'re all set.\n\n/skip to manage dates\n/status to see what\'s coming\n/help for everything else');
    return;
  }

  // Not linked yet - need token
  if (!token) {
    await sendMessage(
      ctx,
      chatId,
      'Hey! Welcome to Frontier.\n\nHead to frontier-meals.com to subscribe — we\'ll send you a link to connect your account here.\n\nQuestions? Hit up @noahchonlee'
    );
    return;
  }

  // Validate token format (UUID)
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!token || !UUID_REGEX.test(token)) {
    console.log('[Telegram] Invalid token format received');
    await sendMessage(
      ctx,
      chatId,
      'That link doesn\'t look right.\n\nCheck your welcome email for the correct link, or ping @noahchonlee if you need help.'
    );
    return;
  }

  // Verify deep link token (hash incoming token for comparison)
  const tokenHash = await sha256(token);
  console.log('[Telegram Webhook] Querying database for deep link token');

  const { data: deepLinkToken, error: deepLinkError } = await ctx.supabase
    .from('telegram_deep_link_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .eq('used', false)
    .single();

  console.log('[Telegram Webhook] Deep link query result:', {
    found: !!deepLinkToken,
    error: deepLinkError ? { code: deepLinkError.code, message: deepLinkError.message } : null
  });

  if (!deepLinkToken) {
    console.log('[Telegram Webhook] No valid deep link token found');
    await sendMessage(
      ctx,
      chatId,
      'Hmm, that link isn\'t working — might be expired.\n\nCheck your welcome email for a fresh one, or ping @noahchonlee if you need a hand.'
    );
    return;
  }

  // Check if token expired
  const expiresAt = new Date(deepLinkToken.expires_at);
  if (expiresAt < new Date()) {
    await sendMessage(
      ctx,
      chatId,
      'Hmm, that link isn\'t working — might be expired.\n\nCheck your welcome email for a fresh one, or ping @noahchonlee if you need a hand.'
    );
    return;
  }

  // ============================================================================
  // ATOMIC TOKEN CLAIM - RACE CONDITION FIX (C2)
  // ============================================================================
  // This section prevents race conditions where multiple Telegram users could
  // claim the same token. We use an atomic "claim" operation that:
  // 1. Sets claimed_by_telegram_user_id ONLY IF it's currently NULL and used=FALSE
  // 2. Returns whether the claim succeeded
  // 3. Only proceeds if THIS request successfully claimed the token
  //
  // For PayPal customers, token is created at checkout with customer_id=NULL
  // Webhook activates it by setting customer_id when customer is created
  // If user clicks link BEFORE webhook completes, poll for up to 5 seconds

  // Step 1: Attempt to atomically claim this token for this Telegram user
  // The WHERE clause ensures only ONE request can succeed
  const { data: claimResult, error: claimError } = await ctx.supabase
    .from('telegram_deep_link_tokens')
    .update({
      claimed_by_telegram_user_id: telegramUserId,
      claimed_at: new Date().toISOString()
    })
    .eq('token_hash', tokenHash)
    .eq('used', false)
    .or(`claimed_by_telegram_user_id.is.null,claimed_by_telegram_user_id.eq.${telegramUserId}`)
    .select('id, claimed_by_telegram_user_id')
    .single();

  if (claimError || !claimResult) {
    // Check if token was already claimed by someone else
    const { data: tokenStatus } = await ctx.supabase
      .from('telegram_deep_link_tokens')
      .select('claimed_by_telegram_user_id, used')
      .eq('token_hash', tokenHash)
      .single();

    if (tokenStatus?.used) {
      console.log('[Telegram] Token already used');
      await sendMessage(
        ctx,
        chatId,
        'This link has already been used.\n\n' +
        'If you\'ve already connected your account, use /status to check.\n\n' +
        'Questions? Message @noahchonlee'
      );
      return;
    }

    if (tokenStatus?.claimed_by_telegram_user_id && tokenStatus.claimed_by_telegram_user_id !== telegramUserId) {
      console.log('[Telegram] Token claimed by different user');
      await sendMessage(
        ctx,
        chatId,
        'This link is being processed by another account.\n\n' +
        'Each subscription link can only be used once. If this is your subscription, please contact @noahchonlee for help.'
      );
      return;
    }

    // Unknown error - log and return generic message
    console.error('[Telegram] Failed to claim token:', claimError);
    await sendMessage(
      ctx,
      chatId,
      'Something went wrong claiming this link.\n\n' +
      'Please try again, or contact @noahchonlee if the problem persists.'
    );
    return;
  }

  console.log('[Telegram] Token claimed successfully');

  // Step 2: Check if token is activated (customer_id set)
  if (!deepLinkToken.customer_id) {
    console.log('[Telegram] Token not yet activated - polling for webhook completion');

    // Poll for activation (10 attempts × 500ms = 5 seconds)
    for (let i = 0; i < 10; i++) {
      await new Promise(r => setTimeout(r, 500));
      const { data } = await ctx.supabase
        .from('telegram_deep_link_tokens')
        .select('customer_id')
        .eq('token_hash', tokenHash)
        .single();

      if (data?.customer_id) {
        deepLinkToken.customer_id = data.customer_id;
        console.log('[Telegram] Token activated during polling - proceeding with link');
        break;
      }
    }

    // If still not activated after polling, ask user to wait
    // Note: Token remains claimed by this user, so they can retry
    if (!deepLinkToken.customer_id) {
      console.log('[Telegram] Token still not activated after polling');
      await sendMessage(
        ctx,
        chatId,
        'Your payment is being processed! This usually takes up to a minute.\n\n' +
        'Try clicking the link again in a moment, or use the link in your welcome email.\n\n' +
        'Questions? Message @noahchonlee'
      );
      return;
    }
  }

  // ============================================================================
  // EXTRACT TELEGRAM HANDLE FROM message.from.username
  // This is the key change for PayPal support - we no longer require
  // telegram_handle from checkout, we extract it here from the bot interaction
  // ============================================================================
  const extractedHandle = telegramUsername ? `@${telegramUsername}` : null;

  if (!extractedHandle) {
    // UJ-6: User has no Telegram username set - provide clear instructions
    console.log('[Telegram] User has no username set, prompting for handle setup');
    await sendMessage(
      ctx,
      chatId,
      `Hey ${telegramFirstName}! You need a Telegram username to use Frontier Meals.\n\n` +
      '🔧 Why? Your username lets us contact you if there are issues with your order.\n\n' +
      '📱 How to set one:\n' +
      '1. Tap the menu (☰) in Telegram\n' +
      '2. Go to Settings\n' +
      '3. Tap "Edit Profile"\n' +
      '4. Tap "Username" and create one\n' +
      '5. Come back here and click the link again\n\n' +
      '✅ Once you\'ve set it, click your welcome email link again to connect.\n\n' +
      'Questions? Message @noahchonlee'
    );
    return;
  }

  // ============================================================================
  // C1 SECURITY FIX: EMAIL VERIFICATION BEFORE LINKING
  // ============================================================================
  // Instead of directly linking, we now:
  // 1. Get customer email from database
  // 2. Create a pending verification with 6-digit code
  // 3. Send verification code to customer's email
  // 4. User must enter code in Telegram to complete linking
  // This prevents account takeover via shared deep links.

  // Get customer info (especially email)
  const { data: customer, error: customerError } = await ctx.supabase
    .from('customers')
    .select('id, email, name')
    .eq('id', deepLinkToken.customer_id)
    .single();

  if (customerError || !customer) {
    console.error('[DB ERROR] Could not find customer:', customerError);
    await sendMessage(ctx, chatId, 'Something went wrong.\n\nTry again? If it keeps happening, ping @noahchonlee.');
    return;
  }

  // Create pending verification and get the plaintext code
  let verificationCode: string;
  try {
    verificationCode = await createPendingVerification(
      ctx,
      deepLinkToken.customer_id,
      telegramUserId,
      telegramUsername || null,
      tokenHash,
      chatId
    );
  } catch (error) {
    console.error('[DB ERROR] Failed to create verification:', error);
    await sendMessage(ctx, chatId, 'Something went wrong.\n\nTry again? If it keeps happening, ping @noahchonlee.');
    return;
  }

  // C3/C4: Don't log email addresses (PII) - log customer_id instead
  console.log('[Telegram] Verification created, sending email for customer:', customer.id);

  // Send verification email
  try {
    const customerFirstName = customer.name?.split(' ')[0] || 'there';
    const emailResult = await renderTemplate(
      'telegram_verification',
      {
        customer_name: customerFirstName,
        verification_code: verificationCode
      },
      ctx.env.SUPABASE_SERVICE_ROLE_KEY
    );

    await sendEmail({
      to: customer.email,
      subject: emailResult.subject,
      html: emailResult.html,
      tags: [
        { name: 'category', value: 'telegram_verification' },
        { name: 'customer_id', value: customer.id }
      ],
      supabase: ctx.supabase
    });

    // C3/C4: Don't log email addresses (PII)
    console.log('[Email] Verification code sent for customer:', customer.id);
  } catch (emailError) {
    console.error('[Email ERROR] Failed to send verification email:', emailError);
    // Clean up the pending verification since we couldn't send the email
    await ctx.supabase
      .from('telegram_link_verifications')
      .delete()
      .eq('telegram_user_id', telegramUserId);

    await sendMessage(
      ctx,
      chatId,
      'We couldn\'t send your verification email.\n\n' +
      'Please try clicking the link again, or contact @noahchonlee for help.'
    );
    return;
  }

  // Log audit event for verification initiated
  await ctx.supabase.from('audit_log').insert({
    actor: `customer:${deepLinkToken.customer_id}`,
    action: 'telegram_verification_initiated',
    subject: `customer:${deepLinkToken.customer_id}`,
    metadata: {
      telegram_user_id: telegramUserId,
      telegram_username: telegramUsername,
      source: 'deep_link'
    }
  });

  // Mask email for display (show first 2 chars + last part after @)
  const emailParts = customer.email.split('@');
  const maskedEmail = emailParts[0].substring(0, 2) + '***@' + emailParts[1];

  // Send instructions to user
  await sendMessage(
    ctx,
    chatId,
    `Almost there! We need to verify this is your account.\n\n` +
    `We just sent a 6-digit code to ${maskedEmail}\n\n` +
    `Please check your email and reply with the code here.\n\n` +
    `(Code expires in 10 minutes)`
  );
}

async function sendDietSelectionKeyboard(ctx: RequestContext, chatId: number) {
  await sendMessage(
    ctx,
    chatId,
    'Nice! You\'re connected.\n\nLet\'s dial in your meals — what\'s your diet?',
    {
      inline_keyboard: [
        [{ text: '🥗 Everything (default)', callback_data: 'diet:everything' }],
        [{ text: '🐟 Pescatarian', callback_data: 'diet:pescatarian' }],
        [{ text: '🥕 Vegetarian', callback_data: 'diet:vegetarian' }],
        [{ text: '🌱 Vegan', callback_data: 'diet:vegan' }]
      ]
    }
  );
}

async function handleCallbackQuery(ctx: RequestContext, query: TelegramCallbackQuery) {
  const data = query.data;
  const chatId = query.message.chat.id;
  const telegramUserId = query.from.id;

  // Handle unskip callback before answering query (needs to answer with custom message)
  if (data.startsWith('unskip:')) {
    const skipId = data.replace('unskip:', '');

    // Get skip details before deleting (verify it's a telegram skip)
    const { data: skip } = await ctx.supabase
      .from('skips')
      .select('skip_date, customer_id, source')
      .eq('id', skipId)
      .eq('source', 'telegram')  // Safety check
      .single();

    if (!skip) {
      await answerCallbackQuery(ctx, query.id, 'That skip was already removed.');
      return;
    }

    // Delete (source filter for defense-in-depth, already verified above)
    await ctx.supabase.from('skips').delete().eq('id', skipId).eq('source', 'telegram');

    const date = new Date(skip.skip_date + 'T12:00:00');
    const formatted = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    // Edit the original message
    await editMessage(ctx, chatId, query.message.message_id, `✅ ${formatted} is back on.`);

    // Audit log
    await ctx.supabase.from('audit_log').insert({
      actor: `customer:${skip.customer_id}`,
      action: 'skip_removed',
      subject: `customer:${skip.customer_id}`,
      metadata: { skip_date: skip.skip_date, via: 'unskip_command' }
    });

    return;
  }

  // Answer callback query first (acknowledge button press)
  await answerCallbackQuery(ctx, query.id);

  // Parse callback data
  const parts = data.split(':');
  const action = parts[0];

  switch (action) {
    case 'diet':
      await handleDietSelection(ctx, chatId, telegramUserId, parts[1]);
      break;
    case 'allergy':
      await handleAllergyResponse(ctx, chatId, telegramUserId, parts[1]);
      break;
    case 'skip':
      await handleSkipSelection(ctx, chatId, telegramUserId, parts[1]);
      break;
    case 'skip_multi':
      await handleSkipMultiAction(ctx, chatId, telegramUserId, query.message.message_id, parts.slice(1));
      break;
    default:
      console.log('Unknown callback action:', action);
  }
}

async function handleDietSelection(ctx: RequestContext, chatId: number, telegramUserId: number, diet: string) {
  // Find customer
  const { data: customer } = await ctx.supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) {
    await sendMessage(ctx, chatId, 'Can\'t find your account.\n\nSomething\'s off — message @noahchonlee and we\'ll sort it out.');
    return;
  }

  // Update dietary flags
  await ctx.supabase
    .from('customers')
    .update({
      dietary_flags: { diet }
    })
    .eq('id', customer.id);

  // Send next question - allergies
  await sendMessage(
    ctx,
    chatId,
    `Got it — ${diet} it is.\n\nAny food allergies we should know about?`,
    {
      inline_keyboard: [
        [{ text: '✅ No allergies', callback_data: 'allergy:none' }],
        [{ text: '⚠️ Yes, I have allergies', callback_data: 'allergy:yes' }]
      ]
    }
  );
}

async function handleAllergyResponse(ctx: RequestContext, chatId: number, telegramUserId: number, response: string) {
  const { data: customer } = await ctx.supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) return;

  if (response === 'yes') {
    // Update allergies flag
    await ctx.supabase
      .from('customers')
      .update({ allergies: true })
      .eq('id', customer.id);

    await sendMessage(
      ctx,
      chatId,
      'Let\'s make sure we get this right.\n\nSend @noahchonlee a message so we can safely accommodate your needs.'
    );
  } else {
    await ctx.supabase
      .from('customers')
      .update({ allergies: false })
      .eq('id', customer.id);
  }

  // Send completion message with QR timeline
  await sendMessage(
    ctx,
    chatId,
    'You\'re all set!\n\nYour daily QR code will be sent at 12 PM PT on weekdays.\n\nIf you signed up on a weekday before noon, you\'ll get today\'s QR shortly. Otherwise, it\'ll arrive on the next service day.\n\n(/help if you need anything)'
  );
}

async function handleDietCommand(ctx: RequestContext, chatId: number) {
  await sendDietSelectionKeyboard(ctx, chatId);
}

async function handleSkipCommand(ctx: RequestContext, chatId: number) {
  const telegramUserId = chatId; // In DM, chatId === userId

  // Find customer
  const { data: customer } = await ctx.supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) {
    await sendMessage(ctx, chatId, 'Please use /start first to link your account.');
    return;
  }

  // Load existing skips (exclude today - cannot skip today)
  const todayStr = todayInPT();
  const { data: existingSkips } = await ctx.supabase
    .from('skips')
    .select('*')
    .eq('customer_id', customer.id)
    .eq('source', 'telegram') // Only load user-created skips
    .gt('skip_date', todayStr); // gt (greater than) not gte - exclude today

  const existingSkipSet = new Set((existingSkips || []).map(s => s.skip_date));

  // Create session
  const session: SkipSession = {
    customer_id: customer.id,
    selected_dates: existingSkipSet,
    message_id: 0, // Will be updated after sending
    expires_at: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
  };

  await setSkipSession(ctx, telegramUserId, session);

  // Send calendar
  const response = await sendSkipCalendar(ctx, chatId, telegramUserId, existingSkipSet);

  // Update session with message ID
  if (response.result?.message_id) {
    session.message_id = response.result.message_id;
    await setSkipSession(ctx, telegramUserId, session);
  }
}

async function sendSkipCalendar(
  ctx: RequestContext,
  chatId: number,
  telegramUserId: number,
  existingSkips: Set<string>
) {
  const session = await getSkipSession(ctx, telegramUserId);
  if (!session) {
    await sendMessage(ctx, chatId, 'Session expired. Use /skip to start again.');
    return;
  }

  const todayStr = todayInPT();
  const today = new Date(todayStr + 'T00:00:00');

  // Load admin-created skips to display as locked
  const { data: adminSkips } = await ctx.supabase
    .from('skips')
    .select('*')
    .eq('customer_id', session.customer_id)
    .eq('source', 'admin')
    .gt('skip_date', todayStr);

  const adminSkipSet = new Set((adminSkips || []).map(s => s.skip_date));
  const calendar: Array<Array<{ text: string; callback_data: string }>> = [];

  // Generate next 14 days (starting from tomorrow - skip today)
  for (let i = 1; i <= 14; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;

    let emoji, text, callbackData;

    if (adminSkipSet.has(dateStr)) {
      // Admin-created skip - locked, not toggleable
      emoji = '🔒';
      text = `${emoji} ${dayName} ${monthDay}`;
      callbackData = `skip_multi:locked:${dateStr}`;
    } else if (session.selected_dates.has(dateStr)) {
      // User-created skip - selected in current session
      emoji = '✅';
      text = `${emoji} ${dayName} ${monthDay}`;
      callbackData = `skip_multi:toggle:${dateStr}`;
    } else {
      // Available to select
      emoji = '⬜';
      text = `${emoji} ${dayName} ${monthDay}`;
      callbackData = `skip_multi:toggle:${dateStr}`;
    }

    // Add in rows of 2
    if ((i - 1) % 2 === 0) {
      calendar.push([{ text, callback_data: callbackData }]);
    } else {
      calendar[calendar.length - 1].push({ text, callback_data: callbackData });
    }
  }

  // Add confirm/cancel row
  const selectedCount = session.selected_dates.size;
  calendar.push([
    { text: `✅ Confirm (${selectedCount})`, callback_data: 'skip_multi:confirm' },
    { text: '❌ Cancel', callback_data: 'skip_multi:cancel' }
  ]);

  const messageText = `📅 Select dates to skip your meals\n(Tap to toggle • Confirm when ready)\n\nCurrently selected: ${selectedCount} dates`;

  return await sendMessage(ctx, chatId, messageText, { inline_keyboard: calendar });
}

async function handleSkipMultiAction(
  ctx: RequestContext,
  chatId: number,
  telegramUserId: number,
  messageId: number,
  actionParts: string[]
) {
  const session = await getSkipSession(ctx, telegramUserId);

  if (!session) {
    await editMessage(ctx, chatId, messageId, '⏱️ Selection expired. Use /skip to start again.');
    return;
  }

  const action = actionParts[0];

  if (action === 'disabled' || action === 'locked') {
    // User clicked today or admin-locked date - do nothing
    return;
  }

  if (action === 'cancel') {
    await deleteSkipSession(ctx, telegramUserId);
    await editMessage(ctx, chatId, messageId, 'Got it — cancelled.');
    return;
  }

  if (action === 'toggle') {
    const dateStr = actionParts[1];
    const todayStr = todayInPT();

    // Prevent toggling today (safety check)
    if (dateStr === todayStr) {
      return;
    }

    // Toggle selection
    if (session.selected_dates.has(dateStr)) {
      session.selected_dates.delete(dateStr);
    } else {
      session.selected_dates.add(dateStr);
    }

    // Save updated session
    await setSkipSession(ctx, telegramUserId, session);

    // Update calendar display
    const { data: existingSkips } = await ctx.supabase
      .from('skips')
      .select('*')
      .eq('customer_id', session.customer_id)
      .eq('source', 'telegram') // Only load user-created skips
      .gt('skip_date', todayStr); // gt (greater than) not gte - exclude today

    const existingSkipSet = new Set((existingSkips || []).map(s => s.skip_date));
    await updateSkipCalendar(ctx, chatId, messageId, telegramUserId, existingSkipSet);
    return;
  }

  if (action === 'confirm') {
    // Get existing skips (exclude today - cannot skip today)
    const todayStr = todayInPT();
    const { data: existingSkips } = await ctx.supabase
      .from('skips')
      .select('*')
      .eq('customer_id', session.customer_id)
      .eq('source', 'telegram') // Only load user-created skips
      .gt('skip_date', todayStr); // gt (greater than) not gte - exclude today

    const existingSkipSet = new Set((existingSkips || []).map(s => s.skip_date));

    // Calculate changes
    const datesToAdd = [...session.selected_dates].filter(d => !existingSkipSet.has(d));
    const datesToRemove = [...existingSkipSet].filter(d => !session.selected_dates.has(d));

    // Batch insert new skips (with source = 'telegram')
    if (datesToAdd.length > 0) {
      const skipInserts = datesToAdd.map(date => ({
        customer_id: session.customer_id,
        skip_date: date,
        source: 'telegram',
        eligible_for_reimbursement: isSkipEligibleForReimbursement(date)
      }));

      await ctx.supabase.from('skips').insert(skipInserts);
    }

    // Batch delete removed skips (only user-created ones)
    if (datesToRemove.length > 0) {
      await ctx.supabase
        .from('skips')
        .delete()
        .in('skip_date', datesToRemove)
        .eq('customer_id', session.customer_id)
        .eq('source', 'telegram'); // Only delete user-created skips
    }

    // Clear session
    await deleteSkipSession(ctx, telegramUserId);

    // Send confirmation message
    let confirmText = '✅ Done!';

    if (datesToAdd.length > 0) {
      confirmText += `\n\nSkipped ${datesToAdd.length} date${datesToAdd.length > 1 ? 's' : ''}:`;
      datesToAdd.forEach(dateStr => {
        const date = new Date(dateStr);
        const formatted = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        confirmText += `\n  • ${formatted}`;
      });
    }

    if (datesToRemove.length > 0) {
      confirmText += `\n\nRemoved ${datesToRemove.length} skip${datesToRemove.length > 1 ? 's' : ''}:`;
      datesToRemove.forEach(dateStr => {
        const date = new Date(dateStr);
        const formatted = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
        confirmText += `\n  • ${formatted}`;
      });
    }

    if (datesToAdd.length === 0 && datesToRemove.length === 0) {
      confirmText = 'No changes made.';
    } else {
      confirmText += '\n\n(/status to see your schedule)';
    }

    await editMessage(ctx, chatId, messageId, confirmText);
    return;
  }
}

async function updateSkipCalendar(
  ctx: RequestContext,
  chatId: number,
  messageId: number,
  telegramUserId: number,
  existingSkips: Set<string>
) {
  const session = await getSkipSession(ctx, telegramUserId);
  if (!session) return;

  const todayStr = todayInPT();
  const today = new Date(todayStr + 'T00:00:00');

  // Load admin-created skips to display as locked
  const { data: adminSkips } = await ctx.supabase
    .from('skips')
    .select('*')
    .eq('customer_id', session.customer_id)
    .eq('source', 'admin')
    .gt('skip_date', todayStr);

  const adminSkipSet = new Set((adminSkips || []).map(s => s.skip_date));
  const calendar: Array<Array<{ text: string; callback_data: string }>> = [];

  // Generate next 14 days (starting from tomorrow - skip today)
  for (let i = 1; i <= 14; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;

    let emoji, text, callbackData;

    if (adminSkipSet.has(dateStr)) {
      // Admin-created skip - locked, not toggleable
      emoji = '🔒';
      text = `${emoji} ${dayName} ${monthDay}`;
      callbackData = `skip_multi:locked:${dateStr}`;
    } else if (session.selected_dates.has(dateStr)) {
      // User-created skip - selected in current session
      emoji = '✅';
      text = `${emoji} ${dayName} ${monthDay}`;
      callbackData = `skip_multi:toggle:${dateStr}`;
    } else {
      // Available to select
      emoji = '⬜';
      text = `${emoji} ${dayName} ${monthDay}`;
      callbackData = `skip_multi:toggle:${dateStr}`;
    }

    if ((i - 1) % 2 === 0) {
      calendar.push([{ text, callback_data: callbackData }]);
    } else {
      calendar[calendar.length - 1].push({ text, callback_data: callbackData });
    }
  }

  const selectedCount = session.selected_dates.size;
  calendar.push([
    { text: `✅ Confirm (${selectedCount})`, callback_data: 'skip_multi:confirm' },
    { text: '❌ Cancel', callback_data: 'skip_multi:cancel' }
  ]);

  const messageText = `📅 Select dates to skip your meals\n(Tap to toggle • Confirm when ready)\n\nCurrently selected: ${selectedCount} dates`;

  await editMessage(ctx, chatId, messageId, messageText, { inline_keyboard: calendar });
}

async function handleSkipSelection(ctx: RequestContext, chatId: number, telegramUserId: number, dateStr: string) {
  if (dateStr === 'cancel') {
    await sendMessage(ctx, chatId, 'Cancelled.');
    return;
  }

  // Find customer
  const { data: customer } = await ctx.supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) {
    await sendMessage(ctx, chatId, 'Error: Could not find your account.');
    return;
  }

  // Check if already skipped (user-created only)
  const { data: existingSkip } = await ctx.supabase
    .from('skips')
    .select('*')
    .eq('customer_id', customer.id)
    .eq('skip_date', dateStr)
    .eq('source', 'telegram')
    .single();

  if (existingSkip) {
    // Unskip (delete the skip record)
    console.log('[DB] Deleting skip:', { customer_id: customer.id, skip_date: dateStr });
    const { error: deleteError } = await ctx.supabase
      .from('skips')
      .delete()
      .eq('customer_id', customer.id)
      .eq('skip_date', dateStr)
      .eq('source', 'telegram');

    if (deleteError) {
      console.error('[DB ERROR] Error deleting skip:', {
        code: deleteError.code,
        message: deleteError.message,
        customer_id: customer.id,
        skip_date: dateStr
      });
      await sendMessage(ctx, chatId, '❌ Error removing skip. Please try again or contact @noahchonlee.');
      return;
    }

    console.log('[DB SUCCESS] Skip deleted');

    const date = new Date(dateStr);
    const formattedDate = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    await sendMessage(ctx, chatId, `✅ ${formattedDate} is back on your schedule!`);

    // Log audit event
    const { error: auditError } = await ctx.supabase.from('audit_log').insert({
      actor: `customer:${customer.id}`,
      action: 'skip_removed',
      subject: `customer:${customer.id}`,
      metadata: { skip_date: dateStr }
    });

    if (auditError) {
      console.error('[DB ERROR] Error creating audit_log:', { code: auditError.code, message: auditError.message });
    }
  } else {
    // Add skip with reimbursement eligibility based on Friday 09:00 PT boundary
    const eligible = isSkipEligibleForReimbursement(dateStr);

    console.log('[DB] Creating skip:', { customer_id: customer.id, skip_date: dateStr, eligible_for_reimbursement: eligible });
    const { error: insertError } = await ctx.supabase
      .from('skips')
      .insert({
        customer_id: customer.id,
        skip_date: dateStr,
        source: 'telegram',
        eligible_for_reimbursement: eligible
      });

    if (insertError) {
      console.error('[DB ERROR] Error creating skip:', {
        code: insertError.code,
        message: insertError.message,
        details: insertError.details,
        hint: insertError.hint,
        customer_id: customer.id,
        skip_date: dateStr
      });
      await sendMessage(ctx, chatId, '❌ Error adding skip. Please try again or contact @noahchonlee.');
      return;
    }

    console.log('[DB SUCCESS] Skip created');

    const date = new Date(dateStr);
    const formattedDate = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    await sendMessage(ctx, chatId, `✅ Skipped ${formattedDate}. You won't receive a QR code for this date.`);

    // Log audit event
    const { error: auditError } = await ctx.supabase.from('audit_log').insert({
      actor: `customer:${customer.id}`,
      action: 'skip_added',
      subject: `customer:${customer.id}`,
      metadata: { skip_date: dateStr }
    });

    if (auditError) {
      console.error('[DB ERROR] Error creating audit_log:', { code: auditError.code, message: auditError.message });
    }
  }
}

async function handleStatusCommand(ctx: RequestContext, chatId: number) {
  const telegramUserId = chatId;

  // Find customer
  const { data: customer } = await ctx.supabase
    .from('customers')
    .select('*, subscriptions(*)')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) {
    await sendMessage(ctx, chatId, 'Please use /start first to link your account.');
    return;
  }

  const subscription = Array.isArray(customer.subscriptions) ? customer.subscriptions[0] : customer.subscriptions;

  if (!subscription) {
    await sendMessage(ctx, chatId, 'No active subscription found. Please visit https://frontier-meals.com to subscribe.');
    return;
  }

  // Check onboarding completion status
  const hasSetDiet = customer.dietary_flags && customer.dietary_flags.diet;
  const hasSetAllergies = customer.allergies !== null;
  const onboardingComplete = hasSetDiet && hasSetAllergies;

  // Get upcoming skips (both user and admin - show all to user)
  const todayStr = todayInPT(); // Use Pacific Time
  const { data: upcomingSkips } = await ctx.supabase
    .from('skips')
    .select('skip_date, source')
    .eq('customer_id', customer.id)
    .gte('skip_date', todayStr)
    .order('skip_date', { ascending: true })
    .limit(5);

  // Format skips with indicator for admin-created ones
  const formatSkip = (s: { skip_date: string; source: string }) => {
    const date = new Date(s.skip_date + 'T12:00:00');
    const formatted = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    return s.source === 'admin' ? `  🔒 ${formatted}` : `  • ${formatted}`;
  };

  let statusText = `
Here's what's up:

📋 Subscription: ${subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
🗓 Current cycle: ${new Date(subscription.current_period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}

🥗 Diet: ${hasSetDiet ? (customer.dietary_flags.diet.charAt(0).toUpperCase() + customer.dietary_flags.diet.slice(1)) : '❌ Not set'}
⚠️ Allergies: ${hasSetAllergies ? (customer.allergies ? 'Yes (contact @noahchonlee)' : 'None') : '❌ Not set'}

${upcomingSkips && upcomingSkips.length > 0 ? `Upcoming skips:\n${upcomingSkips.map(formatSkip).join('\n')}` : 'No skips coming up — you\'re getting meals every day.'}
  `.trim();

  // Add onboarding prompt if incomplete
  if (!onboardingComplete) {
    statusText += '\n\n⚠️ Setup incomplete! Please:\n';
    if (!hasSetDiet) statusText += '  • /diet - Set your dietary preference\n';
    if (!hasSetAllergies) statusText += '  • Respond to allergy question\n';
  } else {
    statusText += '\n\n/skip to change dates\n/diet to update preferences';
  }

  await sendMessage(ctx, chatId, statusText);
}

async function handleHelpCommand(ctx: RequestContext, chatId: number) {
  const helpText = `
Here's what you can do:

/diet — Update food preferences
/skip — Skip future meal(s)
/unskip — Remove a skip
/status — See what's coming
/billing — Manage subscription
/undo — Undo your last skip
/resend — Get a new Telegram link (if not yet linked)

Questions? Hit up @noahchonlee
  `.trim();

  await sendMessage(ctx, chatId, helpText);
}

async function handleUndoCommand(ctx: RequestContext, chatId: number) {
  const telegramUserId = chatId;

  // Find customer
  const { data: customer } = await ctx.supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) {
    await sendMessage(ctx, chatId, 'Please use /start first to link your account.');
    return;
  }

  // Get most recent skip (from today forward)
  const todayStr = todayInPT(); // Use Pacific Time
  const { data: recentSkips } = await ctx.supabase
    .from('skips')
    .select('*')
    .eq('customer_id', customer.id)
    .eq('source', 'telegram')  // Only undo user's own skips, not admin-created ones
    .gte('skip_date', todayStr)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!recentSkips || recentSkips.length === 0) {
    await sendMessage(ctx, chatId, 'Nothing to undo — you haven\'t skipped anything recently.');
    return;
  }

  const skipToUndo = recentSkips[0];

  // Remove the skip
  await ctx.supabase
    .from('skips')
    .delete()
    .eq('id', skipToUndo.id)
    .eq('source', 'telegram');  // Extra safety - only delete user-created skips

  const date = new Date(skipToUndo.skip_date);
  const formattedDate = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  await sendMessage(ctx, chatId, `✅ Undone — ${formattedDate} is back on.`);

  // Log audit event
  await ctx.supabase.from('audit_log').insert({
    actor: `customer:${customer.id}`,
    action: 'skip_undone',
    subject: `customer:${customer.id}`,
    metadata: { skip_date: skipToUndo.skip_date }
  });
}

async function handleUnskipCommand(ctx: RequestContext, chatId: number) {
  const telegramUserId = chatId;

  const { data: customer } = await ctx.supabase
    .from('customers')
    .select('id')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) {
    await sendMessage(ctx, chatId, 'Please use /start first to link your account.');
    return;
  }

  // Get future user-created skips only
  const todayStr = todayInPT();
  const { data: skips } = await ctx.supabase
    .from('skips')
    .select('id, skip_date')
    .eq('customer_id', customer.id)
    .eq('source', 'telegram')  // Only user's own skips
    .gt('skip_date', todayStr)
    .order('skip_date', { ascending: true });

  if (!skips || skips.length === 0) {
    await sendMessage(ctx, chatId, 'You have no upcoming skips to remove.\n\nUse /skip to manage your schedule.');
    return;
  }

  // Build buttons (2 per row)
  const buttons: Array<Array<{ text: string; callback_data: string }>> = [];
  for (let i = 0; i < skips.length; i++) {
    const skip = skips[i];
    const date = new Date(skip.skip_date + 'T12:00:00');
    const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const button = { text: `❌ ${label}`, callback_data: `unskip:${skip.id}` };

    if (i % 2 === 0) {
      buttons.push([button]);
    } else {
      buttons[buttons.length - 1].push(button);
    }
  }

  await sendMessage(ctx, chatId, 'Tap a date to restore it:', { inline_keyboard: buttons });
}

async function handleResendCommand(ctx: RequestContext, chatId: number, telegramUserId: number) {
  // UJ-5: Resend linking email command

  // Check if user is already linked
  const { data: customer } = await ctx.supabase
    .from('customers')
    .select('id, email, name, telegram_handle')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (customer) {
    await sendMessage(
      ctx,
      chatId,
      'You\'re already linked! 🎉\n\nUse /status to check your subscription, or /help to see what else you can do.'
    );
    return;
  }

  // Not linked - check for pending tokens
  // User isn't linked, so we need to find tokens by telegram_user_id from any previous linking attempts
  // But we don't store telegram_user_id in tokens table... we need to find by checking if user has any tokens
  // Actually, if user isn't linked, they need a NEW token. Let's check if they have an email in the system first.

  // For resend to work, we need to know which customer this should be for
  // The only way to know is if they've tried before and we have their telegram_user_id in a failed attempt
  // Or if they give us their email... but that's complex UX

  // Actually, let's check if there's a token that was created but never used
  // We can't directly query by telegram_user_id since tokens are created BEFORE linking
  // This is a limitation of the current architecture

  // Better approach: Check rate limit first, then look for any unused tokens
  const { data: rateLimit } = await ctx.supabase
    .from('telegram_resend_rate_limit')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

  if (rateLimit && new Date(rateLimit.last_resend_at) > oneHourAgo) {
    const timeSinceLastResend = now.getTime() - new Date(rateLimit.last_resend_at).getTime();
    const minutesLeft = Math.ceil((60 * 60 * 1000 - timeSinceLastResend) / 60 / 1000);

    await sendMessage(
      ctx,
      chatId,
      `Please wait ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''} before requesting another link.\n\n` +
      'Check your email inbox (and spam folder) for the welcome email from Frontier Meals.\n\n' +
      'Need help? Message @noahchonlee'
    );
    return;
  }

  // No linked account and passed rate limit - they need to contact support
  // We can't resend without knowing which customer record to link to
  await sendMessage(
    ctx,
    chatId,
    'No pending link found for your Telegram account.\n\n' +
    '📧 If you just subscribed, check your email for the welcome message with your Telegram link.\n\n' +
    '🆕 If you haven\'t subscribed yet, visit frontiermeals.com to get started.\n\n' +
    '❓ Already subscribed but can\'t find your link? Message @noahchonlee with your email address and we\'ll help you out.'
  );

  // Update rate limit even for failed attempts (prevents spam)
  await ctx.supabase
    .from('telegram_resend_rate_limit')
    .upsert({
      telegram_user_id: telegramUserId,
      last_resend_at: now.toISOString()
    });
}

async function checkAbandonedOnboarding(ctx: RequestContext, chatId: number, telegramUserId: number) {
  // UX-2: Check if user has incomplete onboarding and prompt them

  const { data: customer } = await ctx.supabase
    .from('customers')
    .select('id, dietary_flags, allergies')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) {
    // Not linked - don't nag
    return;
  }

  // Check if onboarding is incomplete
  const hasSetDiet = customer.dietary_flags && customer.dietary_flags.diet;
  const hasSetAllergies = customer.allergies !== null;

  if (!hasSetDiet || !hasSetAllergies) {
    // Onboarding incomplete - send gentle reminder
    await sendMessage(
      ctx,
      chatId,
      '👋 Hey! Looks like you haven\'t finished setting up your meal preferences.\n\n' +
      'Quick setup:\n' +
      (!hasSetDiet ? '  • /diet - Choose your dietary preference\n' : '') +
      (!hasSetAllergies ? '  • Tell us about any allergies\n' : '') +
      '\nThis ensures we prepare the right meals for you! 🍽️'
    );
  }
}

async function handleBillingCommand(ctx: RequestContext, chatId: number) {
  const telegramUserId = chatId;

  // Find customer
  const { data: customer } = await ctx.supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) {
    await sendMessage(ctx, chatId, 'Please use /start first to link your account.');
    return;
  }

  // Route to provider-specific billing handler
  const provider = customer.payment_provider;

  if (provider === 'paypal') {
    // PayPal flow: Direct link to PayPal account management
    await sendMessage(
      ctx,
      chatId,
      '💳 Manage Your Subscription\n\n' +
      '• Update payment method\n' +
      '• View billing history\n' +
      '• Pause or cancel\n\n' +
      '⚠️ You\'ll see all your PayPal subscriptions — look for "Frontier Meals"\n\n' +
      'Tap below to open PayPal:',
      {
        inline_keyboard: [
          [
            {
              text: '💳 Open PayPal Account',
              url: 'https://www.paypal.com/myaccount/autopay/'
            }
          ]
        ]
      }
    );

    // Log audit event
    await ctx.supabase.from('audit_log').insert({
      actor: `customer:${customer.id}`,
      action: 'billing_portal_accessed',
      subject: `customer:${customer.id}`,
      metadata: { payment_provider: 'paypal' }
    });

    return;
  }

  if (provider === 'stripe') {
    // Stripe flow: Generate billing portal session
    if (!customer.stripe_customer_id) {
      await sendMessage(
        ctx,
        chatId,
        'Can\'t find your billing account.\n\nSomething\'s off — message @noahchonlee and we\'ll sort it out.'
      );
      return;
    }

    try {
      // Generate Stripe Customer Portal session (expires in 30 minutes)
      const portalSession = await ctx.stripe.billingPortal.sessions.create({
        customer: customer.stripe_customer_id,
        return_url: 'https://frontier-meals.com'
      });

      // Send message with inline button
      await sendMessage(
        ctx,
        chatId,
        '💳 Manage Your Subscription\n\n• Update payment method\n• View billing history\n• Pause or cancel\n\nTap below to open your portal (expires in 30 min):',
        {
          inline_keyboard: [
            [
              {
                text: '💳 Open Billing Portal',
                url: portalSession.url
              }
            ]
          ]
        }
      );

      // Log audit event
      await ctx.supabase.from('audit_log').insert({
        actor: `customer:${customer.id}`,
        action: 'billing_portal_accessed',
        subject: `customer:${customer.id}`,
        metadata: { portal_session_id: portalSession.id, payment_provider: 'stripe' }
      });
    } catch (error) {
      console.error('[Telegram] Error creating portal session:', error);
      await sendMessage(
        ctx,
        chatId,
        'Something went wrong.\n\nTry again? If it keeps happening, ping @noahchonlee.'
      );
    }

    return;
  }

  // Unknown provider
  console.error('[Telegram] Unknown payment provider:', provider);
  await sendMessage(
    ctx,
    chatId,
    'Can\'t find your billing account.\n\nSomething\'s off — message @noahchonlee and we\'ll sort it out.'
  );
}

// Telegram API helpers

/**
 * Safe wrapper for sendMessage - catches and logs errors without crashing
 * Returns null on failure to allow graceful handling
 */
async function sendMessage(
  ctx: RequestContext,
  chatId: number,
  text: string,
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> }
): Promise<any | null> {
  try {
    const payload: any = {
      chat_id: chatId,
      text
    };

    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    const response = await fetch(`https://api.telegram.org/bot${ctx.env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Telegram] sendMessage failed:', {
        status: response.status,
        error,
        textPreview: text.substring(0, 100)
      });
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[Telegram] sendMessage exception:', {
      error: error instanceof Error ? error.message : String(error),
      textPreview: text.substring(0, 100)
    });
    return null;
  }
}

/**
 * Safe wrapper for editMessage - catches and logs errors without crashing
 * Returns null on failure to allow graceful handling
 */
async function editMessage(
  ctx: RequestContext,
  chatId: number,
  messageId: number,
  text: string,
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> }
): Promise<any | null> {
  try {
    const payload: any = {
      chat_id: chatId,
      message_id: messageId,
      text
    };

    if (replyMarkup) {
      payload.reply_markup = replyMarkup;
    }

    const response = await fetch(`https://api.telegram.org/bot${ctx.env.TELEGRAM_BOT_TOKEN}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Telegram] editMessage failed:', {
        messageId,
        status: response.status,
        error,
        textPreview: text.substring(0, 100)
      });
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[Telegram] editMessage exception:', {
      messageId,
      error: error instanceof Error ? error.message : String(error),
      textPreview: text.substring(0, 100)
    });
    return null;
  }
}

/**
 * Safe wrapper for answerCallbackQuery - catches and logs errors without crashing
 * Returns false on failure to allow graceful handling
 */
async function answerCallbackQuery(ctx: RequestContext, queryId: string, text?: string): Promise<boolean> {
  try {
    const payload: any = { callback_query_id: queryId };
    if (text) payload.text = text;

    const response = await fetch(`https://api.telegram.org/bot${ctx.env.TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('[Telegram] answerCallbackQuery failed:', {
        queryId,
        status: response.status,
        error
      });
      return false;
    }

    return true;
  } catch (error) {
    console.error('[Telegram] answerCallbackQuery exception:', {
      queryId,
      error: error instanceof Error ? error.message : String(error)
    });
    return false;
  }
}
