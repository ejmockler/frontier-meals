#!/usr/bin/env tsx
/**
 * Interactive Telegram Bot Testing Script
 *
 * Simulates Telegram webhook updates to test all bot functionality
 * without needing actual Telegram interaction.
 *
 * Usage: npx tsx scripts/test-telegram-bot.ts
 */

import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import { config } from 'dotenv';

// Load environment variables from .env file
config();

// Get environment variables
const SUPABASE_URL = process.env.PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const TELEGRAM_SECRET_TOKEN = process.env.TELEGRAM_SECRET_TOKEN!;
const WEBHOOK_URL = process.env.WEBHOOK_URL || 'http://localhost:5173/api/telegram/webhook';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Test data
const TEST_TELEGRAM_USER_ID = 999999999; // Fake Telegram ID for testing
const TEST_CHAT_ID = 999999999;

interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    chat: {
      id: number;
      type: string;
    };
    text?: string;
    entities?: Array<{ offset: number; length: number; type: string }>;
  };
  callback_query?: {
    id: string;
    from: {
      id: number;
      first_name: string;
      username?: string;
    };
    message: {
      message_id: number;
      from: {
        id: number;
        first_name: string;
        username?: string;
      };
      chat: {
        id: number;
        type: string;
      };
      text?: string;
    };
    data: string;
  };
}

let updateCounter = 1;

async function sendWebhook(update: TelegramUpdate): Promise<any> {
  console.log('\n🚀 Sending webhook update:', JSON.stringify(update, null, 2));

  const response = await fetch(WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Telegram-Bot-Api-Secret-Token': TELEGRAM_SECRET_TOKEN
    },
    body: JSON.stringify(update)
  });

  const result = await response.json();
  console.log(`✅ Response (${response.status}):`, result);

  return result;
}

function createMessageUpdate(text: string, isCommand: boolean = false): TelegramUpdate {
  const entities = isCommand ? [{
    offset: 0,
    length: text.indexOf(' ') > 0 ? text.indexOf(' ') : text.length,
    type: 'bot_command'
  }] : undefined;

  return {
    update_id: updateCounter++,
    message: {
      message_id: updateCounter,
      from: {
        id: TEST_TELEGRAM_USER_ID,
        first_name: 'Test',
        username: 'testuser'
      },
      chat: {
        id: TEST_CHAT_ID,
        type: 'private'
      },
      text,
      entities
    }
  };
}

function createCallbackUpdate(data: string): TelegramUpdate {
  return {
    update_id: updateCounter++,
    callback_query: {
      id: crypto.randomUUID(),
      from: {
        id: TEST_TELEGRAM_USER_ID,
        first_name: 'Test',
        username: 'testuser'
      },
      message: {
        message_id: updateCounter,
        from: {
          id: TEST_TELEGRAM_USER_ID,
          first_name: 'Bot',
          username: 'frontiermealsbot'
        },
        chat: {
          id: TEST_CHAT_ID,
          type: 'private'
        },
        text: 'Previous message'
      },
      data
    }
  };
}

async function createTestCustomer(): Promise<string> {
  console.log('\n📝 Creating test customer...');

  // Create customer
  const { data: customer, error: customerError } = await supabase
    .from('customers')
    .insert({
      email: 'test@frontiermeals.com',
      name: 'Test Customer',
      stripe_customer_id: 'cus_test_' + crypto.randomBytes(8).toString('hex'),
      telegram_user_id: null // Not linked yet
    })
    .select()
    .single();

  if (customerError) {
    throw new Error(`Failed to create customer: ${customerError.message}`);
  }

  console.log('✅ Customer created:', customer.id);

  // Create active subscription
  const { error: subError } = await supabase
    .from('subscriptions')
    .insert({
      customer_id: customer.id,
      stripe_subscription_id: 'sub_test_' + crypto.randomBytes(8).toString('hex'),
      status: 'active',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    });

  if (subError) {
    throw new Error(`Failed to create subscription: ${subError.message}`);
  }

  console.log('✅ Subscription created');

  return customer.id;
}

async function createDeepLinkToken(customerId: string): Promise<string> {
  console.log('\n🔗 Creating deep link token...');

  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  const { error } = await supabase
    .from('telegram_deep_link_tokens')
    .insert({
      customer_id: customerId,
      token_hash: tokenHash,
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      used: false
    });

  if (error) {
    throw new Error(`Failed to create token: ${error.message}`);
  }

  console.log('✅ Token created');
  console.log('📎 Deep link:', `https://t.me/frontiermealsbot?start=${rawToken}`);

  return rawToken;
}

async function cleanupTestData(customerId: string) {
  console.log('\n🧹 Cleaning up test data...');

  // Delete in order to avoid foreign key constraints
  await supabase.from('skips').delete().eq('customer_id', customerId);
  await supabase.from('subscriptions').delete().eq('customer_id', customerId);
  await supabase.from('telegram_link_status').delete().eq('customer_id', customerId);
  await supabase.from('telegram_deep_link_tokens').delete().eq('customer_id', customerId);
  await supabase.from('audit_log').delete().eq('subject', `customer:${customerId}`);
  await supabase.from('customers').delete().eq('id', customerId);

  console.log('✅ Cleanup complete');
}

