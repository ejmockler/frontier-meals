# BlockEditor Integration Guide

This guide shows how to integrate the BlockEditor into the existing `/admin/emails` page.

## Overview

The BlockEditor replaces the raw HTML textarea with a semantic block-based interface. The integration maintains backward compatibility - you can still store both the generated HTML and the editor state.

## Step 1: Update the Page Component

Replace the raw HTML textarea section in `/src/routes/admin/emails/+page.svelte`:

### Before (Lines 196-211):
```svelte
<div>
  <label for="htmlBody" class="block text-sm font-bold text-[#1A1816] mb-2">
    HTML Body
    <span class="text-xs text-[#5C5A56] ml-2">Use {'{{'}variable_name{'}}' } for dynamic content</span>
  </label>
  <textarea
    id="htmlBody"
    name="htmlBody"
    bind:value={htmlBody}
    required
    rows="15"
    placeholder="<html>...</html>"
    class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-mono text-sm text-[#1A1816] bg-white"
  ></textarea>
</div>
```

### After:
```svelte
<script lang="ts">
  import { BlockEditor, editorActions, editorState } from '$lib/components/admin/email';

  let blockEditor: BlockEditor;
  let useBlockEditor = true; // Toggle between block editor and raw HTML

  // Sync block editor HTML to form field
  $: if (blockEditor && useBlockEditor) {
    htmlBody = blockEditor.getHTML();
  }
</script>

<div>
  <div class="flex items-center justify-between mb-2">
    <label class="block text-sm font-bold text-[#1A1816]">
      Email Content
    </label>
    <button
      type="button"
      on:click={() => useBlockEditor = !useBlockEditor}
      class="text-xs font-bold text-[#E67E50] hover:text-[#D97F3E]"
    >
      {useBlockEditor ? 'Switch to HTML' : 'Switch to Block Editor'}
    </button>
  </div>

  {#if useBlockEditor}
    <BlockEditor bind:this={blockEditor} />
    <!-- Hidden input to submit HTML -->
    <input type="hidden" name="htmlBody" value={htmlBody} />
    <!-- Optional: Store editor state for later editing -->
    <input type="hidden" name="editorState" value={JSON.stringify($editorState)} />
  {:else}
    <textarea
      id="htmlBody"
      name="htmlBody"
      bind:value={htmlBody}
      required
      rows="15"
      placeholder="<html>...</html>"
      class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-mono text-sm text-[#1A1816] bg-white"
    ></textarea>
  {/if}
</div>
```

## Step 2: Update the Variables Section

The BlockEditor auto-detects variables, so you can simplify or remove the manual variables textarea:

### Option A: Hide it when using BlockEditor
```svelte
{#if !useBlockEditor}
  <div>
    <label for="variables" class="block text-sm font-bold text-[#1A1816] mb-2">
      Test Variables (JSON)
      <span class="text-xs text-[#5C5A56] ml-2">For preview only</span>
    </label>
    <textarea
      id="variables"
      name="variables"
      bind:value={variables}
      rows="5"
      placeholder="{'{'}&#34;customer_name&#34;: &#34;John Doe&#34;, &#34;amount&#34;: &#34;$15.00&#34;{'}'}"
      class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-mono text-sm text-[#1A1816] bg-white"
    ></textarea>
  </div>
{/if}
```

### Option B: Sync with BlockEditor
```svelte
<script lang="ts">
  // Sync block editor variables to form
  $: if (useBlockEditor) {
    variables = JSON.stringify($editorState.variables, null, 2);
  }
</script>
```

## Step 3: Update Preview

The BlockEditor has a built-in live preview, but you can keep the existing preview for the HTML mode:

```svelte
{#if showPreview}
  <div class="border-2 border-[#D9D7D2] rounded-sm overflow-hidden">
    <!-- Subject preview -->
    <div class="bg-white p-4 border-b-2 border-[#D9D7D2]">
      <p class="text-xs font-bold text-[#5C5A56] mb-1">Subject:</p>
      <p class="text-sm font-extrabold text-[#1A1816]">{subject || '(No subject)'}</p>
    </div>

    <!-- HTML preview -->
    <div class="p-4 max-h-[600px] overflow-y-auto bg-white">
      {#if htmlBody}
        <iframe
          title="Email Preview"
          srcdoc={useBlockEditor ? htmlBody : previewHtml}
          sandbox="allow-same-origin"
          class="w-full h-[500px] border-0"
        ></iframe>
      {:else}
        <p class="text-[#5C5A56] text-center py-12">
          {useBlockEditor ? 'Add blocks to see preview' : 'Start typing to see preview'}
        </p>
      {/if}
    </div>
  </div>
{/if}
```

