import { Suspense, lazy, useEffect } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import RouteFallback from './components/simpleComponents/RouteFallback';
import { AdminStackName } from './navigation/AdminStack';
import { ClientStackName } from './navigation/ClientStack';
import { LoginStackName } from './navigation/LoginStack';
import { AppRoles } from './constant/appRoles';
import { useFromApp } from './providers/FromAppProvider';
import { loadFirmSettings } from './services/firmSettings';
import {
  CalendarInviteScreenName,
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
  ShortNavRedirectScreenName,
  ShortSignRedirectScreenName,
  SigningScreenName,
  ViewSignedDocumentName,
} from './navigation/screenPaths';
import TenantShell from './components/tenant/TenantShell';
import TenantAdminRedirect from './components/tenant/TenantAdminRedirect';
import { isMultiTenantApp } from './lib/tenantSlug';

const LoginStack = lazy(() => import('./navigation/LoginStack'));
const AdminStack = lazy(() => import('./navigation/AdminStack'));
const ClientStack = lazy(() => import('./navigation/ClientStack'));

const PublicSigningScreen = lazy(() => import('./screens/signingScreen/PublicSigningScreen'));
const ShortSignRedirectScreen = lazy(() => import('./screens/signingScreen/ShortSignRedirectScreen'));
const ShortNavRedirectScreen = lazy(() => import('./screens/calendarScreen/ShortNavRedirectScreen'));
const ViewSignedDocument = lazy(() => import('./screens/viewSignedDocument/ViewSignedDocument'));
const EvidenceVerifyScreen = lazy(() => import('./screens/verify/EvidenceVerifyScreen'));
const PricingScreen = lazy(() => import('./screens/pricingScreen/PricingScreen'));
const SecurityScreen = lazy(() => import('./screens/compliance/SecurityScreen'));
const PrivacyPage = lazy(() => import('./screens/compliance/PrivacyPage'));
const ContinuityPage = lazy(() => import('./screens/compliance/ContinuityPage'));
const CompliancePage = lazy(() => import('./screens/compliance/CompliancePage'));
const ChatBotPage = lazy(() => import('./screens/chatbot/ChatBotPage'));
const CalendarInviteScreen = lazy(() => import('./screens/calendarScreen/CalendarInviteScreen'));
const SignupScreen = lazy(() => import('./screens/signup/SignupScreen'));
const SignupCompleteScreen = lazy(() =>
  import('./screens/signup/SignupScreen').then((m) => ({ default: m.SignupCompleteScreen }))
);
const MasterAdminScreen = lazy(() => import('./screens/masterAdmin/MasterAdminScreen'));

const STACK_SUFFIX = '/*';

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { isFromApp, setIsFromApp } = useFromApp();

  useEffect(() => { loadFirmSettings(); }, []);

  useEffect(() => {
    const p = String(location?.pathname || '');
    const disable =
      /(?:^|\/)(SigningScreen|SigningManagerScreen)(?:$|\/)/i.test(p) ||
      /(?:^|\/)(upload-file-for-signing)(?:$|\/)/i.test(p) ||
      /(?:^|\/)(PublicSignScreen)(?:$|\/)/i.test(p) ||
      /(?:^|\/)s(?:$|\/)/i.test(p) ||
      /(?:^|\/)(Verify\/Evidence)(?:$|\/)/i.test(p);

    const root = document?.documentElement;
    if (!root) return;
    if (disable) root.classList.add('lw-noPullRefresh');
    else root.classList.remove('lw-noPullRefresh');

    return () => {
      root.classList.remove('lw-noPullRefresh');
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

    const isPublicSignRoute = /^\/PublicSign/i.test(location?.pathname || '')
      || /^\/s(?:\/|$)/i.test(location?.pathname || '');

    const token = (!isPublicSignRoute && searchParams.get('token')) || localStorage.getItem('token');
    const role = (!isPublicSignRoute && searchParams.get('role')) || localStorage.getItem('role');

    const isDeepLink = !isPublicSignRoute && !!(searchParams.get('token') && searchParams.get('role'));

    if (token && role) {
      localStorage.setItem('token', token);
      localStorage.setItem('role', role);

      const isPlatformAdminParam = searchParams.get('isPlatformAdmin');
      if (isPlatformAdminParam === 'true') {
        localStorage.setItem('isPlatformAdmin', 'true');
      }

      if (signingFileId) {
        sessionStorage.setItem('lw_signing_deeplink_fileId', String(signingFileId));
        sessionStorage.setItem('lw_signing_deeplink_public', isPublicSigning ? '1' : '0');
      }

      if (isDeepLink) {
        navigate(location.pathname, { replace: true });

        const alreadyOnAdminRoute = location.pathname.startsWith(AdminStackName);
        const alreadyOnClientRoute = location.pathname.startsWith(ClientStackName);

        if (role === AppRoles.Admin) {
          if (appointmentId) {
            navigate(
              `${AdminStackName}${CalendarScreenName}?eventId=${encodeURIComponent(String(appointmentId))}`,
              { replace: true }
            );
          } else if (signingFileId) {
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

  const multiTenant = isMultiTenantApp();

  return (
    <Suspense fallback={<RouteFallback />}>
      <Routes>
        <Route path={PublicSignScreenName} element={<PublicSigningScreen />} />
        <Route path={ShortSignRedirectScreenName} element={<ShortSignRedirectScreen />} />
        <Route path={ShortNavRedirectScreenName} element={<ShortNavRedirectScreen />} />
        <Route path={ViewSignedDocumentName} element={<ViewSignedDocument />} />
        <Route path={CalendarInviteScreenName} element={<CalendarInviteScreen />} />
        <Route path={EvidenceVerifyScreenName} element={<EvidenceVerifyScreen />} />
        <Route path={PricingScreenName} element={<PricingScreen />} />
        <Route path={SecurityScreenName} element={<SecurityScreen />} />
        <Route path={PrivacyPageName} element={<PrivacyPage />} />
        <Route path={ContinuityPageName} element={<ContinuityPage />} />
        <Route path={CompliancePageName} element={<CompliancePage />} />
        <Route path={ChatBotPageName} element={<ChatBotPage />} />

        {multiTenant && (
          <>
            <Route path="/signup" element={<SignupScreen />} />
            <Route path="/signup/complete" element={<SignupCompleteScreen />} />
          </>
        )}

        <Route path="/admin/master" element={<MasterAdminScreen />} />
        <Route path="/ticket" element={<Navigate to="/AdminStack/support" replace />} />

        {multiTenant ? (
          <>
            <Route
              path="/:tenantSlug/LoginStack/*"
              element={<TenantShell><LoginStack /></TenantShell>}
            />
            <Route
              path="/:tenantSlug/AdminStack/*"
              element={<TenantShell><AdminStack /></TenantShell>}
            />
            <Route
              path="/:tenantSlug/ClientStack/*"
              element={<TenantShell><ClientStack /></TenantShell>}
            />
            <Route path="/:tenantSlug/admin" element={<TenantAdminRedirect />} />
            <Route path="/" element={<Navigate to="/signup" replace />} />
          </>
        ) : (
          <>
            <Route path={LoginStackName + STACK_SUFFIX} element={<LoginStack />} />
            <Route path={AdminStackName + STACK_SUFFIX} element={<AdminStack />} />
            <Route path={ClientStackName + STACK_SUFFIX} element={<ClientStack />} />
            <Route path="/*" element={<Navigate to={LoginStackName} replace />} />
          </>
        )}
      </Routes>
    </Suspense>
  );
};

export default App;
