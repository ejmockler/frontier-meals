# Email Template Builder - Implementation Plan

**Project:** Block-based visual email template editor
**Timeline:** 3-4 weeks
**Last Updated:** 2025-11-09

## Executive Summary

Replacing raw HTML textarea editor with a visual block-based system that:
- Enables non-technical users to create email templates
- Provides progressive disclosure (simple → advanced → HTML)
- Stores templates as structured JSON (maintainable, upgradable)
- Generates email-client-safe HTML via MJML
- Supports variable interpolation for dynamic content

## Architecture Overview

### Data Flow
```
User Input (Blocks)
  → Structured JSON Storage (Postgres JSONB)
  → MJML Generation (Server-side)
  → Email-safe HTML (Cached)
  → Email Delivery (Resend API)
```

### Core Technologies
- **Frontend:** Svelte 5 (runes mode), SvelteKit
- **Storage:** Supabase (Postgres with JSONB)
- **HTML Generation:** MJML (via `mjml-browser` or API)
- **Rich Text:** Custom contentEditable (structured segments)
- **Deployment:** Cloudflare Workers (adapter-cloudflare)

## Database Schema

### Migration 1: Add Structure Column
```sql
-- Add new columns to email_templates table
ALTER TABLE email_templates ADD COLUMN structure JSONB;
ALTER TABLE email_templates ADD COLUMN editor_mode TEXT DEFAULT 'html' CHECK (editor_mode IN ('blocks', 'html'));
ALTER TABLE email_templates ADD COLUMN html_cache TEXT;
ALTER TABLE email_templates ADD COLUMN html_cache_hash TEXT;
ALTER TABLE email_templates ADD COLUMN html_cache_generated_at TIMESTAMPTZ;

-- Create version history table
CREATE TABLE email_template_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  structure JSONB NOT NULL,
  editor_mode TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID -- Future: link to admin users
);

-- Index for searching templates by variable usage
CREATE INDEX idx_templates_structure ON email_templates USING gin (structure jsonb_path_ops);

-- Index for version history
CREATE INDEX idx_template_versions_template_id ON email_template_versions(template_id, created_at DESC);
```

### Migration 2: Migrate Existing Templates
```sql
-- Convert existing HTML templates to custom_html blocks
UPDATE email_templates
SET
  structure = jsonb_build_object(
    'version', '1.0',
    'baseStyle', jsonb_build_object(
      'fontFamily', 'Arial, sans-serif',
      'primaryColor', '#10b981',
      'containerWidth', 600
    ),
    'blocks', jsonb_build_array(
      jsonb_build_object(
        'type', 'custom_html',
        'id', gen_random_uuid()::text,
        'html', html_body
      )
    )
  ),
  editor_mode = 'html'
WHERE structure IS NULL;
```

## Type Definitions

**File:** `src/lib/types/email-template.ts`

