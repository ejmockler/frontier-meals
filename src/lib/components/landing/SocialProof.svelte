<script lang="ts">
	import { Section, Container, Text } from '$lib/components/landing';
	import { scrollReveal } from '$lib/actions/scrollReveal';
</script>

<Section background="recessed" spacing="tight" class="pt-10 md:pt-14">
	<Container>
		<!-- Community Image -->
		<div
			class="relative rounded-md overflow-hidden shadow-xl max-w-3xl mx-auto"
			use:scrollReveal={{ delay: 100 }}
		>
			<img
				src="/images/landing/large-gathering.jpg"
				alt="Large community gathering at Frontier Tower lunch"
				width="1200"
				height="800"
				class="w-full"
				loading="lazy"
				decoding="async"
			/>

			<!-- Caption overlay -->
			<div class="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent p-4 sm:p-6">
				<Text color="inverse" size="sm" align="center">
					The Frontier Tower community
				</Text>
			</div>
		</div>
	</Container>
</Section>
