<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { toasts } from '$lib/stores/toast';
	import type { SubscriptionPlan } from '$lib/types/discount';

	export let data: PageData;
	export let form;

	// Check if we're loading data (during invalidation/refresh)
	$: isLoadingData = isRefreshingData;

	// Form state
	let embedInputLive = '';
	let embedInputSandbox = '';
	let extractedPlanIdLive = '';
	let extractedPlanIdSandbox = '';
	let businessName = '';
	let billingCycle = 'monthly';
	let isDefault = false;

	// Edit state
	let editingPlan: SubscriptionPlan | null = null;
	let showDeleteConfirm = false;
	let planToDelete: SubscriptionPlan | null = null;

	// Loading states
	let isSubmitting = false;
	let syncingPlanId: string | null = null;
	let isDeleting = false;
	let isRefreshingData = false;

	// Extract PayPal Plan ID from URL or embed code
	function extractPlanId(input: string): string {
		const planIdRegex = /P-[A-Z0-9]{20,}/g;
		const matches = input.match(planIdRegex);
		return matches && matches.length > 0 ? matches[0] : '';
	}

	function handleLiveInput() {
		extractedPlanIdLive = extractPlanId(embedInputLive);
		if (extractedPlanIdLive) {
			toasts.show('Live Plan ID extracted', 'success');
		}
	}

	function handleSandboxInput() {
		extractedPlanIdSandbox = extractPlanId(embedInputSandbox);
		if (extractedPlanIdSandbox) {
			toasts.show('Sandbox Plan ID extracted', 'success');
		}
	}

	// Clear form
	function clearForm() {
		embedInputLive = '';
		embedInputSandbox = '';
		extractedPlanIdLive = '';
		extractedPlanIdSandbox = '';
		businessName = '';
		billingCycle = 'monthly';
		isDefault = false;
		editingPlan = null;
	}

	// Start editing a plan
	function startEdit(plan: SubscriptionPlan) {
		editingPlan = plan;
		embedInputLive = '';
		embedInputSandbox = '';
		extractedPlanIdLive = plan.paypal_plan_id_live;
		extractedPlanIdSandbox = plan.paypal_plan_id_sandbox || '';
		businessName = plan.business_name;
		billingCycle = plan.billing_cycle;
		isDefault = plan.is_default;
		window.scrollTo({ top: 0, behavior: 'smooth' });
	}

	// Cancel editing
	function cancelEdit() {
		clearForm();
	}

	// Confirm delete
	function confirmDelete(plan: SubscriptionPlan) {
		planToDelete = plan;
		showDeleteConfirm = true;
	}

	// Close delete modal
	function closeDeleteModal() {
		showDeleteConfirm = false;
		planToDelete = null;
	}

	// Truncate Plan ID for display
	function truncatePlanId(planId: string | null): string {
		if (!planId) return '—';
		return planId.slice(0, 10) + '...';
	}

	// Handle form response
	$: if (form?.success) {
		clearForm();
		toasts.show(form.message || 'Action completed successfully', 'success');
		isRefreshingData = true;
		setTimeout(async () => {
			await invalidate('app:subscription-plans');
			// Keep skeleton visible for a brief moment to ensure smooth transition
			setTimeout(() => {
				isRefreshingData = false;
			}, 100);
		}, 500);
	} else if (form?.error) {
		toasts.show(form.error, 'error', 5000);
	}
</script>

