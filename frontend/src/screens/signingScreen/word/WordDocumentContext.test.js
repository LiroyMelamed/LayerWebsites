import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import ClientSendContext from '../templates/ClientSendContext';
import CaseContextPicker from '../templates/CaseContextPicker';

jest.mock('../templates/useSigningLocale', () => () => ({ t: key => key, direction: 'rtl', errorMessage: () => 'Access unavailable' }));

test('a client whose data is already in Word cannot be removed from the final-PDF composer', async () => {
    const record = { id: 71, name: 'Synthetic client' };
    const api = { clientContext: jest.fn().mockResolvedValue(record) };
    let update;
    function Host() {
        const [value, setValue] = React.useState(null); update = jest.fn(setValue);
        return <ClientSendContext api={api} initialClientId={71} locked value={value} onChange={update} onPending={() => {}} />;
    }
    render(<Host />);
    await screen.findByText(record.name);
    expect(api.clientContext).toHaveBeenCalledWith(71);
    expect(screen.queryByText('signingV2.compose.clientContext.remove')).not.toBeInTheDocument();
    expect(screen.queryByText('signingV2.compose.clientContext.without')).not.toBeInTheDocument();
});

test('a case whose data is already in Word cannot be swapped or omitted from the final-PDF composer', async () => {
    const record = { id: 41, name: 'Synthetic case' };
    const api = { caseContext: jest.fn().mockResolvedValue(record), cases: jest.fn() };
    function Host() {
        const [value, setValue] = React.useState(null);
        return <CaseContextPicker api={api} initialCaseId={41} locked value={value} onChange={setValue} onPending={() => {}} />;
    }
    render(<Host />);
    await screen.findByText(record.name);
    expect(api.caseContext).toHaveBeenCalledWith(41);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.queryByText('signingV2.compose.context.remove')).not.toBeInTheDocument();
    expect(api.cases).not.toHaveBeenCalled();
});

test('failed pinned-case access permits retry while preserving the required document context', async () => {
    const onChange = jest.fn(), api = { caseContext: jest.fn().mockRejectedValueOnce(new Error('revoked'))
        .mockResolvedValueOnce({ id: 41, name: 'Synthetic case' }) };
    render(<CaseContextPicker api={api} initialCaseId={41} locked onChange={onChange} onPending={() => {}} />);
    await screen.findByText('Access unavailable');
    expect(screen.queryByText('signingV2.compose.context.without')).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText('common.retry'));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith({ id: 41, name: 'Synthetic case' }));
    expect(api.caseContext).toHaveBeenCalledTimes(2);
});
