<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { BlockType } from './editor-store';

  const dispatch = createEventDispatcher<{
    select: BlockType;
    close: void;
  }>();

  // Block types organized by category with visual icons
  const blockTypes: Array<{
    type: BlockType;
    icon: string;
    label: string;
    description: string;
    color: string;
  }> = [
    {
      type: 'greeting',
      icon: '👋',
      label: 'Greeting',
      description: 'Hi {{name}}!',
      color: '#52A675'
    },
    {
      type: 'paragraph',
      icon: '📝',
      label: 'Paragraph',
      description: 'Body text',
      color: '#374151'
    },
    {
      type: 'infoBox',
      icon: '💡',
      label: 'Info Box',
      description: 'Highlighted notice',
      color: '#2563EB'
    },
    {
      type: 'button',
      icon: '🔘',
      label: 'Button',
      description: 'Call to action',
      color: '#E67E50'
    },
    {
      type: 'stepList',
      icon: '📋',
      label: 'Step List',
      description: 'Numbered steps',
      color: '#8B5CF6'
    },
    {
      type: 'codeInline',
      icon: '⌨️',
      label: 'Code (Inline)',
      description: 'Inline code',
      color: '#6B7280'
    },
    {
      type: 'codeBlock',
      icon: '💻',
      label: 'Code Block',
      description: 'Code snippet',
      color: '#374151'
    },
    {
      type: 'image',
      icon: '🖼️',
      label: 'Image',
      description: 'CID reference',
      color: '#0F766E'
    },
    {
      type: 'divider',
      icon: '➖',
      label: 'Divider',
      description: 'Horizontal line',
      color: '#D1D5DB'
    },
    {
      type: 'spacer',
      icon: '⬇️',
      label: 'Spacer',
      description: 'Vertical space',
      color: '#E5E7EB'
    }
  ];

  function selectBlock(type: BlockType) {
    dispatch('select', type);
  }
</script>

<div class="palette">
  <div class="palette-header">
    <h3>Add Block</h3>
    <button
      type="button"
      class="close-btn"
      on:click={() => dispatch('close')}
      title="Close"
    >
      <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </button>
  </div>

  <div class="palette-grid">
    {#each blockTypes as block}
      <button
        type="button"
        class="block-option"
        style="--block-color: {block.color}"
        on:click={() => selectBlock(block.type)}
      >
        <span class="block-icon">{block.icon}</span>
        <span class="block-label">{block.label}</span>
        <span class="block-desc">{block.description}</span>
      </button>
    {/each}
  </div>

  <div class="palette-footer">
    <p class="hint">Click a block type to add it to your email</p>
  </div>
</div>

<style>
  .palette {
    background: white;
    border: 2px solid #D9D7D2;
    border-radius: 6px;
    box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
    overflow: hidden;
  }

  .palette-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    background: #F9FAFB;
    border-bottom: 2px solid #E5E7EB;
  }

  .palette-header h3 {
    margin: 0;
    font-size: 20px;
    font-weight: 800;
    color: #1A1816;
  }

  .close-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    background: none;
    border: none;
    border-radius: 6px;
    color: #6B7280;
    cursor: pointer;
    transition: all 100ms;
  }

  .close-btn:hover {
    background: #E5E7EB;
    color: #1A1816;
  }

  .palette-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
    gap: 12px;
    padding: 24px;
  }

  .block-option {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 20px 16px;
    background: white;
    border: 2px solid #E5E7EB;
    border-radius: 8px;
    cursor: pointer;
    transition: all 100ms;
    position: relative;
  }

  .block-option::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: var(--block-color);
    opacity: 0;
    transition: opacity 100ms;
  }

  .block-option:hover {
    border-color: var(--block-color);
    background: #FAFAFA;
    transform: translateY(-2px);
    box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  }

  .block-option:hover::before {
    opacity: 1;
  }

  .block-option:active {
    transform: translateY(0);
  }

  .block-icon {
    font-size: 32px;
    line-height: 1;
  }

  .block-label {
    font-size: 14px;
    font-weight: 700;
    color: #1A1816;
    text-align: center;
  }

  .block-desc {
    font-size: 12px;
    color: #6B7280;
    text-align: center;
  }

  .palette-footer {
    padding: 16px 24px;
    background: #F9FAFB;
    border-top: 1px solid #E5E7EB;
    text-align: center;
  }

  .hint {
    margin: 0;
    font-size: 13px;
    color: #6B7280;
  }

  /* Responsive adjustments */
  @media (max-width: 640px) {
    .palette-grid {
      grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
      gap: 10px;
      padding: 16px;
    }

    .block-option {
      padding: 16px 12px;
    }

    .block-icon {
      font-size: 28px;
    }
  }
</style>
