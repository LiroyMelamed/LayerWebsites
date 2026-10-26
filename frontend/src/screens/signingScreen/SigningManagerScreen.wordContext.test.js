import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SigningManagerScreen from './SigningManagerScreen';

const mockNavigate = jest.fn(), mockReload = jest.fn();
let mockWorkspaceProps, mockWordSigningProps;
jest.mock('react-router-dom', () => ({ ...jest.requireActual('react-router-dom'), useNavigate: () => mockNavigate }));
jest.mock('../../providers/ScreenSizeProvider', () => ({ useScreenSize: () => ({ isSmallScreen: true }) }));
jest.mock('../../providers/FirmPermissionsProvider', () => ({ useFirmPermissions: () => ({ loaded: true, permissionMode: 'legacy', canAction: () => true }) }));
jest.mock('../../providers/FromAppProvider', () => ({ useFromApp: () => ({ isFromApp: false }) }));
jest.mock('../../providers/PopUpProvider', () => ({ usePopup: () => ({ openPopup: jest.fn(), closePopup: jest.fn() }) }));
jest.mock('../../hooks/useAutoHttpRequest', () => () => ({ result: { files: [] }, isPerforming: false, performRequest: mockReload, error: null }));
jest.mock('../../hooks/useHttpRequest', () => () => ({ result: [], isPerforming: false, performRequest: jest.fn() }));
jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../../services/firmSettings', () => ({ useSigningOtpEnabled: () => false }));
jest.mock('../../api/apiUtils', () => ({ __esModule: true, default: { defaults: { baseURL: '' } } }));
jest.mock('../../components/ui/toast', () => ({ toastError: jest.fn(), toastSuccess: jest.fn() }));
jest.mock('../../assets/images/images', () => ({ images: { Backgrounds: { AppBackground: '' } } }));
jest.mock('../../navigation/AdminStack', () => ({ AdminStackName: '/AdminStack' }));
jest.mock('./UploadFileForSigningScreen', () => ({ uploadFileForSigningScreenName: '/UploadFileForSigningScreen' }));
jest.mock('../mainScreen/MainScreen', () => ({ MainScreenName: '/MainScreen' }));
jest.mock('../../components/navBars/data/NavBarData', () => ({ getNavBarData: () => [] }));
jest.mock('../../components/navBars/topToolBarSmallScreen/TopToolBarSmallScreen', () => () => <nav aria-label="Incumbent mobile signing navigation" />);
jest.mock('../../components/simpleComponents/SimpleScreen', () => ({ children }) => <main>{children}</main>);
jest.mock('../../components/simpleComponents/SimpleScrollView', () => ({ children }) => <div>{children}</div>);
jest.mock('./templates/SigningPackagesHub', () => ({ __esModule: true, default: () => <section>Tracking</section>, useSigningV2Available: () => true }));
jest.mock('./templates/CaseStageAutomationPanel', () => () => null);
jest.mock('./word/WordSigningWorkflow', () => props => {
    mockWordSigningProps = props;
    return <section><button onClick={props.onBack}>Return to Word data</button></section>;
});
jest.mock('./templates/TemplatesWorkspace', () => props => {
    mockWorkspaceProps = props;
    return <section aria-label="Existing template workspace"><button onClick={() => props.onWordContinue({ id: 'owned-preview', sourceId: 'owned-source', sourceVersion: 2, pdfHash: 'a'.repeat(64), clientId: 71, caseId: 41 })}>Continue reviewed Word document</button></section>;
});

const context = { clientRecord: { id: 71, label: 'Saved client' }, caseRecord: { id: 41, label: 'Saved case' } };
const draft = { source: { id: 'source' }, name: 'Template', roles: [], bindings: [], inputs: { clientId: '71', caseId: '41', ...context } };
const mount = state => render(<MemoryRouter initialEntries={[{ pathname: '/AdminStack/SigningManagerScreen', search: '?panel=templates&mode=word', state }]}><SigningManagerScreen /></MemoryRouter>);
beforeEach(() => { jest.clearAllMocks(); mockWorkspaceProps = null; mockWordSigningProps = null; });

test('case entry keeps the mobile shell and immutable preview; returning restores the latest Word data draft', () => {
    mount({ wordInitialContext: context, wordResumeDraft: draft });
    expect(screen.getByRole('navigation', { name: 'Incumbent mobile signing navigation' })).toBeVisible();
    expect(mockWorkspaceProps.initialWordMode).toBe(true);
    expect(mockWorkspaceProps.initialContext).toEqual(context);
    expect(mockWorkspaceProps.resumeDraft).toEqual(draft);
    const updated = { ...draft, name: 'Latest template label' };
    mockWorkspaceProps.onDraftChange(updated);
    fireEvent.click(screen.getByRole('button', { name: 'Continue reviewed Word document' }));
    expect(mockWordSigningProps.preview).toEqual({ id: 'owned-preview', sourceId: 'owned-source', sourceVersion: 2, pdfHash: 'a'.repeat(64), clientId: 71, caseId: 41 });
    expect(mockNavigate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Return to Word data' }));
    expect(mockWorkspaceProps.resumeDraft).toEqual(updated);
});

test('a different explicit case context cannot restore a draft for the previous case', () => {
    mount({ wordInitialContext: { ...context, caseRecord: { id: 42, label: 'Different saved case' } }, wordResumeDraft: draft });
    expect(mockWorkspaceProps.resumeDraft).toBeNull();
    expect(mockWorkspaceProps.initialContext.caseRecord.id).toBe(42);
    expect(mockNavigate).not.toHaveBeenCalled();
});

test('return context follows the user confirmed draft choices without inferring signers', () => {
    mount({ wordInitialContext: context });
    const changedContext = { clientRecord: { id: 72, label: 'Another saved client' }, caseRecord: null };
    const updated = { ...draft, inputs: { ...draft.inputs, clientId: '72', caseId: '', ...changedContext } };
    mockWorkspaceProps.onDraftChange(updated);
    fireEvent.click(screen.getByRole('button', { name: 'Continue reviewed Word document' }));
    expect(mockWordSigningProps.preview).not.toHaveProperty('signers');
    expect(mockWordSigningProps.preview).not.toHaveProperty('signatureSpots');
    fireEvent.click(screen.getByRole('button', { name: 'Return to Word data' }));
    expect(mockWorkspaceProps.resumeDraft.inputs.clientRecord).toEqual(changedContext.clientRecord);
    expect(mockWorkspaceProps.resumeDraft.inputs.caseRecord).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
});
