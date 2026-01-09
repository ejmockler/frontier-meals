<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import { slide } from 'svelte/transition';

	export let type: 'holiday' | 'special_event';
	export let exception: any = null;

	const dispatch = createEventDispatcher<{
		close: void;
		saved: { exception: any; isNew: boolean };
	}>();

	let formData = {
		date: exception?.date || '',
		name: exception?.name || '',
		is_service_day: exception?.is_service_day ?? false,
		recurring: exception?.recurring || 'one-time',
		recurrence_rule: exception?.recurrence_rule || ''
	};

	let saving = false;

	async function handleSubmit() {
		if (!formData.date || !formData.name) {
			alert('Date and name are required');
			return;
		}

		saving = true;

		const isNew = !exception?.id;
		const data = new FormData();
		if (exception?.id) data.append('id', exception.id);
		data.append('date', formData.date);
		data.append('type', type);
		data.append('name', formData.name);
		data.append('is_service_day', formData.is_service_day.toString());
		data.append('recurring', formData.recurring);
		if (formData.recurrence_rule) {
			data.append('recurrence_rule', formData.recurrence_rule);
		}

		try {
			const action = exception ? '?/updateException' : '?/addException';
			const response = await fetch(action, {
				method: 'POST',
				body: data
			});

			if (response.ok) {
				// Dispatch saved event with exception data for notification modal
				dispatch('saved', {
					exception: {
						id: exception?.id,
						date: formData.date,
						type,
						name: formData.name,
						is_service_day: formData.is_service_day,
						recurring: formData.recurring,
						recurrence_rule: formData.recurrence_rule
					},
					isNew
				});
			}
		} catch (error) {
			console.error('Error saving exception:', error);
			alert('Failed to save. Please try again.');
		} finally {
			saving = false;
		}
	}

	function handleClose() {
		dispatch('close');
	}
</script>

<!-- Overlay -->
<div class="overlay" on:click={handleClose} transition:slide></div>

