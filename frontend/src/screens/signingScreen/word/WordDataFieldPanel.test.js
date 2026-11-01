import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WordDataFieldPanel from './WordDataFieldPanel';
jest.mock('../../../components/specializedComponents/signFiles/fieldToolbar/AddFieldPanel', () => ({ fieldTypeOptions, onSelectField }) => <div>{fieldTypeOptions.map(item => <button key={item.id} onClick={() => onSelectField(item.id)}>{item.label}</button>)}</div>);
jest.mock('../../../components/specializedComponents/containers/SearchInput', () => ({ title, value, onSearch, disabled }) => <label>{title}<input value={value} disabled={disabled} onChange={event => onSearch(event.target.value)} /></label>);
jest.mock('../templates/SigningSelect', () => ({ children, ...props }) => <select {...props}>{children}</select>);
const definitions = [
    { key: 'client.fullName', phase: 'storedData', available: true, resolver: 'client' },
    { key: 'client.firstName', phase: 'storedData', available: true, resolver: 'manual' },
    { key: 'case.courtNumber', phase: 'storedData', available: true, resolver: 'case' },
    { key: 'signature', phase: 'signature', available: false },
];

test('the backend catalog limits the data picker; search and explicit selection do not create a signer or write data', () => {
    const onChange = jest.fn(); render(<WordDataFieldPanel definitions={definitions} roles={[]} value="client.fullName" onChange={onChange} fieldLabel={value => value} text={value => value} />);
    expect(screen.queryByRole('button', { name: 'signature' })).not.toBeInTheDocument(); expect(screen.queryByRole('button', { name: 'case.courtNumber' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('findDataField'), { target: { value: 'first' } });
    expect(screen.queryByRole('button', { name: 'client.fullName' })).not.toBeInTheDocument(); fireEvent.click(screen.getByRole('button', { name: 'client.firstName' }));
    expect(onChange).toHaveBeenCalledTimes(1); expect(onChange).toHaveBeenCalledWith('client.firstName');
});

test('manual-only fields and disabled state are explicit', () => {
    const onChange = jest.fn(); const { rerender } = render(<WordDataFieldPanel definitions={definitions} roles={[]} value="client.firstName" onChange={onChange} fieldLabel={value => value} text={value => value} />);
    expect(screen.getByText('manualDataFieldHelp')).toBeInTheDocument();
    rerender(<WordDataFieldPanel definitions={definitions} roles={[]} value="client.firstName" disabled onChange={onChange} fieldLabel={value => value} text={value => value} />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument(); expect(screen.getByLabelText('findDataField')).toBeDisabled(); expect(onChange).not.toHaveBeenCalled();
});
