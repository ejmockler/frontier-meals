import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	// @ts-ignore - Vite version mismatch in node_modules causes type conflicts
	plugins: [sveltekit()],
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		globals: true,
		environment: 'jsdom'
	},
	server: {
		port: 5173,
		strictPort: false,
		allowedHosts: ['localhost', '.trycloudflare.com']
	}
});
