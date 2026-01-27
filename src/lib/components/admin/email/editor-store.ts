/**
 * Email Block Editor Store
 *
 * Manages the semantic block structure for email composition.
 * State is kept simple and reactive for <100ms UI updates.
 */

import { writable, derived } from 'svelte/store';
import { buildEmailHTML, brandColors } from '$lib/email/templates/base';
import type { EmailColorScheme } from '$lib/email/templates/base';

export type BlockType =
  | 'greeting'
  | 'paragraph'
  | 'infoBox'
  | 'button'
  | 'stepList'
  | 'codeInline'
  | 'codeBlock'
  | 'image'
  | 'divider'
  | 'spacer';

export type ParagraphStyle = 'lead' | 'normal' | 'muted' | 'small';
export type InfoBoxType = 'success' | 'warning' | 'error' | 'info';

export interface BaseBlock {
  id: string;
  type: BlockType;
}

export interface GreetingBlock extends BaseBlock {
  type: 'greeting';
  variableName: string; // e.g., "customer_name"
}

export interface ParagraphBlock extends BaseBlock {
  type: 'paragraph';
  text: string;
  style: ParagraphStyle;
}

export interface InfoBoxBlock extends BaseBlock {
  type: 'infoBox';
  boxType: InfoBoxType;
  title: string;
  text: string;
}

export interface ButtonBlock extends BaseBlock {
  type: 'button';
  label: string;
  urlVariable: string; // e.g., "payment_url"
  colorOverride?: string; // Optional hex color
}

export interface Step {
  id: string;
  title: string;
  description: string;
}

export interface StepListBlock extends BaseBlock {
  type: 'stepList';
  steps: Step[];
}

export interface CodeInlineBlock extends BaseBlock {
  type: 'codeInline';
  text: string;
}

export interface CodeBlockBlock extends BaseBlock {
  type: 'codeBlock';
  code: string;
}

export interface ImageBlock extends BaseBlock {
  type: 'image';
  cidReference: string; // e.g., "qr-code"
  alt: string;
  width?: number;
  height?: number;
}

export interface DividerBlock extends BaseBlock {
  type: 'divider';
}

export interface SpacerBlock extends BaseBlock {
  type: 'spacer';
}

export type Block =
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

export interface TemplateSettings {
  colorScheme: 'orange' | 'teal' | 'green' | 'amber' | 'red' | 'gray';
  emoji: string;
  title: string;
  subtitle: string;
}

export interface Variable {
  name: string;
  testValue: string;
}

export interface EditorState {
  settings: TemplateSettings;
  blocks: Block[];
  variables: Record<string, string>; // name -> testValue
}

// Initial state
const initialState: EditorState = {
  settings: {
    colorScheme: 'orange',
    emoji: '🍽️',
    title: 'Welcome',
    subtitle: 'Your update from Frontier Meals'
  },
  blocks: [],
  variables: {}
};

// Create the main store
export const editorState = writable<EditorState>(initialState);

// Derived stores for convenience
export const settings = derived(editorState, $state => $state.settings);
export const blocks = derived(editorState, $state => $state.blocks);
export const variables = derived(editorState, $state => $state.variables);

// Helper: Generate unique ID
let idCounter = 0;
function generateId(): string {
  return `block_${Date.now()}_${idCounter++}`;
}

// Actions for manipulating state
export const editorActions = {
  // Settings
  updateSettings(partial: Partial<TemplateSettings>) {
    editorState.update(state => ({
      ...state,
      settings: { ...state.settings, ...partial }
    }));
  },

  // Blocks
  addBlock(type: BlockType, index?: number) {
    const newBlock = createDefaultBlock(type);

    editorState.update(state => {
      const blocks = [...state.blocks];
      if (index !== undefined) {
        blocks.splice(index, 0, newBlock);
      } else {
        blocks.push(newBlock);
      }
      return { ...state, blocks };
    });
  },

  updateBlock(id: string, updates: Partial<Block>) {
    editorState.update(state => ({
      ...state,
      blocks: state.blocks.map(b => b.id === id ? { ...b, ...updates } as Block : b)
    }));
  },

  deleteBlock(id: string) {
    editorState.update(state => ({
      ...state,
      blocks: state.blocks.filter(b => b.id !== id)
    }));
  },

  moveBlock(fromIndex: number, toIndex: number) {
    editorState.update(state => {
      const blocks = [...state.blocks];
      const [moved] = blocks.splice(fromIndex, 1);
      blocks.splice(toIndex, 0, moved);
      return { ...state, blocks };
    });
  },

  // StepList specific
  addStep(blockId: string) {
    editorState.update(state => ({
      ...state,
      blocks: state.blocks.map(b => {
        if (b.id === blockId && b.type === 'stepList') {
          return {
            ...b,
            steps: [
              ...b.steps,
              { id: generateId(), title: '', description: '' }
            ]
          };
        }
        return b;
      })
    }));
  },

  updateStep(blockId: string, stepId: string, updates: Partial<Step>) {
    editorState.update(state => ({
      ...state,
      blocks: state.blocks.map(b => {
        if (b.id === blockId && b.type === 'stepList') {
          return {
            ...b,
            steps: b.steps.map(s => s.id === stepId ? { ...s, ...updates } : s)
          };
        }
        return b;
      })
    }));
  },

  deleteStep(blockId: string, stepId: string) {
    editorState.update(state => ({
      ...state,
      blocks: state.blocks.map(b => {
        if (b.id === blockId && b.type === 'stepList') {
          return {
            ...b,
            steps: b.steps.filter(s => s.id !== stepId)
          };
        }
        return b;
      })
    }));
  },

  // Variables
  setVariable(name: string, testValue: string) {
    editorState.update(state => ({
      ...state,
      variables: { ...state.variables, [name]: testValue }
    }));
  },

  deleteVariable(name: string) {
    editorState.update(state => {
      const { [name]: _, ...rest } = state.variables;
      return { ...state, variables: rest };
    });
  },

  // Full state management
  loadState(newState: EditorState) {
    editorState.set(newState);
  },

  reset() {
    editorState.set(initialState);
  }
};

