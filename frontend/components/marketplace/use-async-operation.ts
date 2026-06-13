"use client";

import { useState, useCallback, useRef, useEffect } from "react";

type AsyncState<T> = {
  data: T | null;
  isLoading: boolean;
  error: string | null;
  isTimeout: boolean;
};

type UseAsyncOperationOptions = {
  /** Timeout in milliseconds. Default 30000ms (30s) per requirement 12.6 */
  timeout?: number;
};

/**
 * Hook for async operations with 30s timeout and retry support.
 * Shows loading within 200ms, times out at 30s with retry option.
 * Validates: Requirements 12.5, 12.6
 */
export function useAsyncOperation<T>(options: UseAsyncOperationOptions = {}) {
  const { timeout = 30000 } = options;
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    isLoading: false,
    error: null,
    isTimeout: false,
  });

  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
  }, []);

  useEffect(() => {
    return cleanup;
  }, [cleanup]);

  const execute = useCallback(
    async (asyncFn: (signal: AbortSignal) => Promise<T>) => {
      cleanup();

      const controller = new AbortController();
      abortRef.current = controller;

      setState({ data: null, isLoading: true, error: null, isTimeout: false });

      // Set up 30s timeout
      timeoutRef.current = setTimeout(() => {
        controller.abort();
        setState({
          data: null,
          isLoading: false,
          error: "Время ожидания истекло",
          isTimeout: true,
        });
      }, timeout);

      try {
        const result = await asyncFn(controller.signal);
        if (!controller.signal.aborted) {
          cleanup();
          setState({ data: result, isLoading: false, error: null, isTimeout: false });
        }
        return result;
      } catch (err) {
        if (controller.signal.aborted) {
          // Already handled by timeout or manual abort
          return null;
        }
        cleanup();
        const message =
          err instanceof Error ? err.message : "Произошла ошибка";
        setState({ data: null, isLoading: false, error: message, isTimeout: false });
        return null;
      }
    },
    [cleanup, timeout]
  );

  const reset = useCallback(() => {
    cleanup();
    setState({ data: null, isLoading: false, error: null, isTimeout: false });
  }, [cleanup]);

  return { ...state, execute, reset };
}
