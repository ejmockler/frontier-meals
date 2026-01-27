/**
 * Type conversion bridge: Editor store blocks → Renderer EmailBlocks
 */

import type { EmailBlock } from './types';
import type { Block as EditorBlock } from '$lib/components/admin/email/editor-store';

// Wrap bare variable name in {{...}} for renderer VariableRef format
function toVariableRef(name: string): `{{${string}}}` {
	return `{{${name}}}`;
}

export function convertEditorBlocks(blocks: EditorBlock[]): EmailBlock[] {
	return blocks.map(convertBlock);
}

function convertBlock(block: EditorBlock): EmailBlock {
	switch (block.type) {
		case 'greeting':
			return {
				type: 'greeting',
				id: block.id,
				nameVariable: toVariableRef(block.variableName)
			};

		case 'paragraph':
			return {
				type: 'paragraph',
				id: block.id,
				content: block.text,
				style: block.style
			};

		case 'infoBox':
			return {
				type: 'infobox',
				id: block.id,
				boxType: block.boxType,
				title: block.title,
				content: block.text
			};

		case 'button':
			return {
				type: 'button',
				id: block.id,
				label: block.label,
				urlVariable: toVariableRef(block.urlVariable)
			};

		case 'stepList':
			return {
				type: 'steplist',
				id: block.id,
				steps: block.steps.map(step => ({
					title: step.title,
					description: step.description
				}))
			};

		case 'codeInline':
			return {
				type: 'code',
				id: block.id,
				content: block.text,
				style: 'inline'
			};

		case 'codeBlock':
			return {
				type: 'code',
				id: block.id,
				content: block.code,
				style: 'block'
			};

		case 'image':
			return {
				type: 'image',
				id: block.id,
				cid: block.cidReference,
				alt: block.alt,
				width: block.width || 280,
				height: block.height || 280
			};

		case 'divider':
			return {
				type: 'divider',
				id: block.id,
				style: 'light'
			};

		case 'spacer':
			return {
				type: 'spacer',
				id: block.id,
				size: 'lg'
			};

		default:
			// Exhaustive check - TypeScript will error if we miss a case
			const _exhaustive: never = block;
			throw new Error(`Unknown block type: ${(_exhaustive as EditorBlock).type}`);
	}
}
