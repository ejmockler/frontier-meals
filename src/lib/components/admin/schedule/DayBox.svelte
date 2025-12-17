<script lang="ts">
	export let date: Date;
	export let isService: boolean;
	export let exception: any = null;

	const today = new Date();
	today.setHours(0, 0, 0, 0);

	$: isToday = date.getTime() === today.getTime();
	$: isPast = date < today;

	function formatDate(date: Date): string {
		return date.getDate().toString();
	}

	function getMonthName(date: Date): string {
		return date.toLocaleDateString('en-US', { month: 'short' });
	}

	$: showMonth = date.getDate() === 1;
</script>

<div
	class="day-box"
	class:is-today={isToday}
	class:is-past={isPast}
	class:is-service={isService}
	class:is-closed={!isService}
	class:has-exception={exception}
>
	<div class="date-number">
		{formatDate(date)}
		{#if showMonth}
			<span class="month-label">{getMonthName(date)}</span>
		{/if}
	</div>

	<div class="status-indicator">
		{#if exception}
			<span class="exception-badge" class:holiday={exception.type === 'holiday'} class:event={exception.type === 'special_event'}>
				{exception.type === 'holiday' ? '🎉' : '⭐'}
			</span>
		{:else if isService}
			<span class="service-badge">Open</span>
		{:else}
			<span class="closed-badge">Closed</span>
		{/if}
	</div>

	{#if exception}
		<div class="exception-name">{exception.name}</div>
	{/if}
</div>

<style>
	.day-box {
		position: relative;
		aspect-ratio: 1;
		padding: 0.75rem;
		background: white;
		border: 2px solid #e5e7eb;
		border-radius: 6px;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		transition: all 0.2s;
	}

	.day-box.is-today {
		border-color: #2563eb;
		box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.1);
	}

	.day-box.is-past {
		opacity: 0.5;
	}

	.day-box.is-service {
		background: #f0fdf4;
		border-color: #86efac;
	}

	.day-box.is-closed {
		background: #fef2f2;
		border-color: #fca5a5;
	}

	.day-box.has-exception {
		background: #fef3c7;
		border-color: #fbbf24;
	}

	.date-number {
		display: flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.875rem;
		font-weight: 600;
		color: #1a1a1a;
	}

	.month-label {
		font-size: 0.75rem;
		font-weight: 500;
		color: #666;
		text-transform: uppercase;
	}

	.status-indicator {
		margin-top: auto;
	}

	.service-badge,
	.closed-badge,
	.exception-badge {
		display: inline-block;
		font-size: 0.75rem;
		font-weight: 500;
		padding: 0.125rem 0.5rem;
		border-radius: 4px;
	}

	.service-badge {
		background: #dcfce7;
		color: #166534;
	}

	.closed-badge {
		background: #fee2e2;
		color: #991b1b;
	}

	.exception-badge {
		background: #fef3c7;
		color: #92400e;
		font-size: 1rem;
		padding: 0.25rem;
	}

	.exception-name {
		font-size: 0.625rem;
		color: #666;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: -0.25rem;
	}

	@media (max-width: 768px) {
		.day-box {
			padding: 0.5rem;
			font-size: 0.75rem;
		}

		.exception-name {
			display: none;
		}
	}
</style>
