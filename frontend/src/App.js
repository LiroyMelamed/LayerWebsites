import LoginStack, { LoginStackName } from './navigation/LoginStack';
import { Navigate, Route, Routes } from 'react-router-dom';
import AdminStack, { AdminStackName } from './navigation/AdminStack';

const STACK_SUFFIX = "/*"

const App = () => {
  return (
    <>
      <Routes>
        <Route path={LoginStackName + STACK_SUFFIX} element={<LoginStack />} />

        <Route path={AdminStackName + STACK_SUFFIX} element={<AdminStack />} />

        <Route path="/*" element={<Navigate to={LoginStackName} replace />} />
      </Routes>
    </>
  );
};

export default App;