```typescript
export interface EmailTemplate {
  id: string;
  name: string;
  slug: string;
  subject: string; // Can contain {{variables}}
  structure: TemplateStructure;
  editor_mode: 'blocks' | 'html';
  html_cache?: string;
  html_cache_hash?: string;
  html_cache_generated_at?: string;
  variables?: Record<string, VariableDefinition>;
  created_at: string;
  updated_at: string;
}

export interface TemplateStructure {
  version: '1.0';
  baseStyle: BaseStyle;
  blocks: Block[];
}

export interface BaseStyle {
  fontFamily: string;
  primaryColor: string;
  secondaryColor?: string;
  containerWidth: number; // px
  backgroundColor?: string;
}

export interface VariableDefinition {
  name: string;
  type: 'text' | 'email' | 'url' | 'image' | 'date';
  defaultValue?: string;
  required?: boolean;
  description?: string;
}

export type Block =
  | HeaderBlock
  | ContentBlock
  | ImageBlock
  | ButtonBlock
  | QRCodeBlock
  | SpacerBlock
  | DividerBlock
  | TwoColumnBlock
  | CustomHTMLBlock;

interface BaseBlock {
  id: string;
  type: string;
}

export interface HeaderBlock extends BaseBlock {
  type: 'header';
  content: RichText;
  level: 1 | 2 | 3;
  align?: 'left' | 'center' | 'right';
  backgroundColor?: string;
  padding?: Spacing;
}

export interface ContentBlock extends BaseBlock {
  type: 'content';
  content: RichText;
  align?: 'left' | 'center' | 'right';
  backgroundColor?: string;
  padding?: Spacing;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  src: string; // URL or {{variable}}
  alt: string;
  width?: number;
  href?: string; // Make clickable
  align?: 'left' | 'center' | 'right';
}

export interface ButtonBlock extends BaseBlock {
  type: 'button';
  text: string; // Can contain {{variables}}
  href: string; // Can contain {{variables}}
  style?: 'primary' | 'secondary' | 'custom';
  backgroundColor?: string;
  textColor?: string;
  borderRadius?: number;
  align?: 'left' | 'center' | 'right';
}

export interface QRCodeBlock extends BaseBlock {
  type: 'qrcode';
  data: string; // Can contain {{variables}}
  size?: number;
  errorCorrection?: 'L' | 'M' | 'Q' | 'H';
  align?: 'left' | 'center' | 'right';
}

export interface SpacerBlock extends BaseBlock {
  type: 'spacer';
  height: number; // px
}

export interface DividerBlock extends BaseBlock {
  type: 'divider';
  color?: string;
  width?: number; // percentage
  thickness?: number; // px
}

export interface TwoColumnBlock extends BaseBlock {
  type: 'two_column';
  leftWidth: number; // percentage
  rightWidth: number; // percentage
  leftContent: RichText;
  rightContent: RichText;
  backgroundColor?: string;
  padding?: Spacing;
}

export interface CustomHTMLBlock extends BaseBlock {
  type: 'custom_html';
  html: string;
}

export interface RichText {
  type: 'richtext';
  content: Segment[];
}

export type Segment =
  | TextSegment
  | BoldSegment
  | ItalicSegment
  | LinkSegment
  | VariableSegment
  | LineBreakSegment;

export interface TextSegment {
  type: 'text';
  value: string;
}

export interface BoldSegment {
  type: 'bold';
  content: Segment[];
}

export interface ItalicSegment {
  type: 'italic';
  content: Segment[];
}

export interface LinkSegment {
  type: 'link';
  href: string;
  content: Segment[];
}

export interface VariableSegment {
  type: 'variable';
  name: string;
}

export interface LineBreakSegment {
  type: 'linebreak';
}

export type Spacing =
  | 'none'
  | 'small'
  | 'medium'
  | 'large'
  | { top: number; right: number; bottom: number; left: number };
```

## Phase 1: Foundation (Days 1-3)

### Goals
- Database schema ready
- Type system complete
- Editor shell functional
- State management proven

### Tasks

#### 1.1 Database Setup
- [ ] Create migration file for new columns
- [ ] Create version history table
- [ ] Add indexes for performance
- [ ] Run migration on development database
- [ ] Verify rollback works

#### 1.2 Type Definitions
- [ ] Create `src/lib/types/email-template.ts`
- [ ] Create `src/lib/types/email-builder.ts` (UI state types)
- [ ] Export types from `src/lib/types/index.ts`

#### 1.3 Editor Context & State
**File:** `src/lib/components/email-builder/EmailBuilderContext.svelte.ts`

