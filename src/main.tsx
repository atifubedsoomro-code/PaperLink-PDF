import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

if (typeof window !== 'undefined') {
  window.addEventListener(
    'unhandledrejection',
    (event) => {
      const stack = String((event.reason && (event.reason.stack || event.reason.message)) || event.reason || '');
      if (stack.includes('chrome-extension://') || stack.includes('moz-extension://')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );

  window.addEventListener(
    'error',
    (event) => {
      const source = String(event.filename || event.error?.stack || '');
      if (source.includes('chrome-extension://') || source.includes('moz-extension://')) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    },
    true
  );
}

createRoot(document.getElementById('root')!).render(<App />);
