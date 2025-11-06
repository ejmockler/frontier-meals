import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { TELEGRAM_SECRET_TOKEN, SUPABASE_SERVICE_ROLE_KEY, STRIPE_SECRET_KEY } from '$env/static/private';
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
  // Demo mode: ignore Telegram webhooks (safety check)
  if (IS_DEMO_MODE) {
    logDemoAction('Telegram webhook received (demo) - ignoring');
    return json({ ok: true });
  }

  // Verify secret token using constant-time comparison to prevent timing attacks
  const secretToken = request.headers.get('x-telegram-bot-api-secret-token');

  if (!secretToken || !timingSafeEqual(secretToken, TELEGRAM_SECRET_TOKEN)) {
    console.error('Invalid Telegram secret token');
    return json({ error: 'Forbidden' }, { status: 403 });
  }

  const update: TelegramUpdate = await request.json();

  try {
    if (update.message) {
      await handleMessage(update.message);
    } else if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
    }

    return json({ ok: true });
  } catch (error) {
    console.error('Error processing Telegram update:', error);
    return json({ error: 'Internal error' }, { status: 500 });
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
        await sendMessage(chatId, 'Unknown command. Type /help to see available commands.');
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

    await sendMessage(chatId, 'Welcome back! Use /help to see available commands.');
    return;
  }

  // Not linked yet - need token
  if (!token) {
    await sendMessage(
      chatId,
      'Welcome! To get started, please subscribe at https://frontier-meals.com\n\nYou\'ll receive a link to connect your Telegram account.'
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
      '❌ Invalid or expired link. Please use the link from your welcome email, or contact @noahchonlee for help.'
    );
    return;
  }

  // Check if token expired
  const expiresAt = new Date(deepLinkToken.expires_at);
  if (expiresAt < new Date()) {
    await sendMessage(
      chatId,
      '❌ This link has expired. Please contact @noahchonlee to get a new link.'
    );
    return;
  }

  // Link the account
  await supabase
    .from('customers')
    .update({ telegram_user_id: telegramUserId })
    .eq('id', deepLinkToken.customer_id);

  // Mark token as used
  await supabase
    .from('telegram_deep_link_tokens')
    .update({ used: true, used_at: new Date().toISOString() })
    .eq('token_hash', tokenHash);

  // Update telegram_link_status
  await supabase
    .from('telegram_link_status')
    .upsert({
      customer_id: deepLinkToken.customer_id,
      is_linked: true,
      first_seen_at: new Date().toISOString(),
      last_seen_at: new Date().toISOString()
    });

  // Log audit event
  await supabase.from('audit_log').insert({
    actor: `customer:${deepLinkToken.customer_id}`,
    action: 'telegram_linked',
    subject: `customer:${deepLinkToken.customer_id}`,
    metadata: { telegram_user_id: telegramUserId, telegram_username: telegramUsername }
  });

  // Send onboarding - diet selection
  await sendDietSelectionKeyboard(chatId);
}

