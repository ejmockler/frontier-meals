/**
 * Server-Side Email Block Renderer
 *
 * Converts block data to HTML for storage and preview.
 * Unlike the client-side renderer, this:
 * - KEEPS variable placeholders as {{variable_name}} (no substitution)
 * - Is designed to be called from SvelteKit server actions
 * - Produces complete, standalone HTML emails
 *
 * The template service will substitute variables at send time.
 */

import type { EmailBlock, ColorSchemeName } from './types';
import {
  buildEmailHTML,
  brandColors,
  getSupportFooter,
  styles,
  tokens,
  buttonStyle,
  linkStyle,
  infoBoxStyle,
  infoBoxTitleStyle,
  infoBoxTextStyle,
  type EmailColorScheme,
} from '../templates/base';

// ============================================================================
// INPUT TYPES
// ============================================================================

export interface TemplateSettings {
  colorScheme: ColorSchemeName;
  emoji: string;
  title: string;
  subtitle: string;
}

export interface RenderInput {
  settings: TemplateSettings;
  blocks: EmailBlock[];
  /** Optional: footer type, defaults to 'support' */
  footerType?: 'support' | 'minimal' | 'custom';
  /** Optional: custom footer HTML (only used when footerType='custom') */
  customFooterHtml?: string;
  /** Optional: preheader text for inbox preview */
  preheader?: string;
}

// ============================================================================
// MAIN RENDER FUNCTION
// ============================================================================

/**
 * Render blocks to complete email HTML
 *
 * This function converts semantic blocks to HTML while PRESERVING variable
 * placeholders ({{variable_name}}). Variables are substituted at send time
 * by the template service.
 *
 * @param input - Template settings and blocks to render
 * @returns Complete HTML email string
 */
export function renderBlocksToHTML(input: RenderInput): string {
  const { settings, blocks, footerType = 'support', customFooterHtml, preheader } = input;
  const colorScheme = brandColors[settings.colorScheme];

  // Build header content from settings
  const headerContent = buildHeaderContent(settings);

  // Render all blocks to HTML body
  const bodyContent = blocks.map((block) => renderBlockServer(block, colorScheme)).join('\n\n');

  // Build footer content
  const footerContent = buildFooterContent(footerType, colorScheme, customFooterHtml);

  // Wrap in complete email HTML
  return buildEmailHTML({
    colorScheme,
    title: settings.title,
    preheader,
    headerContent,
    bodyContent,
    footerContent,
  });
}

// ============================================================================
// HEADER BUILDER
// ============================================================================

/**
 * Build header content from settings
 * Keeps {{variable}} placeholders intact
 */
function buildHeaderContent(settings: TemplateSettings): string {
  const subtitle = settings.subtitle ? `<p>${settings.subtitle}</p>` : '';
  return `
    <div style="font-size: 48px; margin-bottom: 12px;">${settings.emoji}</div>
    <h1>${settings.title}</h1>
    ${subtitle}
  `.trim();
}

// ============================================================================
// FOOTER BUILDER
// ============================================================================

/**
 * Build footer content based on type
 */
function buildFooterContent(
  type: 'support' | 'minimal' | 'custom',
  colorScheme: EmailColorScheme,
  customHtml?: string
): string {
  switch (type) {
    case 'support':
      return getSupportFooter(colorScheme);
    case 'custom':
      return customHtml || '';
    case 'minimal':
    default:
      return `<p style="${styles.pSmall}">&copy; ${new Date().getFullYear()} Frontier Meals. All rights reserved.</p>`;
  }
}

// ============================================================================
// BLOCK RENDERERS (Server-side versions - no variable substitution)
// ============================================================================

/**
 * Render a single block to HTML
 * Variables are preserved as {{variable_name}} for later substitution
 */
function renderBlockServer(block: EmailBlock, colorScheme: EmailColorScheme): string {
  switch (block.type) {
    case 'greeting':
      return renderGreeting(block);
    case 'paragraph':
      return renderParagraph(block);
    case 'infobox':
      return renderInfoBox(block);
    case 'button':
      return renderButton(block, colorScheme);
    case 'steplist':
      return renderStepList(block, colorScheme);
    case 'code':
      return renderCode(block);
    case 'image':
      return renderImage(block);
    case 'divider':
      return renderDivider(block);
    case 'spacer':
      return renderSpacer(block);
    case 'heading':
      return renderHeading(block);
    case 'list':
      return renderList(block);
    case 'link':
      return renderLink(block, colorScheme);
    case 'custom':
      return block.html;
    default:
      // Exhaustive check
      const _exhaustive: never = block;
      return '';
  }
}

