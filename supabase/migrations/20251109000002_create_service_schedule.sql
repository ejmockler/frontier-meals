-- Service Schedule Configuration
-- Manages weekday service patterns and date-specific exceptions

-- Table: service_schedule_config
-- Stores the base service pattern (which days of the week service is available)
CREATE TABLE service_schedule_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_days INTEGER[] DEFAULT '{1,2,3,4,5}', -- 0=Sunday, 1=Monday, ..., 6=Saturday
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES staff_accounts(id)
);

-- Insert default configuration (Monday-Friday service)
INSERT INTO service_schedule_config (service_days) VALUES ('{1,2,3,4,5}');

-- Table: service_exceptions
-- Stores date-specific overrides for holidays and special events
CREATE TABLE service_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('holiday', 'special_event')),
  name TEXT NOT NULL,
  is_service_day BOOLEAN NOT NULL,
  recurring TEXT NOT NULL DEFAULT 'one-time' CHECK (recurring IN ('annual', 'floating', 'one-time')),
  recurrence_rule TEXT, -- JSON string for floating holidays e.g. {"month":11,"day_of_week":4,"occurrence":4}
  created_by UUID REFERENCES staff_accounts(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(date, type)
);

-- Index for efficient date lookups
CREATE INDEX idx_service_exceptions_date ON service_exceptions(date);
CREATE INDEX idx_service_exceptions_type ON service_exceptions(type);

-- Insert default US holidays (2025)
INSERT INTO service_exceptions (date, type, name, is_service_day, recurring, recurrence_rule) VALUES
  ('2025-01-01', 'holiday', 'New Year''s Day', false, 'annual', NULL),
  ('2025-01-20', 'holiday', 'Martin Luther King Jr. Day', false, 'floating', '{"month":1,"day_of_week":1,"occurrence":3}'),
  ('2025-02-17', 'holiday', 'Presidents'' Day', false, 'floating', '{"month":2,"day_of_week":1,"occurrence":3}'),
  ('2025-05-26', 'holiday', 'Memorial Day', false, 'floating', '{"month":5,"day_of_week":1,"occurrence":-1}'),
  ('2025-07-04', 'holiday', 'Independence Day', false, 'annual', NULL),
  ('2025-09-01', 'holiday', 'Labor Day', false, 'floating', '{"month":9,"day_of_week":1,"occurrence":1}'),
  ('2025-11-27', 'holiday', 'Thanksgiving', false, 'floating', '{"month":11,"day_of_week":4,"occurrence":4}'),
  ('2025-11-28', 'holiday', 'Day after Thanksgiving', false, 'floating', '{"month":11,"day_of_week":5,"occurrence":4}'),
  ('2025-12-25', 'holiday', 'Christmas Day', false, 'annual', NULL);

-- RLS Policies
ALTER TABLE service_schedule_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_exceptions ENABLE ROW LEVEL SECURITY;

-- Admin read access
CREATE POLICY "Admins can view service schedule config"
  ON service_schedule_config
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_accounts
      WHERE staff_accounts.id = auth.uid()
    )
  );

-- Admin write access
CREATE POLICY "Admins can update service schedule config"
  ON service_schedule_config
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_accounts
      WHERE staff_accounts.id = auth.uid()
    )
  );

-- Admin read access to exceptions
CREATE POLICY "Admins can view service exceptions"
  ON service_exceptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_accounts
      WHERE staff_accounts.id = auth.uid()
    )
  );

-- Admin insert access to exceptions
CREATE POLICY "Admins can create service exceptions"
  ON service_exceptions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM staff_accounts
      WHERE staff_accounts.id = auth.uid()
    )
  );

-- Admin update access to exceptions
CREATE POLICY "Admins can update service exceptions"
  ON service_exceptions
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_accounts
      WHERE staff_accounts.id = auth.uid()
    )
  );

-- Admin delete access to exceptions
CREATE POLICY "Admins can delete service exceptions"
  ON service_exceptions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM staff_accounts
      WHERE staff_accounts.id = auth.uid()
    )
  );

-- Function to check if a date is a service day
-- Combines service_schedule_config (weekday pattern) with service_exceptions (overrides)
CREATE OR REPLACE FUNCTION is_service_day(check_date DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  day_of_week INTEGER;
  service_days INTEGER[];
  exception_record RECORD;
BEGIN
  -- Get day of week (0=Sunday, 1=Monday, ..., 6=Saturday)
  day_of_week := EXTRACT(DOW FROM check_date);

  -- Check for date-specific exception first
  SELECT * INTO exception_record
  FROM service_exceptions
  WHERE date = check_date
  LIMIT 1;

  -- If exception exists, use its is_service_day value
  IF FOUND THEN
    RETURN exception_record.is_service_day;
  END IF;

  -- Otherwise, check against service pattern
  SELECT service_schedule_config.service_days INTO service_days
  FROM service_schedule_config
  LIMIT 1;

  -- Return true if day_of_week is in service_days array
  RETURN day_of_week = ANY(service_days);
END;
$$;

COMMENT ON FUNCTION is_service_day(DATE) IS 'Checks if a given date is a service day based on weekday pattern and exceptions';
