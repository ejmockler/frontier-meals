<script lang="ts">
  import { editorState, editorActions, detectedVariables, type BlockType, type Block } from './editor-store';
  import { buildEmailHTML, brandColors } from '$lib/email/templates/base';
  import BlockCard from './BlockCard.svelte';
  import BlockPalette from './BlockPalette.svelte';

  // Color scheme swatches - visual recognition, not text labels
  const colorSwatches = [
    { key: 'orange', color: '#c2410c', label: 'Orange' },
    { key: 'teal', color: '#0f766e', label: 'Teal' },
    { key: 'green', color: '#15803d', label: 'Green' },
    { key: 'amber', color: '#b45309', label: 'Amber' },
    { key: 'red', color: '#b91c1c', label: 'Red' },
    { key: 'gray', color: '#374151', label: 'Gray' },
  ] as const;

  // Common email emojis - constrained choice set (working memory: 4±1)
  const emojiOptions = ['🍽️', '💳', '⚠️', '🚨', '👋', '📱', '✅', '❌', '🔔', '⏰'];

  // UI State
  let showPalette = false;
  let showSettingsCollapsed = false;
  let draggedIndex: number | null = null;

  // Reactive HTML generation
  $: previewHTML = generatePreviewHTML($editorState);

  function generatePreviewHTML(state: typeof $editorState): string {
    const scheme = brandColors[state.settings.colorScheme];

    const headerContent = `
      <div style="font-size: 48px; margin-bottom: 12px;">${state.settings.emoji}</div>
      <h1>${state.settings.title}</h1>
      <p>${state.settings.subtitle}</p>
    `;

    const bodyContent = blocksToHTML(state.blocks, state.variables);

    return buildEmailHTML({
      colorScheme: scheme,
      title: state.settings.title,
      preheader: state.settings.subtitle,
      headerContent,
      bodyContent,
    });
  }

  function blocksToHTML(blocks: Block[], vars: Record<string, string>): string {
    return blocks.map(block => blockToHTML(block, vars)).join('\n');
  }

  function blockToHTML(block: Block, vars: Record<string, string>): string {
    // Replace variables in text
    const replaceVars = (text: string) => {
      let result = text;
      for (const [key, value] of Object.entries(vars)) {
        result = result.replace(new RegExp(`{{${key}}}`, 'g'), value);
      }
      return result;
    };

    const styles = {
      p: `margin: 0 0 16px; font-size: 16px; line-height: 1.6; color: #1f2937; font-family: -apple-system, sans-serif;`,
      pLead: `margin: 0 0 16px; font-size: 18px; font-weight: 500; line-height: 1.5; color: #111827; font-family: -apple-system, sans-serif;`,
      pMuted: `margin: 0; font-size: 14px; line-height: 1.5; color: #4b5563; font-family: -apple-system, sans-serif;`,
      pSmall: `margin: 0; font-size: 12px; line-height: 1.5; color: #4b5563; font-family: -apple-system, sans-serif;`,
      code: `background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-family: monospace; font-size: 14px; color: #111827;`,
      codeBlock: `display: block; background: #f3f4f6; padding: 16px; border-radius: 8px; word-break: break-all; font-family: monospace; font-size: 12px; color: #111827;`,
    };

    switch (block.type) {
      case 'greeting':
        return `<p style="${styles.pLead}">Hi ${vars[block.variableName] || `{{${block.variableName}}}`}!</p>`;

      case 'paragraph':
        const pStyle = {
          lead: styles.pLead,
          normal: styles.p,
          muted: styles.pMuted,
          small: styles.pSmall,
        }[block.style];
        return `<p style="${pStyle}">${replaceVars(block.text)}</p>`;

      case 'infoBox':
        const boxColors = {
          success: { bg: '#dcfce7', border: '#16a34a', text: '#14532d' },
          warning: { bg: '#fef3c7', border: '#d97706', text: '#78350f' },
          error: { bg: '#fee2e2', border: '#dc2626', text: '#7f1d1d' },
          info: { bg: '#dbeafe', border: '#2563eb', text: '#1e3a8a' },
        }[block.boxType];
        return `
          <div style="padding: 16px; margin: 24px 0; border-radius: 8px; border-left: 4px solid ${boxColors.border}; background-color: ${boxColors.bg};">
            <p style="margin: 0; font-size: 14px; font-weight: 600; color: ${boxColors.text};">${replaceVars(block.title)}</p>
            <p style="margin: 8px 0 0; font-size: 14px; color: ${boxColors.text}; line-height: 1.5;">${replaceVars(block.text)}</p>
          </div>
        `;

      case 'button':
        const scheme = brandColors[$editorState.settings.colorScheme];
        const btnColor = block.colorOverride || scheme.primary;
        const url = vars[block.urlVariable] || `{{${block.urlVariable}}}`;
        return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin: 24px 0;">
            <tr>
              <td align="center">
                <a href="${url}" style="display: inline-block; padding: 14px 32px; background-color: ${btnColor}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  ${replaceVars(block.label)}
                </a>
              </td>
            </tr>
          </table>
        `;

      case 'stepList':
        const stepsHTML = block.steps.map((step, i) => `
          <tr>
            <td style="padding: 12px 0; vertical-align: top;">
              <div style="display: inline-block; width: 28px; height: 28px; background: #e5e7eb; border-radius: 50%; text-align: center; line-height: 28px; font-weight: 600; color: #374151; margin-right: 12px;">
                ${i + 1}
              </div>
            </td>
            <td style="padding: 12px 0;">
              <p style="margin: 0 0 4px; font-weight: 600; color: #111827;">${replaceVars(step.title)}</p>
              <p style="margin: 0; font-size: 14px; color: #4b5563;">${replaceVars(step.description)}</p>
            </td>
          </tr>
        `).join('');
        return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 24px 0;">
            ${stepsHTML}
          </table>
        `;

      case 'codeInline':
        return `<p style="${styles.p}"><code style="${styles.code}">${replaceVars(block.text)}</code></p>`;

      case 'codeBlock':
        return `<pre style="${styles.codeBlock}">${replaceVars(block.code)}</pre>`;

      case 'image':
        return `
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: 32px 0;">
            <tr>
              <td align="center">
                <img
                  src="cid:${block.cidReference}"
                  alt="${block.alt}"
                  style="width: ${block.width || 280}px; height: ${block.height || 280}px; display: block;"
                  width="${block.width || 280}"
                  height="${block.height || 280}"
                >
              </td>
            </tr>
          </table>
        `;

      case 'divider':
        return `<hr style="border: none; border-top: 1px solid #e5e7eb; margin: 32px 0;">`;

      case 'spacer':
        return `<div style="height: 32px;"></div>`;

      default:
        return '';
    }
  }

  // Drag and drop handlers
  function handleDragStart(index: number) {
    draggedIndex = index;
  }

  function handleDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    if (draggedIndex !== null && draggedIndex !== index) {
      editorActions.moveBlock(draggedIndex, index);
      draggedIndex = index;
    }
  }

  function handleDragEnd() {
    draggedIndex = null;
  }

  // Add block from palette
  function handleAddBlock(event: CustomEvent<BlockType>) {
    editorActions.addBlock(event.detail);
    showPalette = false;
  }

  // Auto-sync detected variables with test values
  $: {
    const detected = $detectedVariables;
    for (const varName of detected) {
      if (!($editorState.variables[varName])) {
        editorActions.setVariable(varName, '');
      }
    }
  }

  // Export HTML for form submission
  export function getHTML(): string {
    return previewHTML;
  }
