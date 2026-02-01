<script lang="ts">
	import { Section, Container, SectionHeader } from '$lib/components/landing';
	import { scrollReveal } from '$lib/actions/scrollReveal';

	const images = [
		{
			src: '/images/landing/rooftop-celebration.jpg',
			alt: 'Rooftop lunch celebration',
			size: 'large' // Featured image spans 2 columns
		},
		{
			src: '/images/landing/happy-participants.jpg',
			alt: 'Happy lunch participants',
			size: 'small'
		},
		{
			src: '/images/landing/community-dining.jpg',
			alt: 'Community dining together',
			size: 'small'
		}
	];
</script>

<Section background="elevated">
	<Container>
		<SectionHeader
			headline="Join Our Community"
			subhead="More than just lunch—it's about connecting with your colleagues"
		/>

		<!-- Consistent horizontal layout: Featured large + 2 smaller squares -->
		<div class="flex flex-col sm:flex-row gap-3 md:gap-4">
			<!-- Featured large image -->
			<div
				class="group relative overflow-hidden rounded-md shadow-lg flex-1 sm:flex-[2] aspect-4-3"
				use:scrollReveal={{ delay: 0 }}
			>
				<img
					src={images[0].src}
					alt={images[0].alt}
					width="800"
					height="600"
					class="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
					loading="lazy"
					decoding="async"
				/>
				<div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300"></div>
			</div>

			<!-- Two smaller images stacked vertically -->
			<div class="flex flex-row sm:flex-col gap-3 md:gap-4 flex-1">
				{#each images.slice(1) as image, i}
					<div
						class="group relative overflow-hidden rounded-md shadow-lg flex-1 aspect-square"
						use:scrollReveal={{ delay: (i + 1) * 100 }}
					>
						<img
							src={image.src}
							alt={image.alt}
							width="400"
							height="400"
							class="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
							loading="lazy"
							decoding="async"
						/>
						<div class="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-60 group-hover:opacity-80 transition-opacity duration-300"></div>
					</div>
				{/each}
			</div>
		</div>
	</Container>
</Section>

<style>
	.aspect-4-3 {
		aspect-ratio: 4 / 3;
	}
</style>
