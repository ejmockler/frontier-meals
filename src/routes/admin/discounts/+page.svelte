<script lang="ts">
	import type { PageData } from './$types';
	import type { DiscountStatus } from '$lib/types/discount';

	export let data: PageData;

	// Get discount display text from price delta
	function getDiscountDisplay(discount: any, defaultPlanPrice: number): string {
		if (!discount.plan) return 'Unknown discount';

		const planPrice = discount.plan.price_amount;
		const savings = Math.max(0, defaultPlanPrice - planPrice);

		if (savings <= 0) return 'No discount';

		const savingsPercent = Math.round((savings / defaultPlanPrice) * 100);
		return `$${savings.toFixed(2)} off (${savingsPercent}%)`;
	}

	// Calculate discount status
	function getStatus(discount: any): DiscountStatus {
		// Error: Referenced plan no longer exists
		if (!discount.plan) {
			return 'error';
		}

		const now = new Date();
		const validUntil = discount.valid_until ? new Date(discount.valid_until) : null;
		const validFrom = discount.valid_from ? new Date(discount.valid_from) : null;

		// Inactive: Admin deactivated
		if (!discount.is_active) {
			return 'inactive';
		}

		// Not yet valid
		if (validFrom && validFrom > now) {
			return 'inactive';
		}

		// Expired
		if (validUntil && validUntil < now) {
			return 'expired';
		}

		// Exhausted (reached max uses)
		if (discount.max_uses !== null && discount.current_uses >= discount.max_uses) {
			return 'exhausted';
		}

		// Unused (active but never used)
		if (discount.current_uses === 0) {
			return 'unused';
		}

		// Active (everything is good)
		return 'active';
	}

	// Get status badge styling
	function getStatusBadge(status: DiscountStatus): { color: string; label: string; emoji: string } {
		switch (status) {
			case 'active':
				return {
					color: 'bg-[#52A675] text-white border-2 border-[#52A675]/70',
					label: 'Active',
					emoji: '🟢'
				};
			case 'unused':
				return {
					color: 'bg-[#D97F3E] text-white border-2 border-[#D97F3E]/70',
					label: 'Unused',
					emoji: '🟡'
				};
			case 'exhausted':
				return {
					color: 'bg-[#C85454] text-white border-2 border-[#C85454]/70',
					label: 'Exhausted',
					emoji: '🔴'
				};
			case 'expired':
				return {
					color: 'bg-[#C85454] text-white border-2 border-[#C85454]/70',
					label: 'Expired',
					emoji: '🔴'
				};
			case 'inactive':
				return {
					color: 'bg-[#78766F] text-white border-2 border-[#78766F]/70',
					label: 'Inactive',
					emoji: '⚫'
				};
			case 'error':
				return {
					color: 'bg-[#78766F] text-white border-2 border-[#78766F]/70',
					label: 'Error',
					emoji: '⚫'
				};
			default:
				return {
					color: 'bg-[#D9D7D2] text-[#1A1816] border-2 border-[#B8B6B1]',
					label: 'Unknown',
					emoji: '❓'
				};
		}
	}

	// Format date for display
	function formatDate(dateString: string | null): string {
		if (!dateString) return '—';
		const date = new Date(dateString);
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
	}

	// Format usage display
	function formatUsage(discount: any): string {
		if (discount.max_uses === null) {
			return `${discount.current_uses} / ∞`;
		}
		return `${discount.current_uses} / ${discount.max_uses}`;
	}

	// Get default plan price for delta calculation
	$: defaultPlanPrice = data.defaultPlanPrice || 29;

	// Process discounts with status
	$: processedDiscounts = data.discounts.map((discount) => ({
		...discount,
		status: getStatus(discount),
		discount_display: getDiscountDisplay(discount, defaultPlanPrice)
	}));

	// Summary statistics
	$: totalActive = processedDiscounts.filter((d) => d.status === 'active').length;
	$: totalUnused = processedDiscounts.filter((d) => d.status === 'unused').length;
	$: totalExpired = processedDiscounts.filter((d) => d.status === 'expired' || d.status === 'exhausted').length;
	$: totalRedemptions = processedDiscounts.reduce((sum, d) => sum + d.current_uses, 0);
