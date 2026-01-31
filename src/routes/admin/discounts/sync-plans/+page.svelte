<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { invalidate } from '$app/navigation';
	import { toasts } from '$lib/stores/toast';
	import type { SubscriptionPlan } from '$lib/types/discount';

	export let data: PageData;
	export let form;

	// Form state
	let embedInput = '';
	let extractedPlanId = '';
	let businessName = '';
	let priceAmount = '';
	let billingCycle = 'monthly';
	let isDefault = false;
	let isExtracting = false;

	// Edit state
	let editingPlan: SubscriptionPlan | null = null;
	let showDeleteConfirm = false;
	let planToDelete: SubscriptionPlan | null = null;

	// Extract PayPal Plan ID from URL or embed code
	function extractPlanId() {
		isExtracting = true;
		const planIdRegex = /P-[A-Z0-9]{20,}/g;
		const matches = embedInput.match(planIdRegex);

		if (matches && matches.length > 0) {
			extractedPlanId = matches[0];
			toasts.show('Plan ID extracted successfully', 'success');
		} else {
			extractedPlanId = '';
			toasts.show('No Plan ID found. Please check your input.', 'error', 5000);
		}
		isExtracting = false;
	}

	// Clear form
	function clearForm() {
		embedInput = '';
		extractedPlanId = '';
		businessName = '';
		priceAmount = '';
		billingCycle = 'monthly';
		isDefault = false;
		editingPlan = null;
	}

	// Start editing a plan
	function startEdit(plan: SubscriptionPlan) {
		editingPlan = plan;
		embedInput = '';
		extractedPlanId = plan.paypal_plan_id;
		businessName = plan.business_name;
		priceAmount = plan.price_amount.toString();
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
	function truncatePlanId(planId: string): string {
		return planId.slice(0, 8) + '...';
	}

	// Handle form response
	$: if (form?.success) {
		clearForm();
		toasts.show(form.message || 'Action completed successfully', 'success');
		setTimeout(() => invalidate('app:subscription-plans'), 500);
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
			Import your PayPal subscription plans to create discount codes for them.
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
				return async ({ result, update }) => {
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

			{#if !editingPlan}
				<!-- Paste PayPal URL/Embed Code -->
				<div>
					<label
						for="embed_input"
						class="block text-sm font-bold text-[#1A1816] mb-2"
					>
						Paste PayPal plan URL or button embed code:
					</label>
					<textarea
						id="embed_input"
						bind:value={embedInput}
						on:input={extractPlanId}
						placeholder="https://www.paypal.com/webapps/billing/plans/subscribe?plan_id=P-..."
						rows="4"
						class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
					></textarea>
				</div>
			{/if}

			<!-- Extracted Plan ID -->
			{#if extractedPlanId}
				<div
					class="p-4 bg-[#52A675]/10 border-2 border-[#52A675] rounded-sm flex items-center gap-2"
				>
					<svg class="w-5 h-5 text-[#52A675] flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
						<path
							fill-rule="evenodd"
							d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
							clip-rule="evenodd"
						/>
					</svg>
					<span class="font-bold text-[#1A1816]">
						Found Plan: <span class="font-mono">{extractedPlanId}</span>
					</span>
				</div>
			{/if}

			<input type="hidden" name="paypal_plan_id" value={extractedPlanId} />

			<!-- Business Name -->
			<div>
				<label for="business_name" class="block text-sm font-bold text-[#1A1816] mb-2">
					Give it a friendly name:
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

			<!-- Price and Billing Cycle -->
			<div class="grid grid-cols-2 gap-4">
				<div>
					<label for="price_amount" class="block text-sm font-bold text-[#1A1816] mb-2">
						Price:
					</label>
					<div class="relative">
						<span class="absolute left-3 top-2 text-[#5C5A56] font-bold">$</span>
						<input
							id="price_amount"
							type="number"
							name="price_amount"
							bind:value={priceAmount}
							placeholder="29.00"
							step="0.01"
							min="0"
							required
							class="w-full pl-8 pr-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white"
						/>
					</div>
				</div>

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
					disabled={!extractedPlanId || !businessName || !priceAmount}
					class="px-6 py-2 text-white bg-[#E67E50] border-2 border-[#D97F3E] hover:bg-[#D97F3E] hover:shadow-xl shadow-lg rounded-sm font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed"
				>
					{editingPlan ? 'Update Plan' : 'Add Plan'}
				</button>
			</div>
		</form>
	</div>

	<!-- Your Plans Section -->
	<div class="bg-white border-2 border-[#D9D7D2] rounded-sm overflow-hidden shadow-lg">
		<div class="p-6 border-b-2 border-[#D9D7D2]">
			<h2 class="text-xl font-extrabold tracking-tight text-[#1A1816]">Your Plans</h2>
		</div>

		{#if data.plans.length === 0}
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
				{#each data.plans as plan}
					<div class="p-6 hover:bg-gray-50 transition-colors">
						<div class="flex items-center justify-between gap-4">
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
								<div class="flex items-center gap-4 text-sm text-[#5C5A56]">
									<span class="font-mono text-xs">{truncatePlanId(plan.paypal_plan_id)}</span>
									<span class="font-medium">
										${plan.price_amount.toFixed(2)} / {plan.billing_cycle}
									</span>
								</div>
							</div>

							<div class="flex gap-2">
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
					closeDeleteModal();
					return async ({ result, update }) => {
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
						class="flex-1 px-4 py-2 text-white bg-[#D97F3E] border-2 border-[#D97F3E]/70 hover:bg-[#D97F3E]/80 hover:shadow-xl shadow-lg rounded-sm font-bold transition-colors"
					>
						Delete Plan
					</button>
				</div>
			</form>
		</div>
	</div>
{/if}
