export function getWeekDates(date: Date = new Date()): Date[] {
	const week: Date[] = [];
	const current = new Date(date);

	// Get to Monday of current week
	const day = current.getDay();
	const diff = current.getDate() - day + (day === 0 ? -6 : 1);
	current.setDate(diff);

	// Generate 7 days
	for (let i = 0; i < 7; i++) {
		week.push(new Date(current));
		current.setDate(current.getDate() + 1);
	}

	return week;
}

export function formatDate(date: Date): string {
	return date.toISOString().split('T')[0];
}

export function formatWeekRange(dates: Date[]): string {
	if (dates.length === 0) return '';

	const first = dates[0];
	const last = dates[dates.length - 1];

	const options: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };

	return `${first.toLocaleDateString('en-US', options)} - ${last.toLocaleDateString('en-US', options)}`;
}

export function getDayName(date: Date): string {
	return date.toLocaleDateString('en-US', { weekday: 'short' });
}

export function getDayNumber(date: Date): number {
	return date.getDate();
}

export function isToday(date: Date): boolean {
	const today = new Date();
	return (
		date.getDate() === today.getDate() &&
		date.getMonth() === today.getMonth() &&
		date.getFullYear() === today.getFullYear()
	);
}

export function isPast(date: Date): boolean {
	const today = new Date();
	today.setHours(0, 0, 0, 0);
	const check = new Date(date);
	check.setHours(0, 0, 0, 0);
	return check < today;
}

export function addWeeks(date: Date, weeks: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + weeks * 7);
	return result;
}
