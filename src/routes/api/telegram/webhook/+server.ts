import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { todayInPT, isSkipEligibleForReimbursement } from '$lib/utils/timezone';
import { sha256, timingSafeEqual } from '$lib/utils/crypto';
import { getEnv, type ServerEnv } from '$lib/server/env';
import Stripe from 'stripe';

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
      default:
        await sendMessage(ctx, chatId, 'Not sure what that is. Try /help to see what\'s available.');
    }
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
  console.log('[Telegram Webhook] Checking if user already linked, telegram_user_id:', telegramUserId);
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
      console.log('[Telegram] Updated missing telegram_handle for existing customer:', extractedHandle);
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

  // Verify deep link token (hash incoming token for comparison)
  const tokenHash = await sha256(token);
  console.log('[Telegram Webhook] Token hash computed, querying database...');

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
  // EXTRACT TELEGRAM HANDLE FROM message.from.username
  // This is the key change for PayPal support - we no longer require
  // telegram_handle from checkout, we extract it here from the bot interaction
  // ============================================================================
  const extractedHandle = telegramUsername ? `@${telegramUsername}` : null;

  if (!extractedHandle) {
    // User has no Telegram username set - prompt them to set one
    console.log('[Telegram] User has no username set, prompting:', { telegram_user_id: telegramUserId, first_name: telegramFirstName });
    await sendMessage(
      ctx,
      chatId,
      `Hey ${telegramFirstName}! Looks like you don\'t have a Telegram username set.\n\n` +
      'To use Frontier Meals, please:\n\n' +
      '1. Go to Settings > Edit Profile\n' +
      '2. Set a username\n' +
      '3. Come back and click the link again\n\n' +
      'Questions? Message @noahchonlee'
    );
    return;
  }

  // Link the account: set BOTH telegram_user_id AND telegram_handle
  // For Stripe customers, telegram_handle may already be set from checkout
  // For PayPal customers, telegram_handle will be null and we set it here
  console.log('[DB] Linking telegram account:', {
    customer_id: deepLinkToken.customer_id,
    telegram_user_id: telegramUserId,
    telegram_handle: extractedHandle
  });

  const { error: linkError } = await ctx.supabase
    .from('customers')
    .update({
      telegram_user_id: telegramUserId,
      telegram_handle: extractedHandle  // Set handle from message.from.username
    })
    .eq('id', deepLinkToken.customer_id);

  if (linkError) {
    console.error('[DB ERROR] Error linking telegram account:', {
      code: linkError.code,
      message: linkError.message,
      details: linkError.details,
      hint: linkError.hint,
      customer_id: deepLinkToken.customer_id
    });
    await sendMessage(ctx, chatId, 'Something went wrong.\n\nTry again? If it keeps happening, ping @noahchonlee.');
    return;
  }

  console.log('[DB SUCCESS] Telegram account linked with handle:', extractedHandle);

  // Mark token as used
  console.log('[DB] Marking token as used');
  const { error: tokenError } = await ctx.supabase
    .from('telegram_deep_link_tokens')
    .update({ used: true, used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash);

  if (tokenError) {
    console.error('[DB ERROR] Error marking token as used:', {
      code: tokenError.code,
      message: tokenError.message
    });
    // Don't fail - account is already linked
  }

  // Update telegram_link_status
  console.log('[DB] Updating telegram_link_status');
  const { error: statusError } = await ctx.supabase
    .from('telegram_link_status')
    .upsert({
      customer_id: deepLinkToken.customer_id,
      is_linked: true,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    });

  if (statusError) {
    console.error('[DB ERROR] Error updating telegram_link_status:', {
      code: statusError.code,
      message: statusError.message,
      details: statusError.details,
      hint: statusError.hint
    });
    // Don't fail - account is already linked
  }

  console.log('[DB SUCCESS] Telegram link status updated');

  // Log audit event (include extracted handle)
  console.log('[DB] Creating audit_log entry for telegram_linked');
  const { error: auditError } = await ctx.supabase.from('audit_log').insert({
    actor: `customer:${deepLinkToken.customer_id}`,
    action: 'telegram_linked',
    subject: `customer:${deepLinkToken.customer_id}`,
    metadata: {
      telegram_user_id: telegramUserId,
      telegram_username: telegramUsername,
      telegram_handle: extractedHandle,
      source: 'deep_link'
    }
  });

  if (auditError) {
    console.error('[DB ERROR] Error creating audit_log:', {
      code: auditError.code,
      message: auditError.message
    });
  } else {
    console.log('[DB SUCCESS] Audit log created');
  }

  // Send onboarding - diet selection
  await sendDietSelectionKeyboard(ctx, chatId);
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

  // Send completion message
  await sendMessage(
    ctx,
    chatId,
    'You\'re all set!\n\nYour daily QR drops at noon PT. See you then.\n\n(/help if you need anything)'
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

  const statusText = `
Here's what's up:

📋 Subscription: ${subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
🗓 Current cycle: ${new Date(subscription.current_period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}

🥗 Diet: ${(customer.dietary_flags?.diet || 'Everything').charAt(0).toUpperCase() + (customer.dietary_flags?.diet || 'Everything').slice(1)}
⚠️ Allergies: ${customer.allergies ? 'Yes (contact @noahchonlee)' : 'None'}

${upcomingSkips && upcomingSkips.length > 0 ? `Upcoming skips:\n${upcomingSkips.map(formatSkip).join('\n')}` : 'No skips coming up — you\'re getting meals every day.'}

/skip to change dates
/diet to update preferences
  `.trim();

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
      '💳 Manage your subscription:\n\n• Update payment\n• View billing history\n• Pause or cancel\n\nTap below to open your portal (expires in 30 min)',
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
      metadata: { portal_session_id: portalSession.id }
    });
  } catch (error) {
    console.error('[Telegram] Error creating portal session:', error);
    await sendMessage(
      ctx,
      chatId,
      'Something went wrong.\n\nTry again? If it keeps happening, ping @noahchonlee.'
    );
  }
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
        chatId,
        status: response.status,
        error,
        textPreview: text.substring(0, 100)
      });
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('[Telegram] sendMessage exception:', {
      chatId,
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
        chatId,
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
      chatId,
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
