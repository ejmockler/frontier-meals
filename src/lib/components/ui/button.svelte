<script lang="ts">
	import { cn } from '$utils/cn';
	import type { HTMLButtonAttributes } from 'svelte/elements';

	interface Props extends HTMLButtonAttributes {
		variant?: 'default' | 'secondary' | 'destructive' | 'outline' | 'ghost';
		size?: 'default' | 'sm' | 'lg' | 'icon';
		class?: string;
		children?: any;
	}

	let {
		variant = 'default',
		size = 'default',
		class: className,
		children,
		...restProps
	}: Props = $props();

	// Frontier Tower aesthetic: minimal rounding, bold borders, snappy transitions
	const baseStyles =
		'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-bold tracking-tight transition-all duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.98]';

	const variants = {
		default:
			'bg-[#E67E50] text-white shadow-lg hover:bg-[#D97F3E] hover:shadow-xl border-2 border-[#D97F3E]',
		secondary:
			'bg-[#E8C547] text-[#1A1816] shadow-lg hover:bg-[#E8C547]/90 hover:shadow-xl border-2 border-[#E8C547]/50',
		destructive:
			'bg-[#C85454] text-white shadow-lg hover:bg-[#C85454]/90 hover:shadow-xl border-2 border-[#C85454]/50',
		outline:
			'border-2 border-[#D9D7D2] bg-transparent shadow-sm hover:bg-[#E8E6E1] hover:border-[#B8B6B1]',
		ghost: 'hover:bg-[#E8E6E1] hover:text-[#1A1816]'
	};

	const sizes = {
		default: 'h-11 px-6 py-2.5 text-base',
		sm: 'h-9 px-4 py-2 text-sm',
		lg: 'h-12 px-8 py-3 text-lg',
		icon: 'h-11 w-11 p-2'
	};

	const combinedClass = $derived(
		cn(baseStyles, variants[variant], sizes[size], className)
	);
</script>

<button class={combinedClass} {...restProps}>
	{@render children?.()}
</button>
