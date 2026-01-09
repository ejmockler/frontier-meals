<script lang="ts">
	/**
	 * Schedule Change Notification Modal
	 *
	 * Perceptual Engineering Principles Applied:
	 * - Timing: 300ms modal transitions, <100ms save feedback
	 * - Recognition: Visual diff shows what changed, affected dates listed
	 * - Working Memory: No calculation required - changes shown explicitly
	 * - Reversibility: Clear separation between saving and notifying
	 */
	import { createEventDispatcher, onMount } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';

	export let changeType: 'service_pattern' | 'holiday' | 'special_event';
	export let changeAction: 'added' | 'updated' | 'deleted';
	export let changeSummary: string; // Human-readable description
	export let affectedDates: string[] = []; // YYYY-MM-DD format
	export let activeCustomerCount: number = 0;
	export let previousValue: any = null; // For showing diff
	export let newValue: any = null; // For showing diff

	const dispatch = createEventDispatcher<{
		confirm: { notify: boolean; message: string };
		cancel: void;
	}>();

	let notifyCustomers = false;
	let customMessage = '';
	let sending = false;
	let mounted = false;

	onMount(() => {
		// Trigger entrance animation after mount
		mounted = true;
	});

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric'
		});
	}

	function getChangeTypeLabel(): string {
		switch (changeType) {
			case 'service_pattern':
				return 'Service Pattern';
			case 'holiday':
				return 'Holiday';
			case 'special_event':
				return 'Special Event';
			default:
				return 'Schedule';
		}
	}

	function getActionVerb(): string {
		switch (changeAction) {
			case 'added':
				return 'added';
			case 'updated':
				return 'updated';
			case 'deleted':
				return 'removed';
			default:
				return 'changed';
		}
	}

	function getDefaultMessage(): string {
		const label = getChangeTypeLabel().toLowerCase();
		const verb = getActionVerb();

		if (changeType === 'service_pattern') {
			return `Our regular service schedule has been updated. Please check the affected dates below to see how this impacts your meal service.`;
		}

		if (changeAction === 'deleted') {
			return `A ${label} has been removed from our schedule. The dates listed below will now follow our regular service pattern.`;
		}

		return `A ${label} has been ${verb}. Please review the affected dates below.`;
	}

	function handleConfirm() {
		sending = true;
		dispatch('confirm', {
			notify: notifyCustomers,
			message: customMessage || getDefaultMessage()
		});
	}

	function handleCancel() {
		dispatch('cancel');
	}

	// Generate service pattern diff display
	function getServicePatternDiff(): { removed: number[]; added: number[] } | null {
		if (changeType !== 'service_pattern' || !previousValue || !newValue) return null;

		const prev = new Set(previousValue as number[]);
		const next = new Set(newValue as number[]);

		return {
			removed: [...prev].filter((d) => !next.has(d)),
			added: [...next].filter((d) => !prev.has(d))
		};
	}

	$: patternDiff = getServicePatternDiff();
	$: displayedDates = affectedDates.slice(0, 8);
	$: hiddenDateCount = affectedDates.length - displayedDates.length;
</script>

