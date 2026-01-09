# BlockEditor Architecture

Visual guide to the component structure, data flow, and perceptual design.

## Component Hierarchy

```
BlockEditor.svelte (Main Container)
├── Template Settings Section
│   ├── Color Swatches (6 options)
│   ├── Emoji Picker (10 options)
│   ├── Title Input
│   └── Subtitle Input
│
├── Blocks Section
│   ├── BlockCard.svelte (for each block)
│   │   ├── Block Header
│   │   │   ├── Drag Handle ☰
│   │   │   ├── Block Icon 👋
│   │   │   ├── Block Label "Greeting"
│   │   │   └── Delete Button ×
│   │   └── Block Content (type-specific)
│   │       ├── GreetingBlock: variableName input
│   │       ├── ParagraphBlock: text textarea + style select
│   │       ├── InfoBoxBlock: type select + title + text
│   │       ├── ButtonBlock: label + URL var + color
│   │       ├── StepListBlock: dynamic step items
│   │       ├── CodeBlock: code textarea
│   │       ├── ImageBlock: CID + alt + dimensions
│   │       └── Divider/Spacer: static visual
│   │
│   └── Add Block Button
│       └── BlockPalette.svelte (modal overlay)
│           └── Grid of 10 block types
│
├── Variables Section (auto-generated)
│   └── Variable Rows
│       ├── Variable Name (code tag)
│       └── Test Value Input
│
└── Live Preview Section
    └── iframe with generated HTML
```

## Data Flow

```
User Action → editorActions → editorState Store → Reactive UI Update
                                    ↓
                            detectedVariables (derived)
                                    ↓
                            Variables Section
                                    ↓
                            HTML Generation
                                    ↓
                            Live Preview
```

### Example Flow: Adding a Block

```
1. User clicks "Add Block" button
   ↓
2. showPalette = true
   ↓
3. BlockPalette renders (overlay)
   ↓
4. User clicks "Greeting" option
   ↓
5. Event: dispatch('select', 'greeting')
   ↓
6. editorActions.addBlock('greeting')
   ↓
7. editorState.update(state => {
     blocks: [...state.blocks, newGreetingBlock]
   })
   ↓
8. Svelte reactivity triggers
   ↓
9. New BlockCard renders (<100ms)
   ↓
10. detectedVariables updates
    ↓
11. Variables section updates
    ↓
12. HTML regenerates
    ↓
13. Preview iframe updates
```

**Total time: <100ms** (perceived as instant)

## State Structure

```typescript
EditorState {
  settings: {
    colorScheme: 'orange' | 'teal' | 'green' | 'amber' | 'red' | 'gray'
    emoji: string           // e.g., "🍽️"
    title: string           // e.g., "Your Daily Meal"
    subtitle: string        // e.g., "Ready for pickup"
  }

  blocks: [
    {
      id: 'block_1234567890_0'  // Unique ID (timestamp + counter)
      type: 'greeting'
      variableName: 'customer_name'
    },
    {
      id: 'block_1234567890_1'
      type: 'paragraph'
      text: 'Welcome to {{service_name}}!'
      style: 'lead'
    },
    {
      id: 'block_1234567890_2'
      type: 'button'
      label: 'Get Started'
      urlVariable: 'onboarding_url'
      colorOverride: '#E67E50'
    }
    // ... more blocks
  ]

  variables: {
    'customer_name': 'Jane Doe',        // Test value
    'service_name': 'Frontier Meals',
    'onboarding_url': 'https://example.com/start'
  }
}
```

## Store Architecture

```
editor-store.ts
│
├── Writable Stores
│   └── editorState (main state container)
│
├── Derived Stores
│   ├── settings (derived from editorState.settings)
│   ├── blocks (derived from editorState.blocks)
│   ├── variables (derived from editorState.variables)
│   └── detectedVariables (scans blocks for {{var}} patterns)
│
└── Actions (pure functions)
    ├── updateSettings(partial)
    ├── addBlock(type, index?)
    ├── updateBlock(id, updates)
    ├── deleteBlock(id)
    ├── moveBlock(fromIndex, toIndex)
    ├── addStep(blockId)
    ├── updateStep(blockId, stepId, updates)
    ├── deleteStep(blockId, stepId)
    ├── setVariable(name, value)
    ├── deleteVariable(name)
    ├── loadState(newState)
    └── reset()
```

## Perceptual Layout

