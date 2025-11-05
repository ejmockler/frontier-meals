<script lang="ts">
	import { cn } from '$utils/cn';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLDivElement> {
		class?: string;
		hoverable?: boolean;
		variant?: 'default' | 'concrete';
		children?: any;
	}

	let { class: className, hoverable = false, variant = 'default', children, ...restProps }: Props = $props();

	// Frontier Tower aesthetic: minimal rounding, grounded shadows, industrial feel
	const baseStyles =
		'rounded-sm border-2 bg-card text-card-foreground shadow-lg transition-shadow';

	const variantStyles = {
		default: 'bg-card border-border',
		concrete: 'bg-[#E8E6E1] border-[#D9D7D2]'
	};

	const hoverStyles = hoverable
		? 'hover:shadow-xl cursor-pointer'
		: '';

	const combinedClass = $derived(cn(baseStyles, variantStyles[variant], hoverStyles, className));
</script>

<div class={combinedClass} {...restProps}>
	{@render children?.()}
</div>
