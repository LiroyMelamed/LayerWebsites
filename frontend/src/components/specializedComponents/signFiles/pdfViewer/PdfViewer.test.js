import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PdfViewer from './PdfViewer';

let mockDocumentProps;
let mockMountCount = 0;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
jest.mock('../signatureSpots/SignatureSpotsLayer', () => () => null);
jest.mock('../../../simpleComponents/SimpleLoader', () => () => <span>Loading</span>);
jest.mock('../../../styledComponents/buttons/SecondaryButton', () => ({ onPress, children }) => (
    <button onClick={onPress}>{children}</button>
));
jest.mock('react-pdf', () => {
    const React = require('react');
    return {
        pdfjs: { GlobalWorkerOptions: {}, version: 'test' },
        Document: (props) => {
            const [failed, setFailed] = React.useState(false);
            const [mountId] = React.useState(() => ++mockMountCount);
            mockDocumentProps = props;
            return (
                <div data-testid="document" data-mount-id={mountId}>
                    <button onClick={() => {
                        setFailed(true);
                        props.onLoadError(new Error('Temporary PDF load failure'));
                    }}>Fail load</button>
                    <button onClick={() => {
                        setFailed(true);
                        props.onSourceError?.(new Error('Temporary PDF source failure'));
                    }}>Fail source</button>
                    {failed ? props.error : props.children}
                </div>
            );
        },
        Page: ({ pageNumber }) => <canvas data-testid={`page-${pageNumber}`} />,
    };
});

beforeEach(() => {
    mockMountCount = 0;
    window.IntersectionObserver = class {
        observe() {}
        disconnect() {}
    };
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    jest.restoreAllMocks();
    delete window.IntersectionObserver;
});

const source = { url: '/document-a.pdf' };

async function finishLoading() {
    await act(async () => mockDocumentProps.onLoadSuccess({
        numPages: 1,
        getPage: () => Promise.resolve({ getViewport: () => ({ width: 600, height: 800 }) }),
    }));
}

test.each(['Fail load', 'Fail source'])('%s can be retried without leaving the signing flow', async (failure) => {
    const onDocumentReady = jest.fn();
    render(<PdfViewer pdfSource={source} onDocumentReady={onDocumentReady} suppressLoadingUI />);
    await finishLoading();
    expect(screen.getByTestId('page-1')).toBeInTheDocument();
    const previousMount = screen.getByTestId('document').getAttribute('data-mount-id');

    fireEvent.click(screen.getByText(failure));
    expect(screen.getByRole('alert')).toHaveTextContent('signing.pdf.loadError');
    expect(onDocumentReady).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('document').getAttribute('data-mount-id')).not.toBe(previousMount);
    expect(mockDocumentProps.file).toBe(source);
    await finishLoading();
    expect(screen.getByTestId('page-1')).toBeInTheDocument();
});

test('switching PDFs resets document state while changing signature spots preserves it', async () => {
    const { rerender } = render(<PdfViewer pdfSource={source} />);
    await finishLoading();
    const firstMount = screen.getByTestId('document').getAttribute('data-mount-id');
    rerender(<PdfViewer pdfSource={source} spots={[{ SignatureSpotId: 1, PageNumber: 1 }]} />);
    expect(screen.getByTestId('document').getAttribute('data-mount-id')).toBe(firstMount);

    fireEvent.click(screen.getByText('Fail load'));
    rerender(<PdfViewer pdfSource={{ url: '/document-b.pdf' }} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('document').getAttribute('data-mount-id')).not.toBe(firstMount);
    await finishLoading();
    expect(screen.getByTestId('page-1')).toBeInTheDocument();
});
