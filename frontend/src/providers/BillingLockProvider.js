import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import billingApi from '../api/billingApi';

const BillingLockContext = createContext(null);

export function useBillingLock() {
    const ctx = useContext(BillingLockContext);
    if (!ctx) {
        throw new Error('useBillingLock must be used within BillingLockProvider');
    }
    return ctx;
}

export function BillingLockProvider({ children }) {
    const [lock, setLock] = useState({
        locked: false,
        status: null,
        graceUntil: null,
        payUrl: null,
        loaded: false,
    });

    const applyLock = useCallback((payload = {}) => {
        setLock((prev) => ({
            ...prev,
            locked: payload.locked === true || payload.billingLocked === true || payload.errorCode === 'BILLING_LOCKED',
            status: payload.status || prev.status,
            graceUntil: payload.graceUntil || prev.graceUntil,
            payUrl: payload.payUrl || prev.payUrl,
            loaded: true,
        }));
    }, []);

    const request = useRef(0);
    const refresh = useCallback(async () => {
        const generation = ++request.current;
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) {
            setLock((prev) => ({ ...prev, locked: false, loaded: true }));
            return;
        }
        try {
            const res = await billingApi.getLockStatus();
            if (generation !== request.current || token !== localStorage.getItem('token')) return;
            if (res?.success && res.data) {
                applyLock(res.data);
                return;
            }
            setLock((prev) => ({ ...prev, loaded: true }));
        } catch {
            if (generation !== request.current || token !== localStorage.getItem('token')) return;
            setLock((prev) => ({ ...prev, loaded: true }));
        }
    }, [applyLock]);

    useEffect(() => {
        void refresh();
        const onLocked = (event) => applyLock(event?.detail || { locked: true });
        const onAuthChange = () => { setLock({ locked: false, status: null, graceUntil: null, payUrl: null, loaded: false }); void refresh(); };
        window.addEventListener('lw-billing-locked', onLocked);
        window.addEventListener('lw-auth-changed', onAuthChange);
        return () => { request.current += 1; window.removeEventListener('lw-billing-locked', onLocked); window.removeEventListener('lw-auth-changed', onAuthChange); };
    }, [applyLock, refresh]);

    const value = useMemo(
        () => ({ ...lock, refresh }),
        [lock, refresh]
    );

    return (
        <BillingLockContext.Provider value={value}>
            {children}
        </BillingLockContext.Provider>
    );
}
