/**
 * Email Template Parser
 *
 * Reverse-engineers existing template source code to extract:
 * - Color scheme
 * - Header content
 * - Body blocks
 * - Variables used
 *
 * This enables importing existing templates into the editor.
 * Note: Parsing is best-effort heuristic-based, not guaranteed to be perfect.
 */

import type {
  EmailTemplate,
  EmailBlock,
  EmailHeader,
  TemplateVariable,
  ColorSchemeName,
  EmailFooter,
  ParseResult,
  ParseError,
} from './types';

/**
 * Generate unique ID for blocks
 */
function generateId(): string {
  return `block_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Parse template source code to extract template structure
 */
export function parseExistingTemplate(sourceCode: string): ParseResult {
  const errors: ParseError[] = [];
  const warnings: string[] = [];

  try {
    // Extract basic metadata
    const slug = extractSlug(sourceCode);
    const name = extractName(sourceCode) || slug;
    const description = extractDescription(sourceCode);
    const colorScheme = extractColorScheme(sourceCode);
    const subject = extractSubject(sourceCode);
    const preheader = extractPreheader(sourceCode);
    const header = extractHeader(sourceCode);
    const footer = extractFooter(sourceCode);
    const variables = extractVariables(sourceCode);
    const blocks = extractBlocks(sourceCode);

    if (!subject) {
      errors.push({
        message: 'Could not extract subject line',
        severity: 'error',
      });
    }

    if (!header) {
      errors.push({
        message: 'Could not extract header content',
        severity: 'error',
      });
    }

    if (errors.length > 0) {
      return { errors, warnings };
    }

    const template: EmailTemplate = {
      slug: slug || 'untitled',
      name: name || 'Untitled Template',
      description,
      subject: subject!,
      preheader,
      colorScheme,
      header: header!,
      blocks,
      footer,
      variables,
    };

    return { template, errors, warnings };
  } catch (error) {
    errors.push({
      message: `Failed to parse template: ${error instanceof Error ? error.message : String(error)}`,
      severity: 'error',
    });
    return { errors, warnings };
  }
}

/**
 * Extract slug from function name
 */
function extractSlug(source: string): string {
  const match = source.match(/export function get(\w+)Email/);
  if (!match) return 'unknown';

  // Convert PascalCase to kebab-case
  return match[1]
    .replace(/([A-Z])/g, '-$1')
    .toLowerCase()
    .replace(/^-/, '');
}

/**
 * Extract name from comments or function name
 */
function extractName(source: string): string | undefined {
  // Look for JSDoc comment
  const jsdocMatch = source.match(/\/\*\*\s*\n\s*\*\s*(.+?)\n/);
  if (jsdocMatch) return jsdocMatch[1];

  // Fallback to function name conversion
  const funcMatch = source.match(/export function get(\w+)Email/);
  if (funcMatch) {
    // Convert PascalCase to Title Case
    return funcMatch[1].replace(/([A-Z])/g, ' $1').trim();
  }

  return undefined;
}

/**
 * Extract description from comments
 */
function extractDescription(source: string): string | undefined {
  const match = source.match(/\/\*\*\s*\n(?:\s*\*\s*(.+?)\n)+\s*\*\//);
  if (!match) return undefined;

  // Extract all lines from the comment
  const lines = match[0]
    .split('\n')
    .slice(1, -1) // Remove /** and */
    .map(line => line.replace(/^\s*\*\s*/, '').trim())
    .filter(line => line.length > 0);

  return lines.join(' ');
}

/**
 * Extract color scheme from source code
 */
function extractColorScheme(source: string): ColorSchemeName {
  const match = source.match(/brandColors\.(orange|teal|green|amber|red|gray)/);
  return (match?.[1] as ColorSchemeName) || 'orange';
}

/**
 * Extract subject line
 */
function extractSubject(source: string): string | null {
  const match = source.match(/const subject = [`'"](.+?)['"`]/s);
  return match?.[1] || null;
}

/**
 * Extract preheader
 */
function extractPreheader(source: string): string | undefined {
  const match = source.match(/preheader:\s*[`'"](.+?)['"`]/s);
  return match?.[1];
}

