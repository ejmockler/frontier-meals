-- Make subscription period dates nullable
-- These will be set by invoice.paid events, not checkout.session.completed
-- During checkout, the subscription exists but hasn't been billed yet

ALTER TABLE subscriptions
  ALTER COLUMN current_period_start DROP NOT NULL,
  ALTER COLUMN current_period_end DROP NOT NULL;

COMMENT ON COLUMN subscriptions.current_period_start IS 'Set by invoice.paid webhook (null until first invoice)';
COMMENT ON COLUMN subscriptions.current_period_end IS 'Set by invoice.paid webhook (null until first invoice)';
