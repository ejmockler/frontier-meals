<script lang="ts">
	import { cn } from '$utils/cn';

	interface Props {
		size?: 'default' | 'narrow' | 'wide';
		class?: string;
		children: any;
	}

	let { size = 'default', class: className, children }: Props = $props();

	const sizes = {
		narrow: 'max-w-3xl',
		default: 'max-w-6xl',
		wide: 'max-w-7xl'
	};
</script>

<div class={cn(sizes[size], 'mx-auto px-4 sm:px-6 lg:px-8', className)}>
	{@render children()}
</div>