```typescript
import { setContext, getContext } from 'svelte';
import type { EmailTemplate, Block } from '$lib/types';

interface EditorState {
  blocks: Block[];
  selectedBlockId: string | null;
  isDirty: boolean;
  history: {
    past: Block[][];
    future: Block[][];
  };
}

interface EditorActions {
  addBlock(block: Block, index?: number): void;
  updateBlock(blockId: string, updates: Partial<Block>): void;
  deleteBlock(blockId: string): void;
  moveBlock(fromIndex: number, toIndex: number): void;
  selectBlock(blockId: string | null): void;
  undo(): void;
  redo(): void;
  reset(): void;
}

export function createEditorContext(initialTemplate: EmailTemplate) {
  let state = $state<EditorState>({
    blocks: initialTemplate.structure.blocks,
    selectedBlockId: null,
    isDirty: false,
    history: { past: [], future: [] }
  });

  const actions: EditorActions = {
    addBlock(block, index) {
      pushHistory();
      if (index !== undefined) {
        state.blocks.splice(index, 0, block);
      } else {
        state.blocks.push(block);
      }
      state.isDirty = true;
    },

    updateBlock(blockId, updates) {
      pushHistory();
      const index = state.blocks.findIndex(b => b.id === blockId);
      if (index !== -1) {
        state.blocks[index] = { ...state.blocks[index], ...updates };
        state.isDirty = true;
      }
    },

    deleteBlock(blockId) {
      pushHistory();
      state.blocks = state.blocks.filter(b => b.id !== blockId);
      state.isDirty = true;
    },

    moveBlock(fromIndex, toIndex) {
      pushHistory();
      const [block] = state.blocks.splice(fromIndex, 1);
      state.blocks.splice(toIndex, 0, block);
      state.isDirty = true;
    },

    selectBlock(blockId) {
      state.selectedBlockId = blockId;
    },

    undo() {
      const previous = state.history.past.pop();
      if (previous) {
        state.history.future.push([...state.blocks]);
        state.blocks = previous;
        state.isDirty = true;
      }
    },

    redo() {
      const next = state.history.future.pop();
      if (next) {
        state.history.past.push([...state.blocks]);
        state.blocks = next;
        state.isDirty = true;
      }
    },

    reset() {
      state.isDirty = false;
      state.history = { past: [], future: [] };
    }
  };

  function pushHistory() {
    state.history.past.push([...state.blocks]);
    state.history.future = [];

    // Limit to 50 states
    if (state.history.past.length > 50) {
      state.history.past.shift();
    }
  }

  const context = {
    get state() { return state; },
    actions
  };

  setContext('emailBuilder', context);
  return context;
}

export function getEditorContext() {
  return getContext<ReturnType<typeof createEditorContext>>('emailBuilder');
}
```

#### 1.4 Main Editor Component
**File:** `src/lib/components/email-builder/EmailBuilder.svelte`

```svelte
<script lang="ts">
import { createEditorContext } from './EmailBuilderContext.svelte';
import BlockList from './BlockList.svelte';
import BlockInspector from './BlockInspector.svelte';
import PreviewPane from './PreviewPane.svelte';
import EditorToolbar from './EditorToolbar.svelte';
import type { EmailTemplate } from '$lib/types';

interface Props {
  template: EmailTemplate;
  onSave: (template: EmailTemplate) => Promise<void>;
}

let { template, onSave }: Props = $props();

const editor = createEditorContext(template);

let isSaving = $state(false);
let showPreview = $state(true);

async function handleSave() {
  isSaving = true;
  try {
    await onSave({
      ...template,
      structure: {
        ...template.structure,
        blocks: editor.state.blocks
      }
    });
    editor.actions.reset();
  } finally {
    isSaving = false;
  }
}

function handleKeydown(e: KeyboardEvent) {
  const isMod = e.metaKey || e.ctrlKey;

  if (isMod && e.key === 'z') {
    e.preventDefault();
    if (e.shiftKey) {
      editor.actions.redo();
    } else {
      editor.actions.undo();
    }
  }

  if (isMod && e.key === 's') {
    e.preventDefault();
    handleSave();
  }
}
</script>

<svelte:window on:keydown={handleKeydown} />

<div class="email-builder">
  <EditorToolbar
    canUndo={editor.state.history.past.length > 0}
    canRedo={editor.state.history.future.length > 0}
    isDirty={editor.state.isDirty}
    {isSaving}
    {showPreview}
    onUndo={() => editor.actions.undo()}
    onRedo={() => editor.actions.redo()}
    onSave={handleSave}
    onTogglePreview={() => showPreview = !showPreview}
  />

  <div class="editor-main">
    <div class="editor-canvas">
      <BlockList blocks={editor.state.blocks} />
    </div>

    {#if editor.state.selectedBlockId}
      <aside class="editor-inspector">
        <BlockInspector blockId={editor.state.selectedBlockId} />
      </aside>
    {/if}

    {#if showPreview}
      <aside class="editor-preview">
        <PreviewPane blocks={editor.state.blocks} subject={template.subject} />
      </aside>
    {/if}
  </div>
</div>

<style>
  .email-builder {
    display: flex;
    flex-direction: column;
    height: 100vh;
  }

  .editor-main {
    display: grid;
    grid-template-columns: 1fr auto auto;
    flex: 1;
    overflow: hidden;
  }

  .editor-canvas {
    overflow-y: auto;
    padding: 2rem;
  }

  .editor-inspector,
  .editor-preview {
    width: 320px;
    border-left: 2px solid var(--border-color);
    overflow-y: auto;
  }
</style>
```

