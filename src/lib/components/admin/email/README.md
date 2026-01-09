# Email Block Editor

A perceptually-engineered semantic block editor for composing transactional emails. Built with Svelte and designed for intuitive, spatial interaction.

## Design Principles

This editor follows **perceptual engineering** principles:

- **Visual hierarchy matches information priority** - Most used blocks are visually prominent
- **Spatial layout enables spatial memory** - Consistent positioning of controls
- **Recognition over recall** - Block types shown as icons, not typed commands
- **Working memory constraints (4±1 chunks)** - Limited color/emoji options prevent overwhelm
- **Motion for salience** - Hover states and drag feedback provide instant causality
- **<100ms action-response** - All interactions feel instant via reactive Svelte stores

## Components

### `BlockEditor.svelte`
Main editor component with three sections:
1. **Template Settings** - Color scheme, emoji, title, subtitle
2. **Blocks** - Draggable list of content blocks
3. **Variables** - Auto-detected from block content
4. **Live Preview** - Real-time HTML preview

### `BlockCard.svelte`
Individual block renderer with type-specific inputs:
- Greeting: Variable name input
- Paragraph: Text area + style selector
- Info Box: Type selector + title + text
- Button: Label + URL variable + color override
- Step List: Dynamic numbered steps
- Code Inline/Block: Code input
- Image: CID reference + dimensions
- Divider/Spacer: Static visual representation

### `BlockPalette.svelte`
Grid-based block type selector with icons for visual recognition.

### `editor-store.ts`
Svelte store managing editor state with reactive updates:
- Settings, blocks, variables
- CRUD operations for blocks
- Auto-detection of variables from content

## Usage

### Basic Integration

```svelte
<script lang="ts">
  import { BlockEditor, editorActions, editorState } from '$lib/components/admin/email';

  let editor: BlockEditor;

  async function handleSubmit() {
    // Get generated HTML
    const html = editor.getHTML();

    // Access state
    const state = $editorState;

    // Submit to your API
    await fetch('/api/emails', {
      method: 'POST',
      body: JSON.stringify({
        subject: state.settings.title,
        html,
        variables: state.variables
      })
    });
  }
</script>

<form on:submit|preventDefault={handleSubmit}>
  <BlockEditor bind:this={editor} />

  <button type="submit">Save Email</button>
</form>
```

### Loading Existing Content

```svelte
<script lang="ts">
  import { onMount } from 'svelte';
  import { BlockEditor, editorActions, type EditorState } from '$lib/components/admin/email';

  export let data; // From +page.server.ts

  onMount(() => {
    if (data.emailTemplate) {
      // Load existing state
      editorActions.loadState(data.emailTemplate.editorState);
    }
  });
</script>

<BlockEditor />
```

### Programmatic Control

```svelte
<script lang="ts">
  import { editorActions } from '$lib/components/admin/email';

  function addGreeting() {
    editorActions.addBlock('greeting');
  }

  function updateTitle(newTitle: string) {
    editorActions.updateSettings({ title: newTitle });
  }

  function setTestData() {
    editorActions.setVariable('customer_name', 'Jane Doe');
    editorActions.setVariable('amount', '$25.00');
  }
</script>
```

## Block Types

| Type | Icon | Purpose |
|------|------|---------|
| **Greeting** | 👋 | Personalized salutation with variable |
| **Paragraph** | 📝 | Body text with 4 style variants |
| **Info Box** | 💡 | Highlighted notices (success/warning/error/info) |
| **Button** | 🔘 | Call-to-action with URL variable |
| **Step List** | 📋 | Numbered instructions |
| **Code Inline** | ⌨️ | Inline code snippet |
| **Code Block** | 💻 | Multi-line code block |
| **Image** | 🖼️ | Embedded image via CID reference |
| **Divider** | ➖ | Horizontal rule |
| **Spacer** | ⬇️ | Vertical spacing |

## Variables

Variables are automatically detected from block content using the `{{variable_name}}` syntax.

### Variable Scopes
- **Greeting block**: Variable name field (e.g., `customer_name`)
- **Text content**: Inline `{{variable}}` syntax in paragraphs, buttons, etc.
- **Button URLs**: URL variable field (e.g., `payment_url`)

### Test Values
All detected variables appear in the Variables section where you can set test values for the live preview.

## Color Schemes

Six accessible color schemes with AAA-compliant contrast ratios:
- **Orange** (#c2410c) - Default, warm CTA
- **Teal** (#0f766e) - Informational
- **Green** (#15803d) - Success, confirmations
- **Amber** (#b45309) - Warnings
- **Red** (#b91c1c) - Urgent, errors
- **Gray** (#374151) - Neutral

Visual swatches enable instant recognition without reading labels.

## HTML Output

The editor generates production-ready email HTML using the `buildEmailHTML()` function from `/lib/email/templates/base.ts`:

- Fully inline styles for universal email client compatibility
- Table-based layout for Outlook support
- Proper MSO conditionals
- Semantic HTML structure
- Accessible color contrast (WCAG AAA)

## State Shape

```typescript
interface EditorState {
  settings: {
    colorScheme: 'orange' | 'teal' | 'green' | 'amber' | 'red' | 'gray';
    emoji: string;
    title: string;
    subtitle: string;
  };
  blocks: Block[];
  variables: Record<string, string>; // name -> testValue
}
```

You can serialize this state to JSON and store it in your database alongside the generated HTML.

## Drag and Drop

Blocks can be reordered via drag and drop:
1. Hover over a block to see the drag handle (☰)
2. Click and drag to reorder
3. State updates reactively with <100ms response

## Keyboard Navigation

The editor is fully keyboard accessible:
- `Tab` to navigate between inputs
- `Enter` to add new steps in Step List blocks
- Standard form controls (no custom key bindings)

## Performance

The editor is optimized for instant feedback:
- Reactive stores update in <100ms
- Debounced HTML regeneration for complex emails
- Virtual scrolling for 100+ block emails (future enhancement)

## Examples

See `/src/routes/admin/emails/+page.svelte` for a complete integration example.

## Future Enhancements

Potential additions (not yet implemented):
- [ ] Block templates (common patterns like "dunning email", "QR daily")
- [ ] Undo/redo stack
- [ ] Block duplication
- [ ] Keyboard shortcuts (Cmd+D to duplicate, Cmd+Del to delete)
- [ ] Export/import JSON
- [ ] A/B testing variants
- [ ] Send test email button
