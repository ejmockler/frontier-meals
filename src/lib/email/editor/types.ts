/**
 * Perceptually Engineered Email Block Editor Type System
 *
 * Design Principles:
 * - Data structures ARE mental models - users experience their shape through every interaction
 * - State architecture matches working memory constraints (4±1 chunks per block)
 * - Recognition over recall - blocks show available options, don't require memorizing syntax
 * - Templates are computational substrates experienced through visual perception
 *
 * Type Architecture:
 * 1. EmailTemplate - Top-level template structure (what users see in the editor)
 * 2. EmailBlock union - All possible content blocks (the building blocks)
 * 3. Variable system - Template variables with type safety
 * 4. Style system - Constrained choices matching base.ts primitives
 */

import type { EmailColorScheme } from '../templates/base';

// ============================================================================
// VARIABLE SYSTEM - Template Variables with Type Safety
// ============================================================================

/**
 * Template variable reference - perceptual mapping of {{variable_name}} syntax
 * Users recognize variables by their curly brace syntax, not by memorizing names
 */
export interface TemplateVariable {
  /** Variable name as it appears in template (e.g., "customer_name") */
  name: string;

  /** Human-readable label shown in editor UI (e.g., "Customer Name") */
  label: string;

  /** Variable type for validation and editor assistance */
  type: 'string' | 'url' | 'date' | 'number' | 'base64';

  /** Example value shown in preview (helps users understand what will appear) */
  exampleValue: string;

  /** Optional description explaining when/how this variable is used */
  description?: string;
}

/**
 * Variable reference in content - the {{variable_name}} syntax
 * This is what gets replaced at send time with actual data
 */
export type VariableRef = `{{${string}}}`;

// ============================================================================
// STYLE PRIMITIVES - Constrained Choices from base.ts
// ============================================================================

/**
 * Available color schemes - perceptual semantic colors
 * Each color carries meaning: orange=brand, teal=info, green=success, amber=warning, red=critical, gray=neutral
 */
export type ColorSchemeName = 'orange' | 'teal' | 'green' | 'amber' | 'red' | 'gray';

/**
 * Paragraph style variants - visual hierarchy through type scale
 * Matches working memory constraint: 4 primary text sizes users can recognize
 */
export type ParagraphStyle = 'lead' | 'normal' | 'muted' | 'small';

/**
 * Info box types - semantic color language
 * Color as meaning, not decoration - users instantly recognize intent
 */
export type InfoBoxType = 'success' | 'warning' | 'error' | 'info';

/**
 * Heading levels - limited to h2/h3 to prevent hierarchy chaos
 * Constraint matches cognitive limit: 2 sub-heading levels is enough
 */
export type HeadingLevel = 'h2' | 'h3';

/**
 * Code display modes - inline vs block
 * Recognition: inline is small/embedded, block is large/standalone
 */
export type CodeStyle = 'inline' | 'block';

/**
 * Spacing sizes - vertical rhythm tokens
 * Users don't think in pixels, they think in small/medium/large
 */
export type SpacingSize = 'sm' | 'md' | 'lg' | 'xl' | '2xl';

// ============================================================================
// EMAIL BLOCK TYPES - The Perceptual Building Blocks
// ============================================================================

/**
 * Greeting block - "Hi {{name}},"
 * Perceptual purpose: Creates personal connection at start of email
 * Constraint: Single variable only (typically customer_name)
 */
export interface GreetingBlock {
  type: 'greeting';
  id: string; // Unique ID for React keys and reordering

  /** Variable reference for recipient name, e.g., "{{customer_name}}" */
  nameVariable: VariableRef;

  /** Optional custom greeting prefix (default: "Hi") */
  prefix?: string;
}

/**
 * Paragraph block - Main text content
 * Perceptual purpose: Body text with semantic styling (hierarchy through contrast)
 * Users recognize: lead=important, normal=body, muted=secondary, small=fine-print
 */
export interface ParagraphBlock {
  type: 'paragraph';
  id: string;

  /** Text content with optional variable references */
  content: string;

  /** Style variant affecting size, weight, and color */
  style: ParagraphStyle;

  /** Optional inline formatting (bold, italic, links) - stored as HTML fragments */
  allowHtml?: boolean;
}

/**
 * Info box block - Semantic colored callouts
 * Perceptual purpose: Interrupt reading flow to highlight important information
 * Color instantly communicates severity: green=good, amber=caution, red=urgent, blue=neutral
 */
