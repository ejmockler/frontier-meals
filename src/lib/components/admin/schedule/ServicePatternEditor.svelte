<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';

	export let serviceDays: number[];

	const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
	let selectedDays = new Set(serviceDays);
	let saving = false;

	function toggleDay(day: number) {
		if (selectedDays.has(day)) {
			selectedDays.delete(day);
		} else {
			selectedDays.add(day);
		}
		selectedDays = selectedDays; // Trigger reactivity
	}

	async function savePattern() {
		saving = true;

		const formData = new FormData();
		formData.append('service_days', JSON.stringify(Array.from(selectedDays).sort()));

		try {
			const response = await fetch('?/updateServicePattern', {
				method: 'POST',
				body: formData
			});

			if (response.ok) {
				await invalidateAll();
			}
		} catch (error) {
			console.error('Error saving service pattern:', error);
		} finally {
			saving = false;
		}
	}

	$: hasChanges = JSON.stringify(Array.from(selectedDays).sort()) !== JSON.stringify(serviceDays.sort());
</script>

<section class="service-pattern-editor">
	<div class="header">
		<div>
			<h2>Service Pattern</h2>
			<p class="description">Select which days of the week service is available</p>
		</div>
		{#if hasChanges}
			<button class="btn-save" on:click={savePattern} disabled={saving}>
				{saving ? 'Saving...' : 'Save Changes'}
			</button>
		{/if}
	</div>

	<div class="day-toggles">
		{#each dayNames as dayName, index}
			<button
				type="button"
				class="day-toggle"
				class:active={selectedDays.has(index)}
				on:click={() => toggleDay(index)}
			>
				<span class="day-name">{dayName}</span>
				<span class="day-status">
					{selectedDays.has(index) ? 'Service' : 'Closed'}
				</span>
			</button>
		{/each}
	</div>
</section>

<style>
	.service-pattern-editor {
		background: white;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		padding: 1.5rem;
		position: sticky;
		top: 5rem;
		z-index: 10;
		box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
	}

	.header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1.25rem;
	}

	.header h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: #1a1a1a;
		margin: 0 0 0.25rem 0;
	}

	.description {
		font-size: 0.875rem;
		color: #666;
		margin: 0;
	}

	.btn-save {
		background: #2563eb;
		color: white;
		border: none;
		border-radius: 6px;
		padding: 0.5rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		cursor: pointer;
		transition: background 0.2s;
	}

	.btn-save:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.btn-save:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.day-toggles {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.75rem;
	}

	.day-toggle {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 0.5rem;
		background: #f9fafb;
		border: 2px solid #e5e7eb;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.day-toggle:hover {
		border-color: #cbd5e1;
		background: #f1f5f9;
	}

	.day-toggle.active {
		background: #dbeafe;
		border-color: #2563eb;
	}

	.day-toggle.active:hover {
		background: #bfdbfe;
		border-color: #1d4ed8;
	}

	.day-name {
		font-size: 0.875rem;
		font-weight: 600;
		color: #1a1a1a;
	}

	.day-status {
		font-size: 0.75rem;
		color: #666;
	}

	.day-toggle.active .day-status {
		color: #2563eb;
		font-weight: 500;
	}

	@media (max-width: 768px) {
		.day-toggles {
			grid-template-columns: repeat(4, 1fr);
		}
	}
</style>
