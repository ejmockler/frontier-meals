<script lang="ts">
  import { editorActions, type Block, type ParagraphStyle, type InfoBoxType } from './editor-store';
  import VariablePicker from './VariablePicker.svelte';
  import type { VariableDefinition, TemplateContext } from '$lib/email/editor/variables';

  interface Props {
    block: Block;
    index?: number;
    templateContext?: TemplateContext;
  }

  let { block, index = 0, templateContext = 'custom' }: Props = $props();

  // Block type metadata for visual recognition
  const blockMeta: Record<string, { icon: string; label: string; color: string }> = {
    greeting: { icon: '👋', label: 'Greeting', color: '#52A675' },
    paragraph: { icon: '📝', label: 'Paragraph', color: '#374151' },
    infoBox: { icon: '💡', label: 'Info Box', color: '#2563EB' },
    button: { icon: '🔘', label: 'Button', color: '#E67E50' },
    stepList: { icon: '📋', label: 'Step List', color: '#8B5CF6' },
    codeInline: { icon: '⌨️', label: 'Code (Inline)', color: '#6B7280' },
    codeBlock: { icon: '💻', label: 'Code Block', color: '#374151' },
    image: { icon: '🖼️', label: 'Image', color: '#0F766E' },
    divider: { icon: '➖', label: 'Divider', color: '#D1D5DB' },
    spacer: { icon: '⬇️', label: 'Spacer', color: '#E5E7EB' },
  };

  const meta = blockMeta[block.type];

  function deleteBlock() {
    if (confirm('Delete this block?')) {
      editorActions.deleteBlock(block.id);
    }
  }

  function updateBlock(updates: Partial<Block>) {
    editorActions.updateBlock(block.id, updates);
  }
</script>

