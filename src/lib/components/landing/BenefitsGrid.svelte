<script lang="ts">
	import { Section, Container } from '$lib/components/landing';
	import { onMount } from 'svelte';

	let visible = $state(false);
	let sectionEl: HTMLElement;

	onMount(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) visible = true;
			},
			{ threshold: 0.3 }
		);
		if (sectionEl) observer.observe(sectionEl);
		return () => observer.disconnect();
	});
</script>

<Section spacing="tight">
	<Container size="narrow">
		<div bind:this={sectionEl} class="relative">
			<!-- Headline: Large, editorial -->
			<h2
				class="text-2xl md:text-3xl font-bold text-[#1A1816] text-center mb-6 transition-all duration-500"
				class:opacity-0={!visible}
				class:translate-y-4={!visible}
			>
				Why Frontier Meals?
			</h2>

			<!-- Benefits: Horizontal strip, no boxes -->
			<div class="flex flex-col sm:flex-row items-center justify-center gap-8 sm:gap-12 md:gap-16">
				<!-- Save Time -->
				<div
					class="group flex flex-col items-center text-center transition-all duration-500 delay-100"
					class:opacity-0={!visible}
					class:translate-y-4={!visible}
				>
					<svg class="w-8 h-8 md:w-10 md:h-10 text-[#E67E50] mb-3 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span class="text-sm md:text-base font-medium text-[#1A1816]">Save time</span>
				</div>

				<!-- Divider -->
				<div class="hidden sm:block w-px h-12 bg-[#E8E6E1]"></div>

				<!-- Build Community -->
				<div
					class="group flex flex-col items-center text-center transition-all duration-500 delay-200"
					class:opacity-0={!visible}
					class:translate-y-4={!visible}
				>
					<svg class="w-8 h-8 md:w-10 md:h-10 text-[#E67E50] mb-3 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
					</svg>
					<span class="text-sm md:text-base font-medium text-[#1A1816]">Build community</span>
				</div>

				<!-- Divider -->
				<div class="hidden sm:block w-px h-12 bg-[#E8E6E1]"></div>

				<!-- Weekdays at Noon -->
				<div
					class="group flex flex-col items-center text-center transition-all duration-500 delay-300"
					class:opacity-0={!visible}
					class:translate-y-4={!visible}
				>
					<svg class="w-8 h-8 md:w-10 md:h-10 text-[#E67E50] mb-3 transition-transform duration-300 group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="1.5" d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
					</svg>
					<span class="text-sm md:text-base font-medium text-[#1A1816]">Weekdays at noon</span>
				</div>
			</div>
		</div>
	</Container>
</Section>
