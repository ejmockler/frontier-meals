/**
 * Email Block Renderer
 *
 * Converts semantic email blocks to HTML using the existing template system.
 * Perceptual engineering principles:
 * - Same block + same variables = identical HTML (deterministic)
 * - No hidden state
 * - Output matches existing template patterns exactly
 */

import type { EmailTemplate, EmailBlock, RenderContext, VariableData, EmailHeader } from './types';
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

/**
 * Generate unique ID for blocks
 */
function generateId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Interpolate variables in text
 * Replaces {{variable}} with actual values
 */
function interpolate(text: string, data: VariableData): string {
  return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    const value = data[varName];
    if (value === undefined || value === null) return match;
    return String(value);
  });
}

/**
 * Render a single block to HTML
 */
export function renderBlock(block: EmailBlock, context: RenderContext): string {
  switch (block.type) {
    case 'greeting':
      return renderGreeting(block, context);
    case 'paragraph':
      return renderParagraph(block, context);
    case 'infobox':
      return renderInfoBox(block, context);
    case 'button':
      return renderButton(block, context);
    case 'steplist':
      return renderStepList(block, context);
    case 'code':
      return renderCode(block, context);
    case 'image':
      return renderImage(block, context);
    case 'divider':
      return renderDivider(block);
    case 'spacer':
      return renderSpacer(block);
    case 'heading':
      return renderHeading(block, context);
    case 'list':
      return renderList(block, context);
    case 'link':
      return renderLink(block, context);
    case 'custom':
      return interpolate(block.html, context.data);
    default:
      const _exhaustive: never = block;
      return '';
  }
}

/**
 * Render greeting block
 */
function renderGreeting(block: Extract<EmailBlock, { type: 'greeting' }>, context: RenderContext): string {
  const prefix = block.prefix || 'Hi';
  const name = interpolate(block.nameVariable, context.data);
  return `<p style="${styles.pLead}">${prefix} ${name},</p>`;
}

/**
 * Render paragraph block
 */
function renderParagraph(block: Extract<EmailBlock, { type: 'paragraph' }>, context: RenderContext): string {
  const styleMap = {
    lead: styles.pLead,
    normal: styles.p,
    muted: styles.pMuted,
    small: styles.pSmall,
  };
  const style = styleMap[block.style];
  const content = interpolate(block.content, context.data);
  return `<p style="${style}">${content}</p>`;
}

/**
 * Render info box block
 */
function renderInfoBox(block: Extract<EmailBlock, { type: 'infobox' }>, context: RenderContext): string {
  const icon = block.icon ? `${block.icon} ` : '';
  const title = block.title
    ? `<p style="${infoBoxTitleStyle(block.boxType)}">${icon}${interpolate(block.title, context.data)}</p>`
    : '';
  const content = interpolate(block.content, context.data);
  return `<div style="${infoBoxStyle(block.boxType)}">${title}<p style="${infoBoxTextStyle(block.boxType)}">${content}</p></div>`;
}

/**
 * Render button block
 */
