-- Fix is_service_day to be VOLATILE instead of STABLE
-- STABLE tells Postgres the function result won't change within a transaction,
-- but we're actively modifying service_schedule_config and service_exceptions during tests!

CREATE OR REPLACE FUNCTION is_service_day(check_date DATE)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE  -- Changed from STABLE - function result CAN change within transaction
SECURITY DEFINER
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

COMMENT ON FUNCTION is_service_day(DATE) IS 'Checks if a given date is a service day. Uses VOLATILE to prevent caching across transactions.';