### Deliverables
- ✅ Database migrated with new schema
- ✅ Complete TypeScript type system
- ✅ Editor context with undo/redo
- ✅ Main editor shell component
- ✅ Keyboard shortcuts (Cmd+Z, Cmd+S)

## Phase 2: Core Blocks (Days 4-7)

### Goals
- Implement 5 essential block types
- Command palette for adding blocks
- Drag-and-drop reordering
- Block selection and deletion

### Block Components

#### 2.1 Header Block
**File:** `src/lib/components/email-builder/blocks/HeaderBlock.svelte`

#### 2.2 Content Block
**File:** `src/lib/components/email-builder/blocks/ContentBlock.svelte`

#### 2.3 Button Block
**File:** `src/lib/components/email-builder/blocks/ButtonBlock.svelte`

#### 2.4 Image Block
**File:** `src/lib/components/email-builder/blocks/ImageBlock.svelte`

#### 2.5 QR Code Block
**File:** `src/lib/components/email-builder/blocks/QRCodeBlock.svelte`

### Command Palette
**File:** `src/lib/components/email-builder/BlockPalette.svelte`

Features:
- Keyboard shortcut: Cmd+K or click [+]
- Fuzzy search
- Recent blocks at top
- Categorized blocks (Content / Media / Layout / Custom)

### Drag-and-Drop
Using native HTML5 drag-and-drop:

```svelte
<div
  draggable="true"
  ondragstart={(e) => handleDragStart(e, index)}
  ondrop={(e) => handleDrop(e, index)}
  ondragover={(e) => e.preventDefault()}
>
  <!-- Block content -->
</div>
```

### Deliverables
- ✅ 5 block components implemented
- ✅ Command palette with search
- ✅ Drag-and-drop reordering
- ✅ Block selection UI
- ✅ Delete block functionality

## Phase 3: Rich Text Editor (Days 8-12)

### Goals
- Custom contentEditable component
- Structured segment storage (not HTML)
- Variable insertion with `{{` trigger
- Bold, italic, link formatting

### Rich Text Component
**File:** `src/lib/components/email-builder/RichTextEditor.svelte`

Key features:
- `{{` triggers variable autocomplete menu
- Selection toolbar (Medium.com style)
- Paste as plain text (strip formatting)
- Tab to indent (if needed)
- Keyboard shortcuts (Cmd+B, Cmd+I, Cmd+K)

### Variable System
**File:** `src/lib/components/email-builder/VariablePicker.svelte`

Features:
- Autocomplete on `{{`
- Display as chips in text
- Prevent editing variable names inline
- Click to edit/remove

