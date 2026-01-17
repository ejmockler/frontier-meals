<script lang="ts">
	import { cn } from '$utils/cn';

	interface Props {
		size?: 'sm' | 'base' | 'lg' | 'xl';
		color?: 'primary' | 'secondary' | 'tertiary' | 'inverse';
		as?: 'p' | 'span' | 'div';
		align?: 'left' | 'center' | 'right';
		class?: string;
		children: any;
	}

	let {
		size = 'base',
		color = 'secondary',
		as = 'p',
		align = 'left',
		class: className,
		children
	}: Props = $props();

	const sizes = {
		sm: 'text-sm leading-relaxed',
		base: 'text-base leading-relaxed',
		lg: 'text-lg leading-relaxed',
		xl: 'text-xl leading-relaxed'
	};

	const colors = {
		primary: 'text-[#1A1816]',
		secondary: 'text-[#5C5A56]',
		tertiary: 'text-[#8E8C87]',
		inverse: 'text-white'
	};

	const alignments = {
		left: 'text-left',
		center: 'text-center',
		right: 'text-right'
	};
</script>

<svelte:element
	this={as}
	class={cn(sizes[size], colors[color], alignments[align], className)}
>
	{@render children()}
</svelte:element>
