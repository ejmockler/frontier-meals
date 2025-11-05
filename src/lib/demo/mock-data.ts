/**
 * Demo Mode Mock Data Repository
 *
 * All mock data for demo mode simulations
 */

import type {
  DemoCustomer,
  DemoAdminSession,
  DemoKioskSession,
  DemoRedemptionResult
} from './types';

/**
 * Mock Customers - realistic variety for demos
 */
export const DEMO_CUSTOMERS: DemoCustomer[] = [
  {
    id: 'demo-cust-001',
    name: 'Alex Demo',
    email: 'alex.demo@example.com',
    dietary_flags: {
      vegetarian: true,
      gluten_free: true
    },
    phone: '555-0001'
  },
  {
    id: 'demo-cust-002',
    name: 'Jamie Test',
    email: 'jamie.test@example.com',
    dietary_flags: {
      vegan: true,
      nut_allergy: true
    },
    phone: '555-0002'
  },
  {
    id: 'demo-cust-003',
    name: 'Taylor Sample',
    email: 'taylor.sample@example.com',
    dietary_flags: {
      dairy_free: true
    },
    phone: '555-0003'
  },
  {
    id: 'demo-cust-004',
    name: 'Morgan Preview',
    email: 'morgan.preview@example.com',
    dietary_flags: {},
    phone: '555-0004'
  },
  {
    id: 'demo-cust-005',
    name: 'Casey Showcase',
    email: 'casey.showcase@example.com',
    dietary_flags: {
      gluten_free: true,
      dairy_free: true,
      nut_allergy: true
    },
    phone: '555-0005'
  }
];

/**
 * Get a random demo customer
 */
export function getRandomDemoCustomer(): DemoCustomer {
  return DEMO_CUSTOMERS[Math.floor(Math.random() * DEMO_CUSTOMERS.length)];
}

/**
 * Get demo customer by ID or return random
 */
export function getDemoCustomer(id?: string): DemoCustomer {
  if (id) {
    const customer = DEMO_CUSTOMERS.find((c) => c.id === id);
    if (customer) return customer;
  }
  return getRandomDemoCustomer();
}

/**
 * Mock Admin Session
 */
export function getMockAdminSession(): DemoAdminSession {
  return {
    sessionId: 'demo-admin-session-' + Date.now(),
    email: 'demo.admin@frontier-meals.com',
    role: 'admin',
    createdAt: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString() // 7 days
  };
}

/**
 * Mock Kiosk Session
 */
export function getMockKioskSession(token: string): DemoKioskSession {
  return {
    valid: true,
    kiosk_id: 'demo-kiosk-001',
    location: 'Demo Location - Main Office'
  };
}

/**
 * Mock Redemption Scenarios
 */
export function getMockRedemptionResult(qrToken: string): DemoRedemptionResult {
  // Use QR token to determine scenario for consistency
  const hash = qrToken.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const scenario = hash % 10;

  // 70% success, 15% already redeemed, 10% expired, 5% invalid
  if (scenario < 7) {
    // Success scenario
    const customer = getRandomDemoCustomer();
    return {
      success: true,
      customer_name: customer.name,
      customer_dietary_flags: customer.dietary_flags,
      redemption_id: 'demo-redemption-' + Date.now()
    };
  } else if (scenario < 8) {
    // Already redeemed scenario
    return {
      success: false,
      error_code: 'ALREADY_REDEEMED',
      error_message: 'This meal has already been redeemed today'
    };
  } else if (scenario < 9) {
    // Expired scenario
    return {
      success: false,
      error_code: 'EXPIRED',
      error_message: 'This QR code has expired'
    };
  } else {
    // Invalid customer scenario
    return {
      success: false,
      error_code: 'CUSTOMER_NOT_FOUND',
      error_message: 'Customer not found in system'
    };
  }
}

/**
 * Mock customer list for admin dashboard
 */
export function getMockCustomerList() {
  return DEMO_CUSTOMERS.map((customer) => ({
    ...customer,
    subscription_status: 'active',
    subscription_plan: 'daily',
    created_at: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
    total_redemptions: Math.floor(Math.random() * 100)
  }));
}

/**
 * Mock email templates
 */
export function getMockEmailTemplates() {
  return [
    {
      id: 'demo-template-001',
      slug: 'demo_welcome_email',
      subject: 'Welcome to Frontier Meals (Demo)',
      html_body: '<html><body><h1>Welcome!</h1><p>This is a demo email template.</p></body></html>',
      variables: { customer_name: 'Demo User' },
      created_at: new Date().toISOString()
    },
    {
      id: 'demo-template-002',
      slug: 'demo_qr_daily',
      subject: 'Your Daily QR Code (Demo)',
      html_body: '<html><body><h1>Your QR Code</h1><p>Scan to redeem your meal!</p></body></html>',
      variables: { qr_code_url: 'https://example.com/qr' },
      created_at: new Date().toISOString()
    }
  ];
}

/**
 * Mock dashboard metrics for admin dashboard
 */
export function getMockDashboardMetrics() {
  return {
    totalCustomers: DEMO_CUSTOMERS.length,
    activeSubscriptions: 4,
    todayRedemptions: 3,
    recentActivity: [
      {
        id: 'demo-activity-001',
        created_at: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
        action: 'meal_redeemed',
        actor: 'customer:demo-cust-001',
        subject: 'customer:demo-cust-001',
        metadata: {
          customer_name: 'Alex Demo',
          location: 'Demo Location - Main Office'
        }
      },
      {
        id: 'demo-activity-002',
        created_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
        action: 'subscription_created',
        actor: 'system',
        subject: 'customer:demo-cust-002',
        metadata: {
          customer_name: 'Jamie Test',
          stripe_customer_id: 'cus_demo_002'
        }
      },
      {
        id: 'demo-activity-003',
        created_at: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
        action: 'meal_redeemed',
        actor: 'customer:demo-cust-003',
        subject: 'customer:demo-cust-003',
        metadata: {
          customer_name: 'Taylor Sample',
          location: 'Demo Location - Main Office'
        }
      }
    ],
    subscriptionStats: {
      active: 4,
      past_due: 0,
      canceled: 1,
      trialing: 0
    }
  };
}
