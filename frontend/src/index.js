import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ScreenSizeProvider } from './providers/ScreenSizeProvider';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import './index.scss';
import { PopupProvider } from './providers/PopUpProvider';
import { FromAppProvider } from './providers/FromAppProvider';
import { ToastProvider } from './components/ui/toast';

// Initialize i18n exactly once (language + RTL/LTR handled centrally).
import './i18n/i18n';

const root = ReactDOM.createRoot(document.getElementById('root'));

root.render(
  <BrowserRouter>
    <FromAppProvider>
      <PopupProvider>
        <ScreenSizeProvider>
          <ToastProvider position="top-center">
            <App />
          </ToastProvider>
        </ScreenSizeProvider>
      </PopupProvider>
    </FromAppProvider>
  </BrowserRouter>
);
