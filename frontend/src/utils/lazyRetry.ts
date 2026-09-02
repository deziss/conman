import { ComponentType, lazy } from 'react';

const RELOAD_KEY = 'conman_chunk_reload_ts';
const RELOAD_COOLDOWN_MS = 10000; // 10 seconds cooldown to prevent infinite loops

export function isChunkLoadError(error: any): boolean {
  if (!error) return false;
  const message = (error.message || error.toString() || '').toLowerCase();
  const name = (error.name || '').toLowerCase();
  return (
    name === 'chunkloaderror' ||
    message.includes('failed to fetch dynamically imported module') ||
    message.includes('importing a module script failed') ||
    message.includes('error loading dynamically imported module') ||
    message.includes('loading chunk') ||
    message.includes('failed to load module script')
  );
}

/**
 * Wraps React.lazy with automatic page reload upon encountering
 * chunk loading errors (caused by new deployments or stale browser cache).
 */
export function lazyRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T }>
) {
  return lazy(() =>
    componentImport().catch((error) => {
      if (isChunkLoadError(error)) {
        const lastReload = sessionStorage.getItem(RELOAD_KEY);
        const now = Date.now();

        if (!lastReload || now - parseInt(lastReload, 10) > RELOAD_COOLDOWN_MS) {
          sessionStorage.setItem(RELOAD_KEY, now.toString());
          // Force reload from server to retrieve latest index.html and module hashes
          window.location.reload();
          // Return a pending promise so React doesn't re-render with error before reload happens
          return new Promise<{ default: T }>(() => {});
        }
      }
      throw error;
    })
  );
}
