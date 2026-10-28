import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import TemplatesWorkspace from './TemplatesWorkspace';
import api from '../../../api/signingTemplatesApi';
import packagesApi from '../../../api/signingPackagesApi';

jest.mock('../../../api/signingTemplatesApi', () => ({ __esModule: true, default: {
    list: jest.fn(), batches: jest.fn(), create: jest.fn(), send: jest.fn(),
} }));
jest.mock('../../../api/signingPackagesApi', () => ({ __esModule: true, default: { authoringTemplates: jest.fn() } }));
jest.mock('./useSigningLocale', () => () => ({ t: key => key, direction: 'rtl', number: String, date: String, errorMessage: String }));
jest.mock('../word/WordTemplatesWorkspace', () => ({ onBack, onContinue }) => <section aria-label="Owned Word workspace">
    <button onClick={() => onContinue({ id: 'owned-preview' })}>Continue owned preview</button>
    <button onClick={onBack}>Back from Word</button>
</section>);
jest.mock('../../../components/styledComponents/SegmentedSwitch', () => () => null);

beforeEach(() => {
    jest.clearAllMocks();
    api.list.mockResolvedValue({ templates: [] });
    api.batches.mockResolvedValue({ batches: [] });
    packagesApi.authoringTemplates.mockResolvedValue({ templates: [], importedOrigins: [] });
});

test('Word opens through the existing template library and forwards only the reviewed preview callback', async () => {
    const onWordContinue = jest.fn();
    render(<TemplatesWorkspace canUpload canManage nativeAvailable onWordContinue={onWordContinue} />);
    fireEvent.click(await screen.findByRole('button', { name: 'signingWord.open' }));
    expect(screen.getByRole('region', { name: 'Owned Word workspace' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Continue owned preview' }));
    expect(onWordContinue).toHaveBeenCalledWith({ id: 'owned-preview' });
    expect(api.create).not.toHaveBeenCalled();
    expect(api.send).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Back from Word' }));
    await screen.findByRole('button', { name: 'signingWord.open' });
    expect(screen.queryByRole('region', { name: 'Owned Word workspace' })).not.toBeInTheDocument();
});

test.each([{ nativeAvailable: false, canUpload: true }, { nativeAvailable: true, canUpload: false }])(
    'Word entry remains hidden without both incumbent native-signing and upload capabilities: %j', async props => {
        render(<TemplatesWorkspace canManage {...props} />);
        await waitFor(() => expect(api.list).toHaveBeenCalledTimes(1));
        await waitFor(() => expect(screen.queryByText('signingV2.workspace.loading')).not.toBeInTheDocument());
        expect(screen.queryByRole('button', { name: 'signingWord.open' })).not.toBeInTheDocument();
        expect(screen.queryByRole('region', { name: 'Owned Word workspace' })).not.toBeInTheDocument();
        expect(api.create).not.toHaveBeenCalled();
        expect(api.send).not.toHaveBeenCalled();
    }
);
