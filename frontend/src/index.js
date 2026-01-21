import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { ScreenSizeProvider } from './providers/ScreenSizeProvider';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import './index.scss';
import { PopupProvider } from './providers/PopUpProvider';
import { FromAppProvider } from './providers/FromAppProvider';
import "./utils/pdfjsConfig";

// Initialize i18n exactly once (language + RTL/LTR handled centrally).
import './i18n/i18n';

function isTruthyParam(value) {
  if (value == null) return false;
  const v = String(value).toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

function maybeEnableDemoModeFromQuery() {
  try {
    const params = new URLSearchParams(window.location.search);
    if (!isTruthyParam(params.get('demo'))) return;
    window.__LW_DEMO_MODE__ = true;
    window.__LW_DEMO_TOKEN__ = window.__LW_DEMO_TOKEN__ || 'demo-token';
  } catch {
    // no-op
  }
}

const root = ReactDOM.createRoot(document.getElementById('root'));
const params = new URLSearchParams(window.location.search);
const isMicro = isTruthyParam(params.get('lwMicro'));

if (isMicro) {
  maybeEnableDemoModeFromQuery();
}

const appTree = (
  <FromAppProvider>
    <PopupProvider>
      <ScreenSizeProvider forceIsSmallScreen={isMicro ? true : undefined}>
        <App />
      </ScreenSizeProvider>
    </PopupProvider>
  </FromAppProvider>
);

root.render(
  isMicro ? (
    <MemoryRouter initialEntries={[{ pathname: window.location.pathname, search: window.location.search }]}>
      {appTree}
    </MemoryRouter>
  ) : (
    <BrowserRouter>
      {appTree}
    </BrowserRouter>
  )
);