<svelte:head>
	<title>Sync Subscription Plans - Frontier Meals Admin</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page header -->
	<div>
		<div class="flex items-center gap-3 mb-2">
			<a
				href="/admin/discounts"
				class="text-[#5C5A56] hover:text-[#1A1816] transition-colors"
				aria-label="Back to Discounts"
			>
				<svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
					<path
						stroke-linecap="round"
						stroke-linejoin="round"
						stroke-width="2"
						d="M15 19l-7-7 7-7"
					/>
				</svg>
			</a>
			<h1 class="text-3xl font-extrabold tracking-tight text-[#1A1816]">
				Sync Subscription Plans
			</h1>
		</div>
		<p class="text-[#5C5A56] ml-9">
			Import your PayPal subscription plans for both Live and Sandbox environments.
		</p>
	</div>

	<!-- Add New Plan Section -->
	<div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-6 shadow-lg">
		<h2 class="text-xl font-extrabold tracking-tight text-[#1A1816] mb-4">
			{editingPlan ? 'Edit Plan' : 'Add New Plan'}
		</h2>

		<form
			method="POST"
			action="?/{editingPlan ? 'updatePlan' : 'createPlan'}"
			use:enhance={() => {
				isSubmitting = true;
				return async ({ result, update }) => {
					isSubmitting = false;
					await update();
				};
			}}
			class="space-y-4"
		>
			{#if data.csrfToken}
				<input type="hidden" name="csrf_token" value={data.csrfToken} />
			{/if}

			{#if editingPlan}
				<input type="hidden" name="plan_id" value={editingPlan.id} />
			{/if}

			<!-- Environment Plan IDs -->
			<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
				<!-- Live Plan ID -->
				<div class="p-4 bg-[#52A675]/5 border-2 border-[#52A675]/30 rounded-sm">
					<div class="flex items-center gap-2 mb-3">
						<span class="px-2 py-0.5 text-xs font-bold rounded-sm bg-[#52A675] text-white">
							LIVE
						</span>
						<span class="text-sm font-bold text-[#1A1816]">Production Plan ID</span>
					</div>

					{#if !editingPlan}
						<textarea
							bind:value={embedInputLive}
							on:input={handleLiveInput}
							placeholder="Paste PayPal plan URL or button embed code..."
							rows="2"
							class="w-full px-3 py-2 text-sm border-2 border-[#52A675]/30 rounded-sm focus:ring-2 focus:ring-[#52A675] focus:border-[#52A675] outline-none font-medium text-[#1A1816] bg-white mb-2"
						></textarea>
					{/if}

					{#if extractedPlanIdLive}
						<div class="flex items-center gap-2 p-2 bg-[#52A675]/10 rounded-sm">
							<svg class="w-4 h-4 text-[#52A675] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
							</svg>
							<span class="font-mono text-xs text-[#1A1816]">{extractedPlanIdLive}</span>
						</div>
					{:else if !editingPlan}
						<p class="text-xs text-[#5C5A56]">Required for production checkout</p>
					{/if}

					<input type="hidden" name="paypal_plan_id_live" value={extractedPlanIdLive} />
				</div>

				<!-- Sandbox Plan ID -->
				<div class="p-4 bg-[#E67E50]/5 border-2 border-[#E67E50]/30 rounded-sm">
					<div class="flex items-center gap-2 mb-3">
						<span class="px-2 py-0.5 text-xs font-bold rounded-sm bg-[#E67E50] text-white">
							SANDBOX
						</span>
						<span class="text-sm font-bold text-[#1A1816]">Testing Plan ID</span>
						<span class="text-xs text-[#5C5A56]">(optional)</span>
					</div>

					<textarea
						bind:value={embedInputSandbox}
						on:input={handleSandboxInput}
						placeholder="Paste PayPal sandbox plan URL..."
						rows="2"
						class="w-full px-3 py-2 text-sm border-2 border-[#E67E50]/30 rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white mb-2"
					></textarea>

					{#if extractedPlanIdSandbox}
						<div class="flex items-center gap-2 p-2 bg-[#E67E50]/10 rounded-sm">
							<svg class="w-4 h-4 text-[#E67E50] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
								<path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd" />
							</svg>
							<span class="font-mono text-xs text-[#1A1816]">{extractedPlanIdSandbox}</span>
						</div>
					{:else}
						<p class="text-xs text-[#5C5A56]">Optional - for testing discount codes</p>
					{/if}

					<input type="hidden" name="paypal_plan_id_sandbox" value={extractedPlanIdSandbox} />
				</div>
			</div>

			<!-- Business Name -->
			<div>
				<label for="business_name" class="block text-sm font-bold text-[#1A1816] mb-2">
					Friendly Name:
				</label>
				<input
					id="business_name"
					type="text"
					name="business_name"
					bind:value={businessName}
					placeholder="Premium - Monthly ($29/mo)"
					required
					class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
				/>
			</div>

			<!-- Auto-Detected Pricing Info -->
			{#if !editingPlan}
				<div class="p-4 bg-[#2D9B9B]/5 border-2 border-[#2D9B9B]/30 rounded-sm">
					<div class="flex items-center gap-2 mb-1">
						<svg class="w-5 h-5 text-[#2D9B9B]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
						</svg>
						<span class="text-sm font-bold text-[#1A1816]">Pricing Auto-Detected from PayPal</span>
					</div>
					<p class="text-xs text-[#5C5A56]">
						Price and trial period will be extracted from the PayPal plan's billing cycles on submit.
					</p>
				</div>
			{:else}
				<div class="p-4 bg-[#E8E6E1]/50 border-2 border-[#D9D7D2] rounded-sm">
					<div class="flex items-center gap-2 mb-1">
						<svg class="w-4 h-4 text-[#5C5A56]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
							<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
						</svg>
						<span class="text-sm font-bold text-[#5C5A56]">Pricing is read-only</span>
					</div>
					<p class="text-xs text-[#5C5A56]">
						Pricing is tied to the PayPal plan. To use different pricing, create a new plan.
					</p>
					<div class="mt-2 text-sm font-medium text-[#1A1816]">
						{#if editingPlan.trial_price_amount != null && editingPlan.trial_duration_months != null}
							${editingPlan.trial_price_amount.toFixed(2)}/mo for {editingPlan.trial_duration_months} {editingPlan.trial_duration_months === 1 ? 'month' : 'months'},
							then ${editingPlan.price_amount.toFixed(2)}/mo
						{:else}
							${editingPlan.price_amount.toFixed(2)}/mo
						{/if}
					</div>
				</div>
			{/if}

			<!-- Billing Cycle -->
			<div>
				<label for="billing_cycle" class="block text-sm font-bold text-[#1A1816] mb-2">
					Billing Cycle:
				</label>
				<select
					id="billing_cycle"
					name="billing_cycle"
					bind:value={billingCycle}
					required
					class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
				>
					<option value="monthly">Monthly</option>
					<option value="annual">Annual</option>
				</select>
			</div>

			<!-- Default Plan Checkbox -->
			<div class="flex items-center gap-2">
				<input
					id="is_default"
					type="checkbox"
					name="is_default"
					bind:checked={isDefault}
					value="true"
					class="w-4 h-4 border-2 border-[#B8B6B1] rounded text-[#E67E50] focus:ring-2 focus:ring-[#E67E50]"
				/>
				<label for="is_default" class="text-sm font-medium text-[#1A1816]">
					Set as default plan (used when no discount code)
				</label>
			</div>

			<!-- Form Actions -->
			<div class="flex gap-3 justify-end pt-4">
				{#if editingPlan}
					<button
						type="button"
						on:click={cancelEdit}
						class="px-6 py-2 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] rounded-sm font-bold transition-colors"
					>
						Cancel
					</button>
				{:else}
					<button
						type="button"
						on:click={clearForm}
						class="px-6 py-2 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] rounded-sm font-bold transition-colors"
					>
						Clear
					</button>
				{/if}
				<button
					type="submit"
					disabled={!extractedPlanIdLive || !businessName || isSubmitting}
					class="px-6 py-2 text-white bg-[#E67E50] border-2 border-[#D97F3E] hover:bg-[#D97F3E] hover:shadow-xl shadow-lg rounded-sm font-bold transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-2"
				>
					{#if isSubmitting}
						<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
							<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25" />
							<path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
						</svg>
						{editingPlan ? 'Updating...' : 'Creating...'}
					{:else}
						{editingPlan ? 'Update Plan' : 'Add Plan'}
					{/if}
				</button>
			</div>
		</form>
	</div>

	<!-- Your Plans Section -->
	<div class="bg-white border-2 border-[#D9D7D2] rounded-sm overflow-hidden shadow-lg">
		<div class="p-6 border-b-2 border-[#D9D7D2]">
			<h2 class="text-xl font-extrabold tracking-tight text-[#1A1816]">Your Plans</h2>
		</div>

		{#await data.plans}
			<!-- Skeleton while loading -->
			<div class="divide-y-2 divide-[#D9D7D2]">
				{#each Array(2) as _}
					<div class="p-6">
						<div class="flex items-start justify-between gap-4">
							<div class="flex-1 space-y-3">
								<!-- Name + badge -->
								<div class="flex items-center gap-3">
									<div class="h-5 w-48 bg-[#E8E6E1] rounded animate-pulse"></div>
									<div class="h-6 w-16 bg-[#E8E6E1] rounded animate-pulse"></div>
								</div>
								<!-- Price lines -->
								<div class="space-y-1">
									<div class="h-4 w-40 bg-[#E8E6E1] rounded animate-pulse"></div>
									<div class="h-3 w-32 bg-[#E8E6E1] rounded animate-pulse opacity-70"></div>
								</div>
								<!-- Environment IDs -->
								<div class="flex gap-3">
									<div class="flex items-center gap-1.5">
										<div class="h-5 w-10 bg-[#52A675] rounded opacity-50"></div>
										<div class="h-4 w-24 bg-[#E8E6E1] rounded animate-pulse"></div>
									</div>
									<div class="flex items-center gap-1.5">
										<div class="h-5 w-14 bg-[#E67E50] rounded opacity-50"></div>
										<div class="h-4 w-24 bg-[#E8E6E1] rounded animate-pulse"></div>
									</div>
								</div>
							</div>
							<!-- Action buttons skeleton -->
							<div class="flex gap-2">
								<div class="h-10 w-14 bg-[#E8E6E1] rounded animate-pulse"></div>
								<div class="h-10 w-12 bg-[#E8E6E1] rounded animate-pulse"></div>
								<div class="h-10 w-16 bg-[#E8E6E1] rounded animate-pulse"></div>
							</div>
						</div>
					</div>
				{/each}
			</div>
		{:then plans}
			{#if isLoadingData}
				<!-- Skeleton while loading -->
				<div class="divide-y-2 divide-[#D9D7D2]">
					{#each Array(2) as _}
						<div class="p-6">
							<div class="flex items-start justify-between gap-4">
								<div class="flex-1 space-y-3">
									<!-- Name + badge -->
									<div class="flex items-center gap-3">
										<div class="h-5 w-48 bg-[#E8E6E1] rounded animate-pulse"></div>
										<div class="h-6 w-16 bg-[#E8E6E1] rounded animate-pulse"></div>
									</div>
									<!-- Price lines -->
									<div class="space-y-1">
										<div class="h-4 w-40 bg-[#E8E6E1] rounded animate-pulse"></div>
										<div class="h-3 w-32 bg-[#E8E6E1] rounded animate-pulse opacity-70"></div>
									</div>
									<!-- Environment IDs -->
									<div class="flex gap-3">
										<div class="flex items-center gap-1.5">
											<div class="h-5 w-10 bg-[#52A675] rounded opacity-50"></div>
											<div class="h-4 w-24 bg-[#E8E6E1] rounded animate-pulse"></div>
										</div>
										<div class="flex items-center gap-1.5">
											<div class="h-5 w-14 bg-[#E67E50] rounded opacity-50"></div>
											<div class="h-4 w-24 bg-[#E8E6E1] rounded animate-pulse"></div>
										</div>
									</div>
								</div>
								<!-- Action buttons skeleton -->
								<div class="flex gap-2">
									<div class="h-10 w-14 bg-[#E8E6E1] rounded animate-pulse"></div>
									<div class="h-10 w-12 bg-[#E8E6E1] rounded animate-pulse"></div>
									<div class="h-10 w-16 bg-[#E8E6E1] rounded animate-pulse"></div>
								</div>
							</div>
						</div>
					{/each}
				</div>
			{:else if plans.length === 0}
			<div class="p-12 text-center text-[#5C5A56]">
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
						d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
					/>
				</svg>
				<p class="font-bold text-lg">No plans yet</p>
				<p class="text-sm mt-1">Add your first PayPal subscription plan above</p>
			</div>
			{:else}
				<div class="divide-y-2 divide-[#D9D7D2]">
					{#each plans as plan}
					<div class="p-6 hover:bg-gray-50 transition-colors">
						<div class="flex items-start justify-between gap-4">
							<div class="flex-1">
								<div class="flex items-center gap-3 mb-2">
									<h3 class="text-lg font-extrabold tracking-tight text-[#1A1816]">
										{plan.business_name}
									</h3>
									{#if plan.is_default}
										<span
											class="px-2 py-1 text-xs font-bold rounded-sm bg-[#2D9B9B] text-white border-2 border-[#2D9B9B]/70"
										>
											Default
										</span>
									{/if}
								</div>

								<!-- Price with Trial Info -->
								<div class="text-sm text-[#5C5A56] mb-3">
									{#if plan.trial_price_amount != null && plan.trial_duration_months != null}
										<div class="font-medium text-[#1A1816]">
											<span class="text-[#2D9B9B]">
												${plan.trial_price_amount.toFixed(2)} / {plan.billing_cycle}
											</span>
											<span class="text-xs text-[#5C5A56]">
												for {plan.trial_duration_months} {plan.trial_duration_months === 1 ? 'month' : 'months'}
											</span>
										</div>
										<div class="text-xs text-[#5C5A56] mt-1">
											Then ${plan.price_amount.toFixed(2)} / {plan.billing_cycle}
										</div>
									{:else}
										<span class="font-medium">
											${plan.price_amount.toFixed(2)} / {plan.billing_cycle}
										</span>
									{/if}
								</div>

								<!-- Environment Plan IDs -->
								<div class="flex flex-wrap gap-3 text-xs">
									<div class="flex items-center gap-1.5">
										<span class="px-1.5 py-0.5 font-bold rounded bg-[#52A675] text-white">LIVE</span>
										<span class="font-mono text-[#5C5A56]">{truncatePlanId(plan.paypal_plan_id_live)}</span>
									</div>
									<div class="flex items-center gap-1.5">
										<span class="px-1.5 py-0.5 font-bold rounded bg-[#E67E50] text-white">SANDBOX</span>
										<span class="font-mono text-[#5C5A56]">
											{#if plan.paypal_plan_id_sandbox}
												{truncatePlanId(plan.paypal_plan_id_sandbox)}
											{:else}
												<span class="italic text-[#B8B6B1]">not configured</span>
											{/if}
										</span>
									</div>
								</div>
							</div>

							<div class="flex gap-2">
								<form
									method="POST"
									action="?/syncPlan"
									use:enhance={() => {
										syncingPlanId = plan.id;
										return async ({ result, update }) => {
											syncingPlanId = null;
											await update();
											if (result.type === 'success') {
												isRefreshingData = true;
												setTimeout(async () => {
													await invalidate('app:subscription-plans');
													setTimeout(() => {
														isRefreshingData = false;
													}, 100);
												}, 500);
											}
										};
									}}
								>
									{#if data.csrfToken}
										<input type="hidden" name="csrf_token" value={data.csrfToken} />
									{/if}
									<input type="hidden" name="plan_id" value={plan.id} />
									<button
										type="submit"
										disabled={syncingPlanId === plan.id}
										class="px-4 py-2 text-sm font-bold text-white bg-[#6366f1] border-2 border-[#6366f1]/70 hover:bg-[#6366f1]/80 hover:shadow-lg rounded-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
									>
										{#if syncingPlanId === plan.id}
											<svg class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
												<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25" />
												<path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
											</svg>
											Syncing...
										{:else}
											Sync
										{/if}
									</button>
								</form>
								<button
									on:click={() => startEdit(plan)}
									class="px-4 py-2 text-sm font-bold text-white bg-[#2D9B9B] border-2 border-[#2D9B9B]/70 hover:bg-[#2D9B9B]/80 hover:shadow-lg rounded-sm transition-all"
								>
									Edit
								</button>
								<button
									on:click={() => confirmDelete(plan)}
									class="px-4 py-2 text-sm font-bold text-white bg-[#D97F3E] border-2 border-[#D97F3E]/70 hover:bg-[#D97F3E]/80 hover:shadow-lg rounded-sm transition-all"
								>
									Delete
								</button>
							</div>
						</div>
					</div>
					{/each}
				</div>
			{/if}
		{/await}
	</div>
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm && planToDelete}
	<!-- svelte-ignore a11y-click-events-have-key-events -->
	<!-- svelte-ignore a11y-no-static-element-interactions -->
	<div
		class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
		on:click={closeDeleteModal}
	>
		<!-- svelte-ignore a11y-click-events-have-key-events -->
		<!-- svelte-ignore a11y-no-static-element-interactions -->
		<div
			class="bg-white border-2 border-[#D9D7D2] rounded-sm shadow-2xl max-w-md w-full p-6"
			on:click|stopPropagation
		>
			<div class="text-center mb-6">
				<div
					class="inline-flex items-center justify-center w-16 h-16 bg-[#D97F3E] border-2 border-[#D97F3E]/70 rounded-sm mb-4"
				>
					<svg class="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
						/>
					</svg>
				</div>
				<h3 class="text-xl font-extrabold tracking-tight text-[#1A1816] mb-2">Delete Plan?</h3>
				<p class="text-[#5C5A56]">
					Are you sure you want to delete <strong class="text-[#1A1816]"
						>{planToDelete.business_name}</strong
					>? This action cannot be undone.
				</p>
				<p class="text-sm text-[#D97F3E] mt-2 font-medium">
					Note: Plans used by discount codes cannot be deleted.
				</p>
			</div>

			<form
				method="POST"
				action="?/deletePlan"
				use:enhance={() => {
					isDeleting = true;
					return async ({ result, update }) => {
						isDeleting = false;
						closeDeleteModal();
						await update();
					};
				}}
			>
				{#if data.csrfToken}
					<input type="hidden" name="csrf_token" value={data.csrfToken} />
				{/if}
				<input type="hidden" name="plan_id" value={planToDelete.id} />

				<div class="flex gap-3">
					<button
						type="button"
						on:click={closeDeleteModal}
						class="flex-1 px-4 py-2 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] rounded-sm font-bold transition-colors"
					>
						Cancel
					</button>
					<button
						type="submit"
						disabled={isDeleting}
						class="flex-1 px-4 py-2 text-white bg-[#D97F3E] border-2 border-[#D97F3E]/70 hover:bg-[#D97F3E]/80 hover:shadow-xl shadow-lg rounded-sm font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2"
					>
						{#if isDeleting}
							<svg class="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
								<circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="3" opacity="0.25" />
								<path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" stroke-width="3" stroke-linecap="round" />
							</svg>
							Deleting...
						{:else}
							Delete Plan
						{/if}
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
