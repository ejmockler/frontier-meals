# Email Editor Integration Guide

## Overview

The email editor system provides **backend rendering infrastructure** that lives alongside the existing Svelte UI components. The two systems can coexist:

- **UI Layer** (`/src/lib/components/admin/email/`): Svelte components and stores for the editor interface
- **Rendering Layer** (`/src/lib/email/editor/`): Block-to-HTML conversion engine that works with any block structure

## Current State

### Existing Components
- `editor-store.ts` - Svelte store with block types for UI
- `BlockCard.svelte` - UI component for editing blocks
- Other Svelte components for the email editor UI

### New Rendering System
- `types.ts` - Comprehensive type system with perceptual engineering principles
- `renderer.ts` - Block-to-HTML rendering engine
- `parser.ts` - Template source code parser
- `registry.ts` - Template catalog

## Integration Options

### Option 1: Use as Backend Renderer (Recommended)

Keep the existing UI but use the new renderer for HTML generation:

```typescript
// In your Svelte component or server endpoint
import { renderTemplate } from '$lib/email/editor';
import type { EmailTemplate } from '$lib/email/editor/types';

// Convert UI store blocks to renderer blocks
function convertBlocksForRendering(uiBlocks) {
  return uiBlocks.map(block => {
    if (block.type === 'greeting') {
      return {
        type: 'greeting',
        id: block.id,
        nameVariable: `{{${block.variableName}}}`
      };
    }
    // ... convert other block types
  });
}

// Render to HTML
const template: EmailTemplate = {
  slug: 'custom',
  name: 'Custom Email',
  colorScheme: 'teal',
  subject: editorState.subject,
  header: editorState.header,
  blocks: convertBlocksForRendering(editorState.blocks),
  footer: { type: 'support' },
  variables: editorState.variables
};

const { subject, html } = renderTemplate(template, variableData);
// Now you have production-ready HTML
```

### Option 2: Gradually Migrate Types

If you want to use the new types in the UI:

1. **Phase 1**: Import types from `$lib/email/editor/types` instead of defining locally
2. **Phase 2**: Update UI components to use new field names (e.g., `nameVariable` → VariableRef)
3. **Phase 3**: Unify the type systems

### Option 3: Keep Separate (Current)

The two systems can remain independent:
- UI uses its own simpler types for editing
- Rendering system uses comprehensive types for HTML generation
- Conversion layer bridges the two

## Usage Examples

### Send Email from Editor UI

```typescript
// src/routes/admin/email/send/+server.ts
import { renderTemplate } from '$lib/email/editor';
import { resend } from '$lib/email/resend';

export async function POST({ request }) {
  const { template, recipients, variableData } = await request.json();

  // Render template to HTML
  const { subject, html } = renderTemplate(template, variableData);

  // Send via Resend
  await resend.emails.send({
    from: 'noreply@frontiermeals.com',
    to: recipients,
    subject,
    html
  });

  return new Response(JSON.stringify({ success: true }));
}
```

### Preview Email in Editor

```typescript
// In your Svelte component
import { renderTemplate } from '$lib/email/editor';
import { getTestVariables } from '$lib/email/editor/parser';

let previewHtml = '';

function updatePreview() {
  const testData = getTestVariables(template.variables);
  const { html } = renderTemplate(template, testData);
  previewHtml = html;
}
```

### Export Template to Code

```typescript
import { generateTemplateCode } from '$lib/email/editor';

function exportTemplate() {
  const code = generateTemplateCode(template);

  // Download as .ts file
  const blob = new Blob([code], { type: 'text/typescript' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${template.slug}.ts`;
  a.click();
}
```

## Type Mapping

Here's how existing UI types map to renderer types:

| UI Type | Renderer Type | Notes |
|---------|---------------|-------|
| `GreetingBlock` | `GreetingBlock` | Similar, but uses `nameVariable: VariableRef` |
| `ParagraphBlock` | `ParagraphBlock` | Same concept, `text` → `content` |
| `InfoBoxBlock` | `InfoBoxBlock` | Same |
| `ButtonBlock` | `ButtonBlock` | `urlVariable` becomes `VariableRef` |
| `StepListBlock` | `StepListBlock` | Same |
| `CodeInlineBlock` | `CodeBlock` (style: 'inline') | Unified into one type |
| `CodeBlockBlock` | `CodeBlock` (style: 'block') | Unified into one type |
| `ImageBlock` | `ImageBlock` | `cidReference` → `cid` |
| `DividerBlock` | `DividerBlock` | Renderer adds `style` option |
| `SpacerBlock` | `SpacerBlock` | Renderer adds `size` control |

New renderer types not in UI:
- `HeadingBlock` - Section headings (h2/h3)
- `ListBlock` - Bulleted/numbered lists
- `LinkBlock` - Standalone links (not buttons)
- `CustomHtmlBlock` - Escape hatch for custom HTML

## File Structure

```
src/lib/
├── email/
│   ├── editor/              # NEW - Rendering infrastructure
│   │   ├── types.ts         # Type definitions
│   │   ├── renderer.ts      # Block → HTML rendering
│   │   ├── parser.ts        # Source code parsing
│   │   ├── registry.ts      # Template catalog
│   │   ├── index.ts         # Exports
│   │   ├── README.md        # Documentation
│   │   └── INTEGRATION.md   # This file
│   └── templates/           # EXISTING - Template files
│       ├── base.ts          # Base styles and helpers
│       ├── qr-daily.ts
│       ├── dunning.ts
│       └── ...
└── components/
    └── admin/
        └── email/           # EXISTING - Svelte UI components
            ├── editor-store.ts
            ├── BlockCard.svelte
            └── ...
```

## Benefits of Dual System

**UI Layer Benefits:**
- Simpler types optimized for editing UX
- Fast reactive updates in Svelte
- UI-specific concerns (drag-drop, validation) don't pollute rendering logic

**Rendering Layer Benefits:**
- Comprehensive type system with all block types
- Production-ready HTML generation
- Template parsing and code generation
- Registry of all templates
- Can be used outside Svelte (server endpoints, CLI tools)

## Migration Path

If you want to fully migrate to the new types:

1. **Update editor-store.ts** to import from `$lib/email/editor/types`
2. **Update BlockCard.svelte** to use new field names
3. **Remove local type definitions** from editor-store.ts
4. **Test all UI functionality** still works
5. **Update any server endpoints** to use renderer directly

## Testing

Test the rendering system independently:

```typescript
// test/email/renderer.test.ts
import { renderTemplate } from '$lib/email/editor';

test('renders greeting block correctly', () => {
  const template = {
    // ... template definition
    blocks: [{
      type: 'greeting',
      id: '1',
      nameVariable: '{{customer_name}}'
    }]
  };

  const { html } = renderTemplate(template, {
    customer_name: 'Alex'
  });

  expect(html).toContain('Hi Alex,');
  expect(html).toContain(styles.pLead);
});
```

## Next Steps

1. **Choose integration option** (backend renderer recommended)
2. **Add conversion layer** if keeping dual types
3. **Update email sending** to use renderer
4. **Add preview** using renderer
5. **Consider migration** to unified types if beneficial

## Questions?

The rendering system is designed to be flexible. You can:
- Use it as-is for HTML generation only
- Gradually adopt types in UI
- Keep systems separate
- Fully migrate to new types

Choose the path that makes sense for your codebase and timeline.
