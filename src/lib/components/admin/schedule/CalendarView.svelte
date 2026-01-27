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

	// Group days into calendar-aligned weeks (Sun=0 start)
	function groupByWeeks(days: Date[]): (Date | null)[][] {
		const weeks: (Date | null)[][] = [];
		let currentWeek: (Date | null)[] = [];

		// Pad the first week with nulls so days align to correct columns
		const firstDayOfWeek = days[0].getDay(); // 0=Sun, 1=Mon, etc.
		for (let i = 0; i < firstDayOfWeek; i++) {
			currentWeek.push(null);
		}

		days.forEach((day) => {
			currentWeek.push(day);
			if (currentWeek.length === 7) {
				weeks.push(currentWeek);
				currentWeek = [];
			}
		});

		// Pad the last week with nulls
		if (currentWeek.length > 0) {
			while (currentWeek.length < 7) {
				currentWeek.push(null);
			}
			weeks.push(currentWeek);
		}

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
				{#if day}
					<DayBox
						date={day}
						isService={isServiceDay(day)}
						exception={getException(day)}
					/>
				{:else}
					<div class="empty-day"></div>
				{/if}
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

	.empty-day {
		min-height: 4rem;
	}
</style>
