# BlockEditor Quick Reference

## Basic Usage

```svelte
<script lang="ts">
  import { BlockEditor } from '$lib/components/admin/email';
  let editor: BlockEditor;
</script>

<BlockEditor bind:this={editor} />
```

## Get HTML Output

```svelte
const html = editor.getHTML();
```

## Access State

```svelte
<script lang="ts">
  import { editorState } from '$lib/components/admin/email';
</script>

{$editorState.settings.title}
{$editorState.blocks.length}
{$editorState.variables}
```

## Manipulate State

```svelte
<script lang="ts">
  import { editorActions } from '$lib/components/admin/email';

  // Settings
  editorActions.updateSettings({
    colorScheme: 'teal',
    emoji: '💳',
    title: 'Payment Due',
    subtitle: 'Your subscription needs attention'
  });

  // Blocks
  editorActions.addBlock('greeting');
  editorActions.addBlock('paragraph', 0); // Insert at index 0
  editorActions.updateBlock('block_123', { text: 'New text' });
  editorActions.deleteBlock('block_123');
  editorActions.moveBlock(0, 2); // Move first block to third position

  // Variables
  editorActions.setVariable('customer_name', 'Jane Doe');
  editorActions.deleteVariable('old_var');

  // Full state
  editorActions.loadState(savedState);
  editorActions.reset();
</script>
```

## Block Types Reference

| Type | Data Structure | Example |
|------|---------------|---------|
| `greeting` | `{ variableName: string }` | Hi {{customer_name}}! |
| `paragraph` | `{ text: string, style: 'lead'\|'normal'\|'muted'\|'small' }` | Body text |
| `infoBox` | `{ boxType: 'info'\|'success'\|'warning'\|'error', title: string, text: string }` | Important notice |
| `button` | `{ label: string, urlVariable: string, colorOverride?: string }` | Click Here |
| `stepList` | `{ steps: Array<{ title, description }> }` | 1. First step |
| `codeInline` | `{ text: string }` | `/skip` |
| `codeBlock` | `{ code: string }` | Multi-line code |
| `image` | `{ cidReference: string, alt: string, width?: number, height?: number }` | QR code |
| `divider` | `{}` | Horizontal line |
| `spacer` | `{}` | Vertical space |

## Auto-Detected Variables

```svelte
<script lang="ts">
  import { detectedVariables } from '$lib/components/admin/email';
</script>

{#each $detectedVariables as varName}
  <p>Found variable: {varName}</p>
{/each}
```

## Full Integration Example

```svelte
<script lang="ts">
  import { BlockEditor, editorActions, editorState } from '$lib/components/admin/email';
  import { onMount } from 'svelte';

  export let data; // From +page.server.ts

  let editor: BlockEditor;
  let saving = false;

  // Load existing template
  onMount(() => {
    if (data.template?.editorState) {
      editorActions.loadState(data.template.editorState);
    }
  });

  // Save template
  async function save() {
    saving = true;
    try {
      const html = editor.getHTML();
      const state = $editorState;

      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug: 'my-template',
          subject: state.settings.title,
          htmlBody: html,
          variables: state.variables,
          editorState: state
        })
      });

      if (response.ok) {
        alert('Saved!');
      }
    } finally {
      saving = false;
    }
  }

  // Send test
  async function sendTest() {
    const html = editor.getHTML();
    const email = prompt('Send test to:');

    if (email) {
      await fetch('/api/send-test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: email,
          subject: $editorState.settings.title,
          html
        })
      });
    }
  }
</script>

<div class="editor-page">
  <header>
    <h1>{data.template ? 'Edit' : 'Create'} Email Template</h1>
    <div class="actions">
      <button on:click={sendTest}>Send Test</button>
      <button on:click={save} disabled={saving}>
        {saving ? 'Saving...' : 'Save Template'}
      </button>
    </div>
  </header>

  <BlockEditor bind:this={editor} />
</div>
```

## Type Definitions