## Step 4: Handle Loading Existing Templates

When editing an existing template, load the editor state:

```svelte
<script lang="ts">
  import { onMount } from 'svelte';

  function editTemplate(template: any) {
    mode = 'edit';
    selectedTemplate = template;
    slug = template.slug;
    subject = template.subject;
    htmlBody = template.html_body;
    variables = template.variables ? JSON.stringify(template.variables, null, 2) : '';

    // Load editor state if available
    if (template.editor_state) {
      onMount(() => {
        editorActions.loadState(JSON.parse(template.editor_state));
      });
    } else {
      // Reset to empty state for new editing
      editorActions.reset();
    }
  }
</script>
```

## Step 5: Update Database Schema (Optional)

Add a column to store the editor state:

```sql
ALTER TABLE email_templates
ADD COLUMN editor_state JSONB;
```

Then update your server actions to save/load it:

```typescript
// In +page.server.ts
export const actions = {
  createTemplate: async ({ request, locals }) => {
    const form = await request.formData();
    const editorState = form.get('editorState');

    await db.insert(emailTemplates).values({
      slug: form.get('slug'),
      subject: form.get('subject'),
      html_body: form.get('htmlBody'),
      variables: JSON.parse(form.get('variables') || '{}'),
      editor_state: editorState ? JSON.parse(editorState) : null,
    });
  },

  updateTemplate: async ({ request, locals }) => {
    const form = await request.formData();
    const id = form.get('id');
    const editorState = form.get('editorState');

    await db.update(emailTemplates)
      .set({
        subject: form.get('subject'),
        html_body: form.get('htmlBody'),
        variables: JSON.parse(form.get('variables') || '{}'),
        editor_state: editorState ? JSON.parse(editorState) : null,
      })
      .where(eq(emailTemplates.id, id));
  }
};
```

## Step 6: Layout Adjustments

The BlockEditor has its own preview, so you might want to adjust the layout:

### Option A: Single Column (BlockEditor Only)
```svelte
<form method="POST" class="max-w-4xl mx-auto">
  <div class="space-y-6">
    <!-- Subject -->
    <div>...</div>

    <!-- BlockEditor (includes preview) -->
    <BlockEditor bind:this={blockEditor} />

    <!-- Actions -->
    <div class="flex gap-3">
      <button type="submit">Save Template</button>
      <button type="button" on:click={() => showTestModal = true}>Send Test</button>
    </div>
  </div>
</form>
```

### Option B: Side-by-Side (Keep Existing Layout)
Keep the two-column grid and place BlockEditor in the left column. The BlockEditor's preview will appear at the bottom of the left column, and you can optionally keep the right column for additional controls or a larger preview.

## Complete Example File

See `/src/lib/components/admin/email/BlockEditorDemo.svelte` for a standalone example showing all features.

## Migration Strategy

### Phase 1: Opt-in (Current)
- Add toggle to switch between HTML and Block Editor
- Both modes save the same HTML output
- Block Editor saves additional `editor_state` JSON

### Phase 2: Default (Future)
- Block Editor becomes default for new templates
- HTML mode available as "Advanced" option
- Existing templates load in HTML mode unless they have `editor_state`

### Phase 3: Block Editor Only (Future)
- HTML mode removed for new templates
- Existing HTML-only templates migrated or kept as-is
- All new work uses Block Editor

## Testing Checklist

- [ ] Create new template with Block Editor
- [ ] Save template and reload page
- [ ] Edit existing template
- [ ] Switch between Block Editor and HTML mode
- [ ] Preview updates in real-time
- [ ] Variables auto-detect correctly
- [ ] Drag and drop reordering works
- [ ] All block types render correctly in preview
- [ ] Send test email with variable substitution
- [ ] Export HTML matches visual preview

## Troubleshooting

### Preview not updating
Make sure you're binding the `blockEditor` instance:
```svelte
let blockEditor: BlockEditor;
<BlockEditor bind:this={blockEditor} />
```

### Variables not syncing
The variables are managed internally by the BlockEditor. Access them via `$editorState.variables`:
```svelte
<script lang="ts">
  import { editorState } from '$lib/components/admin/email';

  $: console.log('Current variables:', $editorState.variables);
</script>
```

### HTML not submitting
Ensure you have the hidden input that captures the HTML:
```svelte
<input type="hidden" name="htmlBody" value={htmlBody} />
```

And update `htmlBody` reactively:
```svelte
$: if (blockEditor && useBlockEditor) {
  htmlBody = blockEditor.getHTML();
}
```
