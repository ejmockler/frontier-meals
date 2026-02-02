// Vitest setup file - runs before all tests
// Load environment variables from .env file BEFORE any module imports
import { config } from 'dotenv';
import type { RequestEvent } from '@sveltejs/kit';

config();

/**
 * Create a mock RequestEvent for testing SvelteKit endpoint handlers.
 *
 * This provides the full RequestEvent interface that SvelteKit handlers expect,
 * including getClientAddress() which is required for rate limiting.
 *
 * @param options Configuration for the mock request
 * @returns A properly typed mock RequestEvent
 */
export function createMockRequestEvent(options: {
	request?: Partial<Request> & { text?: () => Promise<string>; headers?: any };
	headers?: Record<string, string>;
	clientAddress?: string;
	url?: string | URL;
	params?: Record<string, string>;
	locals?: Record<string, unknown>;
} = {}): RequestEvent {
	const {
		request,
		headers = {},
		clientAddress = '127.0.0.1',
		url = 'http://localhost:5173',
		params = {},
		locals = {}
	} = options;

	// Build headers - merge any provided headers with request.headers
	const mergedHeaders = new Headers();
	for (const [key, value] of Object.entries(headers)) {
		mergedHeaders.set(key, value);
	}

	// Create the mock request object
	const mockRequest = {
		headers: request?.headers || {
			get: (name: string) => mergedHeaders.get(name)
		},
		text: request?.text || (() => Promise.resolve('')),
		json: request?.json || (() => Promise.resolve({})),
		...request
	} as Request;

	const mockUrl = typeof url === 'string' ? new URL(url) : url;

	return {
		request: mockRequest,
		url: mockUrl,
		getClientAddress: () => clientAddress,
		params,
		route: { id: null },
		locals,
		platform: undefined,
		cookies: {
			get: () => undefined,
			getAll: () => [],
			set: () => {},
			delete: () => {},
			serialize: () => ''
		} as any,
		fetch: globalThis.fetch,
		setHeaders: () => {},
		isDataRequest: false,
		isSubRequest: false
	} as unknown as RequestEvent;
}