/**
 * Render greeting block
 * Output: "Hi {{customer_name}},"
 */
function renderGreeting(block: Extract<EmailBlock, { type: 'greeting' }>): string {
  const prefix = block.prefix || 'Hi';
  // Keep variable placeholder intact
  return `<p style="${styles.pLead}">${prefix} ${block.nameVariable},</p>`;
}

/**
 * Render paragraph block
 */
function renderParagraph(block: Extract<EmailBlock, { type: 'paragraph' }>): string {
  const styleMap = {
    lead: styles.pLead,
    normal: styles.p,
    muted: styles.pMuted,
    small: styles.pSmall,
  };
  const style = styleMap[block.style];
  return `<p style="${style}">${block.content}</p>`;
}

/**
 * Render info box block
 */
function renderInfoBox(block: Extract<EmailBlock, { type: 'infobox' }>): string {
  const icon = block.icon ? `${block.icon} ` : '';
  const title = block.title
    ? `<p style="${infoBoxTitleStyle(block.boxType)}">${icon}${block.title}</p>`
    : '';
  return `<div style="${infoBoxStyle(block.boxType)}">${title}<p style="${infoBoxTextStyle(block.boxType)}">${block.content}</p></div>`;
}

/**
 * Render button block
 */
function renderButton(
  block: Extract<EmailBlock, { type: 'button' }>,
  defaultScheme: EmailColorScheme
): string {
  const scheme = block.colorScheme ? brandColors[block.colorScheme] : defaultScheme;
  const align = block.align || 'center';

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.lg} 0;">
      <tr>
        <td align="${align}">
          <a href="${block.urlVariable}" style="${buttonStyle(scheme)}">
            ${block.label}
          </a>
        </td>
      </tr>
    </table>
  `.trim();
}

/**
 * Render step list block
 */
function renderStepList(
  block: Extract<EmailBlock, { type: 'steplist' }>,
  colorScheme: EmailColorScheme
): string {
  const stepBadge = `background: ${colorScheme.primary}; color: ${colorScheme.onPrimary}; width: 28px; height: 28px; border-radius: 50%; text-align: center; font-weight: 700; font-size: ${tokens.fontSize.sm}; line-height: 28px;`;

  const rows = block.steps
    .map(
      (step, index) => `
        <tr>
          <td style="padding: 12px 0; vertical-align: top; width: 40px;">
            <div style="${stepBadge}">${index + 1}</div>
          </td>
          <td style="padding: 12px 0 12px 12px; vertical-align: top;">
            <strong style="display: block; color: ${tokens.text.primary}; margin-bottom: 4px;">${step.title}</strong>
            <span style="color: ${tokens.text.muted}; font-size: ${tokens.fontSize.sm};">${step.description}</span>
          </td>
        </tr>
      `
    )
    .join('');

  const titleHtml = block.title ? `<h2 style="${styles.h3}">${block.title}</h2>` : '';
  const containerBg = block.background === 'none' ? 'transparent' : tokens.bg.subtle;

  return `
    <div style="background: ${containerBg}; padding: ${tokens.spacing.lg}; border-radius: ${tokens.radius.lg}; margin: ${tokens.spacing.xl} 0;">
      ${titleHtml}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${rows}
      </table>
    </div>
  `.trim();
}

/**
 * Render code block (inline or block style)
 */
function renderCode(block: Extract<EmailBlock, { type: 'code' }>): string {
  const labelHtml = block.label
    ? `<p style="${styles.pMuted}; margin-bottom: ${tokens.spacing.sm};">${block.label}</p>`
    : '';

  if (block.style === 'inline') {
    return `<code style="${styles.code}">${block.content}</code>`;
  }

  return `${labelHtml}<code style="${styles.codeBlock}">${block.content}</code>`;
}

/**
 * Render image block
 */
function renderImage(block: Extract<EmailBlock, { type: 'image' }>): string {
  const align = block.align || 'center';

  const img = `<img
    src="cid:${block.cid}"
    alt="${block.alt}"
    style="width: ${block.width}px; height: ${block.height}px; display: block;"
    width="${block.width}"
    height="${block.height}"
  >`;

  const caption = block.caption
    ? `<p style="${styles.pMuted}; margin-top: ${tokens.spacing.sm}; text-align: ${align};">${block.caption}</p>`
    : '';

  if (block.bordered) {
    return `
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.xl} 0;">
        <tr>
          <td align="${align}">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="background: ${tokens.bg.card}; padding: ${tokens.spacing.xl}; border-radius: ${tokens.radius.lg}; border: 1px solid ${tokens.border.light};">
              <tr>
                <td>
                  ${img}
                </td>
              </tr>
            </table>
            ${caption}
          </td>
        </tr>
      </table>
    `.trim();
  }

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.xl} 0;">
      <tr>
        <td align="${align}">
          ${img}
          ${caption}
        </td>
      </tr>
    </table>
  `.trim();
}

