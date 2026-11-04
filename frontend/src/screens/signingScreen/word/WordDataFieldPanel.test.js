import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import WordDataFieldPanel from './WordDataFieldPanel';
jest.mock('../templates/SigningSelect', () => ({ children, ...props }) => <select {...props}>{children}</select>);
const definitions = [
    { key: 'client.fullName', phase: 'storedData', available: true, resolver: 'client' },
    { key: 'client.firstName', phase: 'storedData', available: true, resolver: 'manual' },
    { key: 'role.tenant.fullName', phase: 'storedData', available: true, resolver: 'role' },
    { key: 'role.owner.fullName', phase: 'storedData', available: true, resolver: 'role' },
    { key: 'role.owner.hidden', phase: 'storedData', available: false },
    { key: 'role.owner.signature', phase: 'signature', available: true },
];
const props = { definitions, value: '', onChange: jest.fn(), fieldLabel: value => value, text: value => value };
test('only stored fields belonging to the chosen role can be selected in one action', () => {
    const onChange = jest.fn(); const { rerender } = render(<WordDataFieldPanel {...props} group="role.tenant" onChange={onChange} />);
    expect(screen.queryByRole('option', { name: 'role.owner.fullName' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'role.tenant.fullName' } });
    expect(onChange).toHaveBeenCalledWith('role.tenant.fullName');
    rerender(<WordDataFieldPanel {...props} group="role.owner" value="role.tenant.fullName" onChange={onChange} />);
    expect(screen.getByRole('combobox')).toHaveValue('');
    expect(screen.queryByRole('option', { name: 'role.tenant.fullName' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'role.owner.hidden' })).not.toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'role.owner.signature' })).not.toBeInTheDocument();
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'role.owner.fullName' } });
    expect(onChange).toHaveBeenLastCalledWith('role.owner.fullName');
});
test('manual-only fields and disabled state remain explicit', () => {
    render(<WordDataFieldPanel {...props} group="client" value="client.firstName" disabled />);
    expect(screen.getByText('manualDataFieldHelp')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeDisabled();
});