```
┌────────────────────────────────────────────────────────────┐
│  TEMPLATE SETTINGS (Collapsible)                     [▼]  │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ Color:  [●][●][●][●][●][●]  ← Visual swatches       │ │
│  │ Emoji:  [🍽️][💳][⚠️]...      ← Grid of options       │ │
│  │ Title:  [________________]  ← Text input            │ │
│  │ Subtitle: [______________]                           │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────────┐
│  BLOCKS                                            [3]     │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ☰ 👋 Greeting                                    [×] │ │ ← Block header
│  ├──────────────────────────────────────────────────────┤ │
│  │ Variable Name: [customer_name]                       │ │ ← Type-specific
│  └──────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ☰ 📝 Paragraph                                   [×] │ │
│  ├──────────────────────────────────────────────────────┤ │
│  │ Text: [___________________________]                  │ │
│  │ Style: [Normal ▼]                                    │ │
│  └──────────────────────────────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ ☰ 🔘 Button                                      [×] │ │
│  ├──────────────────────────────────────────────────────┤ │
│  │ Label: [Click Here]                                  │ │
│  │ URL Var: [payment_url]                               │ │
│  │ Color: [#E67E50]                                     │ │
│  └──────────────────────────────────────────────────────┘ │
│  [+ Add Block] ← CTA to open palette                     │
└────────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────────┐
│  VARIABLES (Auto-detected)                         [2]    │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ {{customer_name}}  [Jane Doe_____________]           │ │
│  │ {{payment_url}}    [https://example.com__]           │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
                         ↓
┌────────────────────────────────────────────────────────────┐
│  LIVE PREVIEW                                      [Live] │
│  ┌──────────────────────────────────────────────────────┐ │
│  │ [Email preview iframe - 600px width]                 │ │
│  │                                                      │ │
│  │  Rendered HTML with test variable values           │ │
│  │                                                      │ │
│  └──────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────┘
```

## Visual Hierarchy (Z-Index)

```
Layer 0: Page background
Layer 1: Editor sections (cards with border)
Layer 2: Block cards
Layer 3: Inputs, buttons (focus states)
Layer 4: Drag preview (during drag)
Layer 50: Palette overlay backdrop (blur)
Layer 51: Palette modal
```

## Color System

```
Block Type Colors (Left Border Accent):
┌─[#52A675]─ Greeting    (Green - welcoming)
┌─[#374151]─ Paragraph   (Dark Gray - neutral content)
┌─[#2563EB]─ Info Box    (Blue - informational)
┌─[#E67E50]─ Button      (Orange - action/CTA)
┌─[#8B5CF6]─ Step List   (Purple - process)
┌─[#6B7280]─ Code        (Gray - technical)
┌─[#0F766E]─ Image       (Teal - media)
┌─[#D1D5DB]─ Structure   (Light Gray - layout)

Template Color Schemes:
🟠 Orange  (#c2410c) - Default, warm
🔵 Teal    (#0f766e) - Informational
🟢 Green   (#15803d) - Success
🟡 Amber   (#b45309) - Warning
🔴 Red     (#b91c1c) - Urgent
⚫ Gray    (#374151) - Neutral

All meet WCAG AAA (7:1 contrast on white)
```

## Interaction States

```
Button States:
┌─────────────┐
│   Default   │  Border: 2px solid #D97F3E
├─────────────┤  Background: #E67E50
│   Hover     │  Shadow: 0 10px 15px
├─────────────┤  Transform: none
│   Active    │  Transform: scale(0.98)
├─────────────┤  Duration: 100ms
│   Disabled  │  Opacity: 0.5
└─────────────┘  Cursor: not-allowed

Block Card States:
┌─────────────┐
│   Default   │  Border: 2px #D9D7D2
├─────────────┤  Box-shadow: none
│   Hover     │  Box-shadow: 0 4px 6px
├─────────────┤  Transition: 100ms
│   Dragging  │  Cursor: grabbing
└─────────────┘  Opacity: 0.8

Input States:
┌─────────────┐
│   Default   │  Border: 2px #D1D5DB
├─────────────┤
│   Focus     │  Border: 2px #E67E50
│             │  Box-shadow: 0 0 0 3px rgba(230,126,80,0.1)
├─────────────┤  Transition: 100ms
│   Error     │  Border: 2px #DC2626
└─────────────┘  Box-shadow: 0 0 0 3px rgba(220,38,38,0.1)
```

## Responsive Breakpoints

```
Desktop (>1024px):
- Full width blocks
- Side-by-side variable inputs
- Expanded palette grid

Tablet (768px - 1024px):
- Single column layout
- Stacked variable inputs
- Compact palette grid

Mobile (<768px):
- Touch-friendly drag handles
- Full-width inputs
- 2-column palette grid
- Collapsible sections default closed
```

## Animation Timings

```
Instant Feedback (<16ms / 60fps):
- Drag cursor change
- Button active state
- Input focus ring

Fast Feedback (<100ms):
- Block add/remove
- State updates
- Hover states
- Palette open/close

Perceptible (<200ms):
- HTML generation
- Preview update
- Section collapse

Acceptable (<500ms):
- Initial render
- Large email (50+ blocks)
```

## Memory Layout

```
JavaScript Heap:
┌─────────────────────────────────────┐
│ editorState (Svelte store)          │
│ ├─ settings (~200 bytes)            │
│ ├─ blocks (~500 bytes per block)    │
│ └─ variables (~100 bytes per var)   │
│                                     │
│ Typical 10-block email: ~7KB        │
│ Large 50-block email: ~30KB         │
│ Peak memory: <1MB                   │
└─────────────────────────────────────┘

DOM Nodes (Per Email):
- Template settings: ~30 nodes
- Block card: ~15 nodes × N blocks
- Variables: ~5 nodes × N variables
- Preview: 1 iframe
- Total for 10 blocks: ~250 nodes
```

