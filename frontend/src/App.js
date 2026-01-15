import LoginStack, { LoginStackName } from './navigation/LoginStack';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AdminStack, { AdminStackName } from './navigation/AdminStack';
import ClientStack, { ClientStackName } from './navigation/ClientStack';
import PublicSigningScreen, { PublicSigningScreenName } from './screens/signingScreen/PublicSigningScreen';
import { AppRoles } from './screens/otpScreen/OtpScreen.js/LoginOtpScreen';
import { useEffect, useRef, useState } from 'react';
import { MainScreenName } from './screens/mainScreen/MainScreen';
import { ClientMainScreenName } from './screens/client/clientMainScreen/ClientMainScreen';
import { useFromApp } from './providers/FromAppProvider';
import { SigningScreenName } from './screens/signingScreen/SigningScreen';
import { useTranslation } from 'react-i18next';
import FloatingLanguageBubble from './components/i18n/FloatingLanguageBubble';
import { EvidenceDocumentsScreenName } from './screens/evidenceDocuments/EvidenceDocumentsScreen';
import EvidenceVerifyScreen, { EvidenceVerifyScreenName } from './screens/verify/EvidenceVerifyScreen';

const STACK_SUFFIX = "/*"

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setIsFromApp } = useFromApp();
  const { t } = useTranslation();

  const [pullRefresh, setPullRefresh] = useState({ state: 'idle', distance: 0 });
  const pullRefreshRafRef = useRef(null);
  const pullRefreshNextRef = useRef(pullRefresh);

  useEffect(() => {
    // Pull-to-refresh: if the user pulls down while already at the top, reload.
    // Note: this is touch-focused and intentionally minimal (no UI).
    const PULL_THRESHOLD_PX = 80;

    const scrollerRef = { current: null };

    let startY = null;
    let triggered = false;

    function scheduleState(next) {
      pullRefreshNextRef.current = next;
      if (pullRefreshRafRef.current) return;
      pullRefreshRafRef.current = window.requestAnimationFrame(() => {
        pullRefreshRafRef.current = null;
        setPullRefresh(pullRefreshNextRef.current);
      });
    }

    function findScrollableParent(startNode) {
      let node = startNode;
      while (node && node !== document.body && node !== document.documentElement) {
        if (node instanceof HTMLElement) {
          const style = window.getComputedStyle(node);
          const overflowY = style.overflowY;
          const isScrollable = overflowY === 'auto' || overflowY === 'scroll';
          if (isScrollable && node.scrollHeight > node.clientHeight + 1) {
            return node;
          }
        }
        node = node.parentNode;
      }
      return document.scrollingElement || document.documentElement;
    }

    function isAtTop(scroller) {
      const el = scroller || document.scrollingElement || document.documentElement;
      const top = Number(el?.scrollTop || 0);
      return top <= 0;
    }

    function isTextInputFocused() {
      const el = document.activeElement;
      if (!el) return false;
      const tag = String(el.tagName || '').toUpperCase();
      return tag === 'INPUT' || tag === 'TEXTAREA' || Boolean(el.isContentEditable);
    }

    function onTouchStart(e) {
      const scroller = findScrollableParent(e.target);
      scrollerRef.current = scroller;
      if (!isAtTop(scroller)) return;
      if (!e.touches || e.touches.length !== 1) return;
      startY = e.touches[0].clientY;
      triggered = false;

      scheduleState({ state: 'idle', distance: 0 });
    }

    function onTouchMove(e) {
      if (triggered) return;
      if (startY === null) return;
      const scroller = scrollerRef.current;
      if (!isAtTop(scroller)) return;
      if (!e.touches || e.touches.length !== 1) return;
      if (isTextInputFocused()) return;

      const deltaY = e.touches[0].clientY - startY;

      const clamped = Math.max(0, Math.min(deltaY, 140));
      if (clamped <= 0) {
        scheduleState({ state: 'idle', distance: 0 });
        return;
      }

      if (clamped < PULL_THRESHOLD_PX) {
        scheduleState({ state: 'pulling', distance: clamped });
        return;
      }

      // Threshold reached: show loader then reload once.
      scheduleState({ state: 'refreshing', distance: clamped });
      triggered = true;
      setTimeout(() => window.location.reload(), 50);
    }

    function onTouchEnd() {
      startY = null;
      triggered = false;
      scrollerRef.current = null;
      scheduleState({ state: 'idle', distance: 0 });
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: true });
    window.addEventListener('touchend', onTouchEnd, { passive: true });
    window.addEventListener('touchcancel', onTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchmove', onTouchMove);
      window.removeEventListener('touchend', onTouchEnd);
      window.removeEventListener('touchcancel', onTouchEnd);

      if (pullRefreshRafRef.current) {
        window.cancelAnimationFrame(pullRefreshRafRef.current);
        pullRefreshRafRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const token = searchParams.get('token');
    const role = searchParams.get('role');
    const fromAppParam = searchParams.get('fromApp');
    const signingFileId = searchParams.get('signingFileId');
    const publicSigningParam = searchParams.get('publicSigning');
    const isPublicSigning = publicSigningParam === '1' || publicSigningParam === 'true';

    if (fromAppParam === 'true') {
      setIsFromApp(true);
    } else {
      setIsFromApp(false);
    }

    if (token && role) {
      localStorage.setItem('token', token);
      localStorage.setItem('role', role);

      // If we have a deep-link target, store it before we clean the URL.
      if (signingFileId) {
        sessionStorage.setItem('lw_signing_deeplink_fileId', String(signingFileId));
        sessionStorage.setItem('lw_signing_deeplink_public', isPublicSigning ? '1' : '0');
      }

      const cleanPath = location.pathname;
      navigate(cleanPath, { replace: true });

      // Default behavior: land on the relevant main screen.
      // Deep-link override: if caller provided signingFileId, go straight to SigningScreen.
      if (role === AppRoles.Admin) {
        navigate(AdminStackName + MainScreenName, { replace: true });
      } else if (role === AppRoles.Customer) {
        if (signingFileId) {
          navigate(ClientStackName + SigningScreenName, {
            replace: true,
            state: { openSigningFileId: String(signingFileId), publicSigning: isPublicSigning },
          });
        } else {
          navigate(ClientStackName + ClientMainScreenName, { replace: true });
        }
      }
    }
  }, []);

  return (
    <>
      <FloatingLanguageBubble />
      {pullRefresh.state !== 'idle' && (
        <div className="lw-pullRefresh" aria-hidden="true">
          <div
            className="lw-pullRefresh__panel"
            style={{ transform: `translateY(${Math.min(pullRefresh.distance, 80)}px)` }}
          >
            {pullRefresh.state === 'refreshing' ? (
              <>
                <span className="lw-pullRefresh__spinner" />
                <span className="lw-pullRefresh__text">{t('common.refreshing')}</span>
              </>
            ) : (
              <span className="lw-pullRefresh__text">{t('common.refreshPull')}</span>
            )}
          </div>
        </div>
      )}

      <Routes>
        <Route path={PublicSigningScreenName} element={<PublicSigningScreen />} />

        <Route path={EvidenceVerifyScreenName} element={<EvidenceVerifyScreen />} />

        <Route
          path="/admin/evidence-documents"
          element={<Navigate to={AdminStackName + EvidenceDocumentsScreenName} replace />}
        />

        <Route path={LoginStackName + STACK_SUFFIX} element={<LoginStack />} />

        <Route path={AdminStackName + STACK_SUFFIX} element={<AdminStack />} />

        <Route path={ClientStackName + STACK_SUFFIX} element={<ClientStack />} />

        <Route path="/*" element={<Navigate to={LoginStackName} replace />} />
      </Routes>
    </>
  );
};

export default App;
