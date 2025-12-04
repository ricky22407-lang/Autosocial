import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
// CSS is now handled by index.html CDN to prevent build issues

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);