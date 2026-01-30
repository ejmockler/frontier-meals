<script lang="ts">
	import { Section, Container, SectionHeader, Heading, Text } from '$lib/components/landing';
	import { scrollReveal } from '$lib/actions/scrollReveal';

	const steps = [
		{
			number: 1,
			title: 'Subscribe',
			description:
				'Sign up for a monthly subscription. Unlimited weekday lunches with one simple payment.',
			icon: '💳'
		},
		{
			number: 2,
			title: 'Manage on Telegram',
			description:
				'Set your dietary preferences and cancel specific meals if needed—all through Telegram.',
			icon: '💬'
		},
		{
			number: 3,
			title: 'Get Your QR Code',
			description:
				'Receive your unique QR code via email at noon. Scan, pick up, and enjoy your meal.',
			icon: '📱'
		}
	];
</script>

<Section>
	<Container>
		<SectionHeader
			headline="How It Works"
			subhead="Three simple steps to never worry about lunch again"
		/>

		<!-- Steps Grid -->
		<div class="grid grid-cols-1 md:grid-cols-3 gap-8 lg:gap-12">
			{#each steps as step, i}
				<div class="relative text-center" use:scrollReveal={{ delay: i * 100 }}>
					<!-- Connecting Line (desktop only) -->
					{#if i < steps.length - 1}
						<div
							class="hidden md:block absolute top-12 left-1/2 w-full h-0.5 bg-[#D9D7D2]"
						></div>
					{/if}

					<!-- Step Number with Icon -->
					<div class="relative inline-flex flex-col items-center">
						<div
							class="w-24 h-24 rounded-full bg-[#E8E6E1] border-4 border-[#D9D7D2] flex items-center justify-center mb-6 relative z-10"
						>
							<span class="text-4xl">{step.icon}</span>
						</div>

						<!-- Step number badge -->
						<div
							class="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-[#E67E50] text-white font-bold text-sm flex items-center justify-center shadow-md"
						>
							{step.number}
						</div>
					</div>

					<Heading level={3} class="mb-3">
						{step.title}
					</Heading>

					<Text color="secondary" class="max-w-xs mx-auto">
						{step.description}
					</Text>
				</div>
			{/each}
		</div>
	</Container>
</Section>