export interface InfoBoxBlock {
  type: 'infobox';
  id: string;

  /** Box type determines color scheme and icon semantics */
  boxType: InfoBoxType;

  /** Title text (bold, darker color) */
  title: string;

  /** Body text (lighter color, can include variables) */
  content: string;

  /** Optional emoji/icon prefix for title (e.g., "⚠️", "✓") */
  icon?: string;
}

/**
 * Button block - Primary call-to-action
 * Perceptual purpose: Obvious clickable action, highest visual weight
 * Constraint: One button per block (multiple buttons = cognitive load)
 */
export interface ButtonBlock {
  type: 'button';
  id: string;

  /** Button label text (action-oriented, e.g., "Update Payment Method") */
  label: string;

  /** URL variable reference, e.g., "{{update_payment_url}}" */
  urlVariable: VariableRef;

  /** Optional color scheme override (defaults to template colorScheme) */
  colorScheme?: ColorSchemeName;

  /** Alignment: center (default) | left | right */
  align?: 'center' | 'left' | 'right';
}

/**
 * Step list block - Sequential instructions
 * Perceptual purpose: Numbered steps guide users through a process
 * Recognition: Numbered badges create clear sequential mental model
 */
export interface StepListBlock {
  type: 'steplist';
  id: string;

  /** Optional section title above steps */
  title?: string;

  /** Array of steps with title and description */
  steps: Array<{
    /** Step title (bold, primary text) */
    title: string;

    /** Step description (muted, secondary text) */
    description: string;
  }>;

  /** Background style: subtle (gray bg) | none (transparent) */
  background?: 'subtle' | 'none';
}

/**
 * Code block - Display code or technical values
 * Perceptual purpose: Monospace font signals "copy this exactly"
 * Users recognize: inline=small/embedded, block=large/standalone
 */
export interface CodeBlock {
  type: 'code';
  id: string;

  /** Code content (can include variables) */
  content: string;

  /** Display style: inline (within paragraph) or block (standalone) */
  style: CodeStyle;

  /** Optional label for block code (e.g., "Your API Key:") */
  label?: string;
}

/**
 * Image block - Embedded images (QR codes, illustrations)
 * Perceptual purpose: Visual content that breaks text flow
 * Uses Content-ID (cid:) references for email attachments
 */
export interface ImageBlock {
  type: 'image';
  id: string;

  /** Content-ID reference (e.g., "qr-code" for cid:qr-code) */
  cid: string;

  /** Alt text for accessibility and blocked images */
  alt: string;

  /** Image dimensions in pixels */
  width: number;
  height: number;

  /** Alignment: center (default) | left | right */
  align?: 'center' | 'left' | 'right';

  /** Optional caption below image */
  caption?: string;

  /** Show border/card wrapper around image */
  bordered?: boolean;
}

/**
 * Divider block - Horizontal rule
 * Perceptual purpose: Visual break between sections
 * Simple, unobtrusive - uses border color tokens
 */
export interface DividerBlock {
  type: 'divider';
  id: string;

  /** Divider style: light (subtle) | medium (more visible) */
  style?: 'light' | 'medium';
}

/**
 * Spacer block - Vertical spacing
 * Perceptual purpose: Control visual rhythm without empty paragraphs
 * Users think in relative sizes (small/large), not pixels
 */
export interface SpacerBlock {
  type: 'spacer';
  id: string;

  /** Spacing size from tokens.spacing */
  size: SpacingSize;
}

/**
 * Heading block - Section headings
 * Perceptual purpose: Chunk content into scannable sections
 * Constraint: Only h2/h3 to maintain hierarchy (h1 is in header)
 */
export interface HeadingBlock {
  type: 'heading';
  id: string;

  /** Heading text (can include variables) */
  content: string;

  /** Heading level (h2 for major sections, h3 for subsections) */
  level: HeadingLevel;
}

/**
 * List block - Bulleted or numbered list
 * Perceptual purpose: Group related items, show relationships
 * Recognition: Bullets=unordered set, numbers=sequence/priority
 */
export interface ListBlock {
  type: 'list';
  id: string;

  /** List items (plain text or with variables) */
  items: string[];

  /** List style: bulleted (default) | numbered */
  listStyle?: 'bulleted' | 'numbered';

  /** Optional title above list */
  title?: string;
}

/**
 * Link block - Standalone link (not within paragraph)
 * Perceptual purpose: Secondary action or reference
 * Less visual weight than button, but still clickable
 */