function renderButton(block: Extract<EmailBlock, { type: 'button' }>, context: RenderContext): string {
  const scheme = block.colorScheme ? brandColors[block.colorScheme] : context.colorScheme;
  const url = interpolate(block.urlVariable, context.data);
  const label = interpolate(block.label, context.data);
  const align = block.align || 'center';

  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin: ${tokens.spacing.lg} 0;">
      <tr>
        <td align="${align}">
          <a href="${url}" style="${buttonStyle(scheme)}">
            ${label}
          </a>
        </td>
      </tr>
    </table>
  `.trim();
}

/**
 * Render step list block
 */
function renderStepList(block: Extract<EmailBlock, { type: 'steplist' }>, context: RenderContext): string {
  const stepBadge = `background: ${context.colorScheme.primary}; color: ${context.colorScheme.onPrimary}; width: 28px; height: 28px; border-radius: 50%; text-align: center; font-weight: 700; font-size: ${tokens.fontSize.sm}; line-height: 28px;`;

  const rows = block.steps
    .map((step, index) => {
      const title = interpolate(step.title, context.data);
      const description = interpolate(step.description, context.data);
      return `
        <tr>
          <td style="padding: 12px 0; vertical-align: top; width: 40px;">
            <div style="${stepBadge}">${index + 1}</div>
          </td>
          <td style="padding: 12px 0 12px 12px; vertical-align: top;">
            <strong style="display: block; color: ${tokens.text.primary}; margin-bottom: 4px;">${title}</strong>
            <span style="color: ${tokens.text.muted}; font-size: ${tokens.fontSize.sm};">${description}</span>
          </td>
        </tr>
      `;
    })
    .join('');

  const titleHtml = block.title ? `<h2 style="${styles.h3}">${interpolate(block.title, context.data)}</h2>` : '';
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
 * Render code block
 */
function renderCode(block: Extract<EmailBlock, { type: 'code' }>, context: RenderContext): string {
  const content = interpolate(block.content, context.data);
  const labelHtml = block.label ? `<p style="${styles.pMuted}; margin-bottom: ${tokens.spacing.sm};">${block.label}</p>` : '';

  if (block.style === 'inline') {
    return `<code style="${styles.code}">${content}</code>`;
  }

  return `${labelHtml}<code style="${styles.codeBlock}">${content}</code>`;
}

/**
 * Render image block
 */
function renderImage(block: Extract<EmailBlock, { type: 'image' }>, context: RenderContext): string {
  const alt = interpolate(block.alt, context.data);
  const cid = interpolate(block.cid, context.data);
  const align = block.align || 'center';

  const img = `<img
    src="cid:${cid}"
    alt="${alt}"
    style="width: ${block.width}px; height: ${block.height}px; display: block;"
    width="${block.width}"
    height="${block.height}"
  >`;

  const caption = block.caption ? `<p style="${styles.pMuted}; margin-top: ${tokens.spacing.sm}; text-align: ${align};">${interpolate(block.caption, context.data)}</p>` : '';

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
function renderHeading(block: Extract<EmailBlock, { type: 'heading' }>, context: RenderContext): string {
  const content = interpolate(block.content, context.data);
  const style = block.level === 'h2' ? styles.h2 : styles.h3;
  const tag = block.level;
  return `<${tag} style="${style}">${content}</${tag}>`;
}

/**
 * Render list block
 */
function renderList(block: Extract<EmailBlock, { type: 'list' }>, context: RenderContext): string {
  const items = block.items.map(item => `<li style="${styles.li}">${interpolate(item, context.data)}</li>`).join('');
  const tag = block.listStyle === 'numbered' ? 'ol' : 'ul';
  const titleHtml = block.title ? `<h3 style="${styles.h3}">${interpolate(block.title, context.data)}</h3>` : '';

  return `${titleHtml}<${tag} style="margin: ${tokens.spacing.md} 0; padding-left: ${tokens.spacing.lg}; color: ${tokens.text.secondary};">${items}</${tag}>`;
}

/**
 * Render link block
 */
function renderLink(block: Extract<EmailBlock, { type: 'link' }>, context: RenderContext): string {
  const scheme = block.colorScheme ? brandColors[block.colorScheme] : context.colorScheme;
  const url = typeof block.url === 'string' && block.url.startsWith('{{') ? interpolate(block.url, context.data) : block.url;
  const label = interpolate(block.label, context.data);
  const align = block.align || 'center';

  return `
    <p style="margin: ${tokens.spacing.md} 0; text-align: ${align};">
      <a href="${url}" style="${linkStyle(scheme)}">${label}</a>
    </p>
  `.trim();
}

/**
 * Render header content
 */
export function renderHeader(header: EmailHeader, data: VariableData): string {
  const subtitle = header.subtitle ? `<p>${interpolate(header.subtitle, data)}</p>` : '';
  return `
    <div style="font-size: 48px; margin-bottom: 12px;">${header.emoji}</div>
    <h1>${interpolate(header.title, data)}</h1>
    ${subtitle}
  `.trim();
}

/**
 * Render full template to complete HTML email
 */
export function renderTemplate(template: EmailTemplate, data: VariableData): { subject: string; html: string } {
  const colorScheme = brandColors[template.colorScheme];

  const context: RenderContext = {
    template,
    data,
    colorScheme,
    preview: false,
  };

  // Interpolate subject and preheader
  const subject = interpolate(template.subject, data);
  const preheader = template.preheader ? interpolate(template.preheader, data) : undefined;

  // Render header
  const headerContent = renderHeader(template.header, data);

  // Render all body blocks
  const bodyContent = template.blocks.map(block => renderBlock(block, context)).join('\n\n');

  // Render footer
  let footerContent: string;
  if (template.footer.type === 'support') {
    footerContent = getSupportFooter(colorScheme);
  } else if (template.footer.type === 'custom' && template.footer.customHtml) {
    footerContent = interpolate(template.footer.customHtml, data);
  } else {
    footerContent = `<p style="${styles.pSmall}">&copy; ${new Date().getFullYear()} Frontier Meals. All rights reserved.</p>`;
  }

  // Build final HTML
  const html = buildEmailHTML({
    colorScheme,
    title: subject,
    preheader,
    headerContent,
    bodyContent,
    footerContent,
  });

  return { subject, html };
}

/**
 * Generate TypeScript code for a template (for export to codebase)
 * Produces code matching the existing template file patterns
 */
export function generateTemplateCode(template: EmailTemplate): string {
  const interfaceName = toPascalCase(template.slug) + 'EmailData';

  // Generate TypeScript interface for data
  const interfaceFields = template.variables.map(v => `  ${v.name}: ${v.type};`).join('\n');

  const dataInterface = template.variables.length > 0 ? `export interface ${interfaceName} {
${interfaceFields}
}` : '';

  // Generate function signature
  const functionName = 'get' + toPascalCase(template.slug) + 'Email';
  const functionParam = template.variables.length > 0 ? `data: ${interfaceName}` : '';

  // Generate header content
  const headerSubtitleLine = template.header.subtitle ? `\n    <p>${template.header.subtitle}</p>` : '';

  // Generate body content (simplified - just output interpolated blocks)
  const bodyBlocks = template.blocks
    .map(block => {
      const context: RenderContext = {
        template,
        data: {},
        colorScheme: brandColors[template.colorScheme],
      };
      // For code generation, we want template literals not rendered HTML
      return generateBlockCode(block, template.colorScheme);
    })
    .join('\n\n    ');

  // Generate footer
  let footerLine: string;
  if (template.footer.type === 'support') {
    footerLine = `getSupportFooter(scheme)`;
  } else if (template.footer.type === 'custom' && template.footer.customHtml) {
    footerLine = `\`${escapeBackticks(template.footer.customHtml)}\``;
  } else {
    footerLine = `\`<p style="\${styles.pSmall}">&copy; \${new Date().getFullYear()} Frontier Meals. All rights reserved.</p>\``;
  }

  const code = `import {
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
} from './base';

${dataInterface ? dataInterface + '\n\n' : ''}export function ${functionName}(${functionParam}) {
  const subject = \`${escapeBackticks(template.subject)}\`;
  const scheme = brandColors.${template.colorScheme};

  const headerContent = \`
    <div style="font-size: 48px; margin-bottom: 12px;">${template.header.emoji}</div>
    <h1>${template.header.title}</h1>${headerSubtitleLine}
  \`;

  const bodyContent = \`
    ${bodyBlocks}
  \`;

  const html = buildEmailHTML({
    colorScheme: scheme,
    title: subject,${template.preheader ? `\n    preheader: \`${escapeBackticks(template.preheader)}\`,` : ''}
    headerContent,
    bodyContent,
    footerContent: ${footerLine}
  });

  return { subject, html };
}
`;

  return code;
}

/**
 * Generate code for a single block (returns template literal content)
 */
function generateBlockCode(block: EmailBlock, colorScheme: string): string {
  // This is a simplified version - full implementation would need to handle all block types properly
  // For now, just return placeholder
  return `<!-- ${block.type} block: ${block.id} -->`;
}

/**
 * Convert kebab-case to PascalCase
 */
function toPascalCase(str: string): string {
  return str
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join('');
}

/**
 * Escape backticks in template literals
 */
function escapeBackticks(str: string): string {
  return str.replace(/`/g, '\\`').replace(/\$/g, '\\$');
}
