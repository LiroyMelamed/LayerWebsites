import { useEffect, useState } from "react";

export default function useFieldState(checkForErrorFunction, defaultValue = null) {

    const [fieldState, setFieldState] = useState({
        value: defaultValue,
        error: errorFunction(defaultValue)
    })

    useEffect(() => {
        if (defaultValue != fieldState.value) {
            setValueFunction(defaultValue)
        }
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