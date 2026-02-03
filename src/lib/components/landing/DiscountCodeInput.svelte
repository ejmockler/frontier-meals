<script lang="ts">
	/**
	 * DiscountCodeInput - Discount code validation component for checkout
	 *
	 * Perceptual Engineering Principles Applied:
	 * - Desktop: Always-visible optional input (no cognitive friction)
	 * - Mobile: Collapsible with enhanced tap targets (44×44pt minimum)
	 * - Immediate feedback: Loading/success/error states perceptually obvious
	 * - Price animation: Highlight discount impact with subtle motion
	 * - Session persistence: Remember validated code across navigation
	 * - URL parameter support: Auto-apply from ?code= parameter
	 *
	 * Features:
	 * 1. Input field with "Apply" button
	 * 2. Loading state during validation ("Checking code...")
	 * 3. Success state with discount display and price animation
	 * 4. Error state with helpful message and optional suggestion
	 * 5. Session persistence (remember validated code across page navigation)
	 * 6. URL parameter support (?code=SUMMER50)
	 */

	import { onMount } from 'svelte';
	import { page } from '$app/stores';
	import Input from '$lib/components/ui/input.svelte';
	import Button from '$lib/components/ui/button.svelte';
	import type { DiscountValidationResult } from '$lib/types/discount';

	interface Props {
		/** Current plan price (for calculating discounted price) */
		planPrice: number;
		/** Callback when discount is successfully applied */
		onDiscountApplied?: (reservationId: string, discountedPrice: number) => void;
		/** Callback when discount is removed */
		onDiscountRemoved?: () => void;
		/** Optional customer email (for reservation) */
		email?: string;
		/** Mobile breakpoint (default: 640px) */
		mobileBreakpoint?: number;
		/** Disable input until email is valid (only when discount applied) */
		disabled?: boolean;
		/** Callback to request email input focus */
		onEmailRequired?: () => void;
	}

	let {
		planPrice,
		onDiscountApplied,
		onDiscountRemoved,
		email = '',
		mobileBreakpoint = 640,
		disabled = false,
		onEmailRequired
	}: Props = $props();

	// Email validation
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	let isEmailValid = $derived(email ? emailRegex.test(email.trim()) : false);
	let needsEmail = $state(false);

	// Component state
	let code = $state('');
	let loading = $state(false);
	let expanded = $state(false);
	let isMobile = $state(false);

	// Validation result
	let validationResult = $state<DiscountValidationResult | null>(null);
	let isApplied = $derived(validationResult?.success === true);

	// Countdown timer state
	let expiresAt = $state<Date | null>(null);
	let timeRemaining = $state<string | null>(null);
	let isExpiringSoon = $state(false);
	let countdownInterval: NodeJS.Timeout | null = null;

	// Expiration message state
	let expirationMessage = $state<string | null>(null);

	// Session storage key
	const SESSION_KEY = 'discount_reservation';

	/**
	 * Load saved reservation from sessionStorage
	 */
	function loadSavedReservation() {
		try {
			const stored = sessionStorage.getItem(SESSION_KEY);
			if (!stored) return;

			const reservation = JSON.parse(stored);

			// Check if reservation is still valid (not expired)
			if (reservation.expires_at && new Date(reservation.expires_at) > new Date()) {
				// Restore the validated state
				validationResult = {
					success: true,
					reservation_id: reservation.reservation_id,
					plan: reservation.plan,
					discount: reservation.discount,
					original_price: reservation.original_price,
					savings: reservation.savings
				};
				code = reservation.code;
				expiresAt = new Date(reservation.expires_at);

				// Start countdown timer
				startCountdown();

				// Notify parent component with the discounted price (plan.price)
				const discountedPrice = reservation.plan?.price;
				if (onDiscountApplied && reservation.reservation_id && discountedPrice !== undefined) {
					onDiscountApplied(reservation.reservation_id, discountedPrice);
				}
			} else {
				// Expired - show message instead of silently clearing
				sessionStorage.removeItem(SESSION_KEY);
				expirationMessage = 'Your previous discount code expired. Please re-enter your code.';
			}
		} catch (error) {
			console.error('[DiscountCode] Error loading saved reservation:', error);
			sessionStorage.removeItem(SESSION_KEY);
		}
	}

	/**
	 * Save successful reservation to sessionStorage
	 */
	function saveReservation(result: DiscountValidationResult) {
		if (!result.success || !result.reservation_id) return;

		try {
			sessionStorage.setItem(
				SESSION_KEY,
				JSON.stringify({
					code: code.toUpperCase(),
					reservation_id: result.reservation_id,
					plan: result.plan,
					discount: result.discount,
					original_price: result.original_price,
					savings: result.savings,
					expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString() // 15 minutes
				})
			);
		} catch (error) {
			console.error('[DiscountCode] Error saving reservation:', error);
		}
	}

	/**
	 * Apply discount code from URL parameter
	 */
	async function applyCodeFromUrl() {
		const urlCode = $page.url.searchParams.get('code');
		if (urlCode) {
			code = urlCode;
			await validateCode();
		}
	}

	/**
	 * Validate and apply discount code
	 */
	async function validateCode() {
		if (!code.trim()) return;

		// If email not provided, prompt user to enter it first
		if (!email || !isEmailValid) {
			needsEmail = true;
			if (onEmailRequired) {
				onEmailRequired();
			}
			return;
		}

		needsEmail = false;
		loading = true;
		validationResult = null;
		expirationMessage = null;

		// Create abort controller with 10-second timeout
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), 10000);

		try {
			const response = await fetch('/api/discount/reserve', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					code: code.trim(),
					email: email || 'customer@example.com' // Fallback for now
				}),
				signal: controller.signal
			});

			clearTimeout(timeoutId); // Clear timeout on success

			// Handle HTTP status codes
			if (!response.ok) {
				if (response.status === 429) {
					const retryAfter = response.headers.get('Retry-After') || '60';
					validationResult = {
						success: false,
						error: {
							code: 'RATE_LIMITED',
							message: `Too many attempts. Please wait ${retryAfter} seconds.`
						}
					};
					return;
				}
				if (response.status >= 500) {
					validationResult = {
						success: false,
						error: {
							code: 'SERVER_ERROR',
							message: 'Server error. Please try again later.'
						}
					};
					return;
				}
			}

			const result: DiscountValidationResult = await response.json();
			validationResult = result;

			if (result.success) {
				// Set expiration time (15 minutes from now)
				expiresAt = new Date(Date.now() + 15 * 60 * 1000);

				// Save to sessionStorage
				saveReservation(result);

				// Start countdown timer
				startCountdown();

				// Notify parent component with the discounted price (plan.price)
				const discountedPrice = result.plan?.price;
				if (onDiscountApplied && result.reservation_id && discountedPrice !== undefined) {
					onDiscountApplied(result.reservation_id, discountedPrice);
				}
			}
		} catch (error) {
			clearTimeout(timeoutId);

			// Check if it was a timeout
			if (error instanceof Error && error.name === 'AbortError') {
				console.error('[DiscountCode] Request timed out');
				validationResult = {
					success: false,
					error: {
						code: 'TIMEOUT',
						message: 'Request timed out. Please check your connection and try again.'
					}
				};
			} else {
				console.error('[DiscountCode] Error validating code:', error);
				validationResult = {
					success: false,
					error: {
						code: 'INTERNAL_ERROR',
						message: 'Failed to validate code. Please try again.'
					}
				};
			}
		} finally {
			loading = false;
		}
	}

	/**
	 * Apply suggested code (from typo detection)
	 */
	async function applySuggestion() {
		if (!validationResult?.error?.suggestion) return;
		code = validationResult.error.suggestion;
		await validateCode();
	}

	/**
	 * Remove applied discount
	 */
	function removeDiscount() {
		validationResult = null;
		code = '';
		expiresAt = null;
		timeRemaining = null;
		isExpiringSoon = false;
		expirationMessage = null;
		stopCountdown();
		sessionStorage.removeItem(SESSION_KEY);
		if (onDiscountRemoved) {
			onDiscountRemoved();
		}
	}

	/**
	 * Start countdown timer
	 */
	function startCountdown() {
		stopCountdown(); // Clear any existing interval

		const updateCountdown = () => {
			if (!expiresAt) return;

			const now = new Date();
			const diff = expiresAt.getTime() - now.getTime();

			if (diff <= 0) {
				// Expired
				stopCountdown();
				timeRemaining = null;
				expirationMessage = 'Your discount code expired. Please re-apply.';
				removeDiscount();
				return;
			}

			// Calculate minutes and seconds
			const minutes = Math.floor(diff / 60000);
			const seconds = Math.floor((diff % 60000) / 1000);
			timeRemaining = `${minutes}:${seconds.toString().padStart(2, '0')}`;

			// Mark as expiring soon if less than 5 minutes
			isExpiringSoon = minutes < 5;
		};

		updateCountdown();
		countdownInterval = setInterval(updateCountdown, 1000);
	}

	/**
	 * Stop countdown timer
	 */
	function stopCountdown() {
		if (countdownInterval) {
			clearInterval(countdownInterval);
			countdownInterval = null;
		}
	}

	/**
	 * Handle window resize for responsive behavior
	 */
	function handleResize() {
		isMobile = window.innerWidth < mobileBreakpoint;
	}

	/**
	 * Toggle mobile expansion
	 */
	function toggleExpanded() {
		expanded = !expanded;
		if (expanded) {
			// Clear expiration message when user tries again
			expirationMessage = null;
		}
	}

	/**
	 * Handle code input change - clear expiration message
	 */
	function handleCodeInput() {
		if (expirationMessage) {
			expirationMessage = null;
		}
	}

	// Mount lifecycle
	onMount(() => {
		// Check screen size
		handleResize();
		window.addEventListener('resize', handleResize);

		// Load saved reservation
		loadSavedReservation();

		// Apply code from URL if present
		applyCodeFromUrl();

		return () => {
			window.removeEventListener('resize', handleResize);
			stopCountdown();
		};
	});
