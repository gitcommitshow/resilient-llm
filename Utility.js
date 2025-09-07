/**
 * Common utility functions
 */

 /**
 * Sleep for a given number of milliseconds
 * @param {number} ms - The number of milliseconds to sleep
 * @param {AbortSignal} abortSignal - The abort signal to listen for abort events
 * @returns {Promise<void>} - A promise that resolves when the sleep is complete
 * @example
 * await sleep(100, new AbortController().signal);
 */
export function sleep(ms, abortSignal) {
    return new Promise((resolve, reject) => {
      const timerId = setTimeout(() => {
        if (abortSignal) abortSignal.removeEventListener('abort', onAbort);
        resolve();
      }, ms);
  
      function onAbort() {
        clearTimeout(timerId);
        const error = new Error(abortSignal.reason || 'Operation was aborted');
        error.name = 'AbortError';
        reject(error);
      }
  
      if (abortSignal) {
        abortSignal.addEventListener('abort', onAbort, { once: true });
      }
    });
}    