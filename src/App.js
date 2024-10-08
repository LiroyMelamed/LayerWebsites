import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import MainScreen, { MainScreenName } from './screens/mainScreen/MainScreen';
import AllCasesScreen, { AllCasesScreenName } from './screens/mainScreen/allCasesScreen/AllCasesScreen';
import AllCasesTypeScreen, { AllCasesTypeScreenName } from './screens/mainScreen/allCasesTypeScreen/AllCasesTypeScreen';
import AllMangerScreen, { AllMangerScreenName } from './screens/mainScreen/allMangerScreen/AllMangerScreen';
import SideBar from './components/navBars/TopAndRightNavBar';

const App = () => {
  return (
    <>
      <SideBar>
        <Routes>
          <Route path={MainScreenName} element={<MainScreen />} />
          <Route path={AllCasesScreenName} element={<AllCasesScreen />} />
          <Route path={AllCasesTypeScreenName} element={<AllCasesTypeScreen />} />
          <Route path={AllMangerScreenName} element={<AllMangerScreen />} />

          <Route path="*" element={<Navigate to={MainScreenName} />} />
        </Routes>
      </SideBar>
    </>
  );
};

export default App;

