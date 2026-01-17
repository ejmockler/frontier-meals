<script lang="ts">
	import { cn } from '$utils/cn';

	interface Props {
		title: string;
		description: string;
		icon?: string; // Lucide icon name
		highlight?: boolean; // For key features like 75% reimbursement
		class?: string;
	}

	let { title, description, icon, highlight = false, class: className }: Props = $props();
</script>

<div
	class={cn(
		'p-6 rounded-md transition-all duration-150',
		highlight
			? 'bg-[#E67E50]/10 border-2 border-[#E67E50]/30'
			: 'bg-white border-2 border-[#D9D7D2]',
		'hover:shadow-md hover:border-[#B8B6B1]',
		className
	)}
>
	{#if icon}
		<div
			class={cn(
				'w-12 h-12 rounded-md flex items-center justify-center mb-4',
				highlight ? 'bg-[#E67E50] text-white' : 'bg-[#E8E6E1] text-[#5C5A56]'
			)}
		>
			<!-- Icon placeholder - integrate with your icon system -->
			<span class="text-2xl">{icon}</span>
		</div>
	{/if}

	<h3 class={cn('text-lg font-bold text-[#1A1816] mb-2', highlight && 'text-[#E67E50]')}>
		{title}
	</h3>

	<p class="text-[#5C5A56] leading-relaxed">
		{description}
	</p>
</div>
