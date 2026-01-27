<script lang="ts">
  import type { PageData } from './$types';
  import type { Snapshot } from './$types';
  import { enhance } from '$app/forms';
  import { invalidate, pushState, replaceState } from '$app/navigation';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { BlockEditor, editorState, editorActions, previewHTML } from '$lib/components/admin/email';
  import { EMAIL_TEMPLATES } from '$lib/email/editor/registry';
  import { SYSTEM_TEMPLATE_BLOCKS } from '$lib/email/editor/system-template-blocks';
  import type { EmailTemplate } from '$lib/email/editor';

  export let data: PageData;
  export let form;

  // Color scheme hex values for thumbnail rendering
  const COLOR_HEX: Record<string, string> = {
    orange: '#c2410c',
    teal: '#0f766e',
    green: '#15803d',
    amber: '#b45309',
    red: '#b91c1c',
    gray: '#374151'
  };

  // Get visual metadata for a template (for thumbnails)
  function getTemplateVisuals(slug: string): { color: string; emoji: string; title: string } {
    // Try SYSTEM_TEMPLATE_BLOCKS first (uses underscores)
    const blockDef = SYSTEM_TEMPLATE_BLOCKS[slug];
    if (blockDef) {
      return {
        color: COLOR_HEX[blockDef.settings.colorScheme] || COLOR_HEX.orange,
        emoji: blockDef.settings.emoji || '📧',
        title: blockDef.settings.title || slug
      };
    }
    // Fallback defaults
    return { color: COLOR_HEX.orange, emoji: '📧', title: slug };
  }

  let mode: 'list' | 'edit' = 'list';
  let editorMode: 'blocks' | 'html' = 'blocks'; // Toggle between semantic and raw
  let selectedTemplate: any = null;
  let showPreview = true;
  let showTestModal = false;

  // Form state (for raw HTML mode)
  let slug = '';
  let subject = '';
  let htmlBody = '';
  let variables = '';
  let testEmail = '';

  // ============================================
  // SNAPSHOT: Preserve state across navigation
  // ============================================
  interface SnapshotData {
    mode: 'list' | 'edit';
    editorMode: 'blocks' | 'html';
    slug: string;
    subject: string;
    htmlBody: string;
    variables: string;
    testEmail: string;
  }

  export const snapshot: Snapshot<SnapshotData> = {
    capture: () => ({
      mode,
      editorMode,
      slug,
      subject,
      htmlBody,
      variables,
      testEmail
    }),
    restore: (value) => {
      mode = value.mode;
      editorMode = value.editorMode;
      slug = value.slug;
      subject = value.subject;
      htmlBody = value.htmlBody;
      variables = value.variables;
      testEmail = value.testEmail;

      // If restoring to edit mode, try to find and set the selected template
      if (mode === 'edit' && slug) {
        const template = data.templates.find(t => t.slug === slug);
        if (template) {
          selectedTemplate = template;
          // Reload blocks if in block editor mode
          if (editorMode === 'blocks' && template.blocks_json) {
            loadBlocksIntoEditor(template.blocks_json);
          } else if (editorMode === 'blocks' && template.is_system && SYSTEM_TEMPLATE_BLOCKS[template.slug]) {
            const systemDef = SYSTEM_TEMPLATE_BLOCKS[template.slug];
            editorState.set({
              settings: systemDef.settings,
              blocks: systemDef.blocks,
              variables: {}
            });
          }
        }
      }
    }
  };

  // ============================================
  // SHALLOW ROUTING: URL-persistent UI state
  // ============================================
  interface PageState {
    editing?: string;      // Template slug being edited
    editorMode?: 'blocks' | 'html';
  }

  // React to back/forward navigation by restoring state from page.state
  $: {
    const state = $page.state as PageState;
    if (state?.editing) {
      // User navigated back/forward to an editing state
      const template = data.templates.find(t => t.slug === state.editing) as any;
      if (template && (mode !== 'edit' || slug !== state.editing)) {
        // Restore the editing state without pushing new history
        selectedTemplate = template;
        slug = template.slug;
        subject = template.subject;
        htmlBody = template.html_body;
        variables = template.variables ? JSON.stringify(template.variables, null, 2) : '';
        mode = 'edit';

        if (state.editorMode) {
          editorMode = state.editorMode;
        }

        // Load blocks if needed
        if (editorMode === 'blocks') {
          if (template.blocks_json) {
            loadBlocksIntoEditor(template.blocks_json);
          } else if (template.is_system && SYSTEM_TEMPLATE_BLOCKS[template.slug]) {
            const systemDef = SYSTEM_TEMPLATE_BLOCKS[template.slug];
            editorState.set({
              settings: systemDef.settings,
              blocks: systemDef.blocks,
              variables: {}
            });
          }
        }
      }
    } else if (state && 'editing' in state && state.editing === undefined) {
      // User navigated back to list state (editing was explicitly set to undefined)
      if (mode !== 'list') {
        mode = 'list';
        selectedTemplate = null;
        editorActions.reset();
      }
    }
  }

  // Preview with variable replacement (raw HTML mode)
  $: previewHtml = editorMode === 'html'
    ? replaceVariables(htmlBody, variables)
    : ''; // Block editor handles its own preview

  // Serialize editor state to JSON for form submission (Block Editor mode)
  // This creates a full EmailTemplate structure for storage
  function getBlocksJson(): string | null {
    if (editorMode !== 'blocks') return null;

    const state = get(editorState);

    // Build a full EmailTemplate structure from editor state
    const template: EmailTemplate = {
      slug: slug,
      name: state.settings.title || slug,
      subject: state.settings.title,
      colorScheme: state.settings.colorScheme,
      header: {
        emoji: state.settings.emoji,
        title: state.settings.title,
        subtitle: state.settings.subtitle
      },
      blocks: convertEditorBlocksToEmailBlocks(state.blocks),
      footer: { type: 'support' },
      variables: Object.entries(state.variables).map(([name, testValue]) => ({
        name,
        label: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()),
        type: 'string' as const,
        exampleValue: testValue
      }))
    };

    return JSON.stringify(template);
  }

  // Convert editor-store blocks to EmailTemplate blocks format
  function convertEditorBlocksToEmailBlocks(editorBlocks: any[]): any[] {
    return editorBlocks.map(block => {
      switch (block.type) {
        case 'greeting':
          return {
            type: 'greeting',
            id: block.id,
            nameVariable: `{{${block.variableName}}}`,
            prefix: 'Hi'
          };
        case 'paragraph':
          return {
            type: 'paragraph',
            id: block.id,
            content: block.text,
            style: block.style
          };
        case 'infoBox':
          return {
            type: 'infobox',
            id: block.id,
            boxType: block.boxType,
            title: block.title,
            content: block.text
          };
        case 'button':
          return {
            type: 'button',
            id: block.id,
            label: block.label,
            urlVariable: `{{${block.urlVariable}}}`
          };
        case 'stepList':
          return {
            type: 'steplist',
            id: block.id,
            steps: block.steps.map((s: any) => ({
              title: s.title,
              description: s.description
            }))
          };
        case 'codeInline':
          return {
            type: 'code',
            id: block.id,
            content: block.text,
            style: 'inline'
          };
        case 'codeBlock':
          return {
            type: 'code',
            id: block.id,
            content: block.code,
            style: 'block'
          };
        case 'image':
          return {
            type: 'image',
            id: block.id,
            cid: block.cidReference,
            alt: block.alt,
            width: block.width || 280,
            height: block.height || 280
          };
        case 'divider':
          return {
            type: 'divider',
            id: block.id,
            style: 'light'
          };
        case 'spacer':
          return {
            type: 'spacer',
            id: block.id,
            size: 'lg'
          };
        default:
          return block;
      }
    });
  }

  // Load blocks from stored JSON into the editor
  function loadBlocksIntoEditor(blocksJson: string) {
    try {
      const template = JSON.parse(blocksJson) as EmailTemplate;

      // Convert EmailTemplate to editor state format
      editorState.set({
        settings: {
          colorScheme: template.colorScheme || 'orange',
          emoji: template.header?.emoji || '📧',
          title: template.header?.title || template.subject || '',
          subtitle: template.header?.subtitle || ''
        },
        blocks: convertEmailBlocksToEditorBlocks(template.blocks || []),
        variables: (template.variables || []).reduce((acc, v) => {
          acc[v.name] = v.exampleValue;
          return acc;
        }, {} as Record<string, string>)
      });
    } catch (e) {
      console.error('[Admin] Error loading blocks into editor:', e);
      // Reset to initial state if parsing fails
      editorActions.reset();
    }
  }

  // Convert EmailTemplate blocks to editor-store blocks format
  function convertEmailBlocksToEditorBlocks(templateBlocks: any[]): any[] {
    return templateBlocks.map(block => {
      switch (block.type) {
        case 'greeting':
          return {
            type: 'greeting',
            id: block.id,
            // Extract variable name from {{variable}} syntax
            variableName: block.nameVariable?.replace(/^\{\{|\}\}$/g, '') || 'customer_name'
          };
        case 'paragraph':
          return {
            type: 'paragraph',
            id: block.id,
            text: block.content,
            style: block.style || 'normal'
          };
        case 'infobox':
          return {
            type: 'infoBox',
            id: block.id,
            boxType: block.boxType,
            title: block.title || '',
            text: block.content
          };
        case 'button':
          return {
            type: 'button',
            id: block.id,
            label: block.label,
            // Extract variable name from {{variable}} syntax
            urlVariable: block.urlVariable?.replace(/^\{\{|\}\}$/g, '') || 'button_url',
            colorOverride: block.colorScheme ? undefined : undefined
          };
        case 'steplist':
          return {
            type: 'stepList',
            id: block.id,
            steps: (block.steps || []).map((s: any, i: number) => ({
              id: `step_${block.id}_${i}`,
              title: s.title,
              description: s.description
            }))
          };
        case 'code':
          if (block.style === 'inline') {
            return {
              type: 'codeInline',
              id: block.id,
              text: block.content
            };
          } else {
            return {
              type: 'codeBlock',
              id: block.id,
              code: block.content
            };
          }
        case 'image':
          return {
            type: 'image',
            id: block.id,
            cidReference: block.cid,
            alt: block.alt,
            width: block.width,
            height: block.height
          };
        case 'divider':
          return {
            type: 'divider',
            id: block.id
          };
        case 'spacer':
          return {
            type: 'spacer',
            id: block.id
          };
        case 'heading':
          return {
            type: 'paragraph',
            id: block.id,
            text: block.content,
            style: 'lead'
          };
        case 'list':
          // Convert list to paragraph for now (editor doesn't have list block)
          return {
            type: 'paragraph',
            id: block.id,
            text: (block.items || []).join('\n'),
            style: 'normal'
          };
        default:
          return block;
      }
    });
  }

  function replaceVariables(html: string, varsJson: string): string {
    try {
      const vars = varsJson ? JSON.parse(varsJson) : {};
      let result = html;
      for (const [key, value] of Object.entries(vars)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), String(value));
      }
      return result;
    } catch {
      return html;
    }
  }

  function editTemplate(template: any) {
    mode = 'edit';
    selectedTemplate = template;
    slug = template.slug;
    subject = template.subject;
    htmlBody = template.html_body;
    variables = template.variables ? JSON.stringify(template.variables, null, 2) : '';

    // Determine editor mode
    let newEditorMode: 'blocks' | 'html' = 'html';

    // Check if template has saved block data
    if (template.blocks_json) {
      // Template was created/edited with Block Editor - load blocks
      newEditorMode = 'blocks';
      editorMode = 'blocks';
      loadBlocksIntoEditor(template.blocks_json);
    } else if (template.is_system && SYSTEM_TEMPLATE_BLOCKS[template.slug]) {
      // System template without blocks_json - load from code definitions
      newEditorMode = 'blocks';
      editorMode = 'blocks';
      const systemDef = SYSTEM_TEMPLATE_BLOCKS[template.slug];
      editorState.set({
        settings: systemDef.settings,
        blocks: systemDef.blocks,
        variables: {}
      });
    } else {
      // No block data - use HTML mode
      editorMode = 'html';
      // Reset block editor (in case user switches to block mode later)
      editorActions.reset();
      // Load the subject into block editor settings
      if (subject) {
        editorActions.updateSettings({ title: subject });
      }
    }

    // Push state for shallow routing (back button support)
    pushState('', { editing: template.slug, editorMode: newEditorMode } as PageState);
  }

  function cancelEdit() {
    mode = 'list';
    selectedTemplate = null;
    editorActions.reset();

    // Push state for shallow routing (back button support)
    pushState('', { editing: undefined } as PageState);
  }

  // Get HTML from block editor
  function getBlockEditorHTML(): string {
    // The BlockEditor component exposes its HTML via the store
    // We'll need to generate it from the current state
    const state = $editorState;
    // This will be handled by the BlockEditor's internal renderer
    return '';
  }

  // Handle form submission success
  $: if (form?.success || form?.deleted || form?.restored) {
    mode = 'list';
    selectedTemplate = null;
    invalidate('app:email-templates');
  } else if (form?.testSent) {
    showTestModal = false;
    testEmail = '';
  }