```typescript
interface EditorState {
  settings: TemplateSettings;
  blocks: Block[];
  variables: Record<string, string>;
}

interface TemplateSettings {
  colorScheme: 'orange' | 'teal' | 'green' | 'amber' | 'red' | 'gray';
  emoji: string;
  title: string;
  subtitle: string;
}

type Block =
  | GreetingBlock
  | ParagraphBlock
  | InfoBoxBlock
  | ButtonBlock
  | StepListBlock
  | CodeInlineBlock
  | CodeBlockBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock;
```

## Styling Integration

The BlockEditor uses inline styles and adapts to its container. Wrap it in your layout:

```svelte
<div class="max-w-4xl mx-auto p-6">
  <BlockEditor />
</div>
```

No additional CSS required—the component is self-contained.

## Database Schema

Recommended schema for storing templates:

```sql
CREATE TABLE email_templates (
  id SERIAL PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  subject TEXT NOT NULL,
  html_body TEXT NOT NULL,
  variables JSONB,
  editor_state JSONB,  -- Store full EditorState for editing
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Performance Tips

1. **Large emails (50+ blocks):** Consider pagination or collapsible sections
2. **Frequent updates:** The editor already debounces, no extra work needed
3. **Auto-save:** Use debounced reactive statement:
   ```svelte
   let saveTimeout: NodeJS.Timeout;
   $: {
     clearTimeout(saveTimeout);
     saveTimeout = setTimeout(() => {
       save(); // Auto-save after 2s of inactivity
     }, 2000);
   }
   ```

## Debugging

```svelte
<script lang="ts">
  import { editorState, detectedVariables } from '$lib/components/admin/email';

  // Log state on change
  $: console.log('State:', $editorState);
  $: console.log('Variables:', $detectedVariables);

  // Debug action
  function dumpState() {
    console.log(JSON.stringify($editorState, null, 2));
  }
</script>
```

## Common Patterns

### Pre-fill content programmatically

```svelte
onMount(() => {
  editorActions.addBlock('greeting');
  editorActions.addBlock('paragraph');

  setTimeout(() => {
    const blocks = $editorState.blocks;
    if (blocks[0]?.type === 'greeting') {
      editorActions.updateBlock(blocks[0].id, {
        variableName: 'customer_name'
      });
    }
    if (blocks[1]?.type === 'paragraph') {
      editorActions.updateBlock(blocks[1].id, {
        text: 'Welcome to our service!',
        style: 'lead'
      });
    }

    editorActions.setVariable('customer_name', 'Test User');
  }, 100);
});
```

### Toggle between BlockEditor and raw HTML

```svelte
<script lang="ts">
  let useBlockEditor = true;
  let blockEditor: BlockEditor;
  let rawHtml = '';

  $: if (blockEditor && useBlockEditor) {
    rawHtml = blockEditor.getHTML();
  }
</script>

<button on:click={() => useBlockEditor = !useBlockEditor}>
  {useBlockEditor ? 'Switch to HTML' : 'Switch to Block Editor'}
</button>

{#if useBlockEditor}
  <BlockEditor bind:this={blockEditor} />
{:else}
  <textarea bind:value={rawHtml} />
{/if}

<input type="hidden" name="htmlBody" value={rawHtml} />
```

### Export/Import state

```svelte
function exportState() {
  const json = JSON.stringify($editorState, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'email-template.json';
  a.click();
  URL.revokeObjectURL(url);
}

async function importState() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json';
  input.onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      const text = await file.text();
      const state = JSON.parse(text);
      editorActions.loadState(state);
    }
  };
  input.click();
}
```

## Keyboard Shortcuts (Future)

Not yet implemented, but planned:

- `Cmd/Ctrl + Z` - Undo
- `Cmd/Ctrl + Shift + Z` - Redo
- `Cmd/Ctrl + D` - Duplicate block
- `Cmd/Ctrl + Backspace` - Delete block
- `Cmd/Ctrl + ↑/↓` - Move block up/down

## Browser Support

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile browsers: ✅ Touch-friendly drag and drop

## Need Help?

- See `README.md` for detailed documentation
- Check `/src/lib/components/admin/email/BlockEditorDemo.svelte` for live example