<!-- Modal Backdrop -->
{#if mounted}
	<div
		class="modal-backdrop"
		on:click={handleCancel}
		on:keydown={(e) => e.key === 'Escape' && handleCancel()}
		transition:fade={{ duration: 300, easing: cubicOut }}
		role="button"
		tabindex="-1"
	></div>

	<!-- Modal Content -->
	<div
		class="modal"
		transition:fly={{ y: 20, duration: 300, easing: cubicOut }}
		role="dialog"
		aria-modal="true"
		aria-labelledby="modal-title"
	>
		<!-- Header -->
		<div class="modal-header">
			<div class="header-icon">
				{#if changeAction === 'deleted'}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M3 6h18"></path>
						<path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"></path>
						<path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
					</svg>
				{:else if changeAction === 'added'}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<circle cx="12" cy="12" r="10"></circle>
						<path d="M12 8v8"></path>
						<path d="M8 12h8"></path>
					</svg>
				{:else}
					<svg
						xmlns="http://www.w3.org/2000/svg"
						width="24"
						height="24"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
					>
						<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
						<path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
					</svg>
				{/if}
			</div>
			<div class="header-text">
				<h2 id="modal-title">{getChangeTypeLabel()} {getActionVerb()}</h2>
				<p class="header-subtitle">Change saved successfully</p>
			</div>
			<button class="btn-close" on:click={handleCancel} aria-label="Close">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="20"
					height="20"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					stroke-width="2"
				>
					<path d="M18 6L6 18"></path>
					<path d="M6 6l12 12"></path>
				</svg>
			</button>
		</div>

		<!-- Change Summary -->
		<div class="change-summary">
			<p class="summary-text">{changeSummary}</p>

			<!-- Service Pattern Diff -->
			{#if patternDiff && (patternDiff.added.length > 0 || patternDiff.removed.length > 0)}
				<div class="pattern-diff">
					{#if patternDiff.removed.length > 0}
						<div class="diff-item diff-removed">
							<span class="diff-label">Removed:</span>
							<span class="diff-days">
								{patternDiff.removed.map((d) => dayNames[d]).join(', ')}
							</span>
						</div>
					{/if}
					{#if patternDiff.added.length > 0}
						<div class="diff-item diff-added">
							<span class="diff-label">Added:</span>
							<span class="diff-days">
								{patternDiff.added.map((d) => dayNames[d]).join(', ')}
							</span>
						</div>
					{/if}
				</div>
			{/if}
		</div>

		<!-- Affected Dates -->
		{#if affectedDates.length > 0}
			<div class="affected-dates">
				<h3>Affected Dates</h3>
				<div class="dates-grid">
					{#each displayedDates as date}
						<div class="date-chip">{formatDate(date)}</div>
					{/each}
					{#if hiddenDateCount > 0}
						<div class="date-chip date-more">+{hiddenDateCount} more</div>
					{/if}
				</div>
			</div>
		{/if}

		<!-- Notification Toggle -->
		<div class="notification-section">
			<label class="notification-toggle">
				<input type="checkbox" bind:checked={notifyCustomers} />
				<span class="toggle-track">
					<span class="toggle-thumb"></span>
				</span>
				<span class="toggle-label">
					Notify customers of this change
				</span>
			</label>

			{#if activeCustomerCount > 0}
				<p class="customer-count">
					{#if notifyCustomers}
						Will send to <strong>{activeCustomerCount}</strong> active customer{activeCustomerCount ===
						1
							? ''
							: 's'}
					{:else}
						{activeCustomerCount} active customer{activeCustomerCount === 1 ? '' : 's'} will not be
						notified
					{/if}
				</p>
			{/if}
		</div>

		<!-- Custom Message -->
		{#if notifyCustomers}
			<div class="message-section" transition:fly={{ y: -10, duration: 200 }}>
				<label for="custom-message">
					<span class="label-text">Message to customers</span>
					<span class="label-hint">Plain text - will be formatted in email</span>
				</label>
				<textarea
					id="custom-message"
					bind:value={customMessage}
					placeholder={getDefaultMessage()}
					rows="4"
				></textarea>
			</div>
		{/if}

		<!-- Actions -->
		<div class="modal-actions">
			<button class="btn-secondary" on:click={handleCancel} disabled={sending}> Close </button>
			{#if notifyCustomers}
				<button class="btn-primary btn-send" on:click={handleConfirm} disabled={sending}>
					{#if sending}
						<span class="spinner"></span>
						Sending...
					{:else}
						Send Notification
					{/if}
				</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		backdrop-filter: blur(4px);
		z-index: 200;
	}

	.modal {
		position: fixed;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		background: white;
		border-radius: 12px;
		box-shadow: 0 20px 50px rgba(0, 0, 0, 0.2);
		width: 90%;
		max-width: 520px;
		max-height: 90vh;
		overflow-y: auto;
		z-index: 201;
	}

	.modal-header {
		display: flex;
		align-items: flex-start;
		gap: 1rem;
		padding: 1.5rem 1.5rem 1rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.header-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 48px;
		height: 48px;
		background: #dbeafe;
		border-radius: 10px;
		color: #2563eb;
		flex-shrink: 0;
	}

	.header-text {
		flex: 1;
	}

	.header-text h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: #111827;
		margin: 0 0 0.25rem;
	}

	.header-subtitle {
		font-size: 0.875rem;
		color: #16a34a;
		margin: 0;
		display: flex;
		align-items: center;
		gap: 0.375rem;
	}

	.header-subtitle::before {
		content: '';
		display: inline-block;
		width: 8px;
		height: 8px;
		background: #16a34a;
		border-radius: 50%;
	}

	.btn-close {
		background: none;
		border: none;
		padding: 0.5rem;
		cursor: pointer;
		color: #6b7280;
		border-radius: 6px;
		transition: all 0.15s;
	}

	.btn-close:hover {
		background: #f3f4f6;
		color: #111827;
	}

	.change-summary {
		padding: 1rem 1.5rem;
		background: #f9fafb;
		border-bottom: 1px solid #e5e7eb;
	}

	.summary-text {
		font-size: 0.95rem;
		color: #374151;
		margin: 0;
		line-height: 1.5;
	}

	.pattern-diff {
		margin-top: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.diff-item {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-size: 0.875rem;
		padding: 0.375rem 0.625rem;
		border-radius: 6px;
	}

	.diff-removed {
		background: #fef2f2;
		color: #991b1b;
	}

	.diff-added {
		background: #f0fdf4;
		color: #166534;
	}

	.diff-label {
		font-weight: 500;
	}

	.diff-days {
		font-weight: 600;
	}

	.affected-dates {
		padding: 1rem 1.5rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.affected-dates h3 {
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
		margin: 0 0 0.75rem;
	}

	.dates-grid {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.date-chip {
		font-size: 0.8125rem;
		padding: 0.375rem 0.625rem;
		background: #f3f4f6;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		color: #374151;
	}

	.date-more {
		background: #dbeafe;
		border-color: #bfdbfe;
		color: #1d4ed8;
		font-weight: 500;
	}

	.notification-section {
		padding: 1.25rem 1.5rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.notification-toggle {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		cursor: pointer;
	}

	.notification-toggle input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}

	.toggle-track {
		position: relative;
		width: 44px;
		height: 24px;
		background: #d1d5db;
		border-radius: 12px;
		transition: background 0.2s;
		flex-shrink: 0;
	}

	.notification-toggle input:checked + .toggle-track {
		background: #2563eb;
	}

	.toggle-thumb {
		position: absolute;
		top: 2px;
		left: 2px;
		width: 20px;
		height: 20px;
		background: white;
		border-radius: 50%;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.2);
		transition: transform 0.2s;
	}

	.notification-toggle input:checked + .toggle-track .toggle-thumb {
		transform: translateX(20px);
	}

	.toggle-label {
		font-size: 0.95rem;
		font-weight: 500;
		color: #111827;
	}

	.customer-count {
		font-size: 0.875rem;
		color: #6b7280;
		margin: 0.75rem 0 0;
		padding-left: 3.25rem;
	}

	.customer-count strong {
		color: #111827;
	}

	.message-section {
		padding: 1rem 1.5rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.message-section label {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		margin-bottom: 0.5rem;
	}

	.label-text {
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
	}

	.label-hint {
		font-size: 0.75rem;
		color: #9ca3af;
	}

	.message-section textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid #d1d5db;
		border-radius: 8px;
		font-size: 0.875rem;
		font-family: inherit;
		resize: vertical;
		min-height: 100px;
		transition: border-color 0.15s, box-shadow 0.15s;
	}

	.message-section textarea:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.message-section textarea::placeholder {
		color: #9ca3af;
	}

	.modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 1rem 1.5rem;
	}

	.btn-secondary,
	.btn-primary {
		padding: 0.625rem 1.25rem;
		font-size: 0.875rem;
		font-weight: 500;
		border: none;
		border-radius: 8px;
		cursor: pointer;
		transition: all 0.15s;
	}

	.btn-secondary {
		background: #f3f4f6;
		color: #374151;
	}

	.btn-secondary:hover:not(:disabled) {
		background: #e5e7eb;
	}

	.btn-primary {
		background: #2563eb;
		color: white;
	}

	.btn-primary:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.btn-send {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.btn-secondary:disabled,
	.btn-primary:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.spinner {
		width: 16px;
		height: 16px;
		border: 2px solid rgba(255, 255, 255, 0.3);
		border-top-color: white;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(360deg);
		}
	}

	/* Focus visible styles for accessibility */
	.notification-toggle input:focus-visible + .toggle-track {
		outline: 2px solid #2563eb;
		outline-offset: 2px;
	}

	.btn-close:focus-visible,
	.btn-secondary:focus-visible,
	.btn-primary:focus-visible {
		outline: 2px solid #2563eb;
		outline-offset: 2px;
	}

	@media (max-width: 480px) {
		.modal {
			width: 95%;
			max-height: 85vh;
		}

		.modal-header {
			padding: 1.25rem 1rem 0.75rem;
		}

		.change-summary,
		.affected-dates,
		.notification-section,
		.message-section,
		.modal-actions {
			padding-left: 1rem;
			padding-right: 1rem;
		}

		.customer-count {
			padding-left: 0;
		}
	}
</style>
