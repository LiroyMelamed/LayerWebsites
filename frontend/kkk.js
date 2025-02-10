import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import './index.css';
import SignupStack, { SignupStackName } from './navigation/signup/SignUpStack';
import LoginStack, { LoginStackName } from './navigation/login/LoginStack';
import MainStack, { MainStackName } from './navigation/main/MainStack';
import PreviewStack, { PreviewStackName } from './navigation/preview/PreviewStack';
import JunkScreen from './JunkScreen';

const STACK_SUFFIX = "/*"

function App() {
    return (
        <Routes>
            <Route path={LoginStackName + STACK_SUFFIX} element={<LoginStack />} />
            <Route path={SignupStackName + STACK_SUFFIX} element={<SignupStack />} />
            <Route path={MainStackName + STACK_SUFFIX} element={<MainStack />} />
            <Route path={PreviewStackName + STACK_SUFFIX} element={<PreviewStack />} />
            <Route path="/*" element={<Navigate to={LoginStackName} replace />} />
            {/* <Route path="/" element={<JunkScreen />} /> */}

        </Routes>
    );
}

export default App;
