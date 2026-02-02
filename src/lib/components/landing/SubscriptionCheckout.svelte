<script lang="ts">
	/**
	 * SubscriptionCheckout - Commitment Threshold Pattern with Discount Code Support
	 *
	 * Perceptual Engineering Principles Applied:
	 * - Visible State: Locked/unlocked is perceptually obvious
	 * - Causality: Agreement → unlock is immediate (<100ms)
	 * - Recognition > Recall: Key terms shown, not linked to PDF
	 * - Intentionality: Two-step prevents accidental commitment
	 * - Working Memory: Only essential terms (~3 chunks)
	 * - Discount Integration: Always-visible on desktop, collapsible on mobile
	 * - Price Animation: Discount impact perceptually highlighted
	 */

	import DiscountCodeInput from './DiscountCodeInput.svelte';
	import Input from '$lib/components/ui/input.svelte';

	interface Props {
		onPayPalCheckout: (reservationId?: string) => void;
		loading?: boolean;
		price?: string;
		email?: string; // Customer email for discount reservations
	}

	let {
		onPayPalCheckout,
		loading = false,
		price = '$500/month',
		email = ''
	}: Props = $props();

	// Commitment threshold state
	let agreed = $state(false);

	// Email state
	let customerEmail = $state(email || '');
	let emailError = $state<string | null>(null);

	// Discount state
	let reservationId = $state<string | undefined>(undefined);
	let discountedPrice = $state<number | undefined>(undefined);
	let originalPrice = $state<number>(500); // Default price, extracted from price prop
	let showPriceAnimation = $state(false);

	// Extract numeric price from price string (e.g., "$500/month" -> 500)
	$effect(() => {
		const match = price.match(/\$(\d+)/);
		if (match) {
			originalPrice = parseInt(match[1], 10);
		}
	});

	// Email validation regex
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

	// Derived: email is valid
	let isEmailValid = $derived(emailRegex.test(customerEmail.trim()));

	// Derived: buttons unlocked when agreement is checked
	let unlocked = $derived(agreed && !loading);

	// Derived: final price to display
	let finalPrice = $derived(discountedPrice ?? originalPrice);
	let hasDiscount = $derived(discountedPrice !== undefined && discountedPrice !== originalPrice);

	/**
	 * Validate email
	 */
	function validateEmail() {
		const trimmed = customerEmail.trim();
		if (!trimmed) {
			emailError = 'Email is required';
			return false;
		}
		if (!emailRegex.test(trimmed)) {
			emailError = 'Please enter a valid email address';
			return false;
		}
		emailError = null;
		return true;
	}

	/**
	 * Handle discount code applied
	 */
	function handleDiscountApplied(resId: string, newPrice: number) {
		reservationId = resId;
		discountedPrice = newPrice;

		// Trigger price animation
		showPriceAnimation = true;
		setTimeout(() => {
			showPriceAnimation = false;
		}, 300);
	}

	/**
	 * Handle discount code removed
	 */
	function handleDiscountRemoved() {
		reservationId = undefined;
		discountedPrice = undefined;
	}

	/**
	 * Handle PayPal checkout with optional reservation ID
	 */
	function handleCheckout() {
		onPayPalCheckout(reservationId);
	}
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
				<div class="flex-1">
					<div class="font-medium text-[#1A1816]" class:price-updating={showPriceAnimation}>
						{#if hasDiscount}
							<span class="price-original">${originalPrice}/month</span>
							<span class="price-discounted ml-2">${finalPrice}/month</span>
						{:else}
							{price}, billed monthly
						{/if}
					</div>
					<p class="text-sm text-[#5C5A56]">First charge today</p>
					{#if hasDiscount}
						<p class="text-xs text-[#059669] mt-1 savings-badge inline-block">
							You save: ${(originalPrice - finalPrice).toFixed(2)}
						</p>
					{/if}
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

		<!-- Email Input Section -->
		<div class="mb-5 pt-3 border-t-2 border-[#E8E6E1]">
			<label for="customer-email" class="text-sm font-medium text-[#1A1816] block mb-2">
				Email Address <span class="text-[#C85C35]">*</span>
			</label>
			<Input
				id="customer-email"
				type="email"
				placeholder="your.email@example.com"
				bind:value={customerEmail}
				error={emailError !== null}
				onblur={validateEmail}
				class="w-full"
				aria-label="Email address"
				required
			/>
			{#if emailError}
				<p class="text-xs text-[#C85C35] mt-1">{emailError}</p>
			{/if}
			<p class="text-xs text-[#5C5A56] mt-1">Required for discount codes and order confirmation</p>
		</div>

		<!-- Discount Code Section -->
		<div class="mb-5 pt-3 border-t-2 border-[#E8E6E1]">
			<DiscountCodeInput
				planPrice={originalPrice}
				onDiscountApplied={handleDiscountApplied}
				onDiscountRemoved={handleDiscountRemoved}
				email={customerEmail}
				disabled={!isEmailValid}
			/>
		</div>

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
			onclick={handleCheckout}
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

<style>
	/* Price animation styles */
	:global(.price-updating) {
		animation: price-highlight 200ms ease-out;
	}

	@keyframes price-highlight {
		0% {
			background: transparent;
		}
		50% {
			background: #fef3c7;
			transform: scale(1.05);
		}
		100% {
			background: transparent;
			transform: scale(1);
		}
	}

	:global(.price-original) {
		text-decoration: line-through;
		color: #9ca3af;
	}

	:global(.price-discounted) {
		color: #059669;
		font-weight: 600;
	}

	:global(.savings-badge) {
		animation: badge-appear 300ms ease-out;
		background: #d1fae5;
		color: #059669;
		padding: 4px 8px;
		border-radius: 4px;
	}

	@keyframes badge-appear {
		0% {
			opacity: 0;
			transform: translateY(-10px);
		}
		100% {
			opacity: 1;
			transform: translateY(0);
		}
	}
</style>
