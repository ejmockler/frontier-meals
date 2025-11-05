<script lang="ts">
	import { invalidate } from '$app/navigation';
	import { onMount } from 'svelte';
	import '../app.css';
	import type { LayoutData } from './$types';

	let { data, children }: { data: LayoutData; children: any } = $props();

	onMount(() => {
		const { data: authListener } = data.supabase.auth.onAuthStateChange(() => {
			invalidate('supabase:auth');
		});

		return () => {
			authListener?.subscription.unsubscribe();
		};
	});
</script>

<!-- Demo Mode Banner -->
{#if data.isDemoMode}
	<div class="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-yellow-500 to-amber-500 text-black px-4 py-2 text-center font-semibold shadow-lg">
		<div class="flex items-center justify-center gap-2">
			<span class="text-xl">🎭</span>
			<span>DEMO MODE - No real data is being accessed or modified</span>
			<span class="text-xl">🎭</span>
		</div>
	</div>
	<div class="h-12"></div>
{/if}

{@render children()}
