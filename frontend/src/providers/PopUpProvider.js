// PopUpProvider.js
import React, {
    createContext,
    useState,
    useContext,
    useRef,
    useCallback,
    useEffect,
    useMemo,
} from 'react';
import SimplePopUp from '../components/simpleComponents/SimplePopUp';

const PopupContext = createContext(null);
const BACK_ENABLE_DELAY_MS = 300;
const CONTENT_CLEAR_DELAY_MS = 300;

export const PopupProvider = ({ children }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [popupContent, setPopupContent] = useState(null);
    const [preventClose, setPreventClose] = useState(false);
    const [stackDepth, setStackDepth] = useState(0);
    const [backEnabled, setBackEnabled] = useState(false);
    const stackRef = useRef([]);
    const popupContentRef = useRef(null);
    const preventCloseRef = useRef(false);
    const clearContentTimerRef = useRef(null);
    const backEnableTimerRef = useRef(null);

    useEffect(() => {
        popupContentRef.current = popupContent;
    }, [popupContent]);

    useEffect(() => {
        preventCloseRef.current = preventClose;
    }, [preventClose]);

    const cancelPendingClear = useCallback(() => {
        if (clearContentTimerRef.current) {
            clearTimeout(clearContentTimerRef.current);
            clearContentTimerRef.current = null;
        }
    }, []);

    const cancelBackEnableTimer = useCallback(() => {
        if (backEnableTimerRef.current) {
            clearTimeout(backEnableTimerRef.current);
            backEnableTimerRef.current = null;
        }
    }, []);

    const scheduleBackEnable = useCallback(() => {
        cancelBackEnableTimer();
        setBackEnabled(false);
        backEnableTimerRef.current = setTimeout(() => {
            setBackEnabled(true);
            backEnableTimerRef.current = null;
        }, BACK_ENABLE_DELAY_MS);
    }, [cancelBackEnableTimer]);

    useEffect(() => () => {
        cancelBackEnableTimer();
        if (clearContentTimerRef.current) {
            clearTimeout(clearContentTimerRef.current);
        }
    }, [cancelBackEnableTimer]);

    const syncStackDepth = useCallback(() => {
        setStackDepth(stackRef.current.length);
    }, []);

    const openPopup = useCallback((content, options) => {
        cancelPendingClear();
        cancelBackEnableTimer();
        stackRef.current = [];
        setPopupContent(content);
        setPreventClose(!!options?.preventClose);
        setIsOpen(true);
        setStackDepth(0);
        setBackEnabled(false);
    }, [cancelPendingClear, cancelBackEnableTimer]);

    const pushPopup = useCallback((content, options) => {
        cancelPendingClear();

        if (popupContentRef.current) {
            stackRef.current.push({
                content: popupContentRef.current,
                preventClose: preventCloseRef.current,
            });
        }

        setPopupContent(content);
        setPreventClose(!!options?.preventClose);
        setIsOpen(true);
        syncStackDepth();
        scheduleBackEnable();
    }, [cancelPendingClear, scheduleBackEnable, syncStackDepth]);

    const closePopupInternal = useCallback(() => {
        cancelBackEnableTimer();
        stackRef.current = [];
        setIsOpen(false);
        setPreventClose(false);
        setStackDepth(0);
        setBackEnabled(false);

        if (clearContentTimerRef.current) {
            clearTimeout(clearContentTimerRef.current);
        }
        clearContentTimerRef.current = setTimeout(() => {
            setPopupContent(null);
            clearContentTimerRef.current = null;
        }, CONTENT_CLEAR_DELAY_MS);
    }, [cancelBackEnableTimer]);

    const popPopup = useCallback(() => {
        cancelPendingClear();
        cancelBackEnableTimer();

        const previous = stackRef.current.pop();
        if (!previous) {
            closePopupInternal();
            return;
        }

        setPopupContent(previous.content);
        setPreventClose(previous.preventClose);
        setIsOpen(true);
        syncStackDepth();
        setBackEnabled(true);
    }, [cancelPendingClear, cancelBackEnableTimer, closePopupInternal, syncStackDepth]);

    const closePopup = useCallback(() => {
        closePopupInternal();
    }, [closePopupInternal]);

    const canGoBack = stackDepth > 0;

    const contextValue = useMemo(() => ({
        isOpen,
        openPopup,
        pushPopup,
        popPopup,
        closePopup,
        canGoBack,
        stackDepth,
    }), [isOpen, openPopup, pushPopup, popPopup, closePopup, canGoBack, stackDepth]);

    return (
        <PopupContext.Provider value={contextValue}>
            {children}
            <SimplePopUp
                isOpen={isOpen}
                onClose={preventClose ? undefined : closePopup}
                onBack={canGoBack ? popPopup : undefined}
                backEnabled={backEnabled}
            >
                {popupContent}
            </SimplePopUp>
        </PopupContext.Provider>
    );
};

export const usePopup = () => {
    const context = useContext(PopupContext);
    if (!context) {
        throw new Error('usePopup must be used within PopupProvider');
    }
    return context;
};
