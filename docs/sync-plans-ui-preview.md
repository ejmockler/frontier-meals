# Sync Subscription Plans - UI Preview

## Page Layout

### Header Section
```
┌─────────────────────────────────────────────────────────────┐
│ [←] Sync Subscription Plans                                  │
│     Import your PayPal subscription plans to create          │
│     discount codes for them.                                 │
└─────────────────────────────────────────────────────────────┘
```

**Elements:**
- Back arrow button (links to /admin/discounts)
- Page title: "Sync Subscription Plans"
- Subtitle explaining purpose

---

## Add New Plan Section

### Empty State (Before Extraction)
```
┌─ Add New Plan ───────────────────────────────────────────────┐
│                                                               │
│  Paste PayPal plan URL or button embed code:                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ https://www.paypal.com/webapps/billing/plans/           │ │
│  │ subscribe?plan_id=P-...                                  │ │
│  │                                                           │ │
│  │                                                           │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  Give it a friendly name:                                    │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Premium - Monthly ($29/mo)                               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  Price: $[ 29.00 ]    Billing Cycle: [monthly ▼]            │
│                                                               │
│  [ ] Set as default plan (used when no discount code)        │
│                                                               │
│                                     [Clear]  [Add Plan]      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Success State (After Extraction)
```
┌─ Add New Plan ───────────────────────────────────────────────┐
│                                                               │
│  Paste PayPal plan URL or button embed code:                 │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ https://www.paypal.com/webapps/billing/plans/           │ │
│  │ subscribe?plan_id=P-5ML4271244454362WXNWU5NQ            │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ✓ Found Plan: P-5ML4271244454362WXNWU5NQ                │ │  ← Green success banner
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  Give it a friendly name:                                    │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Premium - Monthly ($29/mo)                               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  Price: $[ 29.00 ]    Billing Cycle: [monthly ▼]            │
│                                                               │
│  [✓] Set as default plan (used when no discount code)        │
│                                                               │
│                                     [Clear]  [Add Plan]      │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### Edit Mode (Editing Existing Plan)
```
┌─ Edit Plan ──────────────────────────────────────────────────┐
│                                                               │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ ✓ Found Plan: P-5ML4271244454362WXNWU5NQ                │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  Give it a friendly name:                                    │
│  ┌─────────────────────────────────────────────────────────┐ │
│  │ Premium - Monthly ($29/mo)                               │ │
│  └─────────────────────────────────────────────────────────┘ │
│                                                               │
│  Price: $[ 29.00 ]    Billing Cycle: [monthly ▼]            │
│                                                               │
│  [ ] Set as default plan (used when no discount code)        │
│                                                               │
│                                   [Cancel]  [Update Plan]    │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

---

## Your Plans Section

### Empty State (No Plans)
```
┌─ Your Plans ─────────────────────────────────────────────────┐
│                                                               │
│                          📄                                   │
│                                                               │
│                   No plans yet                                │
│         Add your first PayPal subscription plan above         │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

### With Plans
```
┌─ Your Plans ─────────────────────────────────────────────────┐
├───────────────────────────────────────────────────────────────┤
│  Premium - Monthly ($29/mo)        [Default]                  │
│  P-5ML42...     $29.00 / monthly              [Edit] [Delete] │
├───────────────────────────────────────────────────────────────┤
│  Premium - Annual ($290/yr)                                   │
│  P-8KN91...     $290.00 / annual              [Edit] [Delete] │
├───────────────────────────────────────────────────────────────┤
│  Basic - Monthly ($9/mo)                                      │
│  P-2JF83...     $9.00 / monthly               [Edit] [Delete] │
└───────────────────────────────────────────────────────────────┘
```

---

## Delete Confirmation Modal

```
                    ┌─────────────────────────────────┐
                    │                                 │
                    │       ┌──────────────┐          │
                    │       │   🗑️         │          │
                    │       └──────────────┘          │
                    │                                 │
                    │      Delete Plan?               │
                    │                                 │
                    │  Are you sure you want to       │
                    │  delete Premium - Monthly       │
                    │  ($29/mo)? This action cannot   │
                    │  be undone.                     │
                    │                                 │
                    │  Note: Plans used by discount   │
                    │  codes cannot be deleted.       │
                    │                                 │
                    │  [Cancel]    [Delete Plan]      │
                    │                                 │
                    └─────────────────────────────────┘
```

---

## Color Scheme

