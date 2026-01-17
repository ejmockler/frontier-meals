<script lang="ts">
	import { cn } from '$utils/cn';

	interface Props {
		id?: string;
		background?: 'default' | 'elevated' | 'recessed';
		spacing?: 'normal' | 'compact' | 'spacious';
		class?: string;
		children: any;
	}

	let {
		id,
		background = 'default',
		spacing = 'normal',
		class: className,
		children
	}: Props = $props();

	const backgrounds = {
		default: 'bg-[#F5F3EF]',
		elevated: 'bg-white',
		recessed: 'bg-[#E8E6E1]'
	};

	const spacings = {
		compact: 'py-12 md:py-16',
		normal: 'py-16 md:py-24',
		spacious: 'py-24 md:py-32'
	};
</script>

<section {id} class={cn(backgrounds[background], spacings[spacing], 'relative', className)}>
	{@render children()}
</section>
