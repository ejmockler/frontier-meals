<script lang="ts">
	import { onMount } from 'svelte';
	import { Section, Container, Heading, Text } from '$lib/components/landing';
	import Button from '$lib/components/ui/button.svelte';

	interface Props {
		onSubscribe: () => void;
		onLearnMore: () => void;
		loading?: boolean;
	}

	let { onSubscribe, onLearnMore, loading = false }: Props = $props();

	let mounted = $state(false);

	onMount(() => {
		// Small delay to ensure smooth entrance
		setTimeout(() => {
			mounted = true;
		}, 100);
	});
</script>

<Section spacing="normal" class="overflow-hidden min-h-[calc(100vh-4rem)] flex items-center">
	<Container size="wide">
		<div class="grid md:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center">
			<!-- Content Side -->
			<div
				class="order-2 md:order-1 transition-all duration-500 ease-out"
				class:opacity-0={!mounted}
				class:translate-y-5={!mounted}
				class:opacity-100={mounted}
				class:translate-y-0={mounted}
			>
				<h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#1A1816] mb-4 md:mb-6">
					Frontier Meals
				</h1>

				<p class="text-lg sm:text-xl lg:text-2xl text-[#5C5A56] leading-relaxed mb-6 md:mb-8 max-w-lg">
					Healthy lunches delivered daily to Frontier Tower. Subscribe once,
					show up at noon, and enjoy community dining or grab and go.
				</p>

				<div class="flex flex-wrap gap-3 sm:gap-4">
					<Button
						onclick={onSubscribe}
						disabled={loading}
						size="lg"
						aria-label="Start your lunch subscription"
					>
						{loading ? 'Loading...' : 'Start Your Subscription'}
					</Button>

					<Button
						variant="outline"
						onclick={onLearnMore}
						size="lg"
						aria-label="Learn more about how it works"
					>
						Learn More
					</Button>
				</div>
			</div>

			<!-- Image Side -->
			<div
				class="order-1 md:order-2 relative transition-all duration-500 ease-out delay-150"
				class:opacity-0={!mounted}
				class:scale-95={!mounted}
				class:opacity-100={mounted}
				class:scale-100={mounted}
			>
				<div class="aspect-[4/3] sm:aspect-square md:aspect-[4/5] rounded-md overflow-hidden shadow-xl max-h-[50vh] md:max-h-none">
					<img
						src="/images/landing/hero-community-lunch.jpg"
						alt="Community lunch at Frontier Tower"
						class="w-full h-full object-cover"
						loading="eager"
						decoding="async"
						fetchpriority="high"
					/>
				</div>

				<!-- Decorative accent -->
				<div class="hidden md:block absolute -z-10 -bottom-4 -right-4 w-full h-full bg-[#E67E50]/20 rounded-md"></div>
			</div>
		</div>
	</Container>
</Section>
