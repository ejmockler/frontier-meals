<script lang="ts">
	import { cn } from '$utils/cn';
	import Heading from './Heading.svelte';
	import Text from './Text.svelte';
	import { scrollReveal } from '$lib/actions/scrollReveal';

	interface Props {
		headline: string;
		subhead?: string;
		align?: 'left' | 'center';
		class?: string;
	}

	let { headline, subhead, align = 'center', class: className }: Props = $props();
</script>

<div
	class={cn('mb-12', align === 'center' && 'text-center max-w-2xl mx-auto', className)}
	use:scrollReveal
>
	<Heading level={2} {align}>
		{headline}
	</Heading>

	{#if subhead}
		<Text size="lg" {align} class="mt-4">
			{subhead}
		</Text>
	{/if}
</div>