export interface LinkBlock {
  type: 'link';
  id: string;

  /** Link text */
  label: string;

  /** URL variable reference or static URL */
  url: VariableRef | string;

  /** Optional color scheme override */
  colorScheme?: ColorSchemeName;

  /** Alignment: center (default) | left | right */
  align?: 'center' | 'left' | 'right';
}

/**
 * Custom HTML block - Escape hatch for advanced patterns
 * Perceptual purpose: Handle edge cases not covered by semantic blocks
 * Warning: Bypasses type safety, use sparingly
 */
export interface CustomHtmlBlock {
  type: 'custom';
  id: string;

  /** Raw HTML content (fully user-controlled) */
  html: string;

  /** Description of what this custom HTML does (for maintainability) */
  description: string;
}

// ============================================================================
// UNION TYPE - All Possible Blocks
// ============================================================================

/**
 * EmailBlock union - All possible block types
 * Perceptual architecture: Each block is a distinct mental chunk
 * Editor UI shows block type picker with these options
 */
export type EmailBlock =
  | GreetingBlock
  | ParagraphBlock
  | InfoBoxBlock
  | ButtonBlock
  | StepListBlock
  | CodeBlock
  | ImageBlock
  | DividerBlock
  | SpacerBlock
  | HeadingBlock
  | ListBlock
  | LinkBlock
  | CustomHtmlBlock;

// ============================================================================
// HEADER CONFIGURATION
// ============================================================================

/**
 * Email header configuration - First thing users see
 * Perceptual purpose: Sets tone and context with gradient background
 */
export interface EmailHeader {
  /** Emoji displayed above title (48px, recognizable from inbox preview) */
  emoji: string;

  /** Main headline (h1, white text on gradient) */
  title: string;

  /** Subtitle below title (lighter weight, can include variables) */
  subtitle?: string;
}

// ============================================================================
// FOOTER CONFIGURATION
// ============================================================================

/**
 * Email footer configuration - Closing content
 * Perceptual purpose: Support info, legal text, unsubscribe
 */
export interface EmailFooter {
  /** Footer type: support (with Telegram link) | minimal (just copyright) | custom */
  type: 'support' | 'minimal' | 'custom';

  /** Custom HTML if type='custom' */
  customHtml?: string;
}

// ============================================================================
// TOP-LEVEL TEMPLATE
// ============================================================================

/**
 * EmailTemplate - Complete email template definition
 * Perceptual architecture: Top-level structure matches mental model:
 * 1. Identity (slug, metadata)
 * 2. Appearance (color, header)
 * 3. Content (blocks array)
 * 4. Data (variables)
 * 5. Closure (footer)
 */
export interface EmailTemplate {
  /** Unique template identifier (kebab-case, e.g., "qr-daily") */
  slug: string;

  /** Human-readable template name shown in editor */
  name: string;

  /** Template description/purpose */
  description?: string;

  /** Email subject line (can include variables) */
  subject: string;

  /** Preheader text (shown in inbox preview, can include variables) */
  preheader?: string;

  /** Color scheme for header gradient and buttons */
  colorScheme: ColorSchemeName;

  /** Header configuration (emoji, title, subtitle) */
  header: EmailHeader;

  /** Content blocks array (rendered in order) */
  blocks: EmailBlock[];

  /** Footer configuration */
  footer: EmailFooter;

  /** Template variables used in content */
  variables: TemplateVariable[];

  /** Template metadata */
  metadata?: {
    /** When template was created */
    createdAt?: string;

    /** When template was last modified */
    updatedAt?: string;

    /** Template author/owner */
    author?: string;

    /** Template tags for organization */
    tags?: string[];
  };
}

// ============================================================================
// PARSER TYPES
// ============================================================================

/**
 * Parser result - Outcome of parsing existing template code
 * Perceptual purpose: Import existing templates into block editor
 */
export interface ParseResult {
  /** Successfully parsed template (if parsing succeeded) */
  template?: EmailTemplate;

  /** Parsing errors (if any) */
  errors?: ParseError[];

  /** Warnings about unsupported patterns */
  warnings?: string[];
}

/**
 * Parse error - Specific parsing failure
 * Perceptual purpose: Show users exactly what went wrong and where
 */
export interface ParseError {
  /** Error message */
  message: string;

  /** Line number in source code (if applicable) */
  line?: number;

