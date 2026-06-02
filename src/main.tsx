import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// Intercept window.fetch to inject Authorization: Bearer token for cookie-less sandboxed environments
try {
  const originalFetch = window.fetch;
  Object.defineProperty(window, 'fetch', {
    value: function (input: any, init: any) {
      const token = localStorage.getItem('codevault-token');
      if (token) {
        init = init || {};
        init.headers = init.headers || {};
        if (init.headers instanceof Headers) {
          if (!init.headers.has('Authorization')) {
            init.headers.set('Authorization', `Bearer ${token}`);
          }
        } else if (Array.isArray(init.headers)) {
          const hasAuth = init.headers.some(h => h[0].toLowerCase() === 'authorization');
          if (!hasAuth) {
            init.headers.push(['Authorization', `Bearer ${token}`]);
          }
        } else {
          const keys = Object.keys(init.headers);
          const hasAuth = keys.some(k => k.toLowerCase() === 'authorization');
          if (!hasAuth) {
            (init.headers as any)['Authorization'] = `Bearer ${token}`;
          }
        }
      }
      return originalFetch.call(window, input, init);
    },
    writable: true,
    configurable: true,
    enumerable: true
  });
} catch (e) {
  console.warn('Failed to intercept window.fetch directly:', e);
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