</script>

<svelte:head>
  <title>Email Templates - Frontier Meals Admin</title>
</svelte:head>

<div class="space-y-6">
  <!-- Page header -->
  <div class="flex items-center justify-between">
    <div>
      <h1 class="text-3xl font-extrabold tracking-tight text-[#1A1816]">Email Templates</h1>
      <p class="text-[#5C5A56] mt-2">Edit system email templates with the semantic block editor</p>
    </div>
    {#if mode === 'edit'}
      <button
        onclick={cancelEdit}
        class="px-6 py-3 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] font-bold rounded-sm transition-colors"
      >
        ← Back to List
      </button>
    {/if}
  </div>

  {#if mode === 'list'}
    <!-- Templates Grid -->
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {#each data.templates as template}
        {@const registryInfo = EMAIL_TEMPLATES.find(t => t.slug === template.slug)}
        {@const visuals = getTemplateVisuals(template.slug)}
        <div class="group bg-white border-2 border-[#D9D7D2] hover:border-[#B8B6B1] rounded-sm overflow-hidden transition-all hover:shadow-lg">
          <!-- Template Info (Top) -->
          <div class="p-4">
            <div class="flex items-start justify-between gap-2 mb-1">
              <h3 class="font-bold text-[#1A1816] text-base leading-tight">
                {registryInfo?.name || template.slug}
              </h3>
              {#if template.is_system}
                <span class="px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#5C5A56] bg-[#E8E6E1] rounded flex-shrink-0">
                  System
                </span>
              {/if}
            </div>
            <p class="text-sm text-[#5C5A56] truncate mb-3">{template.subject}</p>

            <!-- Actions -->
            <div class="flex items-center gap-2">
              <button
                onclick={() => editTemplate(template)}
                class="flex-1 px-3 py-2 text-sm font-bold text-[#E67E50] hover:bg-[#E67E50]/10 border-2 border-[#E67E50]/30 hover:border-[#E67E50] rounded transition-colors"
              >
                Edit
              </button>
              {#if template.is_system}
                <form method="POST" action="?/restoreOriginal" use:enhance class="flex-1">
                  <input type="hidden" name="slug" value={template.slug} />
                  <input type="hidden" name="csrf_token" value={data.csrfToken} />
                  <button
                    type="submit"
                    class="w-full px-3 py-2 text-sm font-bold text-[#52A675] hover:bg-[#52A675]/10 border-2 border-[#52A675]/30 hover:border-[#52A675] rounded transition-colors"
                    onclick={(e) => !confirm('Restore to original? This will create a new version.') && e.preventDefault()}
                  >
                    Restore
                  </button>
                </form>
              {:else}
                <form method="POST" action="?/deleteTemplate" use:enhance class="flex-1">
                  <input type="hidden" name="id" value={template.id} />
                  <input type="hidden" name="csrf_token" value={data.csrfToken} />
                  <button
                    type="submit"
                    class="w-full px-3 py-2 text-sm font-bold text-[#C85454] hover:bg-[#C85454]/10 border-2 border-[#C85454]/30 hover:border-[#C85454] rounded transition-colors"
                    onclick={(e) => !confirm('Delete this template?') && e.preventDefault()}
                  >
                    Delete
                  </button>
                </form>
              {/if}
            </div>
          </div>

          <!-- Thumbnail Preview (Bottom) -->
          <button
            type="button"
            onclick={() => editTemplate(template)}
            class="w-full text-left focus:outline-none focus:ring-2 focus:ring-[#E67E50] focus:ring-inset"
          >
            <div class="relative bg-[#F5F5F4] p-2 border-t border-[#E8E6E1]">
              <!-- Miniature Email Frame -->
              <div class="bg-white rounded shadow-sm overflow-hidden max-w-[140px] mx-auto" style="aspect-ratio: 3/4;">
                <!-- Header bar with color -->
                <div class="h-5 flex items-center justify-center" style="background-color: {visuals.color};">
                  <span class="text-white text-xs">{visuals.emoji}</span>
                </div>
                <!-- Content preview -->
                <div class="p-1.5 space-y-1">
                  <!-- Title placeholder -->
                  <div class="h-1 rounded-full bg-[#1A1816] w-3/4 mx-auto"></div>
                  <div class="h-0.5 rounded-full bg-[#D9D7D2] w-1/2 mx-auto"></div>
                  <!-- Content lines -->
                  <div class="pt-0.5 space-y-0.5">
                    <div class="h-0.5 rounded-full bg-[#E8E6E1] w-full"></div>
                    <div class="h-0.5 rounded-full bg-[#E8E6E1] w-5/6"></div>
                    <div class="h-0.5 rounded-full bg-[#E8E6E1] w-4/5"></div>
                  </div>
                  <!-- Button placeholder -->
                  <div class="pt-0.5 flex justify-center">
                    <div class="h-2 w-10 rounded-sm" style="background-color: {visuals.color};"></div>
                  </div>
                </div>
              </div>
              <!-- Hover overlay -->
              <div class="absolute inset-0 bg-[#1A1816]/0 group-hover:bg-[#1A1816]/5 transition-colors flex items-center justify-center">
                <span class="opacity-0 group-hover:opacity-100 transition-opacity bg-white/90 px-2 py-1 rounded text-xs font-bold text-[#1A1816] shadow">
                  Edit
                </span>
              </div>
            </div>
          </button>
        </div>
      {/each}

      {#if data.templates.length === 0}
        <div class="col-span-full bg-white border-2 border-[#D9D7D2] rounded-sm p-12 text-center">
          <svg class="w-16 h-16 mx-auto mb-4 text-[#D9D7D2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
          <p class="font-bold text-[#1A1816] mb-1">No templates yet</p>
          <p class="text-sm text-[#5C5A56]">Create your first email template to get started</p>
        </div>
      {/if}
    </div>
  {:else}
    <!-- Editor Mode Toggle -->
    <div class="flex items-center gap-4 mb-6">
      <div class="flex bg-[#D9D7D2] rounded-sm p-1">
        <button
          onclick={() => {
            editorMode = 'blocks';
            // Update URL state for back button support
            replaceState('', { editing: slug, editorMode: 'blocks' } as PageState);
          }}
          class="px-4 py-2 text-sm font-bold rounded-sm transition-all {editorMode === 'blocks' ? 'bg-white text-[#1A1816] shadow' : 'text-[#5C5A56] hover:text-[#1A1816]'}"
        >
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            Block Editor
          </span>
        </button>
        <button
          onclick={() => {
            editorMode = 'html';
            // Update URL state for back button support
            replaceState('', { editing: slug, editorMode: 'html' } as PageState);
          }}
          class="px-4 py-2 text-sm font-bold rounded-sm transition-all {editorMode === 'html' ? 'bg-white text-[#1A1816] shadow' : 'text-[#5C5A56] hover:text-[#1A1816]'}"
        >
          <span class="flex items-center gap-2">
            <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
            </svg>
            Raw HTML
          </span>
        </button>
      </div>
      <p class="text-sm text-[#5C5A56]">
        {editorMode === 'blocks' ? 'Visual block-based editor with live preview' : 'Direct HTML editing for advanced customization'}
      </p>
    </div>

    {#if editorMode === 'blocks'}
      <!-- Block Editor -->
      <form method="POST" action="?/updateTemplate" use:enhance={() => {
        // Serialize blocks right before submission
        const blocksJsonInput = document.querySelector('input[name="blocksJson"]') as HTMLInputElement;
        if (blocksJsonInput) {
          blocksJsonInput.value = getBlocksJson() || '';
        }
        return async ({ update }) => {
          await update();
        };
      }}>
        <input type="hidden" name="id" value={selectedTemplate?.id} />
        <input type="hidden" name="slug" value={slug} />
        <input type="hidden" name="subject" value={$editorState.settings.title} />
        <input type="hidden" name="htmlBody" value={$previewHTML} />
        <input type="hidden" name="blocksJson" value="" />
        <input type="hidden" name="csrf_token" value={data.csrfToken} />

        <div class="bg-white border-2 border-[#D9D7D2] rounded-sm shadow-lg overflow-hidden">
          <div class="p-4 border-b-2 border-[#D9D7D2] bg-[#FAFAF9]">
            <div class="flex items-center justify-between">
              <div>
                <h2 class="text-xl font-extrabold tracking-tight text-[#1A1816]">
                  Edit Template
                </h2>
                <p class="text-sm text-[#5C5A56]">Compose your email using semantic content blocks</p>
              </div>
              <div class="flex gap-2">
                <button
                  type="button"
                  onclick={() => showTestModal = true}
                  class="px-4 py-2 text-sm text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] font-bold rounded-sm transition-colors"
                >
                  Send Test
                </button>
                <button
                  type="submit"
                  class="px-4 py-2 text-sm text-white bg-[#E67E50] border-2 border-[#D97F3E] hover:bg-[#D97F3E] font-bold rounded-sm transition-colors"
                >
                  Save Template
                </button>
              </div>
            </div>
          </div>
          <BlockEditor />
        </div>
      </form>
    {:else}
      <!-- Raw HTML Editor (original) -->
      <form method="POST" action="?/updateTemplate" use:enhance class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <!-- Left column: Editor -->
        <div class="space-y-6">
          <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
            <h2 class="text-xl font-extrabold tracking-tight text-[#1A1816] mb-6">
              Edit Template
            </h2>

            <input type="hidden" name="id" value={selectedTemplate?.id} />
            <input type="hidden" name="csrf_token" value={data.csrfToken} />

            <div class="space-y-4">
              <div>
                <label for="subject" class="block text-sm font-bold text-[#1A1816] mb-2">
                  Subject Line
                </label>
                <input
                  id="subject"
                  name="subject"
                  type="text"
                  bind:value={subject}
                  required
                  placeholder="Welcome to Frontier Meals"
                  class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
                />
              </div>

              <div>
                <label for="htmlBody" class="block text-sm font-bold text-[#1A1816] mb-2">
                  HTML Body
                  <span class="text-xs text-[#5C5A56] ml-2">Use {"{{variable_name}}"} for dynamic content</span>
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
            </div>

            <div class="flex gap-3 mt-6">
              <button
                type="submit"
                class="flex-1 px-6 py-3 bg-[#E67E50] border-2 border-[#D97F3E] text-white font-bold rounded-sm hover:bg-[#D97F3E] hover:shadow-xl shadow-lg transition-all"
              >
                Save Changes
              </button>
              <button
                type="button"
                onclick={() => showPreview = !showPreview}
                class="px-6 py-3 text-[#E67E50] bg-[#E67E50]/10 border-2 border-[#E67E50]/20 hover:bg-[#E67E50]/20 font-bold rounded-sm transition-colors"
              >
                {showPreview ? 'Hide' : 'Show'} Preview
              </button>
              <button
                type="button"
                onclick={() => showTestModal = true}
                class="px-6 py-3 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] font-bold rounded-sm transition-colors"
              >
                Send Test
              </button>
            </div>
          </div>
        </div>

        <!-- Right column: Preview -->
        <div class="space-y-6">
          <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 sticky top-24 shadow-lg">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-xl font-extrabold tracking-tight text-[#1A1816]">Live Preview</h2>
              <span class="px-2 py-1 text-xs font-bold bg-[#52A675] text-white border-2 border-[#52A675]/70 rounded-sm">
                Live
              </span>
            </div>

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
                      srcdoc={previewHtml}
                      sandbox="allow-same-origin"
                      class="w-full h-[500px] border-0"
                    ></iframe>
                  {:else}
                    <p class="text-[#5C5A56] text-center py-12">Start typing to see preview</p>
                  {/if}
                </div>
              </div>
            {:else}
              <div class="text-center py-12 text-[#5C5A56]">
                <svg class="w-16 h-16 mx-auto mb-4 text-[#D9D7D2]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
                <p class="font-bold">Click "Show Preview" to see how your email looks</p>
              </div>
            {/if}
          </div>
        </div>
      </form>
    {/if}
  {/if}
</div>

<!-- Test Email Modal -->
{#if showTestModal}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50" onclick={() => showTestModal = false}>
    <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
    <div class="bg-white border-2 border-[#D9D7D2] rounded-sm shadow-2xl max-w-md w-full p-6" onclick={(e) => e.stopPropagation()}>
      <h3 class="text-xl font-extrabold tracking-tight text-[#1A1816] mb-4">Send Test Email</h3>

      <form method="POST" action="?/sendTest" use:enhance>
        <input type="hidden" name="subject" value={editorMode === 'blocks' ? $editorState.settings.title : subject} />
        <input type="hidden" name="htmlBody" value={editorMode === 'blocks' ? $previewHTML : previewHtml} />
        <input type="hidden" name="csrf_token" value={data.csrfToken} />

        <div class="mb-6">
          <label for="testEmail" class="block text-sm font-bold text-[#1A1816] mb-2">
            Recipient Email
          </label>
          <input
            id="testEmail"
            name="email"
            type="email"
            bind:value={testEmail}
            required
            placeholder="your@email.com"
            class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
          />
        </div>

        <div class="flex gap-3">
          <button
            type="button"
            onclick={() => showTestModal = false}
            class="flex-1 px-4 py-2 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] rounded-sm font-bold transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            class="flex-1 px-4 py-2 text-white bg-[#E67E50] border-2 border-[#D97F3E] hover:bg-[#D97F3E] hover:shadow-xl shadow-lg rounded-sm font-bold transition-colors"
          >
            Send Test
          </button>
        </div>
      </form>
    </div>
  </div>
{/if}