</script>

<svelte:head>
	<title>Discounts - Frontier Meals Admin</title>
</svelte:head>

<div class="space-y-6">
	<!-- Page header -->
	<div class="flex items-center justify-between">
		<div>
			<h1 class="text-3xl font-extrabold tracking-tight text-[#1A1816]">Discount Codes</h1>
			<p class="text-[#5C5A56] mt-2">Manage promotional discount codes for subscriptions</p>
		</div>
		<div class="flex gap-3">
			<a
				href="/admin/discounts/sync-plans"
				class="px-6 py-3 text-[#1A1816] bg-white border-2 border-[#B8B6B1] hover:bg-[#D9D7D2] hover:shadow-lg rounded-sm font-bold transition-all"
			>
				Sync Plans
			</a>
			<a
				href="/admin/discounts/new"
				class="px-6 py-3 text-white bg-[#E67E50] border-2 border-[#D97F3E] hover:bg-[#D97F3E] hover:shadow-xl shadow-lg rounded-sm font-bold transition-all"
			>
				+ Create Discount
			</a>
		</div>
	</div>

	<!-- Status legend -->
	<div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-4 shadow-lg">
		<div class="flex items-center gap-6 flex-wrap text-sm">
			<span class="font-bold text-[#1A1816]">Status Legend:</span>
			<div class="flex items-center gap-2">
				<span>🟢</span>
				<span class="text-[#5C5A56]">Active</span>
			</div>
			<div class="flex items-center gap-2">
				<span>🟡</span>
				<span class="text-[#5C5A56]">Unused (never redeemed)</span>
			</div>
			<div class="flex items-center gap-2">
				<span>🔴</span>
				<span class="text-[#5C5A56]">Exhausted/Expired</span>
			</div>
			<div class="flex items-center gap-2">
				<span>⚫</span>
				<span class="text-[#5C5A56]">Inactive/Error</span>
			</div>
		</div>
	</div>

	<!-- Discounts table -->
	<div class="bg-white border-2 border-[#D9D7D2] rounded-sm overflow-hidden shadow-lg">
		{#if processedDiscounts.length === 0}
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
						d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z"
					/>
				</svg>
				<p class="font-bold text-lg">No discount codes yet</p>
				<p class="text-sm mt-1">Create your first discount code to get started</p>
			</div>
		{:else}
			<div class="overflow-x-auto">
				<table class="w-full">
					<thead class="bg-[#FAFAF9] border-b-2 border-[#D9D7D2]">
						<tr>
							<th class="px-6 py-3 text-left text-xs font-bold text-[#1A1816] uppercase tracking-wider">
								Status
							</th>
							<th class="px-6 py-3 text-left text-xs font-bold text-[#1A1816] uppercase tracking-wider">
								Code
							</th>
							<th class="px-6 py-3 text-left text-xs font-bold text-[#1A1816] uppercase tracking-wider">
								Plan
							</th>
							<th class="px-6 py-3 text-left text-xs font-bold text-[#1A1816] uppercase tracking-wider">
								Discount
							</th>
							<th class="px-6 py-3 text-left text-xs font-bold text-[#1A1816] uppercase tracking-wider">
								Uses
							</th>
							<th class="px-6 py-3 text-left text-xs font-bold text-[#1A1816] uppercase tracking-wider">
								Valid Until
							</th>
							<th class="px-6 py-3 text-left text-xs font-bold text-[#1A1816] uppercase tracking-wider">
								Actions
							</th>
						</tr>
					</thead>
					<tbody class="divide-y-2 divide-[#D9D7D2]">
						{#each processedDiscounts as discount}
							{@const badge = getStatusBadge(discount.status)}
							<tr class="hover:bg-[#FAFAF9] transition-colors">
								<!-- Status -->
								<td class="px-6 py-4 whitespace-nowrap">
									<span class="inline-flex items-center gap-1 px-2 py-1 text-xs font-bold rounded-sm {badge.color}">
										<span>{badge.emoji}</span>
										<span>{badge.label}</span>
									</span>
								</td>

								<!-- Code -->
								<td class="px-6 py-4 whitespace-nowrap">
									<span class="font-mono font-bold text-[#1A1816]">{discount.code}</span>
								</td>

								<!-- Plan -->
								<td class="px-6 py-4">
									{#if discount.plan}
										<div>
											<p class="font-bold text-[#1A1816] text-sm">{discount.plan.business_name}</p>
											<p class="text-xs text-[#5C5A56]">
												${discount.plan.price_amount}/{discount.plan.billing_cycle}
											</p>
										</div>
									{:else}
										<span class="text-[#C85454] text-sm font-bold">[Deleted Plan]</span>
									{/if}
								</td>

								<!-- Discount -->
								<td class="px-6 py-4 whitespace-nowrap">
									<span class="text-sm text-[#1A1816] font-medium">{discount.discount_display}</span>
								</td>

								<!-- Uses -->
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center gap-2">
										<span class="font-bold text-[#1A1816] text-sm">{formatUsage(discount)}</span>
										{#if discount.reserved_uses > 0}
											<span class="text-xs text-[#D97F3E] font-medium">
												({discount.reserved_uses} reserved)
											</span>
										{/if}
									</div>
								</td>

								<!-- Valid Until -->
								<td class="px-6 py-4 whitespace-nowrap">
									<span class="text-sm text-[#5C5A56]">{formatDate(discount.valid_until)}</span>
								</td>

								<!-- Actions -->
								<td class="px-6 py-4 whitespace-nowrap">
									<div class="flex items-center gap-2">
										<a
											href="/admin/discounts/{discount.id}/edit"
											class="px-3 py-1 text-sm font-bold text-[#E67E50] hover:bg-[#E67E50]/10 border-2 border-[#E67E50]/30 hover:border-[#E67E50] rounded-sm transition-colors"
										>
											Edit
										</a>
										<a
											href="/admin/discounts/{discount.id}"
											class="px-3 py-1 text-sm font-bold text-[#2D9B9B] hover:bg-[#2D9B9B]/10 border-2 border-[#2D9B9B]/30 hover:border-[#2D9B9B] rounded-sm transition-colors"
										>
											View
										</a>
									</div>
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		{/if}
	</div>

	<!-- Summary statistics -->
	{#if processedDiscounts.length > 0}
		<div class="grid grid-cols-1 md:grid-cols-4 gap-4">
			<div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-4 shadow-lg">
				<p class="text-xs font-bold text-[#5C5A56] uppercase tracking-wider mb-1">Total Codes</p>
				<p class="text-3xl font-extrabold text-[#1A1816]">{processedDiscounts.length}</p>
			</div>

			<div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-4 shadow-lg">
				<p class="text-xs font-bold text-[#5C5A56] uppercase tracking-wider mb-1">Active</p>
				<p class="text-3xl font-extrabold text-[#52A675]">{totalActive}</p>
			</div>

			<div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-4 shadow-lg">
				<p class="text-xs font-bold text-[#5C5A56] uppercase tracking-wider mb-1">Unused</p>
				<p class="text-3xl font-extrabold text-[#D97F3E]">{totalUnused}</p>
			</div>

			<div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-4 shadow-lg">
				<p class="text-xs font-bold text-[#5C5A56] uppercase tracking-wider mb-1">Total Redemptions</p>
				<p class="text-3xl font-extrabold text-[#2D9B9B]">{totalRedemptions}</p>
			</div>
		</div>
	{/if}
</div>
