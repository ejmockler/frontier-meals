# Telegram Bot UX Specification
## Multi-Select Skip Flow & Message Redesign

---

## 1. Multi-Select Skip Flow

### Current Problem
- Tapping a date immediately creates/removes a skip
- No chance to review selections before committing
- Easy to make mistakes
- Can't skip multiple dates at once efficiently

### New Solution: Form-Based Multi-Select

#### User Flow
```
/skip → View Calendar → Select/Deselect Dates → Confirm Changes
```

#### State Management
Store pending skip selections in-memory using a session state:

```typescript
// Session state (stored in Map keyed by telegram_user_id)
interface SkipSession {
  customer_id: string;
  selected_dates: Set<string>; // Dates to skip
  message_id: number;         // Last calendar message ID for editing
  expires_at: Date;           // Auto-expire after 5 minutes
}
```

#### Calendar Display
```
📅 Select dates to skip your meals
(Tap dates to toggle • Tap again to undo)

Currently selected: 3 dates

⬜ Mon 11/11    ⬜ Tue 11/12
✅ Wed 11/13   ⬜ Thu 11/14
✅ Fri 11/15    ⬜ Sat 11/16
⬜ Sun 11/17    ✅ Mon 11/18

[✅ Confirm (3 dates)] [❌ Cancel]
```

#### Button States
- **⬜ Date** - Not selected, available to skip
- **✅ Date** - Selected in this session
- **❌ Date (skipped)** - Already skipped (from database)
- **[Gray] Date** - Today or past (disabled)

#### Rules
1. **Cannot skip today** - Today's button is disabled/grayed out
2. **Can toggle existing skips** - If date already skipped, show ❌ and allow un-skipping
3. **Show selection count** - "Currently selected: 3 dates" updates live
4. **Confirm button shows count** - "[✅ Confirm (3 dates)]"
5. **Session timeout** - 5 minutes, then "⏱️ Selection expired. Use /skip to start again."

#### Implementation Details

**Data Flow:**
```typescript
1. User taps /skip
   → Create SkipSession
   → Load existing skips from DB
   → Render calendar with existing skips marked as ❌
   → Set session.expires_at = now + 5min

2. User taps date button (callback: skip_multi:2025-11-13)
   → Check if date in session.selected_dates
   → If yes: Remove from set (deselect)
   → If no: Add to set (select)
   → Edit message to update calendar UI
   → Update "Currently selected: X dates"

3. User taps [Confirm]
   → Batch insert all selected dates
   → Batch delete any deselected dates that were previously skipped
   → Clear session
   → Send confirmation: "✅ Updated! Skipped 3 dates, removed 1 skip."

4. User taps [Cancel] or 5min passes
   → Clear session
   → "Cancelled. No changes made."
```

**Callback Data Format:**
```
skip_multi:ACTION:VALUE

Examples:
skip_multi:toggle:2025-11-13  - Toggle date selection
skip_multi:confirm             - Confirm all changes
skip_multi:cancel              - Cancel session
```

**Database Operations:**
```typescript
// On confirm, batch process changes
const datesToAdd = [...session.selected_dates].filter(d => !existingSkips.has(d));
const datesToRemove = [...existingSkips].filter(d => !session.selected_dates.has(d));

// Batch insert
await supabase.from('skips').insert(
  datesToAdd.map(date => ({
    customer_id,
    skip_date: date,
    eligible_for_reimbursement: isSkipEligibleForReimbursement(date)
  }))
);

// Batch delete
await supabase.from('skips').delete()
  .in('skip_date', datesToRemove)
  .eq('customer_id', customer_id);
```

---

## 2. Message Tone & Voice Redesign

### Core Principles
- **Warm but not saccharine** - Genuine friendliness, not forced enthusiasm
- **Clear but conversational** - Direct info, natural language
- **Human but not chatty** - Brief, no fluff, just right
- **Helpful but not needy** - Offers help, doesn't beg for attention

### Message Inventory & Redesign

#### `/start` - First Time (No Token)
**Current:**
```
Welcome! To get started, please subscribe at https://frontier-meals.com

You'll receive a link to connect your Telegram account.
```

**New:**
```
Hey! Welcome to Frontier.

Head to frontier-meals.com to subscribe — we'll send you a link to connect your account here.

Questions? Hit up @noahchonlee
```

---

#### `/start` - Already Linked
**Current:**
```
Welcome back! Use /help to see available commands.
```

**New:**
```
Hey again! You're all set.

/skip to manage dates
/status to see what's coming
/help for everything else
```

---

