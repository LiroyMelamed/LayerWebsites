import { useEffect, useState } from "react";

function normalizeFieldValue(value) {
    if (value == null) return '';
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return String(value);
    return '';
}

export default function useFieldState(checkForErrorFunction, defaultValue = null) {
    const initialValue = normalizeFieldValue(defaultValue);

    const [fieldState, setFieldState] = useState({
        value: initialValue,
        error: errorFunction(initialValue)
    })

    useEffect(() => {
        const nextValue = normalizeFieldValue(defaultValue);
        if (nextValue !== fieldState.value) {
            setValueFunction(nextValue)
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [defaultValue])

    function setValueFunction(valueOrUpdater) {
        setFieldState(prevState => {
            const value = typeof valueOrUpdater === 'function'
                ? valueOrUpdater(prevState.value)
                : valueOrUpdater;

            return {
                value,
                error: errorFunction(value)
            };
        });
    }

    function errorFunction(currentValue) {
        return checkForErrorFunction?.(currentValue)
    }

    return [fieldState.value, setValueFunction, fieldState.error];
}