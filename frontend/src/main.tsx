import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { ErrorBoundary } from './components/ErrorBoundary.tsx'
import { isChunkLoadError } from './utils/lazyRetry'

// Auto-recover from stale chunks when a new version of the app is deployed
const RELOAD_KEY = 'conman_chunk_reload_ts';
const triggerChunkReload = () => {
  const lastReload = sessionStorage.getItem(RELOAD_KEY);
  const now = Date.now();
  if (!lastReload || now - parseInt(lastReload, 10) > 10000) {
    sessionStorage.setItem(RELOAD_KEY, now.toString());
    window.location.reload();
  }
};

// Vite's built-in event when a dynamic chunk fails to preload/fetch
window.addEventListener('vite:preloadError', (event) => {
  event.preventDefault();
  triggerChunkReload();
});

// Fallback listener for any unhandled dynamic import rejections
window.addEventListener('unhandledrejection', (event) => {
  if (isChunkLoadError(event.reason)) {
    event.preventDefault();
    triggerChunkReload();
  }
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
