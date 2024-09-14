import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ScreenSizeProvider } from './providers/ScreenSizeProvider';
import { BrowserRouter } from 'react-router-dom';
import './index.css';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <ScreenSizeProvider>
        <App />
      </ScreenSizeProvider>
    </BrowserRouter>
  </React.StrictMode>

);
