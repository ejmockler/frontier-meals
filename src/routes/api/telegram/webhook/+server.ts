import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TELEGRAM_SECRET_TOKEN, TELEGRAM_BOT_TOKEN, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { todayInPT, isSkipEligibleForReimbursement } from '$lib/utils/timezone';
import { randomUUID, sha256, timingSafeEqual } from '$lib/utils/crypto';
import Stripe from 'stripe';
import { IS_DEMO_MODE, logDemoAction } from '$lib/demo';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2025-10-29.clover',
  typescript: true
});

// Session storage for multi-select skip flow (database-backed)
interface SkipSession {
  customer_id: string;
  selected_dates: Set<string>;
  message_id: number;
  expires_at: Date;
}

// Database helpers for skip sessions
async function getSkipSession(telegramUserId: number): Promise<SkipSession | null> {
  const { data, error } = await supabase
    .from('telegram_skip_sessions')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (error || !data) {
    return null;
  }

  // Check if expired
  if (new Date(data.expires_at) < new Date()) {
    await deleteSkipSession(telegramUserId);
    return null;
  }

  return {
    customer_id: data.customer_id,
    selected_dates: new Set(data.selected_dates),
    message_id: data.message_id,
    expires_at: new Date(data.expires_at)
  };
}

async function setSkipSession(telegramUserId: number, session: SkipSession): Promise<void> {
  const { error } = await supabase
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

async function deleteSkipSession(telegramUserId: number): Promise<void> {
  const { error } = await supabase
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

export const POST: RequestHandler = async ({ request }) => {
  // LOG: Webhook received
  console.log('[Telegram Webhook] Request received at', new Date().toISOString());
  console.log('[Telegram Webhook] Headers:', Object.fromEntries(request.headers.entries()));

  // Demo mode: ignore Telegram webhooks (safety check)
  if (IS_DEMO_MODE) {
    console.log('[Telegram Webhook] Demo mode - ignoring');
    logDemoAction('Telegram webhook received (demo) - ignoring');
    return json({ ok: true });
  }

  // Verify secret token using constant-time comparison to prevent timing attacks
  const secretToken = request.headers.get('x-telegram-bot-api-secret-token');
  console.log('[Telegram Webhook] Secret token present:', !!secretToken);
  console.log('[Telegram Webhook] Secret token matches:', secretToken === TELEGRAM_SECRET_TOKEN);

  if (!secretToken || !timingSafeEqual(secretToken, TELEGRAM_SECRET_TOKEN)) {
    console.error('[Telegram Webhook] Invalid secret token - REJECTED');
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  console.log('[Telegram Webhook] Secret token verified - processing update');

  const update: TelegramUpdate = await request.json();

  try {
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    return json({ ok: true });
  } catch (error) {
    console.error('[Telegram Webhook] Error processing update:', error);
    // Return 200 even on error to prevent Telegram from retrying
    // The error is logged, but we acknowledge receipt to avoid retry loops
    return json({ ok: true });
  }
};

async function handleMessage(message: TelegramMessage) {
  const text = message.text || '';
  const chatId = message.chat.id;

  // Check if it's a command
  const isCommand = message.entities?.some(e => e.type === 'bot_command');

  if (isCommand) {
    const command = text.split(' ')[0].toLowerCase();

    switch (command) {
      case '/start':
        await handleStartCommand(message);
        break;
      case '/diet':
        await handleDietCommand(chatId);
        break;
      case '/skip':
        await handleSkipCommand(chatId);
        break;
      case '/status':
        await handleStatusCommand(chatId);
        break;
      case '/billing':
        await handleBillingCommand(chatId);
        break;
      case '/help':
        await handleHelpCommand(chatId);
        break;
      case '/undo':
        await handleUndoCommand(chatId);
        break;
      default:
        await sendMessage(chatId, 'Not sure what that is. Try /help to see what\'s available.');
    }
  }
}

async function handleStartCommand(message: TelegramMessage) {
  const text = message.text || '';
  const parts = text.split(' ');
  const token = parts.length > 1 ? parts[1] : null;
  const telegramUserId = message.from.id;
  const telegramUsername = message.from.username;
  const chatId = message.chat.id;

  // Check if already linked
  const { data: existingCustomer } = await supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (existingCustomer) {
    // Already linked - update last seen
    await supabase
      .from('telegram_link_status')
      .upsert({
        customer_id: existingCustomer.id,
        is_linked: true,
        last_seen_at: new Date().toISOString()
      });

    await sendMessage(chatId, 'Hey again! You\'re all set.\n\n/skip to manage dates\n/status to see what\'s coming\n/help for everything else');
    return;
  }

  // Not linked yet - need token
  if (!token) {
    await sendMessage(
      chatId,
      'Hey! Welcome to Frontier.\n\nHead to frontier-meals.com to subscribe — we\'ll send you a link to connect your account here.\n\nQuestions? Hit up @noahchonlee'
    );
    return;
  }

  // Verify deep link token (hash incoming token for comparison)
  const tokenHash = await sha256(token);

  const { data: deepLinkToken } = await supabase
    .from('telegram_deep_link_tokens')
    .select('*')
    .eq('token_hash', tokenHash)
    .eq('used', false)
    .single();

  if (!deepLinkToken) {
    await sendMessage(
      chatId,
      'Hmm, that link isn\'t working — might be expired.\n\nCheck your welcome email for a fresh one, or ping @noahchonlee if you need a hand.'
    );
    return;
  }

  // Check if token expired
  const expiresAt = new Date(deepLinkToken.expires_at);
  if (expiresAt < new Date()) {
    await sendMessage(
      chatId,
      'Hmm, that link isn\'t working — might be expired.\n\nCheck your welcome email for a fresh one, or ping @noahchonlee if you need a hand.'
    );
    return;
  }

  // Link the account
  console.log('[DB] Linking telegram account:', { customer_id: deepLinkToken.customer_id, telegram_user_id: telegramUserId });
  const { error: linkError } = await supabase
    .from('customers')
    .update({ telegram_user_id: telegramUserId })
    .eq('id', deepLinkToken.customer_id);

  if (linkError) {
    console.error('[DB ERROR] Error linking telegram account:', {
      code: linkError.code,
      message: linkError.message,
      details: linkError.details,
      hint: linkError.hint,
      customer_id: deepLinkToken.customer_id
    });
    await sendMessage(chatId, 'Something went wrong.\n\nTry again? If it keeps happening, ping @noahchonlee.');
    return;
  }

  console.log('[DB SUCCESS] Telegram account linked');

  // Mark token as used
  console.log('[DB] Marking token as used');
  const { error: tokenError } = await supabase
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
  const { error: statusError } = await supabase
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

  // Log audit event
  console.log('[DB] Creating audit_log entry for telegram_linked');
  const { error: auditError } = await supabase.from('audit_log').insert({
    actor: `customer:${deepLinkToken.customer_id}`,
    action: 'telegram_linked',
    subject: `customer:${deepLinkToken.customer_id}`,
    metadata: { telegram_user_id: telegramUserId, telegram_username: telegramUsername }
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
  await sendDietSelectionKeyboard(chatId);
}

async function sendDietSelectionKeyboard(chatId: number) {
  await sendMessage(
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

async function handleCallbackQuery(query: TelegramCallbackQuery) {
  const data = query.data;
  const chatId = query.message.chat.id;
  const telegramUserId = query.from.id;

  // Answer callback query first (acknowledge button press)
  await answerCallbackQuery(query.id);

  // Parse callback data
  const parts = data.split(':');
  const action = parts[0];

  switch (action) {
    case 'diet':
      await handleDietSelection(chatId, telegramUserId, parts[1]);
      break;
    case 'allergy':
      await handleAllergyResponse(chatId, telegramUserId, parts[1]);
      break;
    case 'skip':
      await handleSkipSelection(chatId, telegramUserId, parts[1]);
      break;
    case 'skip_multi':
      await handleSkipMultiAction(chatId, telegramUserId, query.message.message_id, parts.slice(1));
      break;
    default:
      console.log('Unknown callback action:', action);
  }
}

async function handleDietSelection(chatId: number, telegramUserId: number, diet: string) {
  // Find customer
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) {
    await sendMessage(chatId, 'Can\'t find your account.\n\nSomething\'s off — message @noahchonlee and we\'ll sort it out.');
    return;
  }

  // Update dietary flags
  await supabase
    .from('customers')
    .update({
      dietary_flags: { diet }
    })
    .eq('id', customer.id);

  // Send next question - allergies
  await sendMessage(
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

async function handleAllergyResponse(chatId: number, telegramUserId: number, response: string) {
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) return;

  if (response === 'yes') {
    // Update allergies flag
    await supabase
      .from('customers')
      .update({ allergies: true })
      .eq('id', customer.id);

    await sendMessage(
      chatId,
      'Let\'s make sure we get this right.\n\nSend @noahchonlee a message so we can safely accommodate your needs.'
    );
  } else {
    await supabase
      .from('customers')
      .update({ allergies: false })
      .eq('id', customer.id);
  }

  // Send completion message
  await sendMessage(
    chatId,
    'You\'re all set!\n\nYour daily QR drops at noon PT. See you then.\n\n(/help if you need anything)'
  );
}

async function handleDietCommand(chatId: number) {
  await sendDietSelectionKeyboard(chatId);
}

async function handleSkipCommand(chatId: number) {
  const telegramUserId = chatId; // In DM, chatId === userId

  // Find customer
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) {
    await sendMessage(chatId, 'Please use /start first to link your account.');
    return;
  }

  // Load existing skips (exclude today - cannot skip today)
  const todayStr = todayInPT();
  const { data: existingSkips } = await supabase
    .from('skips')
    .select('*')
    .eq('customer_id', customer.id)
    .gt('skip_date', todayStr); // gt (greater than) not gte - exclude today

  const existingSkipSet = new Set((existingSkips || []).map(s => s.skip_date));

  // Create session
  const session: SkipSession = {
    customer_id: customer.id,
    selected_dates: existingSkipSet,
    message_id: 0, // Will be updated after sending
    expires_at: new Date(Date.now() + 5 * 60 * 1000) // 5 minutes
  };

  await setSkipSession(telegramUserId, session);

  // Send calendar
  const response = await sendSkipCalendar(chatId, telegramUserId, existingSkipSet);

  // Update session with message ID
  if (response.result?.message_id) {
    session.message_id = response.result.message_id;
    await setSkipSession(telegramUserId, session);
  }
}

async function sendSkipCalendar(
  chatId: number,
  telegramUserId: number,
  existingSkips: Set<string>
) {
  const session = await getSkipSession(telegramUserId);
  if (!session) {
    await sendMessage(chatId, 'Session expired. Use /skip to start again.');
    return;
  }

  const todayStr = todayInPT();
  const today = new Date(todayStr + 'T00:00:00');
  const calendar: Array<Array<{ text: string; callback_data: string }>> = [];

  // Generate next 14 days (starting from tomorrow - skip today)
  for (let i = 1; i <= 14; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;

    let emoji, text, callbackData;

    if (session.selected_dates.has(dateStr)) {
      // Selected in current session
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

  return await sendMessage(chatId, messageText, { inline_keyboard: calendar });
}

async function handleSkipMultiAction(
  chatId: number,
  telegramUserId: number,
  messageId: number,
  actionParts: string[]
) {
  const session = await getSkipSession(telegramUserId);

  if (!session) {
    await editMessage(chatId, messageId, '⏱️ Selection expired. Use /skip to start again.');
    return;
  }

  const action = actionParts[0];

  if (action === 'disabled') {
    // User clicked today - do nothing
    return;
  }

  if (action === 'cancel') {
    await deleteSkipSession(telegramUserId);
    await editMessage(chatId, messageId, 'Got it — cancelled.');
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
    await setSkipSession(telegramUserId, session);

    // Update calendar display
    const { data: existingSkips } = await supabase
      .from('skips')
      .select('*')
      .eq('customer_id', session.customer_id)
      .gt('skip_date', todayStr); // gt (greater than) not gte - exclude today

    const existingSkipSet = new Set((existingSkips || []).map(s => s.skip_date));
    await updateSkipCalendar(chatId, messageId, telegramUserId, existingSkipSet);
    return;
  }

  if (action === 'confirm') {
    // Get existing skips (exclude today - cannot skip today)
    const todayStr = todayInPT();
    const { data: existingSkips } = await supabase
      .from('skips')
      .select('*')
      .eq('customer_id', session.customer_id)
      .gt('skip_date', todayStr); // gt (greater than) not gte - exclude today

    const existingSkipSet = new Set((existingSkips || []).map(s => s.skip_date));

    // Calculate changes
    const datesToAdd = [...session.selected_dates].filter(d => !existingSkipSet.has(d));
    const datesToRemove = [...existingSkipSet].filter(d => !session.selected_dates.has(d));

    // Batch insert new skips
    if (datesToAdd.length > 0) {
      const skipInserts = datesToAdd.map(date => ({
        customer_id: session.customer_id,
        skip_date: date,
        eligible_for_reimbursement: isSkipEligibleForReimbursement(date)
      }));

      await supabase.from('skips').insert(skipInserts);
    }

    // Batch delete removed skips
    if (datesToRemove.length > 0) {
      await supabase
        .from('skips')
        .delete()
        .in('skip_date', datesToRemove)
        .eq('customer_id', session.customer_id);
    }

    // Clear session
    await deleteSkipSession(telegramUserId);

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

    await editMessage(chatId, messageId, confirmText);
    return;
  }
}

async function updateSkipCalendar(
  chatId: number,
  messageId: number,
  telegramUserId: number,
  existingSkips: Set<string>
) {
  const session = await getSkipSession(telegramUserId);
  if (!session) return;

  const todayStr = todayInPT();
  const today = new Date(todayStr + 'T00:00:00');
  const calendar: Array<Array<{ text: string; callback_data: string }>> = [];

  // Generate next 14 days (starting from tomorrow - skip today)
  for (let i = 1; i <= 14; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;

    let emoji, text, callbackData;

    if (session.selected_dates.has(dateStr)) {
      emoji = '✅';
      text = `${emoji} ${dayName} ${monthDay}`;
      callbackData = `skip_multi:toggle:${dateStr}`;
    } else {
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

  await editMessage(chatId, messageId, messageText, { inline_keyboard: calendar });
}

async function handleSkipSelection(chatId: number, telegramUserId: number, dateStr: string) {
  if (dateStr === 'cancel') {
    await sendMessage(chatId, 'Cancelled.');
    return;
  }

  // Find customer
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) {
    await sendMessage(chatId, 'Error: Could not find your account.');
    return;
  }

  // Check if already skipped
  const { data: existingSkip } = await supabase
    .from('skips')
    .select('*')
    .eq('customer_id', customer.id)
    .eq('skip_date', dateStr)
    .single();

  if (existingSkip) {
    // Unskip (delete the skip record)
    console.log('[DB] Deleting skip:', { customer_id: customer.id, skip_date: dateStr });
    const { error: deleteError } = await supabase
      .from('skips')
      .delete()
      .eq('customer_id', customer.id)
      .eq('skip_date', dateStr);

    if (deleteError) {
      console.error('[DB ERROR] Error deleting skip:', {
        code: deleteError.code,
        message: deleteError.message,
        customer_id: customer.id,
        skip_date: dateStr
      });
      await sendMessage(chatId, '❌ Error removing skip. Please try again or contact @noahchonlee.');
      return;
    }

    console.log('[DB SUCCESS] Skip deleted');

    const date = new Date(dateStr);
    const formattedDate = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    await sendMessage(chatId, `✅ ${formattedDate} is back on your schedule!`);

    // Log audit event
    const { error: auditError } = await supabase.from('audit_log').insert({
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
    const { error: insertError } = await supabase
      .from('skips')
      .insert({
        customer_id: customer.id,
        skip_date: dateStr,
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
      await sendMessage(chatId, '❌ Error adding skip. Please try again or contact @noahchonlee.');
      return;
    }

    console.log('[DB SUCCESS] Skip created');

    const date = new Date(dateStr);
    const formattedDate = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    await sendMessage(chatId, `✅ Skipped ${formattedDate}. You won't receive a QR code for this date.`);

    // Log audit event
    const { error: auditError } = await supabase.from('audit_log').insert({
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

async function handleStatusCommand(chatId: number) {
  const telegramUserId = chatId;

  // Find customer
  const { data: customer } = await supabase
    .from('customers')
    .select('*, subscriptions(*)')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) {
    await sendMessage(chatId, 'Please use /start first to link your account.');
    return;
  }

  const subscription = Array.isArray(customer.subscriptions) ? customer.subscriptions[0] : customer.subscriptions;

  if (!subscription) {
    await sendMessage(chatId, 'No active subscription found. Please visit https://frontier-meals.com to subscribe.');
    return;
  }

  // Get upcoming skips
  const todayStr = todayInPT(); // Use Pacific Time
  const { data: upcomingSkips } = await supabase
    .from('skips')
    .select('*')
    .eq('customer_id', customer.id)
    .gte('skip_date', todayStr)
    .order('skip_date', { ascending: true })
    .limit(5);

  const statusText = `
Here's what's up:

📋 Subscription: ${subscription.status.charAt(0).toUpperCase() + subscription.status.slice(1)}
🗓 Current cycle: ${new Date(subscription.current_period_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(subscription.current_period_end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}

🥗 Diet: ${(customer.dietary_flags?.diet || 'Everything').charAt(0).toUpperCase() + (customer.dietary_flags?.diet || 'Everything').slice(1)}
⚠️ Allergies: ${customer.allergies ? 'Yes (contact @noahchonlee)' : 'None'}

${upcomingSkips && upcomingSkips.length > 0 ? `Upcoming skips:\n${upcomingSkips.map(s => `  • ${new Date(s.skip_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`).join('\n')}` : 'No skips coming up — you\'re getting meals every day.'}

/skip to change dates
/diet to update preferences
  `.trim();

  await sendMessage(chatId, statusText);
}

async function handleHelpCommand(chatId: number) {
  const helpText = `
Here's what you can do:

/diet — Update food preferences
/skip — Skip meal dates
/status — See what's coming
/billing — Manage subscription
/undo — Undo your last skip

Questions? Hit up @noahchonlee
  `.trim();

  await sendMessage(chatId, helpText);
}

async function handleUndoCommand(chatId: number) {
  const telegramUserId = chatId;

  // Find customer
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) {
    await sendMessage(chatId, 'Please use /start first to link your account.');
    return;
  }

  // Get most recent skip (from today forward)
  const todayStr = todayInPT(); // Use Pacific Time
  const { data: recentSkips } = await supabase
    .from('skips')
    .select('*')
    .eq('customer_id', customer.id)
    .gte('skip_date', todayStr)
    .order('created_at', { ascending: false })
    .limit(1);

  if (!recentSkips || recentSkips.length === 0) {
    await sendMessage(chatId, 'Nothing to undo — you haven\'t skipped anything recently.');
    return;
  }

  const skipToUndo = recentSkips[0];

  // Remove the skip
  await supabase
    .from('skips')
    .delete()
    .eq('id', skipToUndo.id);

  const date = new Date(skipToUndo.skip_date);
  const formattedDate = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  await sendMessage(chatId, `✅ Undone — ${formattedDate} is back on.`);

  // Log audit event
  await supabase.from('audit_log').insert({
    actor: `customer:${customer.id}`,
    action: 'skip_undone',
    subject: `customer:${customer.id}`,
    metadata: { skip_date: skipToUndo.skip_date }
  });
}

async function handleBillingCommand(chatId: number) {
  const telegramUserId = chatId;

  // Find customer
  const { data: customer } = await supabase
    .from('customers')
    .select('*')
    .eq('telegram_user_id', telegramUserId)
    .single();

  if (!customer) {
    await sendMessage(chatId, 'Please use /start first to link your account.');
    return;
  }

  if (!customer.stripe_customer_id) {
    await sendMessage(
      chatId,
      'Can\'t find your billing account.\n\nSomething\'s off — message @noahchonlee and we\'ll sort it out.'
    );
    return;
  }

  try {
    // Generate Stripe Customer Portal session (expires in 30 minutes)
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: customer.stripe_customer_id,
      return_url: 'https://frontier-meals.com'
    });

    // Send message with inline button
    await sendMessage(
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
    await supabase.from('audit_log').insert({
      actor: `customer:${customer.id}`,
      action: 'billing_portal_accessed',
      subject: `customer:${customer.id}`,
      metadata: { portal_session_id: portalSession.id }
    });
  } catch (error) {
    console.error('[Telegram] Error creating portal session:', error);
    await sendMessage(
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

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
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

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
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
async function answerCallbackQuery(queryId: string, text?: string): Promise<boolean> {
  try {
    const payload: any = { callback_query_id: queryId };
    if (text) payload.text = text;

    const response = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
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
