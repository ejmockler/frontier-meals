<script lang="ts">
	import { createEventDispatcher } from 'svelte';

	export let events: any[];

	const dispatch = createEventDispatcher();

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr + 'T00:00:00');
		return date.toLocaleDateString('en-US', {
			weekday: 'short',
			month: 'short',
			day: 'numeric',
			year: 'numeric'
		});
	}

	async function deleteEvent(id: string) {
		if (!confirm('Delete this special event? This action cannot be undone.')) {
			return;
		}

		const formData = new FormData();
		formData.append('id', id);

		try {
			await fetch('?/deleteException', {
				method: 'POST',
				body: formData
			});

			window.location.reload();
		} catch (error) {
			console.error('Error deleting event:', error);
		}
	}
</script>

<div class="event-list">
	{#if events.length === 0}
		<div class="empty-state">
			<p>No special events configured</p>
			<p class="empty-hint">Add special events to override service patterns for specific dates</p>
		</div>
	{:else}
		<div class="list">
			{#each events as event}
				<div class="event-item">
					<div class="event-info">
						<h3 class="event-name">{event.name}</h3>
						<p class="event-date">{formatDate(event.date)}</p>
						{#if event.is_service_day}
							<span class="status-badge open">Open</span>
						{:else}
							<span class="status-badge closed">Closed</span>
						{/if}
					</div>

					<div class="event-actions">
						<button class="btn-edit" on:click={() => dispatch('edit', event)}>
							Edit
						</button>
						<button class="btn-delete" on:click={() => deleteEvent(event.id)}>
							Delete
						</button>
					</div>
				</div>
			{/each}
		</div>
	{/if}
</div>

<style>
	.event-list {
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

	.event-item {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1rem;
		background: #fef3c7;
		border: 1px solid #fbbf24;
		border-radius: 6px;
		transition: all 0.2s;
	}

	.event-item:hover {
		border-color: #f59e0b;
		background: #fef3c7;
	}

	.event-info {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.event-name {
		font-size: 0.95rem;
		font-weight: 600;
		color: #1a1a1a;
		margin: 0;
	}

	.event-date {
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

	.event-actions {
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
