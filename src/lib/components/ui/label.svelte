<script lang="ts">
	import { cn } from '$utils/cn';
	import type { HTMLAttributes } from 'svelte/elements';

	interface Props extends HTMLAttributes<HTMLLabelElement> {
		for?: string;
		class?: string;
		required?: boolean;
		children?: any;
	}

	let { for: htmlFor, class: className, required = false, children, ...restProps }: Props = $props();

	const baseStyles =
		'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70';

	const combinedClass = $derived(cn(baseStyles, className));
</script>

<label for={htmlFor} class={combinedClass} {...restProps}>
	{@render children?.()}
	{#if required}
		<span class="text-destructive ml-1">*</span>
	{/if}
</label>
