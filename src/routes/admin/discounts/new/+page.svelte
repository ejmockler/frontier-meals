<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';

	export let data: PageData;
	export let form;

	// Form state
	let code = '';
	let plan_id = '';
	let max_uses = '';
	let valid_until = '';
	let max_uses_per_customer = 1;
	let admin_notes = '';
	let showLimits = false;
	let isSubmitting = false;

	// Selected plan for preview
	$: selectedPlan = data.plans.find((p) => p.id === plan_id);

	// Default plan for calculating savings
	$: defaultPlan = data.plans.find((p) => p.is_default);

	// Calculate savings from price delta
	$: savings = defaultPlan && selectedPlan ? Math.max(0, defaultPlan.price_amount - selectedPlan.price_amount) : 0;
	$: savingsPercent = defaultPlan && savings > 0 ? Math.round((savings / defaultPlan.price_amount) * 100) : 0;

	function generateCode() {
		const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
		let result = '';
		for (let i = 0; i < 8; i++) {
			result += chars.charAt(Math.floor(Math.random() * chars.length));
		}
		code = result;
	}

	function cancel() {
		goto('/admin/discounts');
	}
</script>

<svelte:head>
	<title>Create Discount Code - Frontier Meals Admin</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-extrabold tracking-tight text-[#1A1816]">
				Create Discount Code
			</h1>
			<p class="text-[#5C5A56] mt-2">
				Map a promotional code to a discounted subscription plan
			</p>
		</div>
		<button
			on:click={cancel}
			class="px-6 py-3 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] font-bold rounded-sm transition-colors"
		>
			← Back to List
		</button>
	</div>

	<!-- Error message -->
	{#if form?.error}
		<div
			class="bg-[#D97F3E] border-2 border-[#D97F3E]/70 text-white p-4 rounded-sm"
		>
			<p class="font-bold">{form.error}</p>
		</div>
	{/if}

	<!-- Info banner -->
	<div class="bg-[#F0F9FF] border-2 border-[#2D9B9B]/30 rounded-sm p-4">
		<div class="flex items-start gap-3">
			<svg class="w-5 h-5 text-[#2D9B9B] flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
			</svg>
			<div class="text-sm">
				<p class="font-bold text-[#1A1816]">How discounts work</p>
				<p class="text-[#5C5A56] mt-1">
					Each discount code maps to a PayPal plan with pre-configured pricing.
					The discount is calculated automatically as the difference between the default plan price
					and the selected discount plan price.
				</p>
			</div>
		</div>
	</div>

	<!-- Two-column layout -->
	<form
		method="POST"
		action="?/createDiscount"
		use:enhance={() => {
			isSubmitting = true;
			return async ({ result, update }) => {
				isSubmitting = false;
				if (result.type === 'redirect') {
					// Success - redirect happens automatically with message
					goto(`${result.location}?created=${encodeURIComponent(code)}`);
				} else {
					// Error - update form to show error, scroll to top
					await update();
					window.scrollTo({ top: 0, behavior: 'smooth' });
				}
			};
		}}
		class="grid grid-cols-1 lg:grid-cols-5 gap-6"
	>
		<input type="hidden" name="csrf_token" value={data.csrfToken} />

		<!-- Left column: Form (60% = 3 cols) -->
		<div class="lg:col-span-3 space-y-6">
			<div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
				<h2 class="text-xl font-extrabold tracking-tight text-[#1A1816] mb-6">
					Discount Details
				</h2>

				<div class="space-y-4">
					<!-- Code input with generate button -->
					<div>
						<label
							for="code"
							class="block text-sm font-bold text-[#1A1816] mb-2"
						>
							Discount Code
						</label>
						<div class="flex gap-2">
							<input
								id="code"
								name="code"
								type="text"
								bind:value={code}
								required
								placeholder="SUMMER50"
								class="flex-1 px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white uppercase"
							/>
							<button
								type="button"
								on:click={generateCode}
								class="px-4 py-2 text-[#E67E50] bg-[#E67E50]/10 border-2 border-[#E67E50]/20 hover:bg-[#E67E50]/20 font-bold rounded-sm transition-colors"
							>
								Generate
							</button>
						</div>
						<p class="text-xs text-[#5C5A56] mt-1">
							Alphanumeric only (A-Z, 0-9)
						</p>
					</div>

					<!-- Plan dropdown -->
					<div>
						<label
							for="plan_id"
							class="block text-sm font-bold text-[#1A1816] mb-2"
						>
							Discount Plan
						</label>
						<select
							id="plan_id"
							name="plan_id"
							bind:value={plan_id}
							required
							class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
						>
							<option value="">Select a plan...</option>
							{#each data.plans as plan}
								<option value={plan.id}>
									{plan.business_name} — ${plan.price_amount}/{plan.billing_cycle}
									{#if plan.is_default}
										(Default)
									{:else if defaultPlan}
										(Save ${(defaultPlan.price_amount - plan.price_amount).toFixed(2)})
									{/if}
									{#if !plan.paypal_plan_id_sandbox}
										— ⚠️ Live only
									{/if}
								</option>
							{/each}
						</select>
						<p class="text-sm text-gray-500 mt-1">
							Plans marked "Live only" will not work in sandbox/testing mode.
							<a href="/admin/discounts/sync-plans" class="text-blue-600 underline">
								Configure sandbox plan IDs
							</a>
						</p>
						{#if selectedPlan && !selectedPlan.paypal_plan_id_sandbox}
							<div class="bg-yellow-50 border border-yellow-200 rounded p-3 mt-2">
								<p class="text-yellow-800 text-sm">
									⚠️ This plan has no sandbox Plan ID configured.
									Discount codes using this plan will fail during testing.
								</p>
							</div>
						{/if}
					</div>

					<!-- Collapsible Limits section -->
					<div class="pt-4 border-t-2 border-[#D9D7D2]">
						<button
							type="button"
							on:click={() => (showLimits = !showLimits)}
							class="flex items-center gap-2 text-sm font-bold text-[#1A1816] hover:text-[#E67E50] transition-colors"
						>
							<svg
								class="w-4 h-4 transition-transform {showLimits
									? 'rotate-90'
									: ''}"
								fill="none"
								viewBox="0 0 24 24"
								stroke="currentColor"
							>
								<path
									stroke-linecap="round"
									stroke-linejoin="round"
									stroke-width="2"
									d="M9 5l7 7-7 7"
								/>
							</svg>
							Limits (optional)
						</button>

						{#if showLimits}
							<div class="mt-4 space-y-4 pl-6">
								<div>
									<label
										for="max_uses"
										class="block text-sm font-bold text-[#1A1816] mb-2"
									>
										Max Uses
									</label>
									<input
										id="max_uses"
										name="max_uses"
										type="number"
										min="1"
										bind:value={max_uses}
										placeholder="Unlimited"
										class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
									/>
									<p class="text-xs text-[#5C5A56] mt-1">
										Leave blank for unlimited uses
									</p>
								</div>

								<div>
									<label
										for="valid_until"
										class="block text-sm font-bold text-[#1A1816] mb-2"
									>
										Expiration Date
									</label>
									<input
										id="valid_until"
										name="valid_until"
										type="date"
										bind:value={valid_until}
										class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
									/>
									<p class="text-xs text-[#5C5A56] mt-1">
										Leave blank for no expiration
									</p>
								</div>

								<div>
									<label
										for="max_uses_per_customer"
										class="block text-sm font-bold text-[#1A1816] mb-2"
									>
										Per Customer Limit
									</label>
									<input
										id="max_uses_per_customer"
										name="max_uses_per_customer"
										type="number"
										min="1"
										bind:value={max_uses_per_customer}
										required
										class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
									/>
									<p class="text-xs text-[#5C5A56] mt-1">
										How many times can one customer use this code
									</p>
								</div>
							</div>
						{/if}
					</div>

					<!-- Admin notes -->
					<div>
						<label
							for="admin_notes"
							class="block text-sm font-bold text-[#1A1816] mb-2"
						>
							Admin Notes
						</label>
						<textarea
							id="admin_notes"
							name="admin_notes"
							bind:value={admin_notes}
							rows="3"
							placeholder="Internal notes about this discount code..."
							class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
						></textarea>
					</div>
				</div>

				<!-- Form actions -->
				<div class="flex gap-3 mt-6 pt-6 border-t-2 border-[#D9D7D2]">
					<button
						type="button"
						on:click={cancel}
						class="flex-1 px-6 py-3 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] rounded-sm font-bold transition-colors"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={isSubmitting}
						class="flex-1 px-6 py-3 bg-[#E67E50] border-2 border-[#D97F3E] text-white font-bold rounded-sm hover:bg-[#D97F3E] hover:shadow-xl shadow-lg transition-all disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{#if isSubmitting}
							<span class="inline-flex items-center gap-2">
								<svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
								Creating...
							</span>
						{:else}
							Create Discount
						{/if}
					</button>
				</div>
			</div>
		</div>

		<!-- Right column: Preview (40% = 2 cols) -->
		<div class="lg:col-span-2">
			<div
				class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg sticky top-24"
			>
				<h2 class="text-xl font-extrabold tracking-tight text-[#1A1816] mb-6">
					Customer Preview
				</h2>

				{#if code && selectedPlan}
					<div class="space-y-4">
						<div class="text-sm text-[#5C5A56]">
							When customer enters: <strong class="text-[#1A1816]"
								>{code}</strong
							>
						</div>

						<!-- Preview card -->
						<div
							class="bg-[#D1FAE5] border-2 border-[#52A675] rounded-sm p-4"
						>
							<div class="flex items-start gap-2 mb-3">
								<svg
									class="w-5 h-5 text-[#52A675] flex-shrink-0 mt-0.5"
									fill="none"
									viewBox="0 0 24 24"
									stroke="currentColor"
								>
									<path
										stroke-linecap="round"
										stroke-linejoin="round"
										stroke-width="2"
										d="M5 13l4 4L19 7"
									/>
								</svg>
								<div class="flex-1">
									<p class="font-bold text-[#1A1816]">Discount applied!</p>
								</div>
							</div>

							<div class="space-y-2 pl-7">
								<p class="text-sm font-bold text-[#1A1816]">
									{selectedPlan.business_name}
								</p>
								<div class="flex items-baseline gap-2">
									{#if defaultPlan && savings > 0}
										<span class="text-sm text-[#5C5A56] line-through">
											${defaultPlan.price_amount.toFixed(2)}
										</span>
									{/if}
									<span class="text-2xl font-extrabold text-[#52A675]">
										${selectedPlan.price_amount.toFixed(2)}
									</span>
									<span class="text-sm text-[#5C5A56]">/{selectedPlan.billing_cycle}</span>
								</div>
								{#if savings > 0}
									<p class="text-sm font-bold text-[#52A675]">
										Save ${savings.toFixed(2)} ({savingsPercent}% off)
									</p>
								{:else}
									<p class="text-sm text-[#D97F3E] font-bold">
										No discount (same as default plan)
									</p>
								{/if}
							</div>
						</div>
					</div>
				{:else}
					<div class="text-center py-12 text-[#5C5A56]">
						<svg
							class="w-16 h-16 mx-auto mb-4 text-[#D9D7D2]"
							fill="none"
							viewBox="0 0 24 24"
							stroke="currentColor"
						>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
							/>
							<path
								stroke-linecap="round"
								stroke-linejoin="round"
								stroke-width="2"
								d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
							/>
						</svg>
						<p class="font-bold">Fill in the form to see preview</p>
						<p class="text-sm mt-1">
							Enter a code and select a discount plan
						</p>
					</div>
				{/if}
			</div>
		</div>
	</form>
</div>
