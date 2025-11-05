<script lang="ts">
	import { cn } from '$utils/cn';
	import type { HTMLInputAttributes } from 'svelte/elements';

	interface Props extends HTMLInputAttributes {
		class?: string;
		error?: boolean;
		value?: string;
	}

	let { class: className, error = false, value = $bindable(''), ...restProps }: Props = $props();

	const baseStyles =
		'flex h-11 w-full rounded-lg border-2 bg-background px-4 py-2.5 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 transition-all';

	const errorStyles = error
		? 'border-destructive focus-visible:ring-destructive'
		: 'border-input';

	const combinedClass = $derived(cn(baseStyles, errorStyles, className));
</script>

<input class={combinedClass} bind:value {...restProps} />
