<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let holidays: any[];

	const dispatch = createEventDispatcher<{
		edit: any;
		deleted: { exception: any };
	}>();

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	function getRecurringLabel(recurring: string): string {
		if (recurring === 'annual') return 'Annual';
		if (recurring === 'floating') return 'Floating';
		return 'One-time';
	}

	async function deleteHoliday(holiday: any) {
		if (!confirm('Delete this holiday? This action cannot be undone.')) {
			return;
		}

		const formData = new FormData();
		formData.append('id', holiday.id);

		try {
			const response = await fetch('?/deleteException', {
				method: 'POST',
				body: formData
			});

			if (response.ok) {
				// Dispatch deleted event for notification modal
				dispatch('deleted', { exception: holiday });
			}
		} catch (error) {
			console.error('Error deleting holiday:', error);
		}
	}
</script>

<div class="holiday-list">
	{#if holidays.length === 0}
		<div class="empty-state">
			<p>No holidays configured</p>
			<p class="empty-hint">Add holidays to mark days when service is closed</p>
		</div>
	{:else}
		<div class="list">
			{#each holidays as holiday}
				<div class="holiday-item">
					<div class="holiday-info">
						<div class="holiday-header">
							<h3 class="holiday-name">{holiday.name}</h3>
							<span class="recurring-badge">{getRecurringLabel(holiday.recurring)}</span>
						</div>
						<p class="holiday-date">{formatDate(holiday.date)}</p>
						{#if !holiday.is_service_day}
							<span class="status-badge closed">Closed</span>
						{:else}
							<span class="status-badge open">Open</span>
						{/if}
					</div>

					<div class="holiday-actions">
						<button class="btn-edit" on:click={() => dispatch('edit', holiday)}>
							Edit
						</button>
						<button class="btn-delete" on:click={() => deleteHoliday(holiday)}>
							Delete
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.holiday-list {
		min-height: 100px;
	}

	.empty-state {
		text-align: center;
		padding: 2rem;
		color: #666;
	}

	.empty-state p {
		margin: 0;
	}

	.empty-hint {
		font-size: 0.875rem;
		color: #999;
		margin-top: 0.5rem !important;
	}

	.list {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.holiday-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: #f9fafb;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
		transition: all 0.2s;
	}

	.holiday-item:hover {
		border-color: #cbd5e1;
		background: #f1f5f9;
	}

	.holiday-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.holiday-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.holiday-name {
		font-size: 0.95rem;
		font-weight: 600;
		color: #1a1a1a;
		margin: 0;
	}

	.recurring-badge {
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.125rem 0.5rem;
		background: #e0e7ff;
		color: #3730a3;
		border-radius: 4px;
	}

	.holiday-date {
		font-size: 0.875rem;
		color: #666;
		margin: 0;
	}

	.status-badge {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.25rem 0.5rem;
		border-radius: 4px;
	}

	.status-badge.closed {
		background: #fee2e2;
		color: #991b1b;
	}

	.status-badge.open {
		background: #dcfce7;
		color: #166534;
	}

	.holiday-actions {
		display: flex;
		gap: 0.5rem;
	}

	.btn-edit,
	.btn-delete {
		padding: 0.5rem 0.75rem;
		font-size: 0.875rem;
		font-weight: 500;
		border: none;
		border-radius: 4px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-edit {
		background: #f3f4f6;
		color: #374151;
	}

	.btn-edit:hover {
		background: #e5e7eb;
	}

	.btn-delete {
		background: #fef2f2;
		color: #dc2626;
	}

	.btn-delete:hover {
		background: #fee2e2;
	}
</style>