<div class="block-card" style="--block-color: {meta.color}">
  <!-- Header -->
  <div class="block-header">
    <div class="block-info">
      <span class="drag-handle" title="Drag to reorder">
        <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8h16M4 16h16" />
        </svg>
      </span>
      <span class="block-icon">{meta.icon}</span>
      <span class="block-label">{meta.label}</span>
    </div>
    <button type="button" class="delete-btn" onclick={deleteBlock} title="Delete block">
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>

  <!-- Block-specific content -->
  <div class="block-content">
    {#if block.type === 'greeting'}
      <div class="field">
        <label class="field-label">Name Variable</label>
        <VariablePicker
          context={templateContext}
          selected={block.variableName}
          typeFilter={['string']}
          placeholder="Select name variable..."
          onSelect={(v) => updateBlock({ variableName: v.name })}
        />
        <p class="field-hint">Will render as "Hi {'{{' + block.variableName + '}}'}!"</p>
      </div>

    {:else if block.type === 'paragraph'}
      <div class="field">
        <label class="field-label">Text</label>
        <textarea
          class="field-textarea"
          rows="3"
          value={block.text}
          oninput={(e) => updateBlock({ text: e.currentTarget.value })}
          placeholder="Write your paragraph here... Use {{variable_name}} syntax"
        ></textarea>
        <p class="field-hint">Insert variables using {"{{variable_name}}"} syntax</p>
      </div>
      <div class="field">
        <label class="field-label">Insert Variable</label>
        <VariablePicker
          context={templateContext}
          mode="inline"
          onSelect={(v) => updateBlock({ text: block.text + `{{${v.name}}}` })}
        />
      </div>
      <div class="field">
        <label class="field-label">Style</label>
        <select
          class="field-select"
          value={block.style}
          onchange={(e) => updateBlock({ style: e.currentTarget.value as ParagraphStyle })}
        >
          <option value="lead">Lead (larger, bold)</option>
          <option value="normal">Normal</option>
          <option value="muted">Muted (lighter)</option>
          <option value="small">Small</option>
        </select>
      </div>

    {:else if block.type === 'infoBox'}
      <div class="field">
        <label class="field-label">Type</label>
        <select
          class="field-select"
          value={block.boxType}
          onchange={(e) => updateBlock({ boxType: e.currentTarget.value as InfoBoxType })}
        >
          <option value="info">ℹ️ Info (blue)</option>
          <option value="success">✅ Success (green)</option>
          <option value="warning">⚠️ Warning (yellow)</option>
          <option value="error">🚨 Error (red)</option>
        </select>
      </div>
      <div class="field">
        <label class="field-label">Title</label>
        <input
          type="text"
          class="field-input"
          value={block.title}
          oninput={(e) => updateBlock({ title: e.currentTarget.value })}
          placeholder="Important Notice"
        />
      </div>
      <div class="field">
        <label class="field-label">Text</label>
        <textarea
          class="field-textarea"
          rows="2"
          value={block.text}
          oninput={(e) => updateBlock({ text: e.currentTarget.value })}
          placeholder="Additional details..."
        ></textarea>
      </div>
      <div class="field">
        <label class="field-label">Insert Variable</label>
        <VariablePicker
          context={templateContext}
          mode="inline"
          onSelect={(v) => updateBlock({ text: block.text + `{{${v.name}}}` })}
        />
      </div>

    {:else if block.type === 'button'}
      <div class="field">
        <label class="field-label">Label</label>
        <input
          type="text"
          class="field-input"
          value={block.label}
          oninput={(e) => updateBlock({ label: e.currentTarget.value })}
          placeholder="Click Here"
        />
      </div>
      <div class="field">
        <label class="field-label">URL Variable</label>
        <VariablePicker
          context={templateContext}
          selected={block.urlVariable}
          typeFilter={['url']}
          placeholder="Select URL variable..."
          onSelect={(v) => updateBlock({ urlVariable: v.name })}
        />
      </div>
      <div class="field">
        <label class="field-label">Color Override (optional)</label>
        <input
          type="color"
          class="field-color"
          value={block.colorOverride || '#E67E50'}
          oninput={(e) => updateBlock({ colorOverride: e.currentTarget.value })}
        />
      </div>

    {:else if block.type === 'stepList'}
      <div class="steps-container">
        {#each block.steps as step, i}
          <div class="step-item">
            <div class="step-number">{i + 1}</div>
            <div class="step-fields">
              <input
                type="text"
                class="field-input"
                value={step.title}
                oninput={(e) => editorActions.updateStep(block.id, step.id, { title: e.currentTarget.value })}
                placeholder="Step title"
              />
              <textarea
                class="field-textarea"
                rows="2"
                value={step.description}
                oninput={(e) => editorActions.updateStep(block.id, step.id, { description: e.currentTarget.value })}
                placeholder="Step description"
              ></textarea>
            </div>
            <button
              type="button"
              class="step-delete"
              onclick={() => editorActions.deleteStep(block.id, step.id)}
              title="Delete step"
            >
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        {/each}
        <button
          type="button"
          class="add-step-btn"
          onclick={() => editorActions.addStep(block.id)}
        >
          <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
          </svg>
          Add Step
        </button>
      </div>

    {:else if block.type === 'codeInline'}
      <div class="field">
        <label class="field-label">Code Text</label>
        <input
          type="text"
          class="field-input code"
          value={block.text}
          oninput={(e) => updateBlock({ text: e.currentTarget.value })}
          placeholder="/skip"
        />
      </div>

    {:else if block.type === 'codeBlock'}
      <div class="field">
        <label class="field-label">Code</label>
        <textarea
          class="field-textarea code"
          rows="4"
          value={block.code}
          oninput={(e) => updateBlock({ code: e.currentTarget.value })}
          placeholder="Your code here..."
        ></textarea>
      </div>

    {:else if block.type === 'image'}
      <div class="field">
        <label class="field-label">CID Reference</label>
        <input
          type="text"
          class="field-input code"
          value={block.cidReference}
          oninput={(e) => updateBlock({ cidReference: e.currentTarget.value })}
          placeholder="qr-code"
        />
        <p class="field-hint">Use "qr-code" to embed the daily QR code image</p>
      </div>
      <div class="field">
        <label class="field-label">Alt Text</label>
        <input
          type="text"
          class="field-input"
          value={block.alt}
          oninput={(e) => updateBlock({ alt: e.currentTarget.value })}
          placeholder="QR Code"
        />
      </div>
      <div class="field-row">
        <div class="field">
          <label class="field-label">Width (px)</label>
          <input
            type="number"
            class="field-input"
            value={block.width || 280}
            oninput={(e) => updateBlock({ width: parseInt(e.currentTarget.value) || 280 })}
          />
        </div>
        <div class="field">
          <label class="field-label">Height (px)</label>
          <input
            type="number"
            class="field-input"
            value={block.height || 280}
            oninput={(e) => updateBlock({ height: parseInt(e.currentTarget.value) || 280 })}
          />
        </div>
      </div>

    {:else if block.type === 'divider'}
      <div class="static-block">
        <hr style="border: none; border-top: 2px solid #E5E7EB; margin: 8px 0;" />
        <p class="static-hint">Horizontal divider line</p>
      </div>

    {:else if block.type === 'spacer'}
      <div class="static-block">
        <div style="height: 32px; background: repeating-linear-gradient(0deg, transparent, transparent 4px, #E5E7EB 4px, #E5E7EB 5px); border-radius: 4px;"></div>
        <p class="static-hint">32px vertical spacing</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .block-card {
    background: white;
    border: 2px solid #D9D7D2;
    border-left: 4px solid var(--block-color);
    border-radius: 4px;
    overflow: visible;
    transition: all 100ms;
  }

  .block-card:hover {
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  }

  /* Header */
  .block-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #F9FAFB;
    border-bottom: 1px solid #E5E7EB;
  }

  .block-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .drag-handle {
    display: flex;
    color: #9CA3AF;
    cursor: grab;
  }

  .drag-handle:active {
    cursor: grabbing;
  }

  .block-icon {
    font-size: 18px;
    line-height: 1;
  }

  .block-label {
    font-size: 14px;
    font-weight: 700;
    color: #374151;
  }

  .delete-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    background: none;
    border: none;
    border-radius: 4px;
    color: #9CA3AF;
    cursor: pointer;
    transition: all 100ms;
  }

  .delete-btn:hover {
    background: #FEE2E2;
    color: #DC2626;
  }

  /* Content */
  .block-content {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .field-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }

  .field-label {
    font-size: 12px;
    font-weight: 700;
    color: #374151;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .field-hint {
    margin: 4px 0 0;
    font-size: 12px;
    color: #6B7280;
    font-style: italic;
  }

  .field-input,
  .field-textarea,
  .field-select {
    padding: 8px 12px;
    border: 2px solid #D1D5DB;
    border-radius: 4px;
    font-size: 14px;
    color: #1A1816;
    background: white;
    font-family: -apple-system, sans-serif;
    transition: all 100ms;
  }

  .field-input:focus,
  .field-textarea:focus,
  .field-select:focus {
    outline: none;
    border-color: #E67E50;
    box-shadow: 0 0 0 3px rgba(230, 126, 80, 0.1);
  }

  .field-textarea {
    resize: vertical;
    min-height: 60px;
    line-height: 1.5;
  }

  .code {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 13px;
  }

  .field-color {
    width: 80px;
    height: 40px;
    border: 2px solid #D1D5DB;
    border-radius: 4px;
    cursor: pointer;
  }

  /* Steps */
  .steps-container {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .step-item {
    display: grid;
    grid-template-columns: 32px 1fr 32px;
    gap: 12px;
    padding: 12px;
    background: #F9FAFB;
    border: 1px solid #E5E7EB;
    border-radius: 6px;
  }

  .step-number {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: white;
    border: 2px solid #D1D5DB;
    border-radius: 50%;
    font-weight: 700;
    font-size: 14px;
    color: #374151;
  }

  .step-fields {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .step-delete {
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 4px;
    background: none;
    border: none;
    color: #9CA3AF;
    cursor: pointer;
    transition: color 100ms;
  }

  .step-delete:hover {
    color: #DC2626;
  }

  .add-step-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 8px 14px;
    background: #F3F4F6;
    border: 2px dashed #D1D5DB;
    border-radius: 4px;
    color: #374151;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    transition: all 100ms;
  }

  .add-step-btn:hover {
    background: #E5E7EB;
    border-color: #9CA3AF;
  }

  /* Static blocks */
  .static-block {
    padding: 12px;
    text-align: center;
  }

  .static-hint {
    margin: 8px 0 0;
    font-size: 12px;
    color: #6B7280;
    font-style: italic;
  }
</style>
