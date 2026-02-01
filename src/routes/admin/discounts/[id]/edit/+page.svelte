<script lang="ts">
	import type { PageData } from './$types';
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';

	export let data: PageData;
	export let form;

	// Form state - initialize from loaded discount
	let code = data.discount.code;
	let plan_id = data.discount.plan_id;
	let max_uses = data.discount.max_uses?.toString() || '';
	let valid_until = data.discount.valid_until
		? data.discount.valid_until.split('T')[0]
		: '';
	let max_uses_per_customer = data.discount.max_uses_per_customer;
	let admin_notes = data.discount.admin_notes || '';
	let is_active = data.discount.is_active;
	let showLimits = !!(max_uses || valid_until);
	let showDeleteConfirm = false;
	let isSubmitting = false;
	let isDeleting = false;

	// Selected plan for preview
	$: selectedPlan = data.plans.find((p) => p.id === plan_id);

	// Default plan for calculating savings
	$: defaultPlan = data.plans.find((p) => p.is_default);

	// Calculate savings from price delta
	$: savings = defaultPlan && selectedPlan ? Math.max(0, defaultPlan.price_amount - selectedPlan.price_amount) : 0;
	$: savingsPercent = defaultPlan && savings > 0 ? Math.round((savings / defaultPlan.price_amount) * 100) : 0;

	function cancel() {
		goto('/admin/discounts');
	}

	function confirmDelete() {
		showDeleteConfirm = true;
	}

	function closeDeleteConfirm() {
		showDeleteConfirm = false;
	}
</script>