### Formatting Toolbar
**File:** `src/lib/components/email-builder/FormattingToolbar.svelte`

Appears on text selection:
- Bold (Cmd+B)
- Italic (Cmd+I)
- Link (Cmd+K)
- Insert Variable
- Clear Formatting

### Deliverables
- ✅ Rich text editor with structured output
- ✅ Variable insertion system
- ✅ Formatting toolbar
- ✅ Keyboard shortcuts
- ✅ Paste handling

## Phase 4: HTML Generation (Days 13-15)

### Goals
- MJML integration
- Preview system with debouncing
- Cache invalidation
- Server-side API endpoint

### MJML Generator
**File:** `src/lib/email/mjml-generator.ts`

```typescript
import type { TemplateStructure, Block } from '$lib/types';

export function blocksToMJML(
  structure: TemplateStructure,
  variables: Record<string, string> = {}
): string {
  const { baseStyle, blocks } = structure;

  const head = generateMJMLHead(baseStyle);
  const body = blocks.map(block => blockToMJML(block, variables)).join('\n');

  return `
    <mjml>
      ${head}
      <mj-body background-color="#f4f4f4">
        <mj-section background-color="#ffffff" padding="0">
          <mj-column width="${baseStyle.containerWidth}px">
            ${body}
          </mj-column>
        </mj-section>
      </mj-body>
    </mjml>
  `;
}

function generateMJMLHead(baseStyle: BaseStyle): string {
  return `
    <mj-head>
      <mj-font name="${baseStyle.fontFamily}" />
      <mj-attributes>
        <mj-all font-family="${baseStyle.fontFamily}, Arial, sans-serif" />
        <mj-text color="#333" font-size="16px" line-height="24px" />
        <mj-button background-color="${baseStyle.primaryColor}" />
      </mj-attributes>
    </mj-head>
  `;
}

function blockToMJML(block: Block, variables: Record<string, string>): string {
  switch (block.type) {
    case 'header':
      return headerBlockToMJML(block, variables);
    case 'content':
      return contentBlockToMJML(block, variables);
    case 'button':
      return buttonBlockToMJML(block, variables);
    case 'image':
      return imageBlockToMJML(block, variables);
    case 'qrcode':
      return qrCodeBlockToMJML(block, variables);
    case 'custom_html':
      return `<mj-raw>${interpolateVariables(block.html, variables)}</mj-raw>`;
    default:
      return '';
  }
}
```

### HTML Generation API
**File:** `src/routes/api/email/generate-html/+server.ts`

```typescript
import type { RequestHandler } from './$types';
import { blocksToMJML } from '$lib/email/mjml-generator';
import mjml2html from 'mjml-browser'; // or use MJML API

export const POST: RequestHandler = async ({ request }) => {
  const { structure, variables } = await request.json();

  const mjmlString = blocksToMJML(structure, variables);

  const { html, errors } = mjml2html(mjmlString, {
    validationLevel: 'soft'
  });

  if (errors.length > 0) {
    console.warn('MJML validation warnings:', errors);
  }

  return new Response(JSON.stringify({ html, errors }), {
    headers: { 'Content-Type': 'application/json' }
  });
};
```

### Preview Component
**File:** `src/lib/components/email-builder/PreviewPane.svelte`

Features:
- Debounced HTML generation (500ms)
- Desktop/Mobile toggle
- Subject line preview
- Loading state during generation

### Deliverables
- ✅ MJML generator (blocks → MJML → HTML)
- ✅ HTML generation API endpoint
- ✅ Preview pane with debouncing
- ✅ Cache management (hash-based invalidation)
- ✅ Mobile preview mode

## Phase 5: Migration & Polish (Days 16-18)

### Goals
- Import existing HTML templates
- Full accessibility audit
- Performance optimization
- Template gallery/presets

### HTML Import
**File:** `src/lib/email/html-to-blocks.ts`

