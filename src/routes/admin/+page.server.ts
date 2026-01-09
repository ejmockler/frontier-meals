import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import type { PageServerLoad } from './$types';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export const load: PageServerLoad = async ({ depends }) => {
  depends('admin:dashboard'); // Mark for selective invalidation

  const today = new Date().toISOString().split('T')[0];

  // Fetch dashboard metrics and activity log
  const [
    { count: totalCustomers },
    { count: activeSubscriptions },
    { count: todayRedemptions },
    { data: rawActivity }
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

  // Extract all customer IDs from activity (batch operation)
  const customerIds = Array.from(new Set(
    (rawActivity || [])
      .map(a => a.subject?.match(/customer:([a-f0-9-]+)/)?.[1])
      .filter(Boolean) as string[]
  ));

  // Fetch ALL customers in ONE query (10x faster than N+1)
  const { data: customers } = customerIds.length > 0
    ? await supabase
        .from('customers')
        .select('id, email')
        .in('id', customerIds)
    : { data: [] };

  // Build lookup map for O(1) access
  const customerMap = new Map(
    (customers || []).map(c => [c.id, c.email])
  );

  // Enrich activity with customer names (no async, pure mapping)
  const recentActivity = (rawActivity || []).map(activity => {
    const customerIdMatch = activity.subject?.match(/customer:([a-f0-9-]+)/);
    const customerId = customerIdMatch?.[1];
    return {
      ...activity,
      customerName: customerId ? customerMap.get(customerId) || null : null
    };
  });

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