async function runTests() {
  console.log('🧪 Telegram Bot Test Suite\n');
  console.log('Webhook URL:', WEBHOOK_URL);
  console.log('===================================\n');

  let customerId: string | null = null;
  let linkToken: string | null = null;

  try {
    // PHASE 1: Setup
    console.log('\n📋 PHASE 1: SETUP');
    console.log('=================');
    customerId = await createTestCustomer();
    linkToken = await createDeepLinkToken(customerId);

    // PHASE 2: Account Linking
    console.log('\n\n📋 PHASE 2: ACCOUNT LINKING');
    console.log('============================');

    console.log('\n1️⃣ Test: /start without token (should prompt to subscribe)');
    await sendWebhook(createMessageUpdate('/start', true));
    await sleep(1000);

    console.log('\n2️⃣ Test: /start with valid token (should link account)');
    await sendWebhook(createMessageUpdate(`/start ${linkToken}`, true));
    await sleep(1000);

    console.log('\n3️⃣ Test: /start again (should welcome back)');
    await sendWebhook(createMessageUpdate('/start', true));
    await sleep(1000);

    // PHASE 3: Dietary Preferences
    console.log('\n\n📋 PHASE 3: DIETARY PREFERENCES');
    console.log('================================');

    console.log('\n1️⃣ Test: Select "Vegetarian" diet');
    await sendWebhook(createCallbackUpdate('diet:vegetarian'));
    await sleep(1000);

    console.log('\n2️⃣ Test: Respond "No allergies"');
    await sendWebhook(createCallbackUpdate('allergy:none'));
    await sleep(1000);

    console.log('\n3️⃣ Test: /diet command (change diet)');
    await sendWebhook(createMessageUpdate('/diet', true));
    await sleep(1000);

    console.log('\n4️⃣ Test: Change to "Vegan"');
    await sendWebhook(createCallbackUpdate('diet:vegan'));
    await sleep(1000);

    // PHASE 4: Meal Skipping
    console.log('\n\n📋 PHASE 4: MEAL SKIPPING');
    console.log('=========================');

    console.log('\n1️⃣ Test: /skip command');
    await sendWebhook(createMessageUpdate('/skip', true));
    await sleep(1000);

    // Get tomorrow's date
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = tomorrow.toISOString().split('T')[0];

    console.log(`\n2️⃣ Test: Skip tomorrow (${tomorrowStr})`);
    await sendWebhook(createCallbackUpdate(`skip:${tomorrowStr}`));
    await sleep(1000);

    console.log('\n3️⃣ Test: /skip again (should show tomorrow as skipped)');
    await sendWebhook(createMessageUpdate('/skip', true));
    await sleep(1000);

    console.log(`\n4️⃣ Test: Unskip tomorrow (${tomorrowStr})`);
    await sendWebhook(createCallbackUpdate(`skip:${tomorrowStr}`));
    await sleep(1000);

    // PHASE 5: Status & Help
    console.log('\n\n📋 PHASE 5: STATUS & HELP');
    console.log('==========================');

    console.log('\n1️⃣ Test: /status command');
    await sendWebhook(createMessageUpdate('/status', true));
    await sleep(1000);

    console.log('\n2️⃣ Test: /help command');
    await sendWebhook(createMessageUpdate('/help', true));
    await sleep(1000);

    // PHASE 6: Undo
    console.log('\n\n📋 PHASE 6: UNDO FUNCTIONALITY');
    console.log('===============================');

    // Skip a date first
    const dayAfterTomorrow = new Date();
    dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2);
    const dayAfterTomorrowStr = dayAfterTomorrow.toISOString().split('T')[0];

    console.log(`\n1️⃣ Test: Skip day after tomorrow (${dayAfterTomorrowStr})`);
    await sendWebhook(createMessageUpdate('/skip', true));
    await sleep(500);
    await sendWebhook(createCallbackUpdate(`skip:${dayAfterTomorrowStr}`));
    await sleep(1000);

    console.log('\n2️⃣ Test: /undo command');
    await sendWebhook(createMessageUpdate('/undo', true));
    await sleep(1000);

    console.log('\n3️⃣ Test: /undo again (no skips to undo)');
    await sendWebhook(createMessageUpdate('/undo', true));
    await sleep(1000);

    // PHASE 7: Billing
    console.log('\n\n📋 PHASE 7: BILLING');
    console.log('===================');

    console.log('\n1️⃣ Test: /billing command');
    await sendWebhook(createMessageUpdate('/billing', true));
    await sleep(1000);

    // PHASE 8: Error Cases
    console.log('\n\n📋 PHASE 8: ERROR HANDLING');
    console.log('===========================');

    console.log('\n1️⃣ Test: Invalid command');
    await sendWebhook(createMessageUpdate('/invalidcommand', true));
    await sleep(1000);

    console.log('\n2️⃣ Test: Cancel skip selection');
    await sendWebhook(createMessageUpdate('/skip', true));
    await sleep(500);
    await sendWebhook(createCallbackUpdate('skip:cancel'));
    await sleep(1000);

    // Success!
    console.log('\n\n✅ ALL TESTS COMPLETED SUCCESSFULLY!');
    console.log('====================================\n');

  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    throw error;
  } finally {
    if (customerId) {
      await cleanupTestData(customerId);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run tests
runTests().catch(console.error);
