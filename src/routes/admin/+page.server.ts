import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { PageServerLoad } from './$types';
import { IS_DEMO_MODE, getMockDashboardMetrics } from '$lib/demo';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const load: PageServerLoad = async () => {
  // Demo mode: return mock dashboard metrics
  if (IS_DEMO_MODE) {
    const mockMetrics = getMockDashboardMetrics();
    return {
      metrics: {
        totalCustomers: mockMetrics.totalCustomers,
        activeSubscriptions: mockMetrics.activeSubscriptions,
        todayRedemptions: mockMetrics.todayRedemptions,
        statusCounts: mockMetrics.subscriptionStats
      },
      recentActivity: mockMetrics.recentActivity
    };
  }

  const today = new Date().toISOString().split('T')[0];

  // Fetch dashboard metrics
  const [
    { count: totalCustomers },
    { count: activeSubscriptions },
    { count: todayRedemptions },
    { data: recentActivity }
  ] = await Promise.all([
    supabase.from('customers').select('*', { count: 'exact', head: true }),
    supabase.from('subscriptions').select('*', { count: 'exact', head: true }).eq('status', 'active'),
    supabase.from('redemptions').select('*', { count: 'exact', head: true }).eq('service_date', today),
    supabase
      .from('audit_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(10)
  ]);

  // Get subscription status breakdown
  const { data: subscriptionStats } = await supabase
    .from('subscriptions')
    .select('status');

  const statusCounts = subscriptionStats?.reduce((acc, sub) => {
    acc[sub.status] = (acc[sub.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return {
    metrics: {
      totalCustomers: totalCustomers || 0,
      activeSubscriptions: activeSubscriptions || 0,
      todayRedemptions: todayRedemptions || 0,
      statusCounts
    },
    recentActivity: recentActivity || []
  };
};