#### `/start` - Invalid/Expired Token
**Current:**
```
❌ Invalid or expired link. Please use the link from your welcome email, or contact @noahchonlee for help.
```

**New:**
```
Hmm, that link isn't working — might be expired.

Check your welcome email for a fresh one, or ping @noahchonlee if you need a hand.
```

---

#### Account Successfully Linked
**Current:**
```
Welcome to Frontier Meals! 🍽️

Let's personalize your meal plan. What's your diet?
```

**New:**
```
Nice! You're connected.

Let's dial in your meals — what's your diet?
```

---

#### Diet Selection Follow-up
**Current:**
```
Great! Your diet is set to {diet}.

Do you have any food allergies?
```

**New:**
```
Got it — {diet} it is.

Any food allergies we should know about?
```

---

#### Allergy Warning
**Current:**
```
⚠️ Please message @noahchonlee directly to discuss your allergies so we can accommodate your needs safely.
```

**New:**
```
Let's make sure we get this right.

Send @noahchonlee a message so we can safely accommodate your needs.
```

---

#### Onboarding Complete
**Current:**
```
✅ All set! You'll receive your daily QR code at 12 PM PT.

Use /help to see available commands.
```

**New:**
```
You're all set!

Your daily QR drops at noon PT. See you then.

(/help if you need anything)
```

---

#### `/skip` - Calendar Header (Old Single-Tap)
**Current:**
```
📅 Select a date to skip your meal:

Dates marked with ❌ are already skipped.
```

**New (Multi-Select):**
```
📅 Select dates to skip your meals
(Tap to toggle • Confirm when ready)

Currently selected: 0 dates
```

---

#### Skip Confirmed (Old Single-Date)
**Current:**
```
✅ Skipped {date}. You won't receive a QR code for this date.
```

**New (Multi-Date):**
```
✅ Done! Skipped 3 dates.

You won't get QR codes for:
  • Wed Nov 13
  • Fri Nov 15
  • Mon Nov 18
```

---

#### Unskip Confirmed (Old Single-Date)
**Current:**
```
✅ {date} is back on your schedule!
```

**New:**
```
✅ {date} is back on.

You'll get your QR as usual.
```

---

#### Multi-Skip Confirmation (New - Mixed Add/Remove)
**New:**
```
✅ Updated!

Added skips:
  • Wed Nov 13
  • Mon Nov 18

Removed skips:
  • Fri Nov 15

(/status to see your schedule)
```

---

#### `/status` - Subscription Status
**Current:**
```
🍽️ Your Frontier Meals Status

📋 Subscription: active
📅 Current period: 11/1/2025 - 11/30/2025

🥗 Diet: vegan
⚠️ Allergies: None

📅 Upcoming skips:
  • Wed Nov 13
  • Fri Nov 15

Use /skip to manage your dates
Use /diet to update preferences
```

**New:**
```
Here's what's up:

📋 Subscription: Active
🗓 Current cycle: Nov 1 – Nov 30

🥗 Diet: Vegan
⚠️ Allergies: None

Upcoming skips:
  • Wed Nov 13
  • Fri Nov 15

/skip to change dates
/diet to update preferences
```

---

#### `/status` - No Upcoming Skips
**Current:**
```
✅ No upcoming skips
```

**New:**
```
No skips coming up — you're getting meals every day.
```

---

#### `/help` - Command List
**Current:**
```
🍽️ Frontier Meals Commands

/diet - Update your dietary preferences
/skip - Skip meal dates
/status - View upcoming meals
/billing - Manage subscription & payment
/undo - Undo last skip
/help - Show this help message

Questions? Message @noahchonlee
```

**New:**
```
Here's what you can do:

/diet — Update food preferences
/skip — Skip meal dates
/status — See what's coming
/billing — Manage subscription
/undo — Undo your last skip

Questions? Hit up @noahchonlee
```

---

#### `/undo` - Success
**Current:**
```
✅ Undone! {date} is back on your schedule.
```

**New:**
```
✅ Undone — {date} is back on.
```

---

#### `/undo` - No Recent Skips
**Current:**
```
No recent skips to undo.
```

**New:**
```
Nothing to undo — you haven't skipped anything recently.
```

---

#### `/billing` - Portal Access
**Current:**
```
💳 Manage your Frontier Meals subscription:

• Update payment method
• View billing history
• Cancel subscription

Click the button below to access your billing portal (link expires in 30 minutes):
```

**New:**
```
💳 Manage your subscription:

• Update payment
• View billing history
• Pause or cancel

Tap below to open your portal (expires in 30 min)
```

---