Lossy conversion:
- Extract common patterns (headings, paragraphs, images, buttons)
- Fallback to custom_html block for complex HTML
- Preserve variables (detect `{{` patterns)

### Accessibility
- Keyboard navigation (Tab, Arrow keys, Enter, Delete)
- ARIA labels on all interactive elements
- Focus management (return focus after operations)
- Screen reader announcements for state changes

### Performance
- Virtual scrolling (if >50 blocks)
- Lazy block component loading
- Debounced preview (already implemented)
- Optimistic UI updates

### Template Presets
**File:** `src/lib/email/template-presets.ts`

Provide 3-5 starter templates:
- Welcome email
- QR code email (current use case)
- Newsletter
- Receipt/invoice
- Announcement

### Deliverables
- ✅ HTML import tool
- ✅ Accessibility compliance (WCAG 2.1 AA)
- ✅ Performance benchmarks (<100ms block operations)
- ✅ Template gallery
- ✅ User documentation

## File Structure

```
src/
├── lib/
│   ├── types/
│   │   ├── email-template.ts
│   │   ├── email-builder.ts
│   │   └── index.ts
│   ├── components/
│   │   └── email-builder/
│   │       ├── EmailBuilder.svelte
│   │       ├── EmailBuilderContext.svelte.ts
│   │       ├── BlockList.svelte
│   │       ├── BlockRenderer.svelte
│   │       ├── BlockPalette.svelte
│   │       ├── BlockInspector.svelte
│   │       ├── PreviewPane.svelte
│   │       ├── EditorToolbar.svelte
│   │       ├── RichTextEditor.svelte
│   │       ├── VariablePicker.svelte
│   │       ├── FormattingToolbar.svelte
│   │       └── blocks/
│   │           ├── HeaderBlock.svelte
│   │           ├── ContentBlock.svelte
│   │           ├── ButtonBlock.svelte
│   │           ├── ImageBlock.svelte
│   │           ├── QRCodeBlock.svelte
│   │           ├── SpacerBlock.svelte
│   │           ├── DividerBlock.svelte
│   │           ├── TwoColumnBlock.svelte
│   │           └── CustomHTMLBlock.svelte
│   ├── email/
│   │   ├── mjml-generator.ts
│   │   ├── html-to-blocks.ts
│   │   ├── variable-interpolation.ts
│   │   ├── template-presets.ts
│   │   └── cache-management.ts
│   └── db/
│       └── email-templates.ts (CRUD operations)
├── routes/
│   ├── admin/
│   │   └── emails/
│   │       ├── +page.svelte (list templates)
│   │       ├── +page.server.ts
│   │       ├── [id]/
│   │       │   ├── +page.svelte (editor)
│   │       │   ├── +page.server.ts
│   │       │   └── +page.ts
│   │       └── new/
│   │           ├── +page.svelte
│   │           └── +page.server.ts
│   └── api/
│       └── email/
│           ├── generate-html/+server.ts
│           └── send-test/+server.ts
└── tests/
    ├── email-generation.test.ts
    ├── block-components.test.ts
    └── rich-text-editor.test.ts
```

## Testing Strategy

### Unit Tests
- Rich text segment manipulation
- MJML generation (snapshot tests)
- Variable interpolation
- Block operations (add, update, delete, move)

### Integration Tests
- Full editor workflow
- Save/load templates
- Preview generation
- HTML caching

### Email Client Tests
- Use Email on Acid or Litmus API
- Test in: Gmail, Outlook, Apple Mail, Yahoo
- Verify responsive design (desktop/mobile)

### Accessibility Tests
- Keyboard navigation (automated with jest-axe)
- Screen reader compatibility (manual testing)
- Color contrast ratios (automated)

## Performance Targets

- **Block operation:** <100ms (add, update, delete)
- **Preview generation:** <500ms (debounced)
- **Save operation:** <1s (including cache generation)
- **Load editor:** <2s (first paint)
- **Undo/redo:** <50ms

## Risks & Mitigations