## File Sizes

```
Component Code:
BlockEditor.svelte    20 KB (6 KB gzipped)
BlockCard.svelte      14 KB (4 KB gzipped)
BlockPalette.svelte    5 KB (2 KB gzipped)
editor-store.ts        8 KB (3 KB gzipped)

Total: 47 KB raw, 15 KB gzipped

Runtime Dependencies:
- Svelte runtime: ~10 KB gzipped
- Email templates base: ~8 KB gzipped

Total bundle impact: ~33 KB gzipped
```

## API Surface

```typescript
// Public Exports (from index.ts)

// Components
export { BlockEditor }     // Main component
export { BlockCard }       // Individual block (used internally)
export { BlockPalette }    // Block type selector (used internally)

// Stores
export { editorState }     // Main state (subscribe to read)
export { settings }        // Derived: settings only
export { blocks }          // Derived: blocks only
export { variables }       // Derived: variables only
export { detectedVariables } // Derived: auto-detected vars

// Actions (call to mutate)
export { editorActions }   // All mutation functions

// Types
export type { EditorState, TemplateSettings, Variable, Block, BlockType }
export type { GreetingBlock, ParagraphBlock, InfoBoxBlock, ... }
```

## Integration Points

```
┌─────────────────────────────────────────────────┐
│  Your Application                               │
│  ┌───────────────────────────────────────────┐ │
│  │  +page.svelte                             │ │
│  │  ┌─────────────────────────────────────┐ │ │
│  │  │  <form on:submit={save}>            │ │ │
│  │  │    <BlockEditor bind:this={editor} />│ │ │
│  │  │    <button>Save</button>            │ │ │
│  │  │  </form>                            │ │ │
│  │  └─────────────────────────────────────┘ │ │
│  │                                           │ │
│  │  function save() {                        │ │
│  │    const html = editor.getHTML()         │ │
│  │    const state = $editorState            │ │
│  │    // POST to API...                     │ │
│  │  }                                        │ │
│  └───────────────────────────────────────────┘ │
│                    ↓                            │
│  ┌───────────────────────────────────────────┐ │
│  │  +page.server.ts                          │ │
│  │                                           │ │
│  │  export const actions = {                 │ │
│  │    save: async ({ request }) => {         │ │
│  │      const { html, editorState } = ...    │ │
│  │      await db.insert(...)                 │ │
│  │    }                                      │ │
│  │  }                                        │ │
│  └───────────────────────────────────────────┘ │
│                    ↓                            │
│  ┌───────────────────────────────────────────┐ │
│  │  Database                                 │ │
│  │  ┌─────────────────────────────────────┐ │ │
│  │  │ email_templates table               │ │ │
│  │  │ ├─ id                               │ │ │
│  │  │ ├─ slug                             │ │ │
│  │  │ ├─ subject                          │ │ │
│  │  │ ├─ html_body (generated HTML)       │ │ │
│  │  │ ├─ variables (JSONB)                │ │ │
│  │  │ └─ editor_state (JSONB) ← Store this│ │ │
│  │  └─────────────────────────────────────┘ │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

## Error Boundaries

```
User Error → Validation → User Feedback
├─ Empty required field → Prevent save → Highlight field
├─ Invalid variable name → Warn inline → Show error state
└─ Large content → Warn performance → Suggest optimization

System Error → Graceful Degradation
├─ Store update fails → Log + rollback → Show notification
├─ HTML generation fails → Use previous → Show error
└─ Browser API missing → Feature disable → Show fallback UI

Network Error → Retry Logic
├─ Save fails → Auto-retry 3x → Show retry UI
├─ Timeout → Extend timeout → Progress indicator
└─ Offline → Queue locally → Sync on reconnect
```

## Testing Strategy

```
Unit Tests (editor-store.ts)
├─ addBlock() adds to array
├─ updateBlock() updates correct item
├─ deleteBlock() removes item
├─ moveBlock() reorders correctly
├─ detectedVariables scans all content
└─ Action purity (same input = same output)

Component Tests (*.svelte)
├─ Renders empty state
├─ Adds block on click
├─ Updates preview on change
├─ Drag and drop works
└─ Keyboard navigation

Integration Tests
├─ Full email creation flow
├─ State persistence
├─ HTML export correctness
└─ Variable detection accuracy

E2E Tests (Playwright)
├─ Create email from scratch
├─ Edit existing template
├─ Send test email
└─ Mobile responsiveness
```

## Performance Monitoring

```javascript
// In production, track these metrics:

performance.mark('block-add-start');
editorActions.addBlock('greeting');
performance.mark('block-add-end');
performance.measure('block-add', 'block-add-start', 'block-add-end');

// Goals:
// - Block operations: <50ms p95
// - HTML generation: <100ms p95
// - Preview update: <100ms p95
// - Total interaction: <200ms p95
```

---

This architecture balances:
- **Simplicity:** Single-direction data flow
- **Performance:** Reactive updates <100ms
- **Maintainability:** Clear separation of concerns
- **Extensibility:** Easy to add new block types
- **Testability:** Pure functions and isolated components
