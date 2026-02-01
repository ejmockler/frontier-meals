<script lang="ts">
	import { Section, Container, Heading, Text } from '$lib/components/landing';
	import { scrollReveal } from '$lib/actions/scrollReveal';

	const images = [
		{
			src: '/images/landing/buffet-spread.jpg',
			alt: 'Fresh buffet spread'
		},
		{
			src: '/images/landing/serving-meals.jpg',
			alt: 'Serving delicious meals'
		}
	];
</script>

<Section background="elevated" spacing="normal">
	<Container>
		<div class="grid lg:grid-cols-5 gap-8 lg:gap-12 items-center">
			<!-- Text Side: Compact -->
			<div class="lg:col-span-2" use:scrollReveal>
				<Heading level={2} class="mb-3">
					Fresh. Healthy. Daily.
				</Heading>
				<Text color="secondary" class="max-w-sm">
					Quality ingredients, balanced nutrition, generous portions. Something for everyone.
				</Text>
			</div>

			<!-- Images Side: Visual Focus -->
			<div class="lg:col-span-3 grid grid-cols-2 gap-3" use:scrollReveal={{ delay: 100 }}>
				{#each images as image, i}
					<div
						class="group rounded-md overflow-hidden shadow-lg aspect-[4/3]"
					>
						<img
							src={image.src}
							alt={image.alt}
							width="600"
							height="450"
							class="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
							loading="lazy"
							decoding="async"
						/>
					</div>
				{/each}
			</div>
		</div>
	</Container>
</Section>