<svelte:head>
	<title>Edit Discount Code - Frontier Meals Admin</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-extrabold tracking-tight text-[#1A1816]">
				Edit Discount Code
			</h1>
			<p class="text-[#5C5A56] mt-2">
				Modify settings for code: <strong>{data.discount.code}</strong>
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

	<!-- Usage stats banner -->
	<div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-4 shadow-lg">
		<div class="flex items-center justify-between gap-4">
			<div class="flex items-center gap-6">
				<div>
					<p class="text-xs font-bold text-[#5C5A56] uppercase tracking-wide">
						Total Uses
					</p>
					<p class="text-2xl font-extrabold text-[#1A1816]">
						{data.discount.current_uses}
						{#if data.discount.max_uses}
							<span class="text-sm text-[#5C5A56]">
								/ {data.discount.max_uses}
							</span>
						{/if}
					</p>
				</div>
				<div>
					<p class="text-xs font-bold text-[#5C5A56] uppercase tracking-wide">
						Reserved
					</p>
					<p class="text-2xl font-extrabold text-[#1A1816]">
						{data.discount.reserved_uses}
					</p>
				</div>
			</div>
			<button
				type="button"
				on:click={confirmDelete}
				class="px-4 py-2 text-sm font-bold text-[#C85454] hover:bg-[#C85454]/10 border-2 border-[#C85454]/30 hover:border-[#C85454] rounded-sm transition-colors"
			>
				Delete Code
			</button>
		</div>
	</div>

	<!-- Two-column layout -->
	<form
		method="POST"
		action="?/updateDiscount"
		use:enhance={() => {
			isSubmitting = true;
			return async ({ result, update }) => {
				isSubmitting = false;
				if (result.type === 'redirect') {
					goto(`${result.location}`);
				} else {
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
					<!-- Status toggle -->
					<div class="flex items-center justify-between p-4 bg-[#FAFAF9] rounded-sm">
						<div>
							<p class="text-sm font-bold text-[#1A1816]">Discount Status</p>
							<p class="text-xs text-[#5C5A56]">
								{is_active
									? 'Active - customers can use this code'
									: 'Inactive - code is disabled'}
							</p>
						</div>
						<label class="relative inline-flex items-center cursor-pointer">
							<input
								type="checkbox"
								name="is_active"
								bind:checked={is_active}
								value="true"
								class="sr-only peer"
							/>
							<div
								class="w-11 h-6 bg-[#D9D7D2] peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-[#E67E50]/20 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#52A675]"
							></div>
						</label>
					</div>

					<!-- Code input (read-only warning) -->
					<div>
						<label
							for="code"
							class="block text-sm font-bold text-[#1A1816] mb-2"
						>
							Discount Code
						</label>
						<input
							id="code"
							name="code"
							type="text"
							bind:value={code}
							required
							placeholder="SUMMER50"
							class="w-full px-4 py-2 border-2 border-[#B8B6B1] rounded-sm focus:ring-2 focus:ring-[#E67E50] focus:border-[#E67E50] outline-none font-medium text-[#1A1816] bg-white uppercase"
						/>
						{#if data.discount.current_uses > 0}
							<p class="text-xs text-[#D97F3E] mt-1 font-bold">
								⚠️ Warning: Changing the code will not affect existing
								redemptions
							</p>
						{/if}
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
								</option>
							{/each}
						</select>
						<p class="text-xs text-[#5C5A56] mt-1">
							Select the PayPal plan with discounted pricing
						</p>
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
								Saving...
							</span>
						{:else}
							Save Changes
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

						{#if !is_active}
							<div
								class="bg-[#FEF3C7] border-2 border-[#D97F3E] rounded-sm p-3 text-sm"
							>
								<p class="font-bold text-[#1A1816]">
									⚠️ Code is currently inactive
								</p>
								<p class="text-[#5C5A56] mt-1">
									Customers cannot use this code until you activate it.
								</p>
							</div>
						{/if}
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
						<p class="font-bold">Configure discount to see preview</p>
					</div>
				{/if}
			</div>
		</div>
	</form>
</div>

<!-- Delete Confirmation Modal -->
{#if showDeleteConfirm}
	<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4 z-50"
		on:click={closeDeleteConfirm}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
		<div
			class="bg-white border-2 border-[#D9D7D2] rounded-sm shadow-2xl max-w-md w-full p-6"
			on:click|stopPropagation
		>
			<div class="text-center mb-6">
				<div
					class="inline-flex items-center justify-center w-16 h-16 bg-[#C85454] border-2 border-[#C85454]/70 rounded-sm mb-4"
				>
					<svg
						class="w-8 h-8 text-white"
						fill="none"
						viewBox="0 0 24 24"
						stroke="currentColor"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
						/>
					</svg>
				</div>
				<h3 class="text-xl font-extrabold tracking-tight text-[#1A1816] mb-2">
					Delete Discount Code?
				</h3>
				<p class="text-[#5C5A56]">
					Are you sure you want to delete <strong class="text-[#1A1816]"
						>{code}</strong
					>?
					{#if data.discount.current_uses > 0}
						<br />
						<strong class="text-[#D97F3E]"
							>This code has {data.discount.current_uses} redemption{data
								.discount.current_uses > 1
								? 's'
								: ''}.</strong
						>
					{:else}
						This action cannot be undone.
					{/if}
				</p>
			</div>

			<div class="flex gap-3">
				<button
					type="button"
					on:click={closeDeleteConfirm}
					class="flex-1 px-4 py-2 text-[#1A1816] bg-[#D9D7D2] border-2 border-[#B8B6B1] hover:bg-[#B8B6B1] rounded-sm font-bold transition-colors"
				>
					Cancel
				</button>
				<form
					method="POST"
					action="?/deleteDiscount"
					use:enhance={() => {
						isDeleting = true;
						return async ({ result, update }) => {
							isDeleting = false;
							if (result.type === 'redirect') {
								goto(`${result.location}`);
							} else {
								await update();
								closeDeleteConfirm();
							}
						};
					}}
					class="flex-1"
				>
					<input type="hidden" name="csrf_token" value={data.csrfToken} />
					<button
						type="submit"
						disabled={isDeleting}
						class="w-full px-4 py-2 text-white bg-[#C85454] border-2 border-[#C85454]/70 hover:bg-[#C85454]/90 hover:shadow-xl shadow-lg rounded-sm font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{#if isDeleting}
							<span class="inline-flex items-center justify-center gap-2">
								<svg class="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
									<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
									<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
								</svg>
								Deleting...
							</span>
						{:else}
							Delete
						{/if}
					</button>
				</form>
			</div>
		</div>
	</div>
{/if}