### Buttons
- **Primary (Add/Update)**: Orange (#E67E50) with darker border (#D97F3E)
- **Secondary (Edit)**: Teal (#2D9B9B) with semi-transparent border
- **Destructive (Delete)**: Orange-red (#D97F3E)
- **Neutral (Cancel/Clear)**: Gray (#D9D7D2) with darker border (#B8B6B1)

### Status Indicators
- **Success Banner**: Green (#52A675) background with darker border
- **Default Badge**: Teal (#2D9B9B) with white text
- **Empty State Icon**: Light gray (#D9D7D2)

### Form Elements
- **Input Border**: Gray (#B8B6B1)
- **Focus Ring**: Orange (#E67E50)
- **Text**: Dark gray (#1A1816) for primary, medium gray (#5C5A56) for secondary
- **Background**: White with light gray (#D9D7D2) borders

### Typography
- **Headers**: font-extrabold, tracking-tight, text-[#1A1816]
- **Labels**: font-bold, text-sm
- **Descriptions**: text-[#5C5A56]
- **Plan IDs**: font-mono

---

## Responsive Behavior

### Desktop (>768px)
- Full-width form sections
- Two-column layout for price/billing cycle
- Action buttons right-aligned
- Plans table with full information

### Mobile (<768px)
- Single-column layout
- Stacked price and billing cycle fields
- Full-width action buttons
- Simplified plans list (no table)

---

## Interactive States

### Form Validation
- **Empty Fields**: Submit button disabled (opacity-50, cursor-not-allowed)
- **Valid Form**: Submit button enabled (hover effects active)
- **Plan ID Extracted**: Green success banner appears
- **No Plan ID Found**: Red error toast notification

### Button Hover States
- **Primary**: Shadow increases (shadow-lg → shadow-xl)
- **Secondary**: Background opacity changes
- **Edit/Delete**: Border opacity increases

### Loading States
- **Form Submission**: Button shows "Adding..." or "Updating..."
- **Delete Confirmation**: Modal closes, then toast appears

---

## Accessibility Features

- **ARIA Labels**: Back button has "Back to Discounts" label
- **Form Labels**: All inputs properly labeled with for/id attributes
- **Keyboard Navigation**: All interactive elements keyboard accessible
- **Focus Indicators**: Visible focus rings on all inputs
- **Modal Backdrop**: Clicking outside closes modal
- **Error Messages**: Clear, actionable error descriptions

---

## User Feedback

### Toast Notifications
```
┌─────────────────────────────────────┐
│ ✓ Plan created successfully         │  ← Green toast (success)
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ✗ This PayPal Plan ID already exists│  ← Orange toast (error)
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│ ℹ Plan ID extracted successfully    │  ← Teal toast (info)
└─────────────────────────────────────┘
```

**Toast Behavior:**
- Appears top-right corner
- Auto-dismisses after 3 seconds (success) or 5 seconds (error)
- Manual dismiss with ✕ button
- Slide-in animation from right

---

## Edge Cases Handled

### 1. Invalid Input
- No Plan ID detected → Red toast notification
- User can try again with different input

### 2. Duplicate Plan ID
- Form submission prevented
- Error message explains plan already exists
- Suggests checking "Your Plans" table

### 3. Default Plan Switch
- Only one plan can be default
- Checking new default automatically unchecks previous
- Database constraint prevents multiple defaults

### 4. Delete Protection
- Cannot delete plan used by discount codes
- Error message explains constraint
- Suggests deactivating plan instead

### 5. Missing Required Fields
- Submit button disabled until all fields filled
- Visual indication (opacity reduced)
- Cursor shows not-allowed icon

---

## Performance Optimizations

- **Auto-extraction**: Runs on input event (debounced internally by Svelte)
- **Regex**: Compiled once, reused for all extractions
- **Form validation**: Client-side before server submission
- **Optimistic UI**: Form clears immediately on success
- **Data invalidation**: Only refreshes plan list after mutations

---

## Development Notes

### Testing Checklist
- [ ] Paste full PayPal URL → Extracts Plan ID
- [ ] Paste embed code → Extracts Plan ID
- [ ] Paste just Plan ID → Extracts Plan ID
- [ ] Paste invalid text → Shows error
- [ ] Create plan → Appears in table
- [ ] Edit plan → Updates correctly
- [ ] Set default → Previous default unset
- [ ] Delete unused plan → Removes from table
- [ ] Delete used plan → Shows error
- [ ] Mobile responsive → All features work

### Browser Compatibility
- Modern browsers with ES6+ support
- Regex pattern works in all major browsers
- CSS Grid/Flexbox for layout
- No IE11 support required