<!-- Side Panel -->
<div class="panel" transition:slide={{ axis: 'x' }}>
	<div class="panel-header">
		<h2>{exception ? 'Edit' : 'Add'} {type === 'holiday' ? 'Holiday' : 'Special Event'}</h2>
		<button class="btn-close" on:click={handleClose}>✕</button>
	</div>

	<form on:submit|preventDefault={handleSubmit} class="panel-content">
		<!-- Date -->
		<div class="form-group">
			<label for="date">Date *</label>
			<input
				type="date"
				id="date"
				bind:value={formData.date}
				required
			/>
		</div>

		<!-- Name -->
		<div class="form-group">
			<label for="name">Name *</label>
			<input
				type="text"
				id="name"
				bind:value={formData.name}
				placeholder={type === 'holiday' ? 'e.g., Thanksgiving' : 'e.g., Team Offsite'}
				required
			/>
		</div>

		<!-- Service Status -->
		<div class="form-group">
			<label class="checkbox-label">
				<input
					type="checkbox"
					bind:checked={formData.is_service_day}
				/>
				Service is available on this day
			</label>
			<p class="hint">
				{#if formData.is_service_day}
					Service will be <strong>open</strong> on this date (overrides normal pattern)
				{:else}
					Service will be <strong>closed</strong> on this date
				{/if}
			</p>
		</div>

		<!-- Recurring (Holidays only) -->
		{#if type === 'holiday'}
			<div class="form-group">
				<label for="recurring">Recurrence</label>
				<select id="recurring" bind:value={formData.recurring}>
					<option value="one-time">One-time</option>
					<option value="annual">Annual (same date every year)</option>
					<option value="floating">Floating (e.g., 4th Thursday of November)</option>
				</select>
				<p class="hint">
					{#if formData.recurring === 'annual'}
						This holiday will repeat on the same date every year
					{:else if formData.recurring === 'floating'}
						This holiday will repeat based on day-of-week rules (requires recurrence rule)
					{:else}
						This holiday occurs only once
					{/if}
				</p>
			</div>

			<!-- Recurrence Rule (for floating holidays) -->
			{#if formData.recurring === 'floating'}
				<div class="form-group">
					<label for="recurrence_rule">Recurrence Rule (JSON)</label>
					<textarea
						id="recurrence_rule"
						bind:value={formData.recurrence_rule}
						placeholder="{JSON.stringify({month:11,day_of_week:4,occurrence:4})}"
						rows="3"
					></textarea>
					<p class="hint">
						Example: 4th Thursday of November = {JSON.stringify({month:11,day_of_week:4,occurrence:4})}
					</p>
				</div>
			{/if}
		{/if}

		<!-- Actions -->
		<div class="form-actions">
			<button type="button" class="btn-cancel" on:click={handleClose}>
				Cancel
			</button>
			<button type="submit" class="btn-submit" disabled={saving}>
				{saving ? 'Saving...' : exception ? 'Update' : 'Add'}
			</button>
		</div>
	</form>
</div>

<style>
	.overlay {
		position: fixed;
		top: 0;
		left: 0;
		right: 0;
		bottom: 0;
		background: rgba(0, 0, 0, 0.5);
		z-index: 100;
		backdrop-filter: blur(2px);
	}

	.panel {
		position: fixed;
		top: 0;
		right: 0;
		bottom: 0;
		width: 400px;
		background: white;
		box-shadow: -4px 0 16px rgba(0, 0, 0, 0.1);
		z-index: 101;
		display: flex;
		flex-direction: column;
	}

	.panel-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 1.5rem;
		border-bottom: 1px solid #e5e7eb;
	}

	.panel-header h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: #1a1a1a;
		margin: 0;
	}

	.btn-close {
		background: none;
		border: none;
		font-size: 1.5rem;
		color: #666;
		cursor: pointer;
		padding: 0;
		width: 2rem;
		height: 2rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: all 0.2s;
	}

	.btn-close:hover {
		background: #f3f4f6;
		color: #1a1a1a;
	}

	.panel-content {
		flex: 1;
		overflow-y: auto;
		padding: 1.5rem;
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.form-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.form-group label {
		font-size: 0.875rem;
		font-weight: 600;
		color: #374151;
	}

	.form-group input[type='text'],
	.form-group input[type='date'],
	.form-group select,
	.form-group textarea {
		padding: 0.625rem;
		border: 1px solid #d1d5db;
		border-radius: 6px;
		font-size: 0.875rem;
		transition: all 0.2s;
	}

	.form-group input:focus,
	.form-group select:focus,
	.form-group textarea:focus {
		outline: none;
		border-color: #2563eb;
		box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
	}

	.checkbox-label {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		font-weight: 500 !important;
		cursor: pointer;
	}

	.checkbox-label input[type='checkbox'] {
		width: 1.125rem;
		height: 1.125rem;
		cursor: pointer;
	}

	.hint {
		font-size: 0.75rem;
		color: #6b7280;
		margin: 0;
		line-height: 1.4;
	}

	.form-actions {
		display: flex;
		gap: 0.75rem;
		margin-top: auto;
		padding-top: 1rem;
	}

	.btn-cancel,
	.btn-submit {
		flex: 1;
		padding: 0.625rem 1rem;
		font-size: 0.875rem;
		font-weight: 500;
		border: none;
		border-radius: 6px;
		cursor: pointer;
		transition: all 0.2s;
	}

	.btn-cancel {
		background: #f3f4f6;
		color: #374151;
	}

	.btn-cancel:hover {
		background: #e5e7eb;
	}

	.btn-submit {
		background: #2563eb;
		color: white;
	}

	.btn-submit:hover:not(:disabled) {
		background: #1d4ed8;
	}

	.btn-submit:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	@media (max-width: 768px) {
		.panel {
			width: 100%;
		}
	}
</style>
