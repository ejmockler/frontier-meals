<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageData } from './$types';
	import ServicePatternEditor from '$lib/components/admin/schedule/ServicePatternEditor.svelte';
	import CalendarView from '$lib/components/admin/schedule/CalendarView.svelte';
	import HolidayList from '$lib/components/admin/schedule/HolidayList.svelte';
	import SpecialEventList from '$lib/components/admin/schedule/SpecialEventList.svelte';
	import ExceptionPanel from '$lib/components/admin/schedule/ExceptionPanel.svelte';

	export let data: PageData;

	let showExceptionPanel = false;
	let editingException: any = null;
	let exceptionType: 'holiday' | 'special_event' = 'holiday';

	function openAddException(type: 'holiday' | 'special_event') {
		exceptionType = type;
		editingException = null;
		showExceptionPanel = true;
	}

	function openEditException(exception: any) {
		exceptionType = exception.type;
		editingException = exception;
		showExceptionPanel = true;
	}

	function closeExceptionPanel() {
		showExceptionPanel = false;
		editingException = null;
	}
</script>

<svelte:head>
	<title>Schedule - Frontier Meals Admin</title>
</svelte:head>

<div class="schedule-page">
	<div class="schedule-header">
		<h1>Service Schedule</h1>
		<p class="subtitle">Manage service days, holidays, and special events</p>
	</div>

	<div class="schedule-content">
		<div class="main-panel">
			<!-- Service Pattern Editor (Sticky Header) -->
			<ServicePatternEditor serviceDays={data.config.service_days} />

			<!-- 30-Day Calendar View -->
			<section class="calendar-section">
				<h2>Next 30 Days</h2>
				<CalendarView
					serviceDays={data.config.service_days}
					holidays={data.holidays}
					specialEvents={data.specialEvents}
				/>
			</section>

			<!-- Holiday Management -->
			<section class="exceptions-section">
				<div class="section-header">
					<h2>Holidays & Closures</h2>
					<button class="btn-add" on:click={() => openAddException('holiday')}>
						+ Add Holiday
					</button>
				</div>
				<HolidayList holidays={data.holidays} on:edit={(e) => openEditException(e.detail)} />
			</section>

			<!-- Special Events -->
			<section class="exceptions-section">
				<div class="section-header">
					<h2>Special Events</h2>
					<button class="btn-add" on:click={() => openAddException('special_event')}>
						+ Add Event
					</button>
				</div>
				<SpecialEventList
					events={data.specialEvents}
					on:edit={(e) => openEditException(e.detail)}
				/>
			</section>
		</div>

		<!-- Side Panel for Add/Edit Exceptions -->
		{#if showExceptionPanel}
			<ExceptionPanel
				type={exceptionType}
				exception={editingException}
				on:close={closeExceptionPanel}
			/>
		{/if}
	</div>
</div>

<style>
	.schedule-page {
		max-width: 1400px;
		margin: 0 auto;
		padding: 2rem;
	}

	.schedule-header {
		margin-bottom: 2rem;
	}

	.schedule-header h1 {
		font-size: 2rem;
		font-weight: 600;
		color: #1a1a1a;
		margin: 0 0 0.5rem 0;
	}

	.subtitle {
		color: #666;
		font-size: 0.95rem;
		margin: 0;
	}

	.schedule-content {
		display: flex;
		gap: 2rem;
		position: relative;
	}

	.main-panel {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 2rem;
	}

	.calendar-section,
	.exceptions-section {
		background: white;
		border: 1px solid #e5e5e5;
		border-radius: 8px;
		padding: 1.5rem;
	}

	.calendar-section h2,
	.exceptions-section h2 {
		font-size: 1.25rem;
		font-weight: 600;
		color: #1a1a1a;
		margin: 0 0 1rem 0;
	}

	.section-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 1rem;
	}

	.btn-add {
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

	.btn-add:hover {
		background: #1d4ed8;
	}
</style>
