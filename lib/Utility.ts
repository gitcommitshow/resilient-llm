/**
 * Common utility functions
 */

/**
 * Sleep for a given number of milliseconds.
 * Supports abort via AbortSignal; if aborted, rejects with an AbortError.
 *
 * @param ms - The number of milliseconds to sleep
 * @param abortSignal - Optional abort signal to listen for abort events
 * @returns A promise that resolves when the sleep is complete, or rejects on abort
 * @example
 * await sleep(100, new AbortController().signal);
 */
export function sleep(ms: number, abortSignal?: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const timerId = setTimeout(() => {
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
  
      function onAbort() {
        clearTimeout(timerId);
        const error = new Error(abortSignal!.reason || 'Operation was aborted');
        error.name = 'AbortError';
        reject(error);
      }
  
      if (abortSignal) {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }
    });
}
