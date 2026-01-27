<script lang="ts">
  /**
   * BlockEditor Demo
   *
   * Standalone demonstration of the email block editor.
   * Shows all features and integration patterns.
   */

  import BlockEditor from './BlockEditor.svelte';
  import { editorActions, editorState, detectedVariables } from './editor-store';
  import { onMount } from 'svelte';

  let blockEditor: BlockEditor;

  // Demo: Pre-populate with example content
  onMount(() => {
    // Set template settings
    editorActions.updateSettings({
      colorScheme: 'green',
      emoji: '🍽️',
      title: 'Your Daily QR Code',
      subtitle: 'Ready for pickup today'
    });

    // Add some example blocks
    editorActions.addBlock('greeting');
    editorActions.addBlock('paragraph');
    editorActions.addBlock('infoBox');
    editorActions.addBlock('button');

    // Pre-fill content
    setTimeout(() => {
      if ($editorState.blocks.length >= 1) {
        editorActions.updateBlock($editorState.blocks[0].id, {
          variableName: 'customer_name'
        });
      }

      if ($editorState.blocks.length >= 2 && $editorState.blocks[1].type === 'paragraph') {
        editorActions.updateBlock($editorState.blocks[1].id, {
          text: 'Scan this QR code at any kiosk to get your fresh meal today. Your code is valid until 11:59 PM PT.',
          style: 'normal'
        });
      }

      if ($editorState.blocks.length >= 3 && $editorState.blocks[2].type === 'infoBox') {
        editorActions.updateBlock($editorState.blocks[2].id, {
          boxType: 'warning',
          title: '⏰ Expires Tonight',
          text: 'This QR code will expire at midnight Pacific Time.'
        });
      }

      if ($editorState.blocks.length >= 4 && $editorState.blocks[3].type === 'button') {
        editorActions.updateBlock($editorState.blocks[3].id, {
          label: 'View My Account',
          urlVariable: 'account_url'
        });
      }

      // Set test variables
      editorActions.setVariable('customer_name', 'Alex Chen');
      editorActions.setVariable('account_url', 'https://example.com/account');
    }, 100);
  });

  // Export functions
  function exportHTML() {
    const html = blockEditor.getHTML();
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'email-template.html';
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportJSON() {
    const json = JSON.stringify($editorState, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'email-template.json';
    a.click();
    URL.revokeObjectURL(url);
  }

  function copyHTML() {
    const html = blockEditor.getHTML();
    navigator.clipboard.writeText(html);
    alert('HTML copied to clipboard!');
  }

  function logState() {
    console.log('Current Editor State:', $editorState);
    console.log('Detected Variables:', $detectedVariables);
  }

  function resetEditor() {
    if (confirm('Reset editor? This will clear all content.')) {
      editorActions.reset();
    }
  }
</script>

<div class="demo-container">
  <!-- Demo Header -->
  <div class="demo-header">
    <div>
      <h1 class="demo-title">Email Block Editor Demo</h1>
      <p class="demo-subtitle">
        Semantic, perceptually-engineered email composition
      </p>
    </div>
    <div class="demo-actions">
      <button type="button" class="action-btn secondary" on:click={logState}>
        Log State
      </button>
      <button type="button" class="action-btn secondary" on:click={resetEditor}>
        Reset
      </button>
      <button type="button" class="action-btn secondary" on:click={exportJSON}>
        Export JSON
      </button>
      <button type="button" class="action-btn secondary" on:click={copyHTML}>
        Copy HTML
      </button>
      <button type="button" class="action-btn primary" on:click={exportHTML}>
        Download HTML
      </button>
    </div>
  </div>

  <!-- Stats Panel -->
  <div class="stats-panel">
    <div class="stat">
      <span class="stat-label">Blocks</span>
      <span class="stat-value">{$editorState.blocks.length}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Variables</span>
      <span class="stat-value">{$detectedVariables.length}</span>
    </div>
    <div class="stat">
      <span class="stat-label">Color</span>
      <span class="stat-value">{$editorState.settings.colorScheme}</span>
    </div>
  </div>

  <!-- Block Editor -->
  <BlockEditor bind:this={blockEditor} />

  <!-- Feature Highlights -->
  <div class="features">
    <h2 class="features-title">Features</h2>
    <div class="features-grid">
      <div class="feature">
        <div class="feature-icon">🎨</div>
        <h3 class="feature-title">Visual Color Selection</h3>
        <p class="feature-desc">6 accessible color schemes with instant visual recognition</p>
      </div>
      <div class="feature">
        <div class="feature-icon">🔤</div>
        <h3 class="feature-title">Auto Variable Detection</h3>
        <p class="feature-desc">Automatically finds {"{{variables}}"} in your content</p>
      </div>
      <div class="feature">
        <div class="feature-icon">👁️</div>
        <h3 class="feature-title">Live Preview</h3>
        <p class="feature-desc">See changes in real-time with <100ms updates</p>
      </div>
      <div class="feature">
        <div class="feature-icon">🎯</div>
        <h3 class="feature-title">Drag to Reorder</h3>
        <p class="feature-desc">Intuitive drag and drop for spatial organization</p>
      </div>
      <div class="feature">
        <div class="feature-icon">📦</div>
        <h3 class="feature-title">10 Block Types</h3>
        <p class="feature-desc">Greeting, paragraph, button, steps, code, images, and more</p>
      </div>
      <div class="feature">
        <div class="feature-icon">♿</div>
        <h3 class="feature-title">AAA Accessibility</h3>
        <p class="feature-desc">All colors meet WCAG AAA contrast standards</p>
      </div>
    </div>
  </div>

  <!-- Code Example -->
  <div class="code-example">
    <h2 class="code-title">Integration Example</h2>
    <pre class="code-block"><code>{`<script lang="ts">
  import { BlockEditor, editorActions, editorState } from '$lib/components/admin/email';

  let editor: BlockEditor;

  async function save() {
    const html = editor.getHTML();
    const state = $editorState;

    await fetch('/api/templates', {
      method: 'POST',
      body: JSON.stringify({
        subject: state.settings.title,
        html,
        editorState: state
      })
    });
  }
<\/script>

<form on:submit|preventDefault={save}>
  <BlockEditor bind:this={editor} />
  <button type="submit">Save Template</button>
</form>`}</code></pre>
  </div>
</div>

<style>
  .demo-container {
    max-width: 1200px;
    margin: 0 auto;
    padding: 32px 24px;
  }

  .demo-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    margin-bottom: 24px;
    gap: 24px;
    flex-wrap: wrap;
  }

  .demo-title {
    margin: 0;
    font-size: 32px;
    font-weight: 800;
    color: #1A1816;
  }

  .demo-subtitle {
    margin: 8px 0 0;
    font-size: 16px;
    color: #5C5A56;
  }

  .demo-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .action-btn {
    padding: 10px 18px;
    border-radius: 4px;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
    transition: all 100ms;
    border: 2px solid;
  }

  .action-btn.primary {
    background: #E67E50;
    border-color: #D97F3E;
    color: white;
  }

  .action-btn.primary:hover {
    background: #D97F3E;
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  }

  .action-btn.secondary {
    background: white;
    border-color: #D9D7D2;
    color: #1A1816;
  }

  .action-btn.secondary:hover {
    background: #F9FAFB;
    border-color: #B8B6B1;
  }

  .stats-panel {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .stat {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 20px;
    background: white;
    border: 2px solid #D9D7D2;
    border-radius: 6px;
  }

  .stat-label {
    font-size: 12px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #5C5A56;
    margin-bottom: 8px;
  }

  .stat-value {
    font-size: 28px;
    font-weight: 800;
    color: #E67E50;
  }

  .features {
    margin-top: 48px;
    padding: 32px;
    background: white;
    border: 2px solid #D9D7D2;
    border-radius: 6px;
  }

  .features-title {
    margin: 0 0 24px;
    font-size: 24px;
    font-weight: 800;
    color: #1A1816;
  }

  .features-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 24px;
  }

  .feature {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
  }

  .feature-icon {
    font-size: 32px;
    margin-bottom: 12px;
  }

  .feature-title {
    margin: 0 0 8px;
    font-size: 16px;
    font-weight: 700;
    color: #1A1816;
  }

  .feature-desc {
    margin: 0;
    font-size: 14px;
    color: #5C5A56;
    line-height: 1.5;
  }

  .code-example {
    margin-top: 48px;
    padding: 32px;
    background: #1A1816;
    border-radius: 6px;
  }

  .code-title {
    margin: 0 0 16px;
    font-size: 20px;
    font-weight: 800;
    color: white;
  }

  .code-block {
    margin: 0;
    padding: 20px;
    background: #0F0E0D;
    border-radius: 4px;
    overflow-x: auto;
  }

  .code-block code {
    font-family: 'SF Mono', Monaco, monospace;
    font-size: 13px;
    line-height: 1.6;
    color: #E5E7EB;
  }
</style>
