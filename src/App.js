import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import TopAndRightNavBar from './components/navBars/TopAndRightNavBar';
import MainScreen, { MainScreenName } from './screens/mainScreen/MainScreen';
import SimpleScreen from './components/simpleComponents/SimpleScreen';

const App = () => {
  return (
    <>
      <TopAndRightNavBar />

      <Routes>
        <Route path={MainScreenName} element={<MainScreen />} />
        {/* <Route path="/AnotherScreen" element={<AnotherScreen />} /> */}
        <Route path="*" element={<Navigate to={MainScreenName} />} />
      </Routes>
    </>
  );
};

export default App;