#### Error - Account Not Found
**Current:**
```
Error: Could not find your account. Please contact @noahchonlee
```

**New:**
```
Can't find your account.

Something's off — message @noahchonlee and we'll sort it out.
```

---

#### Error - General
**Current:**
```
❌ Error adding skip. Please try again or contact @noahchonlee.
```

**New:**
```
Something went wrong.

Try again? If it keeps happening, ping @noahchonlee.
```

---

#### Cancel Action
**Current:**
```
Cancelled.
```

**New:**
```
Got it — cancelled.
```

---

#### Unknown Command
**Current:**
```
Unknown command. Type /help to see available commands.
```

**New:**
```
Not sure what that is. Try /help to see what's available.
```

---

## 3. Technical Implementation Notes

### Session Storage
```typescript
// In-memory Map (sufficient for single-instance deployment)
const skipSessions = new Map<number, SkipSession>();

// Auto-cleanup stale sessions every minute
setInterval(() => {
  const now = new Date();
  for (const [userId, session] of skipSessions.entries()) {
    if (session.expires_at < now) {
      skipSessions.delete(userId);
    }
  }
}, 60000);
```

### Calendar Rendering
```typescript
function renderSkipCalendar(session: SkipSession, existingSkips: Set<string>) {
  const today = todayInPT();
  const buttons = [];

  for (let i = 0; i < 14; i++) {
    const date = addDays(new Date(today), i);
    const dateStr = format(date, 'yyyy-MM-dd');

    // Determine button state
    let text, emoji;
    if (i === 0) {
      // Today - disabled
      text = `[${format(date, 'EEE M/d')}]`;
      emoji = '⏸️';
    } else if (existingSkips.has(dateStr) && !session.selected_dates.has(dateStr)) {
      // Previously skipped, not in current selection (will be removed on confirm)
      text = format(date, 'EEE M/d');
      emoji = '⬜'; // Deselected for removal
    } else if (session.selected_dates.has(dateStr)) {
      // Selected in this session
      text = format(date, 'EEE M/d');
      emoji = '✅';
    } else if (existingSkips.has(dateStr)) {
      // Already skipped, not changing
      text = format(date, 'EEE M/d');
      emoji = '❌';
    } else {
      // Available to select
      text = format(date, 'EEE M/d');
      emoji = '⬜';
    }

    buttons.push({
      text: `${emoji} ${text}`,
      callback_data: i === 0 ? 'skip_multi:disabled' : `skip_multi:toggle:${dateStr}`
    });
  }

  // Arrange in rows of 2
  const rows = [];
  for (let i = 0; i < buttons.length; i += 2) {
    rows.push(buttons.slice(i, i + 2));
  }

  // Add confirm/cancel row
  const selectedCount = session.selected_dates.size;
  rows.push([
    { text: `✅ Confirm (${selectedCount})`, callback_data: 'skip_multi:confirm' },
    { text: '❌ Cancel', callback_data: 'skip_multi:cancel' }
  ]);

  return rows;
}
```

### Message Updates
Use `editMessageText` instead of sending new messages for better UX:

```typescript
await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    chat_id: chatId,
    message_id: session.message_id,
    text: newCalendarText,
    reply_markup: { inline_keyboard: newButtons }
  })
});
```

---

## 4. Testing Checklist

- [ ] Can select multiple dates
- [ ] Can deselect dates
- [ ] Cannot select today
- [ ] Can toggle existing skips (remove them)
- [ ] Confirm button shows correct count
- [ ] Session expires after 5 minutes
- [ ] Batch operations work correctly
- [ ] Message edits work smoothly
- [ ] All new message copy feels natural
- [ ] Error messages are helpful not scary

---

## 5. Migration Path

1. **Phase 1:** Update message copy only (keep single-tap behavior)
2. **Phase 2:** Implement session storage and multi-select logic
3. **Phase 3:** Deploy and monitor for bugs
4. **Phase 4:** Gather user feedback and iterate

---

## Voice Notes

**Good Frontier Vibes:**
- "Hey" not "Hello" or "Hi there!"
- "Got it" not "Acknowledged" or "Received"
- "Ping @noahchonlee" not "Please contact support"
- "Here's what's up" not "Current status:"
- "You're all set" not "Configuration complete"
- "Drops at noon" not "Will be delivered at 12:00 PM"

**Avoid:**
- Excessive emoji (one per message max, in context)
- Corporate speak ("utilize", "facilitate", "assistance")
- Unnecessary apologies ("Sorry for the inconvenience")
- Forced enthusiasm (!!!, 🎉 everywhere)
- Robotic language ("Your request has been processed")
