<script lang="ts">
	import { Section, Container, Heading, Text } from '$lib/components/landing';
	import { scrollReveal } from '$lib/actions/scrollReveal';

	const features = [
		{
			title: 'Dietary Preferences',
			description:
				"Choose from: I eat anything, Vegetarian, Vegan, or Pescatarian. Let us know about any food allergies and we'll accommodate your needs.",
			icon: '🥗',
			highlight: false
		},
		{
			title: 'Flexible Cancellation',
			description:
				"Can't make it? Cancel by Friday 9am PST before the meal and receive a 75% reimbursement for that day.",
			icon: '📅',
			highlight: true // THIS IS THE KEY DIFFERENTIATOR
		}
	];
</script>

<Section background="recessed">
	<Container size="narrow">
		<div class="grid grid-cols-1 md:grid-cols-2 gap-6 lg:gap-8">
			{#each features as feature, i}
				<div
					class="p-8 rounded-md transition-all duration-150"
					class:bg-white={!feature.highlight}
					class:border-2={true}
					class:border-[#D9D7D2]={!feature.highlight}
					class:bg-highlight={feature.highlight}
					class:border-[#E67E50]={feature.highlight}
					class:shadow-lg={feature.highlight}
					use:scrollReveal={{ delay: i * 100 }}
				>
					<!-- Icon -->
					<div
						class="w-14 h-14 rounded-md flex items-center justify-center mb-5"
						class:bg-[#E8E6E1]={!feature.highlight}
						class:bg-[#E67E50]={feature.highlight}
					>
						<span
							class="text-3xl"
							class:grayscale={!feature.highlight}
							class:grayscale-0={feature.highlight}
						>
							{feature.icon}
						</span>
					</div>

					<Heading level={3} class={feature.highlight ? 'text-[#E67E50]' : ''}>
						{feature.title}
					</Heading>

					<Text color="secondary" class="mt-3">
						{feature.description}
					</Text>

					<!-- Highlight badge for 75% reimbursement -->
					{#if feature.highlight}
						<div
							class="mt-4 inline-flex items-center gap-2 px-3 py-1.5 bg-[#E67E50] text-white text-sm font-bold rounded-full"
						>
							<span>75% Back</span>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	</Container>
</Section>

<style>
	.bg-highlight {
		background-color: rgba(230, 126, 80, 0.1);
	}
</style>
