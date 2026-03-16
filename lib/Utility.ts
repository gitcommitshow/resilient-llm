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