// Create default block based on type
function createDefaultBlock(type: BlockType): Block {
  const id = generateId();

  switch (type) {
    case 'greeting':
      return { id, type: 'greeting', variableName: 'customer_name' };

    case 'paragraph':
      return { id, type: 'paragraph', text: '', style: 'normal' };

    case 'infoBox':
      return { id, type: 'infoBox', boxType: 'info', title: '', text: '' };

    case 'button':
      return { id, type: 'button', label: 'Click Here', urlVariable: 'button_url' };

    case 'stepList':
      return { id, type: 'stepList', steps: [{ id: generateId(), title: '', description: '' }] };

    case 'codeInline':
      return { id, type: 'codeInline', text: '' };

    case 'codeBlock':
      return { id, type: 'codeBlock', code: '' };

    case 'image':
      return { id, type: 'image', cidReference: 'qr-code', alt: 'QR Code', width: 280, height: 280 };

    case 'divider':
      return { id, type: 'divider' };

    case 'spacer':
      return { id, type: 'spacer' };

    default:
      throw new Error(`Unknown block type: ${type}`);
  }
}

// Generate preview HTML from editor state
export const previewHTML = derived(editorState, $state => {
  const scheme = brandColors[$state.settings.colorScheme];

  const headerContent = `
    <div style="font-size: 48px; margin-bottom: 12px;">${$state.settings.emoji}</div>
    <h1>${$state.settings.title}</h1>
    <p>${$state.settings.subtitle}</p>
  `;

  const bodyContent = blocksToHTML($state.blocks, $state.variables, $state.settings.colorScheme);

  return buildEmailHTML({
    colorScheme: scheme,
    title: $state.settings.title,
    preheader: $state.settings.subtitle,
    headerContent,
    bodyContent,
  });
});

// Convert blocks to HTML
function blocksToHTML(blocks: Block[], vars: Record<string, string>, colorScheme: string): string {
  return blocks.map(block => blockToHTML(block, vars, colorScheme)).join('\n');
}

function blockToHTML(block: Block, vars: Record<string, string>, colorScheme: string): string {
  // Replace variables in text
  const replaceVars = (text: string) => {
    let result = text;
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`{{${key}}}`, 'g'), value || `{{${key}}}`);
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

  const scheme = brandColors[colorScheme as keyof typeof brandColors] || brandColors.orange;

  switch (block.type) {
    case 'greeting':
      return `<p style="${styles.pLead}">Hi ${vars[block.variableName] || `{{${block.variableName}}}`}!</p>`;

    case 'paragraph': {
      const pStyle = {
        lead: styles.pLead,
        normal: styles.p,
        muted: styles.pMuted,
        small: styles.pSmall,
      }[block.style];
      return `<p style="${pStyle}">${replaceVars(block.text)}</p>`;
    }

    case 'infoBox': {
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
    }

    case 'button': {
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
    }

    case 'stepList': {
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
    }

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

// Auto-detect variables from blocks
export const detectedVariables = derived(editorState, $state => {
  const vars = new Set<string>();

  // Scan blocks for variable references
  function scanText(text: string) {
    const regex = /{{(\w+)}}/g;
    let match;
    while ((match = regex.exec(text)) !== null) {
      vars.add(match[1]);
    }
  }

  for (const block of $state.blocks) {
    switch (block.type) {
      case 'greeting':
        vars.add(block.variableName);
        break;
      case 'paragraph':
        scanText(block.text);
        break;
      case 'infoBox':
        scanText(block.title);
        scanText(block.text);
        break;
      case 'button':
        scanText(block.label);
        vars.add(block.urlVariable);
        break;
      case 'stepList':
        block.steps.forEach(step => {
          scanText(step.title);
          scanText(step.description);
        });
        break;
      case 'codeInline':
      case 'codeBlock':
        scanText(block.type === 'codeInline' ? block.text : block.code);
        break;
    }
  }

  return Array.from(vars);
});
