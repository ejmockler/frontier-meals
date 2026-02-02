/**
 * Tests for timeout utility
 */

import { describe, it, expect, vi } from 'vitest';
import { withTimeout, TimeoutError, createTimeoutWrapper } from './timeout';

describe('withTimeout', () => {
	it('resolves when promise completes before timeout', async () => {
		const promise = Promise.resolve('success');
		const result = await withTimeout(promise, 1000, 'Test operation');
		expect(result).toBe('success');
	});

	it('rejects with TimeoutError when promise exceeds timeout', async () => {
		// Create a promise that never resolves
		const promise = new Promise<string>(() => {});

		await expect(withTimeout(promise, 50, 'Slow operation')).rejects.toThrow(TimeoutError);

		try {
			await withTimeout(promise, 50, 'Slow operation');
		} catch (error) {
			expect(error).toBeInstanceOf(TimeoutError);
			if (error instanceof TimeoutError) {
				expect(error.timeoutMs).toBe(50);
				expect(error.operation).toBe('Slow operation');
				expect(error.message).toBe('Slow operation timed out after 50ms');
			}
		}
	});

	it('uses default timeout of 10000ms', async () => {
		const promise = new Promise<string>(() => {});

		// Use fake timers to test default
		vi.useFakeTimers();

		const resultPromise = withTimeout(promise, undefined, 'Test');

		// Advance timer to just before default timeout
		vi.advanceTimersByTime(9999);

		// Promise should still be pending

		// Advance past timeout
		vi.advanceTimersByTime(2);

		await expect(resultPromise).rejects.toThrow('Test timed out after 10000ms');

		vi.useRealTimers();
	});

	it('uses default operation name when not provided', async () => {
		const promise = new Promise<string>(() => {});

		vi.useFakeTimers();

		const resultPromise = withTimeout(promise, 100);

		vi.advanceTimersByTime(101);

		await expect(resultPromise).rejects.toThrow('Operation timed out after 100ms');

		vi.useRealTimers();
	});

	it('clears timeout when promise resolves', async () => {
		vi.useFakeTimers();

		const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

		const promise = Promise.resolve('success');
		await withTimeout(promise, 1000);

		expect(clearTimeoutSpy).toHaveBeenCalled();

		clearTimeoutSpy.mockRestore();
		vi.useRealTimers();
	});

	it('clears timeout when promise rejects', async () => {
		vi.useFakeTimers();

		const clearTimeoutSpy = vi.spyOn(globalThis, 'clearTimeout');

		const promise = Promise.reject(new Error('Original error'));

		await expect(withTimeout(promise, 1000)).rejects.toThrow('Original error');
		expect(clearTimeoutSpy).toHaveBeenCalled();

		clearTimeoutSpy.mockRestore();
		vi.useRealTimers();
	});

	it('preserves original promise rejection', async () => {
		const originalError = new Error('Database connection failed');
		const promise = Promise.reject(originalError);

		await expect(withTimeout(promise, 1000, 'DB query')).rejects.toBe(originalError);
	});

	it('handles concurrent timeouts independently', async () => {
		vi.useFakeTimers();

		const slowPromise = new Promise<string>(() => {});
		const fastPromise = Promise.resolve('fast');

		const slowResult = withTimeout(slowPromise, 100, 'Slow');
		const fastResult = withTimeout(fastPromise, 100, 'Fast');

		// Fast should resolve immediately
		await expect(fastResult).resolves.toBe('fast');

		// Slow should timeout
		vi.advanceTimersByTime(101);
		await expect(slowResult).rejects.toThrow('Slow timed out after 100ms');

		vi.useRealTimers();
	});
});

describe('TimeoutError', () => {
	it('has correct name property', () => {
		const error = new TimeoutError('Test', 5000);
		expect(error.name).toBe('TimeoutError');
	});

	it('exposes timeoutMs and operation properties', () => {
		const error = new TimeoutError('API call', 3000);
		expect(error.timeoutMs).toBe(3000);
		expect(error.operation).toBe('API call');
	});

	it('is instanceof Error', () => {
		const error = new TimeoutError('Test', 1000);
		expect(error).toBeInstanceOf(Error);
	});
});

describe('createTimeoutWrapper', () => {
	it('creates a wrapper with custom defaults', async () => {
		const wrapper = createTimeoutWrapper(2000, 'PayPal');

		vi.useFakeTimers();

		const promise = new Promise<string>(() => {});
		const result = wrapper(promise, 'OAuth');

		vi.advanceTimersByTime(2001);

		await expect(result).rejects.toThrow('PayPal: OAuth timed out after 2000ms');

		vi.useRealTimers();
	});

	it('allows overriding timeout per call', async () => {
		const wrapper = createTimeoutWrapper(10000, 'API');

		vi.useFakeTimers();

		const promise = new Promise<string>(() => {});
		const result = wrapper(promise, 'fast call', 500);

		vi.advanceTimersByTime(501);

		await expect(result).rejects.toThrow('API: fast call timed out after 500ms');

		vi.useRealTimers();
	});

	it('works without service prefix', async () => {
		const wrapper = createTimeoutWrapper(1000);

		vi.useFakeTimers();

		const promise = new Promise<string>(() => {});
		const result = wrapper(promise, 'operation');

		vi.advanceTimersByTime(1001);

		await expect(result).rejects.toThrow('operation timed out after 1000ms');

		vi.useRealTimers();
	});
});
