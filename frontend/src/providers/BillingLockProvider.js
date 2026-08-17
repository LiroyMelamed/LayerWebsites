import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
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

    const refresh = useCallback(async () => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        if (!token) {
            setLock((prev) => ({ ...prev, locked: false, loaded: true }));
            return;
        }
        try {
            const res = await billingApi.getLockStatus();
            if (res?.success && res.data) {
                applyLock(res.data);
                return;
            }
            setLock((prev) => ({ ...prev, loaded: true }));
        } catch {
            setLock((prev) => ({ ...prev, loaded: true }));
        }
    }, [applyLock]);

    useEffect(() => {
        void refresh();
        const onLocked = (event) => applyLock(event?.detail || { locked: true });
        window.addEventListener('lw-billing-locked', onLocked);
        return () => window.removeEventListener('lw-billing-locked', onLocked);
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