async function sendDietSelectionKeyboard(chatId: number) {
  await sendMessage(
    chatId,
    'Welcome to Frontier Meals! 🍽️\n\nLet\'s personalize your meal plan. What\'s your diet?',
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
  const [action, value] = data.split(':');

  switch (action) {
    case 'diet':
      await handleDietSelection(chatId, telegramUserId, value);
      break;
    case 'allergy':
      await handleAllergyResponse(chatId, telegramUserId, value);
      break;
    case 'skip':
      await handleSkipSelection(chatId, telegramUserId, value);
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
    await sendMessage(chatId, 'Error: Could not find your account. Please contact @noahchonlee');
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
    `Great! Your diet is set to ${diet}.\n\nDo you have any food allergies?`,
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
      '⚠️ Please message @noahchonlee directly to discuss your allergies so we can accommodate your needs safely.'
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
    '✅ All set! You\'ll receive your daily QR code at 12 PM PT.\n\nUse /help to see available commands.'
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

  // Generate calendar for next 14 days
  await sendSkipCalendar(chatId, customer.id);
}

async function sendSkipCalendar(chatId: number, customerId: string) {
  const todayStr = todayInPT(); // Use Pacific Time
  const today = new Date(todayStr + 'T00:00:00');
  const calendar: Array<Array<{ text: string; callback_data: string }>> = [];

  // Generate next 14 days
  for (let i = 0; i < 14; i++) {
    const date = new Date(today);
    date.setDate(date.getDate() + i);
    const dateStr = date.toISOString().split('T')[0];

    // Check if already skipped
    const { data: existingSkip } = await supabase
      .from('skips')
      .select('*')
      .eq('customer_id', customerId)
      .eq('skip_date', dateStr)
      .single();

    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const monthDay = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

    const buttonText = existingSkip
      ? `❌ ${dayName} ${monthDay} (skipped)`
      : `${dayName} ${monthDay}`;

    // Add in rows of 2
    if (i % 2 === 0) {
      calendar.push([{ text: buttonText, callback_data: `skip:${dateStr}` }]);
    } else {
      calendar[calendar.length - 1].push({ text: buttonText, callback_data: `skip:${dateStr}` });
    }
  }

  // Add cancel button
  calendar.push([{ text: '❌ Cancel', callback_data: 'skip:cancel' }]);

  await sendMessage(
    chatId,
    '📅 Select a date to skip your meal:\n\nDates marked with ❌ are already skipped.',
    { inline_keyboard: calendar }
  );
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
    await supabase
      .from('skips')
      .delete()
      .eq('customer_id', customer.id)
      .eq('skip_date', dateStr);

    const date = new Date(dateStr);
    const formattedDate = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    await sendMessage(chatId, `✅ ${formattedDate} is back on your schedule!`);

    // Log audit event
    await supabase.from('audit_log').insert({
      actor: `customer:${customer.id}`,
      action: 'skip_removed',
      subject: `customer:${customer.id}`,
      metadata: { skip_date: dateStr }
    });
  } else {
    // Add skip with reimbursement eligibility based on Friday 09:00 PT boundary
    const eligible = isSkipEligibleForReimbursement(dateStr);

    await supabase
      .from('skips')
      .insert({
        customer_id: customer.id,
        skip_date: dateStr,
        eligible_for_reimbursement: eligible
      });

    const date = new Date(dateStr);
    const formattedDate = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

    await sendMessage(chatId, `✅ Skipped ${formattedDate}. You won't receive a QR code for this date.`);

    // Log audit event
    await supabase.from('audit_log').insert({
      actor: `customer:${customer.id}`,
      action: 'skip_added',
      subject: `customer:${customer.id}`,
      metadata: { skip_date: dateStr }
    });
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
🍽️ Your Frontier Meals Status

📋 Subscription: ${subscription.status}
📅 Current period: ${new Date(subscription.current_period_start).toLocaleDateString()} - ${new Date(subscription.current_period_end).toLocaleDateString()}

🥗 Diet: ${customer.dietary_flags?.diet || 'Everything'}
⚠️ Allergies: ${customer.allergies ? 'Yes (contact @noahchonlee)' : 'None'}

${upcomingSkips && upcomingSkips.length > 0 ? `\n📅 Upcoming skips:\n${upcomingSkips.map(s => `  • ${new Date(s.skip_date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}`).join('\n')}` : '\n✅ No upcoming skips'}

Use /skip to manage your dates
Use /diet to update preferences
  `.trim();

  await sendMessage(chatId, statusText);
}

async function handleHelpCommand(chatId: number) {
  const helpText = `
🍽️ Frontier Meals Commands

/diet - Update your dietary preferences
/skip - Skip meal dates
/status - View upcoming meals
/billing - Manage subscription & payment
/undo - Undo last skip
/help - Show this help message

Questions? Message @noahchonlee
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
    await sendMessage(chatId, 'No recent skips to undo.');
    return;
  }

  const skipToUndo = recentSkips[0];

  // Remove the skip
  await supabase
    .from('skips')
    .delete()
    .eq('id', skipToUndo.id);

  const date = new Date(skipToUndo.skip_date);
  const formattedDate = date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  await sendMessage(chatId, `✅ Undone! ${formattedDate} is back on your schedule.`);

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
      '❌ No billing account found. Please contact @noahchonlee for assistance.'
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
      '💳 Manage your Frontier Meals subscription:\n\n• Update payment method\n• View billing history\n• Cancel subscription\n\nClick the button below to access your billing portal (link expires in 30 minutes):',
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
      '❌ Error accessing billing portal. Please contact @noahchonlee for assistance.'
    );
  }
}

// Telegram API helpers

async function sendMessage(
  chatId: number,
  text: string,
  replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> }
) {
  const { TELEGRAM_BOT_TOKEN } = await import('$env/static/private');

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
    console.error('Telegram sendMessage error:', error);
    throw new Error(`Telegram API error: ${response.status}`);
  }

  return response.json();
}

async function answerCallbackQuery(queryId: string, text?: string) {
  const { TELEGRAM_BOT_TOKEN } = await import('$env/static/private');

  const payload: any = { callback_query_id: queryId };
  if (text) payload.text = text;

  await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
}
