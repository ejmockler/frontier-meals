import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import path from 'path';

export default defineConfig({
	plugins: [svelte({ hot: !process.env.VITEST })],
	resolve: {
		alias: {
			$lib: path.resolve('./src/lib'),
			'$env/static/private': path.resolve('./src/test-mocks/env-private.ts'),
			'$env/static/public': path.resolve('./src/test-mocks/env-public.ts'),
			'$env/dynamic/private': path.resolve('./src/test-mocks/env-dynamic-private.ts')
		}
	},
	test: {
		include: ['src/**/*.{test,spec}.{js,ts}'],
		globals: true,
		environment: 'jsdom',
		setupFiles: ['./src/test-setup.ts'],
		// Run service calendar and schedule tests sequentially to avoid database state pollution
		// These tests modify global database config that affects other concurrent tests
		fileParallelism: false
	}
});
