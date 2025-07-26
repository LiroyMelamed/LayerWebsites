import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ScreenSizeProvider } from './providers/ScreenSizeProvider';
import { BrowserRouter } from 'react-router-dom';
import './index.css';
import { PopupProvider } from './providers/PopUpProvider';
import { FromAppProvider } from './providers/FromAppProvider';

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <BrowserRouter>
    <FromAppProvider>
      <PopupProvider>
        <ScreenSizeProvider>
          <App />
        </ScreenSizeProvider>
      </PopupProvider>
    </FromAppProvider>
  </BrowserRouter>
);
