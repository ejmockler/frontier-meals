# Subscription Plans Sync Utility - Usage Guide

## Overview

The Subscription Plans Sync Utility (`/admin/discounts/sync-plans`) allows administrators to import PayPal subscription plans into the Frontier Meals translation layer. This is a one-time setup that enables creating discount codes without dealing with technical PayPal Plan IDs.

## Access

Navigate to: `/admin/discounts/sync-plans`

Or click the "Sync Plans" button on the main Discounts page.

## Adding a New Plan

### Step 1: Get PayPal Plan Information

From your PayPal account, copy either:

1. **Subscription URL** (from PayPal button code):
   ```
   https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-5ML4271244454362WXNWU5NQ
   ```

2. **Button Embed Code** (from PayPal):
   ```html
   <div id="paypal-button-container-P-5ML4271244454362WXNWU5NQ"></div>
   ```

3. **Raw Plan ID**:
   ```
   P-5ML4271244454362WXNWU5NQ
   ```

### Step 2: Extract Plan ID

1. Paste the PayPal URL or embed code into the text area
2. The utility automatically extracts the Plan ID using regex: `/P-[A-Z0-9]{20,}/g`
3. A green success banner appears showing: "Found Plan: P-5ML4271244454362WXNWU5NQ"

### Step 3: Add Business Details

Fill in the form fields:

- **Business Name**: Human-readable name (e.g., "Premium - Monthly ($29/mo)")
  - This is what admins see when creating discount codes
  - Should include price and billing cycle for clarity

- **Price**: Plan price amount (e.g., 29.00)
  - Must be a positive number
  - Used for discount calculations

- **Billing Cycle**: Select monthly or annual
  - Determines how discount duration is displayed

- **Set as Default**: Check if this should be the default plan
  - Only one plan can be default at a time
  - Default plan is used when no discount code is applied

### Step 4: Submit

Click "Add Plan" to save the plan to the database.

## Managing Existing Plans

### Your Plans Table

Shows all imported subscription plans with:

- Business name
- Truncated Plan ID (first 8 characters)
- Price and billing cycle
- Default status indicator
- Edit/Delete actions

### Editing a Plan

1. Click "Edit" on any plan
2. Form populates with current values
3. Update business name, price, or billing cycle
4. PayPal Plan ID cannot be changed (read-only)
5. Click "Update Plan" to save

### Deleting a Plan

1. Click "Delete" on any plan
2. Confirmation modal appears
3. Deletion is prevented if plan is used by any discount codes
4. If unused, plan is permanently deleted

## Error Handling

### Common Errors

1. **"No Plan ID found"**
   - Input doesn't contain a valid PayPal Plan ID
   - Ensure you copied the full URL or embed code
   - Plan ID format: `P-` followed by 20+ alphanumeric characters

2. **"This PayPal Plan ID already exists"**
   - Plan has already been imported
   - Check the "Your Plans" table below
   - Use Edit to update existing plan details

3. **"Cannot delete plan that is used by discount codes"**
   - Plan is referenced by one or more discount codes
   - Deactivate the plan instead (set is_active to false)
   - Or delete all discount codes using this plan first

4. **"Price must be a positive number"**
   - Price field is empty or invalid
   - Enter a valid decimal number (e.g., 29.00)

5. **"All fields are required"**
   - Fill in all form fields before submitting
   - Business name, price, and billing cycle are required

## Best Practices

### Naming Convention

Use descriptive business names that include:
- Plan tier (Premium, Basic, etc.)
- Billing cycle (Monthly, Annual)
- Price for quick reference

Examples:
- ✅ "Premium - Monthly ($29/mo)"
- ✅ "Basic - Annual ($99/yr)"
- ❌ "Plan A"
- ❌ "Monthly Plan"

### Default Plan Strategy

- Set your most common plan as default
- Typically the standard monthly plan
- Default plan is used when customers don't enter a discount code
- You can change default by editing any plan and checking "Set as default"

### Plan Organization

- Import all active PayPal plans upfront
- Plans appear in sort_order (automatically set to 0)
- Inactive PayPal plans can be imported but marked inactive
- Keep plan list current with your PayPal account

## Technical Details

### Regex Pattern

The utility uses this regex to extract PayPal Plan IDs:

```javascript
const planIdRegex = /P-[A-Z0-9]{20,}/g;
const matches = inputText.match(planIdRegex);
```

This matches:
- Starts with `P-`
- Followed by 20+ uppercase letters or digits
- Matches PayPal's Plan ID format

### Database Schema

Plans are stored in the `subscription_plans` table:

```sql
CREATE TABLE subscription_plans (
  id UUID PRIMARY KEY,
  business_name TEXT NOT NULL,
  description TEXT,
  price_amount DECIMAL(10,2) NOT NULL,
  price_currency TEXT DEFAULT 'USD',
  billing_cycle TEXT NOT NULL,
  paypal_plan_id TEXT NOT NULL UNIQUE,
  is_default BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### Constraints

- Only one plan can be default at a time (unique index)
- PayPal Plan IDs must be unique (unique constraint)
- Billing cycle must be 'monthly' or 'annual'
- Price must be positive

## Workflow Example

### Scenario: Adding a new promotional plan

1. Create plan in PayPal with 50% discount for first month
2. Copy the PayPal plan URL
3. Navigate to `/admin/discounts/sync-plans`
4. Paste URL in text area
5. Plan ID auto-extracted: `P-8KN91BCD234567890ABCDEFG`
6. Fill in:
   - Business Name: "Premium - Monthly 50% Off ($14.50/mo)"
   - Price: 14.50
   - Billing Cycle: monthly
   - Default: unchecked (this is a promotional plan)
7. Click "Add Plan"
8. Plan now available in discount code creation dropdown

### Next Steps

After syncing plans:
1. Go to `/admin/discounts/new`
2. Create discount codes that map to these plans
3. Distribute codes to customers via email/marketing
4. Track redemptions in the Discounts dashboard

## Support

If you encounter issues:

1. Check browser console for errors
2. Verify PayPal Plan ID format is correct
3. Ensure plan exists in your PayPal account
4. Contact technical support with:
   - Plan ID you're trying to import
   - Error message received
   - Screenshot of the sync-plans page