/**
 * Extract header content (emoji, title, subtitle)
 */
function extractHeader(source: string): EmailHeader | null {
  const headerMatch = source.match(
    /const headerContent = `\s*<div[^>]*>([^<]+)<\/div>\s*<h1>(.+?)<\/h1>(?:\s*<p>(.+?)<\/p>)?/s
  );
  if (!headerMatch) return null;

  return {
    emoji: headerMatch[1].trim(),
    title: headerMatch[2].trim(),
    subtitle: headerMatch[3]?.trim(),
  };
}

/**
 * Extract footer configuration
 */
function extractFooter(source: string): EmailFooter {
  if (source.includes('getSupportFooter')) {
    return { type: 'support' };
  }
  if (source.match(/footerContent:\s*`<p style="\$\{styles\.pSmall\}">&copy;/)) {
    return { type: 'minimal' };
  }

  // Extract custom footer
  const match = source.match(/footerContent:\s*`(.+?)`[,\s]*\}/s);
  return {
    type: 'custom',
    customHtml: match?.[1],
  };
}

/**
 * Extract variables from interface definition
 */
function extractVariables(source: string): TemplateVariable[] {
  const interfaceMatch = source.match(/interface\s+\w+\s*\{([^}]+)\}/s);
  if (!interfaceMatch) return [];

  const fields = interfaceMatch[1]
    .split(';')
    .map(line => line.trim())
    .filter(line => line.length > 0 && !line.startsWith('//'))
    .map(line => {
      const match = line.match(/(\w+):\s*(\w+)/);
      if (!match) return null;

      const name = match[1];
      const type = match[2];

      return {
        name,
        label: toTitleCase(name),
        type: inferVariableType(type) as any,
        exampleValue: getExampleValue(name),
      };
    })
    .filter((v): v is TemplateVariable => v !== null);

  return fields;
}

/**
 * Infer variable type from TypeScript type
 */
function inferVariableType(tsType: string): string {
  if (tsType === 'string') return 'string';
  if (tsType === 'number') return 'number';
  if (tsType.includes('date') || tsType.includes('Date')) return 'date';
  return 'string';
}

/**
 * Get example value for a variable
 */
function getExampleValue(variableName: string): string {
  const examples: Record<string, string> = {
    customer_name: 'Alex',
    service_date: '2025-01-15',
    amount_due: '$12.00',
    telegram_handle: '@alex',
    deep_link: 'https://t.me/frontiermeals_bot?start=abc123',
    magic_link: 'https://frontiermeals.com/admin/auth?token=abc123',
    update_payment_url: 'https://billing.stripe.com/p/session/test_abc123',
    email: 'alex@example.com',
  };

  return examples[variableName] || `{{${variableName}}}`;
}

/**
 * Convert snake_case to Title Case
 */
function toTitleCase(str: string): string {
  return str
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Extract blocks from bodyContent
 * This is heuristic-based pattern matching
 */
function extractBlocks(source: string): EmailBlock[] {
  const bodyMatch = source.match(/const bodyContent = `([\s\S]+?)`;\s*const html =/);
  if (!bodyMatch) return [];

  const bodyContent = bodyMatch[1];
  const blocks: EmailBlock[] = [];

  // Extract greeting
  const greetingMatch = bodyContent.match(/<p style="\$\{styles\.pLead\}">Hi \$\{data\.(\w+)\},<\/p>/);
  if (greetingMatch) {
    blocks.push({
      type: 'greeting',
      id: generateId(),
      nameVariable: `{{${greetingMatch[1]}}}` as any,
    });
  }

  // Extract paragraphs (simplified - this is complex in practice)
  // For now, return empty array - full implementation would parse all block types

  return blocks;
}

/**
 * Extract variable placeholders from a text string
 * Returns array of variable names found in {{variable}} syntax
 */
export function extractVariablesFromText(text: string): string[] {
  const matches = [...text.matchAll(/\{\{(\w+)\}\}/g)];
  return [...new Set(matches.map(m => m[1]))];
}

/**
 * Get test values for variables (for preview)
 */
export function getTestVariables(variables: TemplateVariable[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (const variable of variables) {
    result[variable.name] = variable.exampleValue;
  }
  return result;
}