/**
 * Render divider block
 */
function renderDivider(block: Extract<EmailBlock, { type: 'divider' }>): string {
  const borderColor = block.style === 'medium' ? tokens.border.medium : tokens.border.light;
  return `<div style="margin: ${tokens.spacing.xl} 0; padding-top: ${tokens.spacing.lg}; border-top: 1px solid ${borderColor};"></div>`;
}

/**
 * Render spacer block
 */
function renderSpacer(block: Extract<EmailBlock, { type: 'spacer' }>): string {
  return `<div style="height: ${tokens.spacing[block.size]};"></div>`;
}

/**
 * Render heading block
 */
function renderHeading(block: Extract<EmailBlock, { type: 'heading' }>): string {
  const style = block.level === 'h2' ? styles.h2 : styles.h3;
  const tag = block.level;
  return `<${tag} style="${style}">${block.content}</${tag}>`;
}

/**
 * Render list block
 */
function renderList(block: Extract<EmailBlock, { type: 'list' }>): string {
  const items = block.items.map((item) => `<li style="${styles.li}">${item}</li>`).join('');
  const tag = block.listStyle === 'numbered' ? 'ol' : 'ul';
  const titleHtml = block.title ? `<h3 style="${styles.h3}">${block.title}</h3>` : '';

  return `${titleHtml}<${tag} style="margin: ${tokens.spacing.md} 0; padding-left: ${tokens.spacing.lg}; color: ${tokens.text.secondary};">${items}</${tag}>`;
}

/**
 * Render link block
 */
function renderLink(
  block: Extract<EmailBlock, { type: 'link' }>,
  defaultScheme: EmailColorScheme
): string {
  const scheme = block.colorScheme ? brandColors[block.colorScheme] : defaultScheme;
  const align = block.align || 'center';

  return `
    <p style="margin: ${tokens.spacing.md} 0; text-align: ${align};">
      <a href="${block.url}" style="${linkStyle(scheme)}">${block.label}</a>
    </p>
  `.trim();
}

// ============================================================================
// UTILITY EXPORTS
// ============================================================================

/**
 * Render only the body blocks (without full email wrapper)
 * Useful for previewing just the content portion
 */
export function renderBlocksOnly(
  blocks: EmailBlock[],
  colorScheme: ColorSchemeName
): string {
  const scheme = brandColors[colorScheme];
  return blocks.map((block) => renderBlockServer(block, scheme)).join('\n\n');
}

/**
 * Get list of variables used in blocks
 * Extracts all {{variable_name}} patterns from block content
 */
export function extractVariablesFromBlocks(blocks: EmailBlock[]): string[] {
  const variableSet = new Set<string>();
  const variablePattern = /\{\{(\w+)\}\}/g;

  function extractFromString(str: string): void {
    let match;
    while ((match = variablePattern.exec(str)) !== null) {
      variableSet.add(match[1]);
    }
  }

  for (const block of blocks) {
    switch (block.type) {
      case 'greeting':
        extractFromString(block.nameVariable);
        break;
      case 'paragraph':
        extractFromString(block.content);
        break;
      case 'infobox':
        extractFromString(block.title);
        extractFromString(block.content);
        break;
      case 'button':
        extractFromString(block.label);
        extractFromString(block.urlVariable);
        break;
      case 'steplist':
        if (block.title) extractFromString(block.title);
        for (const step of block.steps) {
          extractFromString(step.title);
          extractFromString(step.description);
        }
        break;
      case 'code':
        extractFromString(block.content);
        if (block.label) extractFromString(block.label);
        break;
      case 'image':
        extractFromString(block.cid);
        extractFromString(block.alt);
        if (block.caption) extractFromString(block.caption);
        break;
      case 'heading':
        extractFromString(block.content);
        break;
      case 'list':
        if (block.title) extractFromString(block.title);
        for (const item of block.items) {
          extractFromString(item);
        }
        break;
      case 'link':
        extractFromString(block.label);
        extractFromString(block.url);
        break;
      case 'custom':
        extractFromString(block.html);
        break;
      // divider and spacer have no text content
    }
  }

  return Array.from(variableSet);
}