</script>

{#if isMobile}
	<!-- Mobile Layout: Collapsible -->
	<div class="w-full">
		<!-- Expiration message -->
		{#if expirationMessage}
			<div class="bg-[#fef3c7] border-2 border-[#f59e0b]/30 rounded-md p-3 mb-3">
				<p class="text-sm text-[#92400e] flex items-start gap-2">
					<svg class="w-4 h-4 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span>{expirationMessage}</span>
				</p>
			</div>
		{/if}

		{#if !expanded && !isApplied}
			<!-- Collapsed state: Enhanced tap target - always accessible -->
			<button
				onclick={toggleExpanded}
				class="w-full min-h-[44px] py-3 px-4 bg-white border-2 rounded-md text-sm font-medium transition-all border-[#D9D7D2] text-[#5C5A56] hover:bg-[#F5F3EF] hover:border-[#B8B6B1] active:scale-[0.98] cursor-pointer"
				aria-label="Enter promo code"
			>
				Have a promo code? Tap to enter
			</button>
		{:else if expanded && !isApplied}
			<!-- Expanded state: Input + Apply -->
			<div class="space-y-3">
				<Input
					type="text"
					placeholder="Enter code"
					bind:value={code}
					disabled={loading}
					class="text-base"
					aria-label="Discount code"
					autofocus
					oninput={handleCodeInput}
				/>
				{#if needsEmail && !isEmailValid}
					<!-- Perceptual prompt: Email needed for this action -->
					<div class="bg-[#fef3c7] border border-[#f59e0b]/30 rounded px-3 py-2 text-sm text-[#92400e] flex items-center gap-2">
						<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span>Enter your email below to apply this code</span>
					</div>
				{/if}
				<div class="flex gap-2">
					<Button
						variant="default"
						class="flex-1"
						onclick={validateCode}
						disabled={loading || !code.trim()}
					>
						{#if loading}
							<svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
								<circle
									class="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									stroke-width="4"
								></circle>
								<path
									class="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
							<span>Checking...</span>
						{:else}
							Apply Code
						{/if}
					</Button>
					<Button variant="ghost" class="px-4" onclick={toggleExpanded}>
						Cancel
					</Button>
				</div>
			</div>
		{/if}

		<!-- Success State (Mobile) -->
		{#if isApplied && validationResult}
			<div class="bg-[#d1fae5] border-2 border-[#059669]/30 rounded-md p-4 space-y-3">
				<div class="flex items-start justify-between">
					<div class="flex items-start gap-2">
						<svg class="w-5 h-5 text-[#059669] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
						</svg>
						<div>
							<p class="font-bold text-[#1A1816] text-sm">
								{code.toUpperCase()}
							</p>
							<p class="text-xs text-[#059669]">
								{#if validationResult.savings && validationResult.savings > 0}
									Save ${validationResult.savings.toFixed(2)} ({validationResult.savings_percent}% off)
								{:else}
									Applied
								{/if}
							</p>
							{#if timeRemaining}
								<p class="text-xs mt-1" class:text-[#d97706]={isExpiringSoon} class:text-[#5C5A56]={!isExpiringSoon}>
									Code reserved for {timeRemaining}
								</p>
							{/if}
						</div>
					</div>
					<button
						onclick={removeDiscount}
						class="text-[#5C5A56] hover:text-[#1A1816] p-1"
						aria-label="Remove discount"
					>
						<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
						</svg>
					</button>
				</div>

				<!-- Savings display -->
				{#if validationResult.savings && validationResult.savings > 0}
					<div class="bg-white/80 rounded px-3 py-2">
						<p class="text-xs text-[#5C5A56]">You save:</p>
						<p class="text-lg font-bold text-[#059669]">
							${validationResult.savings.toFixed(2)}
						</p>
					</div>
				{/if}
			</div>
		{/if}

		<!-- Error State (Mobile) -->
		{#if !isApplied && validationResult?.error}
			<div class="bg-[#fef3c7] border-2 border-[#f59e0b]/30 rounded-md p-4 space-y-3">
				<div class="flex items-start gap-2">
					<svg class="w-5 h-5 text-[#d97706] mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
					<p class="text-sm text-[#92400e]">
						{validationResult.error.message}
					</p>
				</div>

				<!-- Suggestion buttons -->
				{#if validationResult.error.suggestion}
					<Button
						variant="outline"
						size="sm"
						class="w-full"
						onclick={applySuggestion}
					>
						Apply {validationResult.error.suggestion}
					</Button>
				{/if}

				<Button
					variant="ghost"
					size="sm"
					class="w-full"
					onclick={() => { validationResult = null; code = ''; }}
				>
					Try different code
				</Button>
			</div>
		{/if}
	</div>
{:else}
	<!-- Desktop Layout: Always-visible optional input -->
	<div class="space-y-4">
		<!-- Expiration message -->
		{#if expirationMessage}
			<div class="bg-[#fef3c7] border-2 border-[#f59e0b]/30 rounded-lg px-3 py-2">
				<p class="text-sm text-[#92400e] flex items-start gap-2">
					<svg class="w-4 h-4 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span>{expirationMessage}</span>
				</p>
			</div>
		{/if}

		<div class="flex items-start justify-between">
			<label for="discount-code" class="text-sm font-medium text-[#1A1816]">
				Promo Code <span class="text-[#8E8C87]">(optional)</span>
			</label>
			{#if loading}
				<span class="text-xs text-[#5C5A56] flex items-center gap-1">
					<svg class="animate-spin h-3 w-3" fill="none" viewBox="0 0 24 24">
						<circle
							class="opacity-25"
							cx="12"
							cy="12"
							r="10"
							stroke="currentColor"
							stroke-width="4"
						></circle>
						<path
							class="opacity-75"
							fill="currentColor"
							d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
						></path>
					</svg>
					Checking code...
				</span>
			{/if}
		</div>

		{#if !isApplied}
			<!-- Input state - always accessible -->
			<div class="flex gap-2">
				<Input
					id="discount-code"
					type="text"
					placeholder="Enter code"
					bind:value={code}
					disabled={loading}
					error={validationResult?.success === false}
					class="flex-1"
					aria-label="Discount code"
					oninput={handleCodeInput}
				/>
				<Button
					variant="outline"
					onclick={validateCode}
					disabled={loading || !code.trim()}
				>
					Apply
				</Button>
			</div>
			{#if needsEmail && !isEmailValid}
				<!-- Perceptual prompt: Email needed -->
				<div class="bg-[#fef3c7] border border-[#f59e0b]/30 rounded px-3 py-2 text-sm text-[#92400e] flex items-center gap-2">
					<svg class="w-4 h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
					</svg>
					<span>Enter your email below to apply this code</span>
				</div>
			{/if}
		{:else}
			<!-- Applied state -->
			<div class="flex gap-2">
				<div class="flex-1 bg-[#d1fae5] border-2 border-[#059669]/30 rounded-lg px-4 py-2.5 flex items-center gap-2">
					<svg class="w-5 h-5 text-[#059669]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
					</svg>
					<span class="font-bold text-[#1A1816]">{code.toUpperCase()}</span>
				</div>
				<Button variant="ghost" onclick={removeDiscount} aria-label="Remove discount">
					<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
					</svg>
				</Button>
			</div>
		{/if}

		<!-- Success message -->
		{#if isApplied && validationResult}
			<div class="bg-[#d1fae5]/50 rounded-lg px-3 py-2 text-sm">
				<p class="text-[#059669]">
					{#if validationResult.savings && validationResult.savings > 0}
						✓ Save ${validationResult.savings.toFixed(2)} ({validationResult.savings_percent}% off)
					{:else}
						✓ Code applied
					{/if}
				</p>
				{#if timeRemaining}
					<p class="text-xs mt-1" class:text-[#d97706]={isExpiringSoon} class:text-[#5C5A56]={!isExpiringSoon}>
						Code reserved for {timeRemaining}
					</p>
				{/if}
			</div>
		{/if}

		<!-- Error message -->
		{#if !isApplied && validationResult?.error}
			<div class="bg-[#fef3c7] border-2 border-[#f59e0b]/30 rounded-lg px-3 py-2 space-y-2">
				<p class="text-sm text-[#92400e] flex items-start gap-2">
					<svg class="w-4 h-4 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
					</svg>
					<span>{validationResult.error.message}</span>
				</p>

				<!-- Suggestion buttons -->
				{#if validationResult.error.suggestion}
					<div class="flex gap-2">
						<Button
							variant="outline"
							size="sm"
							onclick={applySuggestion}
						>
							Apply {validationResult.error.suggestion}
						</Button>
						<Button
							variant="ghost"
							size="sm"
							onclick={() => { validationResult = null; code = ''; }}
						>
							Try different code
						</Button>
					</div>
				{/if}
			</div>
		{/if}
	</div>
{/if}

<style>
	/* Price animation styles - to be used by parent component */
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
