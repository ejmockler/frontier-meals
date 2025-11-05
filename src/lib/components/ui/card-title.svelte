<script lang="ts">
	import { cn } from '$utils/cn';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLHeadingElement> {
		class?: string;
		children?: any;
	}

	let { class: className, children, ...restProps }: Props = $props();
</script>

<h3 class={cn('text-xl font-semibold leading-tight tracking-tight', className)} {...restProps}>
	{@render children?.()}
</h3>
