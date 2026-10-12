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
    const refreshing = useRef(false);
    const [lock, setLock] = useState({
        locked: false,
        canManageBilling: false,
        status: null,
        graceUntil: null,
        payUrl: null,
        loaded: false,
    });

    const applyLock = useCallback((payload = {}) => {
        setLock((prev) => ({
            ...prev,
            canManageBilling: payload.canManageBilling === true,
            locked: payload.locked === true || payload.billingLocked === true || payload.errorCode === 'BILLING_LOCKED',
            status: payload.canManageBilling === true ? payload.status || null : null,
            graceUntil: payload.canManageBilling === true ? payload.graceUntil || null : null,
            payUrl: payload.canManageBilling === true ? payload.payUrl || null : null,
            loaded: true,
        }));
    }, []);

    const refresh = useCallback(async () => {
        if (refreshing.current) return;
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) {
            setLock({ locked: false, canManageBilling: false, status: null, graceUntil: null, payUrl: null, loaded: true });
            return;
        }
        refreshing.current = true;
        try {
            const res = await billingApi.getLockStatus();
            if (localStorage.getItem('token') !== token) return;
            if (res?.success && res.data) {
                applyLock(res.data);
                return;
            }
            setLock((prev) => ({ ...prev, loaded: true }));
        } catch {
            setLock((prev) => ({ ...prev, loaded: true }));
        } finally { refreshing.current = false; }
    }, [applyLock]);

    useEffect(() => {
        void refresh();
        const onLocked = () => { setLock(prev => ({ ...prev, locked: true, loaded: true })); void refresh(); };
        const onAuthChanged = () => { setLock({ locked: false, canManageBilling: false, status: null, graceUntil: null, payUrl: null, loaded: false }); void refresh(); };
        const timer = window.setInterval(refresh, 30000);
        window.addEventListener('lw-billing-locked', onLocked);
        window.addEventListener('lw-auth-changed', onAuthChanged);
        return () => { window.clearInterval(timer); window.removeEventListener('lw-billing-locked', onLocked); window.removeEventListener('lw-auth-changed', onAuthChanged); };
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