</script>

<div class="block-editor">
  <!-- Template Settings -->
  <div class="settings-section">
    <button
      type="button"
      on:click={() => showSettingsCollapsed = !showSettingsCollapsed}
      class="settings-header"
    >
      <h3>Template Settings</h3>
      <svg
        class="chevron"
        class:collapsed={showSettingsCollapsed}
        width="20"
        height="20"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
      >
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7" />
      </svg>
    </button>

    {#if !showSettingsCollapsed}
      <div class="settings-content">
        <!-- Color Scheme Swatches -->
        <div class="setting-row">
          <label class="setting-label">Color</label>
          <div class="color-swatches">
            {#each colorSwatches as swatch}
              <button
                type="button"
                class="swatch"
                class:selected={$editorState.settings.colorScheme === swatch.key}
                style="background-color: {swatch.color};"
                title={swatch.label}
                on:click={() => editorActions.updateSettings({ colorScheme: swatch.key })}
              >
                {#if $editorState.settings.colorScheme === swatch.key}
                  <svg width="16" height="16" fill="white" viewBox="0 0 24 24">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                {/if}
              </button>
            {/each}
          </div>
        </div>

        <!-- Emoji Picker -->
        <div class="setting-row">
          <label class="setting-label">Emoji</label>
          <div class="emoji-picker">
            {#each emojiOptions as emoji}
              <button
                type="button"
                class="emoji-option"
                class:selected={$editorState.settings.emoji === emoji}
                on:click={() => editorActions.updateSettings({ emoji })}
              >
                {emoji}
              </button>
            {/each}
          </div>
        </div>

        <!-- Title -->
        <div class="setting-row">
          <label class="setting-label" for="header-title">Title</label>
          <input
            id="header-title"
            type="text"
            class="setting-input"
            value={$editorState.settings.title}
            on:input={(e) => editorActions.updateSettings({ title: e.currentTarget.value })}
            placeholder="Email title"
          />
        </div>

        <!-- Subtitle -->
        <div class="setting-row">
          <label class="setting-label" for="header-subtitle">Subtitle</label>
          <input
            id="header-subtitle"
            type="text"
            class="setting-input"
            value={$editorState.settings.subtitle}
            on:input={(e) => editorActions.updateSettings({ subtitle: e.currentTarget.value })}
            placeholder="Brief description"
          />
        </div>
      </div>
    {/if}
  </div>

  <!-- Blocks Section -->
  <div class="blocks-section">
    <div class="section-header">
      <h3>Blocks</h3>
      <span class="block-count">{$editorState.blocks.length}</span>
    </div>

    <div class="blocks-list">
      {#each $editorState.blocks as block, index (block.id)}
        <div
          class="block-wrapper"
          draggable="true"
          on:dragstart={() => handleDragStart(index)}
          on:dragover={(e) => handleDragOver(e, index)}
          on:dragend={handleDragEnd}
        >
          <BlockCard {block} {index} />
        </div>
      {/each}

      {#if $editorState.blocks.length === 0}
        <div class="empty-state">
          <svg class="empty-icon" width="48" height="48" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
          </svg>
          <p class="empty-text">No blocks yet</p>
          <p class="empty-hint">Click "Add Block" below to start building</p>
        </div>
      {/if}
    </div>

    <!-- Add Block Button -->
    <button
      type="button"
      class="add-block-btn"
      on:click={() => showPalette = !showPalette}
    >
      <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4" />
      </svg>
      Add Block
    </button>

    <!-- Block Palette Overlay -->
    {#if showPalette}
      <div class="palette-overlay" on:click={() => showPalette = false}>
        <div class="palette-container" on:click|stopPropagation>
          <BlockPalette on:select={handleAddBlock} on:close={() => showPalette = false} />
        </div>
      </div>
    {/if}
  </div>

  <!-- Variables Section -->
  {#if $detectedVariables.length > 0}
    <div class="variables-section">
      <div class="section-header">
        <h3>Variables</h3>
        <span class="var-count">{$detectedVariables.length}</span>
      </div>

      <div class="variables-list">
        {#each $detectedVariables as varName}
          <div class="variable-row">
            <code class="var-name">{'{{' + varName + '}}'}</code>
            <input
              type="text"
              class="var-input"
              value={$editorState.variables[varName] || ''}
              on:input={(e) => editorActions.setVariable(varName, e.currentTarget.value)}
              placeholder="Test value"
            />
          </div>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Live Preview -->
  <div class="preview-section">
    <div class="section-header">
      <h3>Live Preview</h3>
      <span class="live-badge">Live</span>
    </div>

    <div class="preview-frame">
      <iframe
        title="Email Preview"
        srcdoc={previewHTML}
        sandbox="allow-same-origin"
      ></iframe>
    </div>
  </div>
</div>

<style>
  .block-editor {
    display: flex;
    flex-direction: column;
    gap: 24px;
  }

  /* Settings Section */
  .settings-section {
    background: white;
    border: 2px solid #D9D7D2;
    border-radius: 4px;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  }

  .settings-header {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    background: none;
    border: none;
    cursor: pointer;
    transition: background-color 100ms;
  }

  .settings-header:hover {
    background: #F9FAFB;
  }

  .settings-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    color: #1A1816;
  }

  .chevron {
    color: #5C5A56;
    transition: transform 200ms;
  }

  .chevron.collapsed {
    transform: rotate(-90deg);
  }

  .settings-content {
    padding: 0 24px 24px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }

  .setting-row {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .setting-label {
    font-size: 14px;
    font-weight: 700;
    color: #1A1816;
  }

  .color-swatches {
    display: flex;
    gap: 8px;
  }

  .swatch {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    border: 2px solid transparent;
    cursor: pointer;
    transition: all 100ms;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .swatch:hover {
    transform: scale(1.1);
  }

  .swatch.selected {
    border-color: #1A1816;
    box-shadow: 0 0 0 2px white, 0 0 0 4px #1A1816;
  }

  .emoji-picker {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(44px, 1fr));
    gap: 4px;
  }

  .emoji-option {
    width: 44px;
    height: 44px;
    font-size: 24px;
    border: 2px solid transparent;
    border-radius: 6px;
    background: #F9FAFB;
    cursor: pointer;
    transition: all 100ms;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .emoji-option:hover {
    background: #E5E7EB;
  }

  .emoji-option.selected {
    border-color: #E67E50;
    background: #FEF3C7;
  }

  .setting-input {
    padding: 10px 14px;
    border: 2px solid #B8B6B1;
    border-radius: 4px;
    font-size: 15px;
    font-weight: 500;
    color: #1A1816;
    background: white;
    transition: all 100ms;
  }

  .setting-input:focus {
    outline: none;
    border-color: #E67E50;
    box-shadow: 0 0 0 3px rgba(230, 126, 80, 0.1);
  }

  /* Blocks Section */
  .blocks-section {
    background: white;
    border: 2px solid #D9D7D2;
    border-radius: 4px;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    padding: 24px;
    position: relative;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 20px;
  }

  .section-header h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    color: #1A1816;
  }

  .block-count,
  .var-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
    padding: 0 8px;
    background: #E5E7EB;
    border: 2px solid #D1D5DB;
    border-radius: 6px;
    font-size: 13px;
    font-weight: 700;
    color: #374151;
  }

  .blocks-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-height: 100px;
  }

  .block-wrapper {
    cursor: grab;
  }

  .block-wrapper:active {
    cursor: grabbing;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    text-align: center;
  }

  .empty-icon {
    color: #D9D7D2;
    margin-bottom: 16px;
  }

  .empty-text {
    margin: 0 0 4px;
    font-weight: 700;
    font-size: 16px;
    color: #1A1816;
  }

  .empty-hint {
    margin: 0;
    font-size: 14px;
    color: #5C5A56;
  }

  .add-block-btn {
    width: 100%;
    margin-top: 16px;
    padding: 12px 20px;
    background: #E67E50;
    border: 2px solid #D97F3E;
    border-radius: 4px;
    color: white;
    font-weight: 700;
    font-size: 15px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 100ms;
  }

  .add-block-btn:hover {
    background: #D97F3E;
    box-shadow: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  }

  .add-block-btn:active {
    transform: scale(0.98);
  }

  /* Palette Overlay */
  .palette-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 50;
  }

  .palette-container {
    max-width: 600px;
    width: 90%;
  }

  /* Variables Section */
  .variables-section {
    background: white;
    border: 2px solid #D9D7D2;
    border-radius: 4px;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    padding: 24px;
  }

  .variables-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .variable-row {
    display: grid;
    grid-template-columns: 180px 1fr;
    gap: 12px;
    align-items: center;
  }

  .var-name {
    padding: 8px 12px;
    background: #F3F4F6;
    border: 1px solid #E5E7EB;
    border-radius: 4px;
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 13px;
    color: #374151;
  }

  .var-input {
    padding: 8px 12px;
    border: 2px solid #B8B6B1;
    border-radius: 4px;
    font-size: 14px;
    color: #1A1816;
    background: white;
    transition: all 100ms;
  }

  .var-input:focus {
    outline: none;
    border-color: #E67E50;
    box-shadow: 0 0 0 3px rgba(230, 126, 80, 0.1);
  }

  /* Preview Section */
  .preview-section {
    background: white;
    border: 2px solid #D9D7D2;
    border-radius: 4px;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
    padding: 24px;
  }

  .live-badge {
    display: inline-flex;
    align-items: center;
    padding: 4px 12px;
    background: #52A675;
    border: 2px solid rgba(82, 166, 117, 0.7);
    border-radius: 4px;
    font-size: 12px;
    font-weight: 700;
    color: white;
  }

  .preview-frame {
    margin-top: 16px;
    border: 2px solid #D9D7D2;
    border-radius: 4px;
    overflow: hidden;
  }

  .preview-frame iframe {
    width: 100%;
    height: 600px;
    border: none;
  }
</style>
