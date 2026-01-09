<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { PageData } from './$types';
	import ServicePatternEditor from '$lib/components/admin/schedule/ServicePatternEditor.svelte';
	import CalendarView from '$lib/components/admin/schedule/CalendarView.svelte';
	import HolidayList from '$lib/components/admin/schedule/HolidayList.svelte';
	import SpecialEventList from '$lib/components/admin/schedule/SpecialEventList.svelte';
	import ExceptionPanel from '$lib/components/admin/schedule/ExceptionPanel.svelte';
	import ScheduleChangeModal from '$lib/components/admin/schedule/ScheduleChangeModal.svelte';
	import { calculateAffectedDatesForPatternChange } from '$lib/utils/schedule-dates';

	export let data: PageData;

	let showExceptionPanel = false;
	let editingException: any = null;
	let exceptionType: 'holiday' | 'special_event' = 'holiday';

	// Modal state
	let showChangeModal = false;
	let pendingChange: {
		type: 'service_pattern' | 'holiday' | 'special_event';
		action: 'added' | 'updated' | 'deleted';
		summary: string;
		affectedDates: string[];
		previousValue?: any;
		newValue?: any;
		exceptionDate?: string;
	} | null = null;

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

	// Handle schedule change completion - show notification modal
	function handleScheduleChange(change: typeof pendingChange) {
		pendingChange = change;
		showChangeModal = true;
	}

	// Handle notification modal confirmation
	async function handleNotificationConfirm(event: CustomEvent<{ notify: boolean; message: string }>) {
		const { notify, message } = event.detail;

		if (notify && pendingChange) {
			// Send notification via server action
			const formData = new FormData();
			formData.append('change_type', pendingChange.type);
			formData.append('change_action', pendingChange.action);
			formData.append('message', message);
			formData.append('affected_dates', JSON.stringify(pendingChange.affectedDates));
			if (pendingChange.exceptionDate) {
				formData.append('effective_date', pendingChange.exceptionDate);
			}

			try {
				const response = await fetch('?/sendNotification', {
					method: 'POST',
					body: formData
				});

				if (response.ok) {
					const result = await response.json();
					console.log('Notifications sent:', result);
				} else {
					console.error('Failed to send notifications');
				}
			} catch (error) {
				console.error('Error sending notifications:', error);
			}
		}

		// Close modal and refresh data
		showChangeModal = false;
		pendingChange = null;
		await invalidateAll();
	}

	function handleNotificationCancel() {
		showChangeModal = false;
		pendingChange = null;
		// Still refresh to show the saved change
		invalidateAll();
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
			<ServicePatternEditor
				serviceDays={data.config.service_days}
				on:saved={(e) => {
					const { previousDays, newDays } = e.detail;
					const affectedDates = calculateAffectedDatesForPatternChange(previousDays, newDays, 30);
					const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
					const newDayNames = newDays.map((d: number) => dayNames[d]).join(', ');

					handleScheduleChange({
						type: 'service_pattern',
						action: 'updated',
						summary: `Service pattern updated to: ${newDayNames}`,
						affectedDates,
						previousValue: previousDays,
						newValue: newDays
					});
				}}
			/>

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
				<HolidayList
					holidays={data.holidays}
					on:edit={(e) => openEditException(e.detail)}
					on:deleted={(e) => {
						const { exception } = e.detail;
						handleScheduleChange({
							type: 'holiday',
							action: 'deleted',
							summary: `Holiday "${exception.name}" removed`,
							affectedDates: [exception.date],
							exceptionDate: exception.date
						});
					}}
				/>
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
					on:deleted={(e) => {
						const { exception } = e.detail;
						handleScheduleChange({
							type: 'special_event',
							action: 'deleted',
							summary: `Special event "${exception.name}" removed`,
							affectedDates: [exception.date],
							exceptionDate: exception.date
						});
					}}
				/>
			</section>
		</div>

		<!-- Side Panel for Add/Edit Exceptions -->
		{#if showExceptionPanel}
			<ExceptionPanel
				type={exceptionType}
				exception={editingException}
				on:close={closeExceptionPanel}
				on:saved={(e) => {
					const { exception, isNew } = e.detail;
					closeExceptionPanel();
					handleScheduleChange({
						type: exceptionType,
						action: isNew ? 'added' : 'updated',
						summary: isNew
							? `${exceptionType === 'holiday' ? 'Holiday' : 'Special event'} "${exception.name}" added`
							: `${exceptionType === 'holiday' ? 'Holiday' : 'Special event'} "${exception.name}" updated`,
						affectedDates: [exception.date],
						exceptionDate: exception.date
					});
				}}
			/>
		{/if}
	</div>
</div>

<!-- Schedule Change Notification Modal -->
{#if showChangeModal && pendingChange}
	<ScheduleChangeModal
		changeType={pendingChange.type}
		changeAction={pendingChange.action}
		changeSummary={pendingChange.summary}
		affectedDates={pendingChange.affectedDates}
		activeCustomerCount={data.activeCustomerCount}
		previousValue={pendingChange.previousValue}
		newValue={pendingChange.newValue}
		on:confirm={handleNotificationConfirm}
		on:cancel={handleNotificationCancel}
	/>
{/if}

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
