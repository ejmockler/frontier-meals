/**
 * System Template Block Definitions
 *
 * Semantic block structures for all 9 system email templates.
 * These definitions match the existing HTML output and can be used
 * by the Block Editor to edit system templates.
 *
 * Block ID Pattern: {slug}-{type}-{index}
 */

import type { Block, TemplateSettings, Step } from '$lib/components/admin/email/editor-store';

export interface SystemTemplateDefinition {
  settings: TemplateSettings;
  blocks: Block[];
}

/**
 * System template block definitions
 *
 * Templates:
 * 1. qr_daily - Daily QR code delivery
 * 2. telegram_link - Welcome/onboarding with Telegram connection
 * 3. telegram_correction - Fix mistyped Telegram username
 * 4. dunning_soft - First payment failure notice
 * 5. dunning_retry - Second payment failure notice
 * 6. dunning_final - Final payment warning
 * 7. canceled_notice - Subscription canceled confirmation
 * 8. admin_magic_link - Admin login link
 * 9. schedule_change - Service schedule update notification
 */
export const SYSTEM_TEMPLATE_BLOCKS: Record<string, SystemTemplateDefinition> = {
  // ============================================================================
  // 1. QR Daily - Daily meal QR code
  // Source: src/lib/email/templates/qr-daily.ts
  // Variables: customer_name, day_name, date_formatted, qr_code_base64
  // ============================================================================
  'qr_daily': {
    settings: {
      colorScheme: 'green',
      emoji: '🍽️',
      title: 'Your QR Code for {{day_name}}',
      subtitle: '{{date_formatted}}'
    },
    blocks: [
      {
        id: 'qr_daily-greeting-1',
        type: 'greeting',
        variableName: 'customer_name'
      },
      {
        id: 'qr_daily-paragraph-1',
        type: 'paragraph',
        text: 'Scan this QR code at any kiosk to get your fresh meal today.',
        style: 'normal'
      },
      {
        id: 'qr_daily-image-1',
        type: 'image',
        cidReference: 'qr-code',
        alt: 'Your meal QR code for {{day_name}}',
        width: 280,
        height: 280
      },
      {
        id: 'qr_daily-infoBox-1',
        type: 'infoBox',
        boxType: 'warning',
        title: '⏰ Expires: Tonight at 11:59 PM PT',
        text: 'You can redeem this QR code any time before midnight Pacific Time.'
      },
      {
        id: 'qr_daily-divider-1',
        type: 'divider'
      },
      {
        id: 'qr_daily-codeInline-1',
        type: 'codeInline',
        text: 'Need to skip a day? Use /skip in Telegram'
      }
    ]
  },

  // ============================================================================
  // 2. Telegram Link - Welcome email with Telegram connection
  // Source: src/lib/email/templates/telegram-link.ts
  // Variables: customer_name, telegram_handle, deep_link
  // ============================================================================
  'telegram_link': {
    settings: {
      colorScheme: 'teal',
      emoji: '🍽️',
      title: 'Welcome to Frontier Meals!',
      subtitle: "Let's get you set up on Telegram"
    },
    blocks: [
      {
        id: 'telegram_link-greeting-1',
        type: 'greeting',
        variableName: 'customer_name'
      },
      {
        id: 'telegram_link-paragraph-1',
        type: 'paragraph',
        text: 'Your subscription is active! To complete your setup and manage your meals, connect with our Telegram bot.',
        style: 'normal'
      },
      {
        id: 'telegram_link-button-1',
        type: 'button',
        label: '📱 Connect on Telegram',
        urlVariable: 'deep_link'
      },
      {
        id: 'telegram_link-paragraph-2',
        type: 'paragraph',
        text: 'What happens next:',
        style: 'lead'
      },
      {
        id: 'telegram_link-stepList-1',
        type: 'stepList',
        steps: [
          {
            id: 'telegram_link-step-1',
            title: 'Connect on Telegram',
            description: 'Click the button above to open our bot'
          },
          {
            id: 'telegram_link-step-2',
            title: 'Set your preferences',
            description: 'Tell us your diet and any allergies'
          },
          {
            id: 'telegram_link-step-3',
            title: 'Get your daily QR code',
            description: 'Every day at 12 PM PT via email'
          },
          {
            id: 'telegram_link-step-4',
            title: 'Pick up your meal',
            description: 'Scan your QR at any kiosk before 11:59 PM PT'
          }
        ] as Step[]
      },
      {
        id: 'telegram_link-codeInline-1',
        type: 'codeInline',
        text: 'Your Telegram Handle: {{telegram_handle}}'
      },
      {
        id: 'telegram_link-infoBox-1',
        type: 'infoBox',
        boxType: 'warning',
        title: '⚠️ Important',
        text: 'You must connect on Telegram within 60 minutes to start receiving your daily QR codes.'
      }
    ]
  },

  // ============================================================================
  // 3. Telegram Correction - Fix mistyped username
  // Source: src/lib/email/templates/telegram-correction.ts
  // Variables: customer_name, handle_update_link, deep_link
  // ============================================================================
  'telegram_correction': {
    settings: {
      colorScheme: 'orange',
      emoji: '✏️',
      title: 'Correct Your Telegram Username',
      subtitle: "Let's fix this and get you connected"
    },
    blocks: [
      {
        id: 'telegram_correction-greeting-1',
        type: 'greeting',
        variableName: 'customer_name'
      },
      {
        id: 'telegram_correction-paragraph-1',
        type: 'paragraph',
        text: "We noticed you haven't connected your Telegram account yet. This might be because your username was mistyped during signup.",
        style: 'normal'
      },
      {
        id: 'telegram_correction-paragraph-2',
        type: 'paragraph',
        text: 'Please correct your Telegram username to activate your account:',
        style: 'normal'
      },
      {
        id: 'telegram_correction-button-1',
        type: 'button',
        label: '✏️ Update My Username',
        urlVariable: 'handle_update_link'
      },
      {
        id: 'telegram_correction-infoBox-1',
        type: 'infoBox',
        boxType: 'success',
        title: 'This will let you:',
        text: 'Receive daily meal QR codes, Set dietary preferences, Skip dates when you\'re away, Manage your meal schedule'
      },
      {
        id: 'telegram_correction-divider-1',
        type: 'divider'
      },
      {
        id: 'telegram_correction-paragraph-3',
        type: 'paragraph',
        text: "Alternative: If you don't know your Telegram username, you can also connect directly:",
        style: 'muted'
      },
      {
        id: 'telegram_correction-button-2',
        type: 'button',
        label: '📱 Connect on Telegram',
        urlVariable: 'deep_link',
        colorOverride: '#16a34a'
      },
      {
        id: 'telegram_correction-infoBox-2',
        type: 'infoBox',
        boxType: 'warning',
        title: '⏰ Links expire in 48 hours',
        text: 'Need help? Message @noahchonlee on Telegram.'
      }
    ]
  },

  // ============================================================================
  // 4. Dunning Soft - First payment failure
  // ============================================================================
  'dunning_soft': {
    settings: {
      colorScheme: 'amber',
      emoji: '💳',
      title: 'Payment Needs Attention',
      subtitle: 'We had trouble processing your payment'
    },
    blocks: [
      {
        id: 'dunning_soft-greeting-1',
        type: 'greeting',
        variableName: 'customer_name'
      },
      {
        id: 'dunning_soft-paragraph-1',
        type: 'paragraph',
        text: 'We had trouble processing your payment of {{amount_due}} for your Frontier Meals subscription.',
        style: 'normal'
      },
      {
        id: 'dunning_soft-paragraph-2',
        type: 'paragraph',
        text: "This happens sometimes! Usually it's due to:\n• Card expiration\n• Insufficient funds\n• Billing address change",
        style: 'normal'
      },
      {
        id: 'dunning_soft-paragraph-3',
        type: 'paragraph',
        text: 'Update your payment method now to keep your meals coming.',
        style: 'normal'
      },
      {
        id: 'dunning_soft-button-1',
        type: 'button',
        label: 'Update Payment Method',
        urlVariable: 'update_payment_url'
      },
      {
        id: 'dunning_soft-infoBox-1',
        type: 'infoBox',
        boxType: 'success',
        title: '✓ Good news',
        text: "Your meal access continues uninterrupted while we work this out. We'll automatically retry in 24-48 hours."
      }
    ]
  },

  // ============================================================================
  // 5. Dunning Retry - Second payment failure
  // ============================================================================
  'dunning_retry': {
    settings: {
      colorScheme: 'amber',
      emoji: '⚠️',
      title: 'Payment Still Pending',
      subtitle: 'Action needed to keep your service active'
    },
    blocks: [
      {
        id: 'dunning_retry-greeting-1',
        type: 'greeting',
        variableName: 'customer_name'
      },
      {
        id: 'dunning_retry-paragraph-1',
        type: 'paragraph',
        text: "We tried processing your payment again, but it still didn't go through.",
        style: 'normal'
      },
      {
        id: 'dunning_retry-paragraph-2',
        type: 'paragraph',
        text: "Your meal service will pause if we can't collect payment. Please update your card details now.",
        style: 'normal'
      },
      {
        id: 'dunning_retry-button-1',
        type: 'button',
        label: 'Update Payment Method',
        urlVariable: 'update_payment_url'
      },
      {
        id: 'dunning_retry-infoBox-1',
        type: 'infoBox',
        boxType: 'error',
        title: '⚠️ Action needed',
        text: "We'll make one more automatic retry in 24-48 hours. If that fails, your subscription will be canceled."
      }
    ]
  },

  // ============================================================================
  // 6. Dunning Final - Final payment warning
  // ============================================================================
  'dunning_final': {
    settings: {
      colorScheme: 'red',
      emoji: '🚨',
      title: 'Final Payment Attempt',
      subtitle: 'Immediate action required'
    },
    blocks: [
      {
        id: 'dunning_final-greeting-1',
        type: 'greeting',
        variableName: 'customer_name'
      },
      {
        id: 'dunning_final-paragraph-1',
        type: 'paragraph',
        text: 'This is our final automatic attempt to collect payment of {{amount_due}}.',
        style: 'normal'
      },
      {
        id: 'dunning_final-infoBox-1',
        type: 'infoBox',
        boxType: 'error',
        title: '🚨 Important',
        text: "If this payment fails, your subscription will be canceled and you'll stop receiving daily QR codes."
      },
      {
        id: 'dunning_final-paragraph-2',
        type: 'paragraph',
        text: "We'd love to keep serving you! Please update your payment method to continue.",
        style: 'normal'
      },
      {
        id: 'dunning_final-button-1',
        type: 'button',
        label: 'Update Payment Method',
        urlVariable: 'update_payment_url',
        colorOverride: '#dc2626' // Red for urgency
      },
      {
        id: 'dunning_final-paragraph-3',
        type: 'paragraph',
        text: "If you're facing financial difficulty or have questions, reach out to @noahchonlee on Telegram—we're here to help.",
        style: 'muted'
      }
    ]
  },

  // ============================================================================
  // 7. Canceled Notice - Subscription canceled
  // ============================================================================
  'canceled_notice': {
    settings: {
      colorScheme: 'gray',
      emoji: '👋',
      title: 'Subscription Canceled',
      subtitle: "We're sorry to see you go"
    },
    blocks: [
      {
        id: 'canceled_notice-greeting-1',
        type: 'greeting',
        variableName: 'customer_name'
      },
      {
        id: 'canceled_notice-paragraph-1',
        type: 'paragraph',
        text: "Your Frontier Meals subscription has been canceled. You'll stop receiving daily QR codes immediately.",
        style: 'normal'
      },
      {
        id: 'canceled_notice-divider-1',
        type: 'divider'
      },
      {
        id: 'canceled_notice-paragraph-2',
        type: 'paragraph',
        text: 'Want to come back?',
        style: 'lead'
      },
      {
        id: 'canceled_notice-paragraph-3',
        type: 'paragraph',
        text: "You're always welcome to resubscribe at frontiermeals.com",
        style: 'muted'
      },
      {
        id: 'canceled_notice-divider-2',
        type: 'divider'
      },
      {
        id: 'canceled_notice-paragraph-4',
        type: 'paragraph',
        text: "We appreciate you being part of Frontier Meals. If you have any feedback about your experience, we'd love to hear it—message @noahchonlee on Telegram.",
        style: 'muted'
      }
    ]
  },

  // ============================================================================
  // 8. Admin Magic Link - Admin login
  // ============================================================================
  'admin_magic_link': {
    settings: {
      colorScheme: 'orange',
      emoji: '🔐',
      title: 'Admin Login',
      subtitle: 'Access your dashboard'
    },
    blocks: [
      {
        id: 'admin_magic_link-paragraph-1',
        type: 'paragraph',
        text: 'Hi,',
        style: 'lead'
      },
      {
        id: 'admin_magic_link-paragraph-2',
        type: 'paragraph',
        text: 'Click the button below to access the Frontier Meals admin dashboard:',
        style: 'normal'
      },
      {
        id: 'admin_magic_link-button-1',
        type: 'button',
        label: 'Login to Admin Dashboard',
        urlVariable: 'magic_link'
      },
      {
        id: 'admin_magic_link-infoBox-1',
        type: 'infoBox',
        boxType: 'warning',
        title: '⏰ Expires in 15 minutes',
        text: 'This link can only be used once and will expire soon.'
      },
      {
        id: 'admin_magic_link-paragraph-3',
        type: 'paragraph',
        text: "If you didn't request this login link, you can safely ignore this email.",
        style: 'muted'
      },
      {
        id: 'admin_magic_link-divider-1',
        type: 'divider'
      },
      {
        id: 'admin_magic_link-paragraph-4',
        type: 'paragraph',
        text: 'Or copy and paste this URL into your browser:',
        style: 'muted'
      },
      {
        id: 'admin_magic_link-codeBlock-1',
        type: 'codeBlock',
        code: '{{magic_link}}'
      }
    ]
  },

  // ============================================================================
  // 9. Schedule Change - Service schedule update
  // ============================================================================
  'schedule_change': {
    settings: {
      colorScheme: 'teal',
      emoji: '📅',
      title: 'Schedule Update',
      subtitle: 'Your service schedule has changed'
    },
    blocks: [
      {
        id: 'schedule_change-greeting-1',
        type: 'greeting',
        variableName: 'customer_name'
      },
      {
        id: 'schedule_change-paragraph-1',
        type: 'paragraph',
        text: '{{message}}',
        style: 'normal'
      },
      {
        id: 'schedule_change-paragraph-2',
        type: 'paragraph',
        text: 'Affected Dates:',
        style: 'lead'
      },
      {
        id: 'schedule_change-paragraph-3',
        type: 'paragraph',
        text: '{{affected_dates_list}}',
        style: 'normal'
      },
      {
        id: 'schedule_change-infoBox-1',
        type: 'infoBox',
        boxType: 'info',
        title: 'Effective',
        text: '{{effective_date}}'
      },
      {
        id: 'schedule_change-paragraph-4',
        type: 'paragraph',
        text: 'If you have questions about this change, message @noahchonlee on Telegram.',
        style: 'muted'
      }
    ]
  }
};

/**
 * Get a system template definition by slug
 */
export function getSystemTemplateBlocks(slug: string): SystemTemplateDefinition | undefined {
  return SYSTEM_TEMPLATE_BLOCKS[slug];
}

/**
 * Get all system template slugs
 */
export function getSystemTemplateSlugs(): string[] {
  return Object.keys(SYSTEM_TEMPLATE_BLOCKS);
}

/**
 * Check if a slug is a system template
 */
export function isSystemTemplate(slug: string): boolean {
  return slug in SYSTEM_TEMPLATE_BLOCKS;
}
