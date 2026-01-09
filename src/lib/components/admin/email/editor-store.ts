/**
 * Email Block Editor Store
 *
 * Manages the semantic block structure for email composition.
 * State is kept simple and reactive for <100ms UI updates.
 */

import { writable, derived } from 'svelte/store';
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
