-- Add mock7ee@gmail.com as admin user
-- Date: 2025-10-29

INSERT INTO staff_accounts (email, role)
VALUES ('mock7ee@gmail.com', 'admin')
ON CONFLICT (email) DO NOTHING;
