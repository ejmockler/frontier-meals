const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://oyrwqihbdxevvdngksgz.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

(async () => {
  const { data: customers, error: customerError } = await supabase
    .from('customers')
    .select('id, email, telegram_user_id')
    .eq('email', 'necked414@gmail.com')
    .not('telegram_user_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);
    
  if (customerError) {
    console.error('Customer error:', customerError);
    return;
  }
  
  if (!customers || customers.length === 0) {
    console.log('No customer found');
    return;
  }
  
  const customer = customers[0];
  console.log('Customer:', customer);
  
  const { data: subscriptions, error: subError } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('customer_id', customer.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1);
    
  if (subError) {
    console.error('Subscription error:', subError);
    return;
  }
  
  if (!subscriptions || subscriptions.length === 0) {
    console.log('No active subscription found');
    return;
  }
  
  const sub = subscriptions[0];
  console.log('\nSubscription:');
  console.log('  ID:', sub.id);
  console.log('  Stripe Sub ID:', sub.stripe_subscription_id);
  console.log('  Status:', sub.status);
  console.log('  Period Start:', sub.current_period_start);
  console.log('  Period End:', sub.current_period_end);
  console.log('  Created At:', sub.created_at);
  console.log('  Updated At:', sub.updated_at);
})();
