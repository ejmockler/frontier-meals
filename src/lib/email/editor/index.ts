/**
 * Email Editor System
 *
 * Exports all components for building and managing email templates:
 * - Types: Semantic block definitions
 * - Variables: Registry of available template variables
 * - Renderer: Block-to-HTML conversion
 * - Parser: Source code reverse-engineering
 * - Registry: Template catalog and metadata
 */

export * from './types';
export * from './variables';
export * from './renderer';
export * from './parser';
export * from './registry';
