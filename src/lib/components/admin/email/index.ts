/**
 * Email Block Editor Components
 *
 * Exports the main BlockEditor component and related utilities.
 */

export { default as BlockEditor } from './BlockEditor.svelte';
export { default as BlockCard } from './BlockCard.svelte';
export { default as BlockPalette } from './BlockPalette.svelte';
export { default as VariablePicker } from './VariablePicker.svelte';

export {
  editorState,
  editorActions,
  detectedVariables,
  previewHTML,
  settings,
  blocks,
  variables,
  type Block,
  type BlockType,
  type EditorState,
  type TemplateSettings,
  type Variable,
  type GreetingBlock,
  type ParagraphBlock,
  type InfoBoxBlock,
  type ButtonBlock,
  type StepListBlock,
  type CodeInlineBlock,
  type CodeBlockBlock,
  type ImageBlock,
  type DividerBlock,
  type SpacerBlock,
} from './editor-store';
