<script lang="ts">
	import { onMount } from 'svelte';
	import { Section, Container } from '$lib/components/landing';
	import Button from '$lib/components/ui/button.svelte';

	interface Props {
		onSubscribe: () => void;
		onLearnMore: () => void;
		loading?: boolean;
	}

	let { onSubscribe, onLearnMore, loading = false }: Props = $props();

	let mounted = $state(false);

	onMount(() => {
		setTimeout(() => {
			mounted = true;
		}, 100);
	});
</script>

<Section spacing="normal" class="overflow-hidden min-h-[100dvh] flex flex-col">
	<Container size="wide" class="flex-1 flex items-center">
		<div class="grid md:grid-cols-2 gap-8 md:gap-12 lg:gap-16 items-center w-full">
			<!-- Content Side -->
			<div
				class="order-2 md:order-1 transition-all duration-500 ease-out"
				class:opacity-0={!mounted}
				class:translate-y-5={!mounted}
				class:opacity-100={mounted}
				class:translate-y-0={mounted}
			>
				<!-- Brand + Tagline -->
				<div class="mb-6 md:mb-8">
					<h1 class="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-[#1A1816]">
						Frontier Meals
					</h1>
					<p class="text-xl sm:text-2xl lg:text-3xl font-medium text-[#E67E50] mt-2">
						Lunch, solved.
					</p>
				</div>

				<!-- Value Props: Scannable Chunks -->
				<ul class="space-y-3 mb-8 text-[#5C5A56]">
					<li class="flex items-center gap-3">
						<span class="w-1.5 h-1.5 rounded-full bg-[#E67E50] flex-shrink-0"></span>
						<span class="text-base sm:text-lg">Healthy meals at Frontier Tower, weekdays at noon</span>
					</li>
					<li class="flex items-center gap-3">
						<span class="w-1.5 h-1.5 rounded-full bg-[#E67E50] flex-shrink-0"></span>
						<span class="text-base sm:text-lg">Subscribe once, show up when you want</span>
					</li>
					<li class="flex items-center gap-3">
						<span class="w-1.5 h-1.5 rounded-full bg-[#E67E50] flex-shrink-0"></span>
						<span class="text-base sm:text-lg">Community dining or grab and go</span>
					</li>
				</ul>

				<div class="flex">
					<Button
						onclick={onSubscribe}
						disabled={loading}
						size="lg"
						class="w-full sm:w-auto"
						aria-label="Start your lunch subscription"
					>
						{loading ? 'Loading...' : 'Start Your Subscription'}
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
						width="1200"
						height="800"
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

	<!-- Scroll indicator: Bottom center, easy thumb target -->
	<button
		onclick={onLearnMore}
		class="group flex flex-col items-center gap-2 pb-6 pt-4 px-8 mx-auto text-[#5C5A56] hover:text-[#E67E50] transition-colors duration-200 focus:outline-none focus-visible:text-[#E67E50]"
		class:opacity-0={!mounted}
		class:opacity-100={mounted}
		style="transition: opacity 0.5s ease-out 0.4s"
		aria-label="Scroll to learn how it works"
	>
		<span class="text-sm font-medium">How it works</span>
		<svg
			class="w-6 h-6 animate-bounce"
			fill="none"
			stroke="currentColor"
			viewBox="0 0 24 24"
		>
			<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
		</svg>
	</button>
</Section>
