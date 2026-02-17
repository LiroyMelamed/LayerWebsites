import React, { useState, useMemo } from 'react';
import SearchInput from './SearchInput';

/**
 * A search-style filter input with a hover dropdown of matching items.
 * Works entirely client-side — filters the provided `items` array by the typed query.
 *
 * Props:
 *  - items: string[] — all possible values
 *  - placeholder: string — input title / placeholder
 *  - onSelect: (value: string | null) => void — called when a value is picked or cleared
 *  - className: optional extra class
 */
export default function FilterSearchInput({ items, placeholder, onSelect, className, titleFontSize }) {
    const [query, setQuery] = useState('');

    const filtered = useMemo(() => {
        const q = String(query || '').trim().toLowerCase();
        if (!q) return (items || []).map(name => ({ Name: name }));
        return (items || [])
            .filter(name => String(name || '').toLowerCase().includes(q))
            .map(name => ({ Name: name }));
    }, [items, query]);

    return (
        <SearchInput
            title={placeholder}
            value={query}
            onSearch={(q) => {
                setQuery(q);
                if (!String(q || '').trim()) {
                    onSelect(null);
                }
            }}
            queryResult={filtered}
            isPerforming={false}
            getButtonTextFunction={(item) => item.Name}
            buttonPressFunction={(text) => {
                const val = String(text || '').trim();
                setQuery(val);
                onSelect(val || null);
            }}
            clearOnSelect={false}
            className={className}
            titleFontSize={titleFontSize}
        />
    );
}
