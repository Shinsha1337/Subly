import React from 'react';
import { createRoot } from 'react-dom/client';
import { installBrowserShim } from './dev-browser-shim';
import App from './components/App';

// Plain-browser preview (`npm run dev`): no Electron preload runs there, so
// install mock window.*APIs before the app boots. In the real plugin the
// preload already defined them and this is a no-op.
installBrowserShim();

createRoot(document.getElementById('root')).render(<App />);
