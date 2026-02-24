import LoginStack, { LoginStackName } from './navigation/LoginStack';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AdminStack, { AdminStackName } from './navigation/AdminStack';
import ClientStack, { ClientStackName } from './navigation/ClientStack';
import PublicSigningScreen, { PublicSignScreenName } from './screens/signingScreen/PublicSigningScreen';
import { AppRoles } from './screens/otpScreen/OtpScreen.js/LoginOtpScreen';
import { useEffect } from 'react';
import { MainScreenName } from './screens/mainScreen/MainScreen';
import { ClientMainScreenName } from './screens/client/clientMainScreen/ClientMainScreen';
import { useFromApp } from './providers/FromAppProvider';
import { loadFirmSettings } from './services/firmSettings';
import { SigningScreenName } from './screens/signingScreen/SigningScreen';
import { EvidenceDocumentsScreenName } from './screens/evidenceDocuments/EvidenceDocumentsScreen';
import EvidenceVerifyScreen, { EvidenceVerifyScreenName } from './screens/verify/EvidenceVerifyScreen';
import PricingScreen, { PricingScreenName } from './screens/pricingScreen/PricingScreen';
import SecurityScreen, { SecurityScreenName } from './screens/compliance/SecurityScreen';
import PrivacyPage, { PrivacyPageName } from './screens/compliance/PrivacyPage';
import ContinuityPage, { ContinuityPageName } from './screens/compliance/ContinuityPage';
import CompliancePage, { CompliancePageName } from './screens/compliance/CompliancePage';

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
      /(?:^|\/)(verify\/evidence)(?:$|\/)/i.test(p);

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
    const publicSigningParam = searchParams.get('publicSigning');
    const isPublicSigning = publicSigningParam === '1' || publicSigningParam === 'true';

    if (fromAppParam === 'true') {
      setIsFromApp(true);
    } else {
      setIsFromApp(false);
    }

    // Auth credentials: prefer URL params (legacy/deep-links), fall back to
    // localStorage (injected by mobile WebView before page load).
    const token = searchParams.get('token') || localStorage.getItem('token');
    const role = searchParams.get('role') || localStorage.getItem('role');

    // Only navigate to default screen when credentials come from URL params
    // (deep-link / mobile WebView). On normal page refreshes the token is
    // already in localStorage and we should stay on the current route.
    const isDeepLink = !!(searchParams.get('token') && searchParams.get('role'));

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
          if (signingFileId) {
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
    <>
      <Routes>
        <Route path={PublicSignScreenName} element={<PublicSigningScreen />} />

        <Route path={EvidenceVerifyScreenName} element={<EvidenceVerifyScreen />} />

        <Route path={PricingScreenName} element={<PricingScreen />} />

        <Route path={SecurityScreenName} element={<SecurityScreen />} />
        <Route path={PrivacyPageName} element={<PrivacyPage />} />
        <Route path={ContinuityPageName} element={<ContinuityPage />} />
        <Route path={CompliancePageName} element={<CompliancePage />} />

        <Route path={LoginStackName + STACK_SUFFIX} element={<LoginStack />} />

        <Route path={AdminStackName + STACK_SUFFIX} element={<AdminStack />} />

        <Route path={ClientStackName + STACK_SUFFIX} element={<ClientStack />} />

        <Route path="/*" element={<Navigate to={LoginStackName} replace />} />
      </Routes>
    </>
  );
};

export default App;
