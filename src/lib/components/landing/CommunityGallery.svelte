<script lang="ts">
	import { Section, Container, SectionHeader } from '$lib/components/landing';
	import { scrollReveal } from '$lib/actions/scrollReveal';

	const images = [
		{
			src: '/images/landing/rooftop-celebration.jpg',
			alt: 'Rooftop lunch celebration',
			aspect: 'landscape'
		},
		{
			src: '/images/landing/happy-participants.jpg',
			alt: 'Happy lunch participants',
			aspect: 'landscape'
		},
		{
			src: '/images/landing/community-dining.jpg',
			alt: 'Community dining together',
			aspect: 'portrait'
		}
	];
</script>

<Section background="elevated">
	<Container>
		<SectionHeader
			headline="Join Our Community"
			subhead="More than just lunch—it's about connecting with your colleagues"
		/>

		<div class="grid grid-cols-1 md:grid-cols-3 gap-4 lg:gap-6">
			{#each images as image, i}
				<div
					class="group relative overflow-hidden rounded-md shadow-lg"
					class:md:row-span-2={image.aspect === 'portrait'}
					class:aspect-video={image.aspect === 'landscape'}
					class:aspect-3-4={image.aspect === 'portrait'}
					use:scrollReveal={{ delay: i * 100 }}
				>
					<img
						src={image.src}
						alt={image.alt}
						class="w-full h-full object-cover transition-transform duration-300 ease-out group-hover:scale-105"
						loading="lazy"
						decoding="async"
					/>

					<!-- Subtle overlay on hover -->
					<div class="absolute inset-0 bg-gradient-to-t from-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
				</div>
			{/each}
		</div>
	</Container>
</Section>

<style>
	.aspect-3-4 {
		aspect-ratio: 3 / 4;
	}
</style>
