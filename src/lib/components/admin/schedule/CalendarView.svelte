<script lang="ts">
	import DayBox from './DayBox.svelte';

	export let serviceDays: number[];
	export let holidays: any[];
	export let specialEvents: any[];

	// Generate next 30 days
	function generateNext30Days() {
		const days = [];
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		for (let i = 0; i < 30; i++) {
			const date = new Date(today);
			date.setDate(today.getDate() + i);
			days.push(date);
		}

		return days;
	}

	const days = generateNext30Days();

	// Create lookup maps for exceptions
	$: holidayMap = new Map(holidays.map((h) => [h.date, h]));
	$: eventMap = new Map(specialEvents.map((e) => [e.date, e]));

	function getDateStr(date: Date): string {
		return date.toISOString().split('T')[0];
	}

	function isServiceDay(date: Date): boolean {
		const dateStr = getDateStr(date);
		const dayOfWeek = date.getDay();

		// Check if there's a holiday closure
		const holiday = holidayMap.get(dateStr);
		if (holiday && !holiday.is_service_day) {
			return false;
		}

		// Check if there's a special event override
		const event = eventMap.get(dateStr);
		if (event) {
			return event.is_service_day;
		}

		// Default to service pattern
		return serviceDays.includes(dayOfWeek);
	}

	function getException(date: Date) {
		const dateStr = getDateStr(date);
		return holidayMap.get(dateStr) || eventMap.get(dateStr);
	}

	// Group days by week
	function groupByWeeks(days: Date[]): Date[][] {
		const weeks: Date[][] = [];
		let currentWeek: Date[] = [];

		days.forEach((day, index) => {
			currentWeek.push(day);
			if (currentWeek.length === 7 || index === days.length - 1) {
				weeks.push(currentWeek);
				currentWeek = [];
			}
		});

		return weeks;
	}

	$: weeks = groupByWeeks(days);
</script>

<div class="calendar-view">
	<!-- Day headers -->
	<div class="calendar-header">
		{#each ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as dayName}
			<div class="day-header">{dayName}</div>
		{/each}
	</div>

	<!-- Calendar grid -->
	<div class="calendar-grid">
		{#each weeks as week}
			{#each week as day}
				<DayBox
					date={day}
					isService={isServiceDay(day)}
					exception={getException(day)}
				/>
			{/each}
		{/each}
	</div>
</div>

<style>
	.calendar-view {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.calendar-header {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.5rem;
		margin-bottom: 0.25rem;
	}

	.day-header {
		text-align: center;
		font-size: 0.875rem;
		font-weight: 600;
		color: #666;
		padding: 0.5rem;
	}

	.calendar-grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 0.5rem;
	}
</style>
