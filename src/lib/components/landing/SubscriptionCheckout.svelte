<script lang="ts">
	/**
	 * SubscriptionCheckout - Commitment Threshold Pattern
	 *
	 * Perceptual Engineering Principles Applied:
	 * - Visible State: Locked/unlocked is perceptually obvious
	 * - Causality: Agreement → unlock is immediate (<100ms)
	 * - Recognition > Recall: Key terms shown, not linked to PDF
	 * - Intentionality: Two-step prevents accidental commitment
	 * - Working Memory: Only essential terms (~3 chunks)
	 */

	interface Props {
		onPayPalCheckout: () => void;
		loading?: boolean;
		price?: string;
	}

	let {
		onPayPalCheckout,
		loading = false,
		price = '$500/month'
	}: Props = $props();

	// Commitment threshold state
	let agreed = $state(false);

	// Derived: buttons unlocked when agreement is checked
	let unlocked = $derived(agreed && !loading);
</script>

<div class="w-full max-w-md mx-auto">
	<!-- Commitment Card -->
	<div
		class="bg-white border-2 border-[#D9D7D2] rounded-md p-6 mb-6 shadow-sm transition-all duration-300"
		class:border-[#52A675]={agreed}
		class:shadow-md={agreed}
	>
		<!-- Header -->
		<div class="flex items-center gap-3 mb-4">
			<div
				class="w-10 h-10 rounded-md flex items-center justify-center transition-all duration-300"
				class:bg-[#E8E6E1]={!agreed}
				class:bg-[#52A675]={agreed}
			>
				<svg
					class="w-5 h-5 transition-colors duration-300"
					class:text-[#5C5A56]={!agreed}
					class:text-white={agreed}
					fill="none"
					stroke="currentColor"
					viewBox="0 0 24 24"
				>
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
					/>
				</svg>
			</div>
			<div>
				<h3 class="font-bold text-[#1A1816] text-lg">Subscription Agreement</h3>
				<p class="text-sm text-[#5C5A56]">Review before subscribing</p>
			</div>
		</div>

		<!-- Key Terms (Recognition, not Recall) -->
		<ul class="space-y-3 mb-5">
			<li class="flex items-start gap-3">
				<span class="flex-shrink-0 w-6 h-6 bg-[#E67E50]/10 text-[#E67E50] rounded flex items-center justify-center text-sm font-bold">$</span>
				<div>
					<p class="font-medium text-[#1A1816]">{price}, billed monthly</p>
					<p class="text-sm text-[#5C5A56]">First charge today</p>
				</div>
			</li>
			<li class="flex items-start gap-3">
				<span class="flex-shrink-0 w-6 h-6 bg-[#52A675]/10 text-[#52A675] rounded flex items-center justify-center text-sm">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
					</svg>
				</span>
				<div>
					<p class="font-medium text-[#1A1816]">Cancel anytime</p>
					<p class="text-sm text-[#5C5A56]">Via Telegram bot or email</p>
				</div>
			</li>
			<li class="flex items-start gap-3">
				<span class="flex-shrink-0 w-6 h-6 bg-[#3b82f6]/10 text-[#3b82f6] rounded flex items-center justify-center text-sm">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
					</svg>
				</span>
				<div>
					<p class="font-medium text-[#1A1816]">Full terms apply</p>
					<a
						href="/terms-and-privacy"
						target="_blank"
						class="text-sm text-[#C85C35] underline hover:text-[#A34A2A] focus:outline-none focus:ring-2 focus:ring-[#E67E50] rounded font-medium"
					>
						Read subscription agreement →
					</a>
				</div>
			</li>
		</ul>

		<!-- Agreement Checkbox (The Threshold) -->
		<label
			class="flex items-center gap-3 p-3 -mx-3 rounded-md cursor-pointer transition-colors duration-150 hover:bg-[#F5F3EF]"
		>
			<div class="relative flex-shrink-0">
				<input
					type="checkbox"
					bind:checked={agreed}
					class="peer sr-only"
				/>
				<div
					class="w-6 h-6 border-2 rounded transition-all duration-150 flex items-center justify-center"
					class:border-[#B8B6B1]={!agreed}
					class:bg-white={!agreed}
					class:border-[#52A675]={agreed}
					class:bg-[#52A675]={agreed}
				>
					{#if agreed}
						<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
						</svg>
					{/if}
				</div>
			</div>
			<span class="font-medium text-[#1A1816] select-none">
				I agree to the Subscription Agreement
			</span>
		</label>
	</div>

	<!-- Payment Button (Locked until threshold crossed) -->
	<div class="space-y-3">
		<!-- Subscribe Button -->
		<button
			onclick={onPayPalCheckout}
			disabled={!unlocked}
			class="w-full h-14 rounded-md font-bold text-lg transition-all duration-300 ease-out flex items-center justify-center gap-3 focus:outline-none focus:ring-2 focus:ring-offset-2 border-2"
			class:bg-[#E67E50]={unlocked}
			class:text-white={unlocked}
			class:border-[#D97F3E]={unlocked}
			class:shadow-lg={unlocked}
			class:hover:bg-[#D97F3E]={unlocked}
			class:hover:shadow-xl={unlocked}
			class:focus:ring-[#E67E50]={unlocked}
			class:cursor-pointer={unlocked}
			class:bg-[#E8E6E1]={!unlocked}
			class:text-[#8E8C87]={!unlocked}
			class:border-[#D9D7D2]={!unlocked}
			class:cursor-not-allowed={!unlocked}
			aria-disabled={!unlocked}
		>
			{#if loading}
				<svg class="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
					<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
					<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
				</svg>
				<span>Processing...</span>
			{:else}
				<span>Subscribe Now</span>
			{/if}
		</button>
	</div>

	<!-- Unlock hint (shows when locked) -->
	{#if !agreed}
		<p class="text-center text-sm text-[#8E8C87] mt-4 transition-opacity duration-300">
			Check the box above to continue
		</p>
	{/if}
</div>