  /** Column number in source code (if applicable) */
  column?: number;

  /** Severity: error (blocks import) | warning (can import but may have issues) */
  severity: 'error' | 'warning';
}

// ============================================================================
// RENDERER TYPES
// ============================================================================

/**
 * Render context - Data needed to render blocks to HTML
 * Perceptual purpose: Runtime variable replacement and style application
 */
export interface RenderContext {
  /** Template being rendered */
  template: EmailTemplate;

  /** Variable values for this send (maps variable names to actual values) */
  data: Record<string, string | number>;

  /** Color scheme instance (resolved from colorScheme name) */
  colorScheme: EmailColorScheme;

  /** Preview mode (uses example values instead of real data) */
  preview?: boolean;
}

/**
 * Block renderer function type
 * Each block type has its own renderer function
 */
export type BlockRenderer = (block: EmailBlock, context: RenderContext) => string;

// ============================================================================
// VALIDATION TYPES
// ============================================================================

/**
 * Validation result for template
 * Perceptual purpose: Catch errors before sending
 */
export interface ValidationResult {
  /** Template is valid and ready to send */
  valid: boolean;

  /** Validation errors (blocks sending) */
  errors: ValidationError[];

  /** Warnings (doesn't block sending, but user should review) */
  warnings: ValidationError[];
}

/**
 * Validation error - Specific validation failure
 */
export interface ValidationError {
  /** Error type for categorization */
  type: 'missing_variable' | 'invalid_url' | 'empty_content' | 'invalid_reference' | 'other';

  /** Human-readable error message */
  message: string;

  /** Block ID where error occurred (if applicable) */
  blockId?: string;

  /** Field name within block (if applicable) */
  field?: string;
}

// ============================================================================
// EDITOR STATE TYPES
// ============================================================================

/**
 * Editor state - Current state of email editor UI
 * Perceptual purpose: Track user's working memory and focus
 */
export interface EditorState {
  /** Template being edited */
  template: EmailTemplate;

  /** Currently selected block ID (for editing) */
  selectedBlockId?: string;

  /** Currently focused field (for keyboard navigation) */
  focusedField?: string;

  /** Dirty flag (has unsaved changes) */
  dirty: boolean;

  /** Undo stack */
  history: EmailTemplate[];

  /** Current position in history */
  historyIndex: number;

  /** Preview mode active */
  previewMode: boolean;

  /** Preview data (variable values for preview) */
  previewData?: Record<string, string | number>;
}

// ============================================================================
// BLOCK OPERATIONS
// ============================================================================

/**
 * Block operation types - User actions on blocks
 * Perceptual purpose: Direct manipulation of content structure
 */
export type BlockOperation =
  | { type: 'add'; blockType: EmailBlock['type']; afterBlockId?: string }
  | { type: 'delete'; blockId: string }
  | { type: 'move'; blockId: string; toIndex: number }
  | { type: 'duplicate'; blockId: string }
  | { type: 'update'; blockId: string; updates: Partial<EmailBlock> };

// ============================================================================
// HELPER TYPES
// ============================================================================

/**
 * Extract block type from union by discriminant
 * Usage: ExtractBlock<'paragraph'> = ParagraphBlock
 */
export type ExtractBlock<T extends EmailBlock['type']> = Extract<EmailBlock, { type: T }>;

/**
 * Block type to block instance mapping
 * Perceptual purpose: Type-safe block creation based on type string
 */
export type BlockTypeMap = {
  [K in EmailBlock['type']]: ExtractBlock<K>;
};

/**
 * Variable value type - Runtime data for template variables
 */
export type VariableValue = string | number | boolean | Date;

/**
 * Variable data record - Maps variable names to values
 */
export type VariableData = Record<string, VariableValue>;

// ============================================================================
// PARSER FUNCTION SIGNATURE
// ============================================================================

/**
 * Parse existing template source code into EmailTemplate structure
 * Perceptual purpose: Import legacy templates into block editor
 *
 * This function analyzes TypeScript source code of existing email templates
 * and converts them into the semantic block structure.
 *
 * Example usage:
 * ```typescript
 * const sourceCode = await readFile('src/lib/email/templates/qr-daily.ts', 'utf-8');
 * const result = parseExistingTemplate(sourceCode);
 * if (result.template) {
 *   // Successfully parsed, can now edit in block editor
 * }
 * ```
 */
export type ParseExistingTemplate = (sourceCode: string) => ParseResult;
