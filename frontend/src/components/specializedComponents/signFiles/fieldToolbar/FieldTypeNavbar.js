import React from 'react';
import SimpleContainer from '../../../simpleComponents/SimpleContainer';
import './fieldToolbar.scss';
import './fieldContextMenu.scss';

const FIELD_TYPES = [
    { id: 'signature', label: 'Signature' },
    { id: 'initials', label: 'Initials' },
    { id: 'text', label: 'Text' },
    { id: 'date', label: 'Date' },
    { id: 'checkbox', label: 'Checkbox' },
    { id: 'idnumber', label: 'ID/Number' },
];

export default function FieldTypeNavbar({ selected = 'signature', onSelect = () => {} }) {
    return (
        <SimpleContainer className="lw-fieldTypeNavbar">
            {FIELD_TYPES.map((ft) => (
                <button
                    key={ft.id}
                    type="button"
                    className={`lw-fieldTypeNavbar__btn ${selected === ft.id ? 'is-selected' : ''}`}
                    onClick={() => onSelect(ft.id)}
                    title={ft.label}
                >
                    <span className="lw-fieldTypeNavbar__icon">{ft.label.charAt(0)}</span>
                    <span className="lw-fieldTypeNavbar__label">{ft.label}</span>
                </button>
            ))}
        </SimpleContainer>
    );
}
