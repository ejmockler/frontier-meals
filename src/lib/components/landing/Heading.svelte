<script lang="ts">
	import { cn } from '$utils/cn';

	interface Props {
		level: 1 | 2 | 3 | 4;
		as?: 'h1' | 'h2' | 'h3' | 'h4' | 'p' | 'span';
		align?: 'left' | 'center' | 'right';
		class?: string;
		children: any;
	}

	let { level, as, align = 'left', class: className, children }: Props = $props();

	// Visual hierarchy (independent of semantic level)
	const levelStyles = {
		1: 'text-4xl md:text-5xl font-extrabold tracking-tight leading-tight',
		2: 'text-2xl md:text-3xl font-bold tracking-tight leading-snug',
		3: 'text-xl md:text-2xl font-bold tracking-tight leading-snug',
		4: 'text-lg font-semibold leading-normal'
	};

	const alignments = {
		left: 'text-left',
		center: 'text-center',
		right: 'text-right'
	};

	// Default semantic element matches visual level
	const tag = as ?? `h${level}`;
</script>

<svelte:element
	this={tag}
	class={cn(levelStyles[level], alignments[align], 'text-[#1A1816]', className)}
>
	{@render children()}
</svelte:element>
