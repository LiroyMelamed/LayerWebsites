import { Suspense, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import RouteFallback from './components/simpleComponents/RouteFallback';
import { AdminStackName } from './navigation/AdminStack';
import { ClientStackName } from './navigation/ClientStack';
import { LoginStackName } from './navigation/LoginStack';
import { AppRoles } from './constant/appRoles';
import { useFromApp } from './providers/FromAppProvider';
import { loadFirmSettings } from './services/firmSettings';
import {
  CalendarScreenName,
  ChatBotPageName,
  ClientMainScreenName,
  CompliancePageName,
  ContinuityPageName,
  EvidenceVerifyScreenName,
  MainScreenName,
  PricingScreenName,
  PrivacyPageName,
  PublicSignScreenName,
  SecurityScreenName,
  SigningScreenName,
  ViewSignedDocumentName,
} from './navigation/screenPaths';

import LoginStack from './navigation/LoginStack';
import AdminStack from './navigation/AdminStack';
import ClientStack from './navigation/ClientStack';
import PublicSigningScreen from './screens/signingScreen/PublicSigningScreen';
import ViewSignedDocument from './screens/viewSignedDocument/ViewSignedDocument';
import EvidenceVerifyScreen from './screens/verify/EvidenceVerifyScreen';
import PricingScreen from './screens/pricingScreen/PricingScreen';
import SecurityScreen from './screens/compliance/SecurityScreen';
import PrivacyPage from './screens/compliance/PrivacyPage';
import ContinuityPage from './screens/compliance/ContinuityPage';
import CompliancePage from './screens/compliance/CompliancePage';
import ChatBotPage from './screens/chatbot/ChatBotPage';

const STACK_SUFFIX = "/*"

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isFromApp, setIsFromApp } = useFromApp();

  // Eagerly load public firm settings (WhatsApp phone, etc.)
  useEffect(() => { loadFirmSettings(); }, []);

  useEffect(() => {
    // On signing flows, disable overscroll-based pull-to-refresh (browser-level).
    const p = String(location?.pathname || "");
    const disable =
      /(?:^|\/)(SigningScreen|SigningManagerScreen)(?:$|\/)/i.test(p) ||
      /(?:^|\/)(upload-file-for-signing)(?:$|\/)/i.test(p) ||
      /(?:^|\/)(PublicSignScreen)(?:$|\/)/i.test(p) ||
      /(?:^|\/)(Verify\/Evidence)(?:$|\/)/i.test(p);

    const root = document?.documentElement;
    if (!root) return;
    if (disable) root.classList.add("lw-noPullRefresh");
    else root.classList.remove("lw-noPullRefresh");

    return () => {
      root.classList.remove("lw-noPullRefresh");
    };
  }, [location.pathname]);

  useEffect(() => {
    if (isFromApp) {
      document.body.classList.add('lw-fromApp');
    } else {
      document.body.classList.remove('lw-fromApp');
    }
  }, [isFromApp]);

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const fromAppParam = searchParams.get('fromApp');
    const signingFileId = searchParams.get('signingFileId');
    const appointmentId = searchParams.get('appointmentId');
    const publicSigningParam = searchParams.get('publicSigning');
    const isPublicSigning = publicSigningParam === '1' || publicSigningParam === 'true';

    if (fromAppParam === 'true') {
      setIsFromApp(true);
    } else {
      setIsFromApp(false);
    }

    // The PublicSignScreen route uses ?token= for a signing JWT, not an auth
    // token.  Skip URL-param extraction so we don't overwrite the real auth
    // token in localStorage.
    const isPublicSignRoute = /^\/PublicSign/i.test(location?.pathname || '');

    // Auth credentials: prefer URL params (legacy/deep-links), fall back to
    // localStorage (injected by mobile WebView before page load).
    const token = (!isPublicSignRoute && searchParams.get('token')) || localStorage.getItem('token');
    const role = (!isPublicSignRoute && searchParams.get('role')) || localStorage.getItem('role');

    // Only navigate to default screen when credentials come from URL params
    // (deep-link / mobile WebView). On normal page refreshes the token is
    // already in localStorage and we should stay on the current route.
    const isDeepLink = !isPublicSignRoute && !!(searchParams.get('token') && searchParams.get('role'));

    if (token && role) {
      localStorage.setItem('token', token);
      localStorage.setItem('role', role);

      // Platform admin flag — may come from URL param or already in localStorage
      // (injected by mobile app's WebView).
      const isPlatformAdminParam = searchParams.get('isPlatformAdmin');
      if (isPlatformAdminParam === 'true') {
        localStorage.setItem('isPlatformAdmin', 'true');
      }

      // If we have a deep-link target, store it before we clean the URL.
      if (signingFileId) {
        sessionStorage.setItem('lw_signing_deeplink_fileId', String(signingFileId));
        sessionStorage.setItem('lw_signing_deeplink_public', isPublicSigning ? '1' : '0');
      }

      // Only redirect when arriving via deep-link with URL params.
      // On normal refresh, stay on the current page.
      if (isDeepLink) {
        // Remove query params from URL
        navigate(location.pathname, { replace: true });

        // Check if the current path already points to a valid app route.
        // If so, stay there instead of overriding to the default screen.
        const alreadyOnAdminRoute = location.pathname.startsWith(AdminStackName);
        const alreadyOnClientRoute = location.pathname.startsWith(ClientStackName);

        if (role === AppRoles.Admin) {
          if (appointmentId) {
            navigate(
              `${AdminStackName + CalendarScreenName}?eventId=${encodeURIComponent(String(appointmentId))}`,
              { replace: true }
            );
          } else if (signingFileId) {
            // Admin deep-link to signing – redirect to admin main (signing is client-side)
            navigate(AdminStackName + MainScreenName, { replace: true });
          } else if (!alreadyOnAdminRoute) {
            navigate(AdminStackName + MainScreenName, { replace: true });
          }
        } else if (role === AppRoles.Customer) {
          if (signingFileId) {
            navigate(ClientStackName + SigningScreenName, {
              replace: true,
              state: { openSigningFileId: String(signingFileId), publicSigning: isPublicSigning },
            });
          } else if (!alreadyOnClientRoute) {
            navigate(ClientStackName + ClientMainScreenName, { replace: true });
          }
        }
      }
    }
  }, []);

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path={PublicSignScreenName} element={<PublicSigningScreen />} />
        <Route path={ViewSignedDocumentName} element={<ViewSignedDocument />} />

        <Route path={EvidenceVerifyScreenName} element={<EvidenceVerifyScreen />} />

        <Route path={PricingScreenName} element={<PricingScreen />} />

        <Route path={SecurityScreenName} element={<SecurityScreen />} />
        <Route path={PrivacyPageName} element={<PrivacyPage />} />
        <Route path={ContinuityPageName} element={<ContinuityPage />} />
        <Route path={CompliancePageName} element={<CompliancePage />} />

        <Route path={ChatBotPageName} element={<ChatBotPage />} />

        <Route path={LoginStackName + STACK_SUFFIX} element={<LoginStack />} />

        <Route path={AdminStackName + STACK_SUFFIX} element={<AdminStack />} />

        <Route path={ClientStackName + STACK_SUFFIX} element={<ClientStack />} />

        <Route path="/*" element={<Navigate to={LoginStackName} replace />} />
      </Routes>
    </Suspense>
  );
};

export default App;