### Risk 1: MJML Bundle Size
**Impact:** May exceed Cloudflare Workers size limit (1MB)
**Mitigation:** Use MJML API instead of bundling library

### Risk 2: Rich Text Editor Complexity
**Impact:** 40% of development time
**Mitigation:** Start with minimal features (bold, variables only), iterate

### Risk 3: Email Client Compatibility
**Impact:** Generated HTML doesn't work in Outlook
**Mitigation:** MJML handles this; validate with Email on Acid

### Risk 4: Performance with Large Templates
**Impact:** Editor becomes sluggish with >50 blocks
**Mitigation:** Virtual scrolling, lazy loading, debouncing

### Risk 5: Migration from HTML Editor
**Impact:** Users lose existing templates
**Mitigation:** Import tool + dual-mode support (keep HTML editor for legacy)

## Success Metrics

### Adoption
- 90% of new templates use block editor (not HTML)
- 50% of existing templates migrated within 3 months

### Performance
- <2s editor load time
- <100ms block operations
- Zero email client rendering bugs

### Usability
- Non-technical users create templates without help
- Average template creation time: 5 minutes (down from 30 minutes)

## Future Enhancements (Post-MVP)

### Phase 6: Advanced Features
- Conditional blocks (show if variable exists)
- A/B testing variants
- Template themes (color schemes)
- Custom block types (user-defined)
- Collaborative editing (multiple users)

### Phase 7: AI Features
- Generate template from description
- Suggest improvements (subject lines, CTA placement)
- Auto-optimize for email client compatibility
- Smart variable suggestions

## Dependencies

### npm Packages
```json
{
  "dependencies": {
    "mjml-browser": "^4.14.0" // or use API
  },
  "devDependencies": {
    "@testing-library/svelte": "^4.0.0",
    "vitest": "^1.0.0",
    "jest-axe": "^8.0.0"
  }
}
```

### External Services
- MJML API (optional, for HTML generation)
- Email on Acid / Litmus (for client testing)

## Deployment Checklist

- [ ] Database migrations run in production
- [ ] Environment variables set (MJML_API_KEY if using API)
- [ ] Feature flag enabled for beta users
- [ ] Monitoring/logging for HTML generation
- [ ] Rollback plan tested
- [ ] User documentation published
- [ ] Support team trained

## Appendix

### A. Variable Interpolation
Variables use `{{name}}` syntax, replaced at send-time:

```typescript
function interpolateVariables(
  text: string,
  variables: Record<string, string>
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => {
    return variables[key] || `{{${key}}}`; // Keep unfilled variables
  });
}
```

### B. Cache Invalidation
Hash structure to detect changes:

```typescript
import { createHash } from 'crypto';

function generateStructureHash(structure: TemplateStructure): string {
  const json = JSON.stringify(structure);
  return createHash('sha256').update(json).digest('hex');
}

async function getCachedHTML(template: EmailTemplate): Promise<string | null> {
  const currentHash = generateStructureHash(template.structure);

  if (template.html_cache_hash === currentHash) {
    return template.html_cache;
  }

  return null; // Cache invalid, regenerate
}
```

### C. Keyboard Shortcuts
- `Cmd/Ctrl + K`: Open block palette
- `Cmd/Ctrl + Z`: Undo
- `Cmd/Ctrl + Shift + Z`: Redo
- `Cmd/Ctrl + S`: Save
- `Cmd/Ctrl + B`: Bold (in rich text)
- `Cmd/Ctrl + I`: Italic (in rich text)
- `Cmd/Ctrl + K`: Link (in rich text, when text selected)
- `Delete/Backspace`: Delete selected block
- `Tab`: Navigate to next block
- `Shift + Tab`: Navigate to previous block
- `Enter`: Edit selected block
- `Escape`: Deselect block

---

**Document Version:** 1.0
**Last Updated:** 2025-11-09
**Author:** Claude Code
**Review Status:** Ready for implementation
