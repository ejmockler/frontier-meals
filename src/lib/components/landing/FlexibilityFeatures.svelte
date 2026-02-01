<script lang="ts">
	import { Section, Container, Heading, Text } from '$lib/components/landing';
	import { scrollReveal } from '$lib/actions/scrollReveal';

	interface Feature {
		title: string;
		items: string[];
		highlight?: { value: string; label: string };
	}

	const features: Feature[] = [
		{
			title: 'Your Preferences',
			items: ['Omnivore', 'Vegetarian', 'Vegan', 'Pescatarian']
		},
		{
			title: 'Need to Skip?',
			items: ['Cancel by Friday 9am', 'Get 75% back'],
			highlight: { value: '75%', label: 'refund' }
		}
	];
</script>

<Section background="recessed" spacing="normal">
	<Container size="narrow">
		<div class="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
			{#each features as feature, i}
				<div
					class="p-6 md:p-8 rounded-md bg-white border-2 transition-all duration-200 hover:shadow-md"
					class:border-[#D9D7D2]={!feature.highlight}
					class:border-[#E67E50]={feature.highlight}
					use:scrollReveal={{ delay: i * 100 }}
				>
					<Heading level={3} class="mb-4 text-lg">
						{feature.title}
					</Heading>

					<!-- Tags/Pills for items -->
					<div class="flex flex-wrap gap-2">
						{#each feature.items as item}
							<span class="px-3 py-1.5 bg-[#F5F3EF] text-[#5C5A56] text-sm rounded-full border border-[#E8E6E1]">
								{item}
							</span>
						{/each}
					</div>

					<!-- Highlight callout -->
					{#if feature.highlight}
						<div class="mt-5 pt-5 border-t border-[#E8E6E1] flex items-center gap-3">
							<span class="text-3xl font-bold text-[#E67E50]">{feature.highlight.value}</span>
							<span class="text-sm text-[#5C5A56]">{feature.highlight.label}</span>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</Container>
</Section>
