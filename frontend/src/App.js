import LoginStack, { LoginStackName } from './navigation/LoginStack';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import AdminStack, { AdminStackName } from './navigation/AdminStack';
import ClientStack, { ClientStackName } from './navigation/ClientStack';
import { AppRoles } from './screens/otpScreen/OtpScreen.js/LoginOtpScreen';
import { useEffect } from 'react';
import { MainScreenName } from './screens/mainScreen/MainScreen';
import { ClientMainScreenName } from './screens/client/clientMainScreen/ClientMainScreen';
import { useFromApp } from './providers/FromAppProvider';

const STACK_SUFFIX = "/*"

const App = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { setIsFromApp } = useFromApp();

  useEffect(() => {
    const searchParams = new URLSearchParams(location.search);
    const token = searchParams.get('token');
    const role = searchParams.get('role');
    const fromAppParam = searchParams.get('fromApp');

    if (fromAppParam === 'true') {
      setIsFromApp(true);
    } else {
      setIsFromApp(false);
    }

    if (token && role) {
      localStorage.setItem('token', token);
      localStorage.setItem('role', role);

      const cleanPath = location.pathname;
      navigate(cleanPath, { replace: true });

      if (role === AppRoles.Admin) {
        navigate(AdminStackName + MainScreenName, { replace: true });
      } else if (role === AppRoles.Customer) {
        navigate(ClientStackName + ClientMainScreenName, { replace: true });
      }
    }
  }, []);

  return (
    <>
      <Routes>
        <Route path={LoginStackName + STACK_SUFFIX} element={<LoginStack />} />

        <Route path={AdminStackName + STACK_SUFFIX} element={<AdminStack />} />

        <Route path={ClientStackName + STACK_SUFFIX} element={<ClientStack />} />

        <Route path="/*" element={<Navigate to={LoginStackName} replace />} />
      </Routes>
    </>
  );
};

export default App;
