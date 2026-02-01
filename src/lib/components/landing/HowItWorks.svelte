<script lang="ts">
	import { Section, Container } from '$lib/components/landing';
	import { onMount } from 'svelte';

	const steps = [
		{ num: 1, title: 'Subscribe', detail: 'One payment. Unlimited meals.' },
		{ num: 2, title: 'Telegram', detail: 'Set diet. Skip days.' },
		{ num: 3, title: 'Pick up', detail: 'QR at noon. 75% back if you skip.' }
	];

	let visible = $state(false);
	let counters = $state([0, 0, 0]);
	let sectionEl: HTMLElement;

	onMount(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting && !visible) {
					visible = true;
					// Animate counters sequentially
					steps.forEach((step, i) => {
						setTimeout(() => {
							animateCounter(i, step.num);
						}, i * 200);
					});
				}
			},
			{ threshold: 0.3 }
		);

		if (sectionEl) observer.observe(sectionEl);
		return () => observer.disconnect();
	});

	function animateCounter(index: number, target: number) {
		const duration = 400;
		const start = performance.now();

		function tick(now: number) {
			const elapsed = now - start;
			const progress = Math.min(elapsed / duration, 1);
			// Ease out cubic
			const eased = 1 - Math.pow(1 - progress, 3);
			counters[index] = Math.round(eased * target);

			if (progress < 1) {
				requestAnimationFrame(tick);
			}
		}
		requestAnimationFrame(tick);
	}
</script>

<Section spacing="tight">
	<Container>
		<div class="relative" bind:this={sectionEl}>
			<!-- The Steps: Large numbers as visual anchors -->
			<div class="grid grid-cols-3 gap-4 md:gap-8 relative">
				<!-- Connecting line (behind numbers) -->
				<div
					class="absolute top-[2.5rem] md:top-[3.5rem] left-[16%] right-[16%] h-px bg-gradient-to-r from-transparent via-[#D9D7D2] to-transparent transition-all duration-700"
					class:opacity-0={!visible}
					class:scale-x-0={!visible}
					class:opacity-100={visible}
					class:scale-x-100={visible}
				></div>

				{#each steps as step, i}
					<div
						class="relative text-center group transition-all duration-500"
						class:opacity-0={!visible}
						class:translate-y-4={!visible}
						class:opacity-100={visible}
						class:translate-y-0={visible}
						style="transition-delay: {i * 150}ms"
					>
						<!-- Large number -->
						<div class="relative inline-block mb-3 md:mb-4">
							<span
								class="text-6xl md:text-8xl font-bold text-[#E8E6E1] select-none transition-colors duration-300 group-hover:text-[#E67E50]/20"
							>
								{counters[i]}
							</span>
							<span class="absolute inset-0 flex items-center justify-center text-2xl md:text-3xl font-bold text-[#1A1816] transition-colors duration-300 group-hover:text-[#E67E50]">
								{counters[i]}
							</span>
						</div>

						<!-- Title -->
						<h3 class="text-base md:text-lg font-semibold text-[#1A1816] mb-1">
							{step.title}
						</h3>

						<!-- Detail -->
						<p class="text-xs md:text-sm text-[#5C5A56] leading-relaxed">
							{step.detail}
						</p>
					</div>
				{/each}
			</div>

			<!-- Diet tags: floating below -->
			<div
				class="mt-6 flex flex-wrap justify-center gap-2 transition-all duration-500 delay-500"
				class:opacity-0={!visible}
				class:translate-y-2={!visible}
				class:opacity-100={visible}
				class:translate-y-0={visible}
			>
				{#each ['Omnivore', 'Vegetarian', 'Vegan', 'Pescatarian'] as diet}
					<span class="px-3 py-1 text-xs md:text-sm text-[#5C5A56] bg-white/60 rounded-full border border-[#E8E6E1] backdrop-blur-sm">
						{diet}
					</span>
				{/each}
			</div>
		</div>
	</Container>
</Section>
