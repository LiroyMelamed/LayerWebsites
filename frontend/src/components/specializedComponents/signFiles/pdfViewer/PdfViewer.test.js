import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PdfViewer from './PdfViewer';

let mockDocumentProps;
let mockMountCount = 0;
let mockPageProps = new Map();
let mockSpotsLayerProps;

jest.mock('react-i18next', () => ({
    useTranslation: () => ({ t: (key) => key }),
}));
jest.mock('../signatureSpots/SignatureSpotsLayer', () => props => { mockSpotsLayerProps = props; return null; });
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
        Page: (props) => {
            mockPageProps.set(props.pageNumber, props);
            return <canvas width={props.width} data-testid={`page-${props.pageNumber}`} />;
        },
    };
});

beforeEach(() => {
    mockMountCount = 0;
    mockPageProps = new Map();
    mockSpotsLayerProps = null;
    window.IntersectionObserver = class {
        observe() {}
        disconnect() {}
    };
    jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
    jest.restoreAllMocks();
    delete window.IntersectionObserver;
    delete window.ResizeObserver;
});

const source = { url: '/document-a.pdf' };

async function finishLoading() {
    await act(async () => mockDocumentProps.onLoadSuccess({
        numPages: 1,
        getPage: () => Promise.resolve({ getViewport: () => ({ width: 600, height: 800 }) }),
    }));
}

test('proposed locations use the canonical page scale without becoming editable fields', async () => {
    const onUpdateSpot = jest.fn();
    const { container } = render(<PdfViewer pdfSource={source} spots={[]}
        suggestedSpots={[{ pageNum: 1, x: 100, y: 200, width: 160, height: 50 }, { pageNum: 2, x: 100, y: 200, width: 160, height: 50 }]}
        onUpdateSpot={onUpdateSpot} suppressLoadingUI />);
    await finishLoading();
    // Non-interactive PDF overlays have no accessible role; inspect their physical geometry.
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const boxes = container.querySelectorAll('.lw-detectedSignaturePreview');
    expect(boxes).toHaveLength(1);
    // The 600-point page is fitted into the incumbent 588px content width.
    expect(boxes[0]).toHaveStyle({ left: '98px', top: '196px', width: '156.8px', height: '49px' });
    expect(boxes[0]).toHaveAttribute('aria-hidden', 'true');
    expect(onUpdateSpot).not.toHaveBeenCalled();
});

test.each(['Fail load', 'Fail source'])('%s can be retried without leaving the signing flow', async (failure) => {
    const onDocumentReady = jest.fn();
    render(<PdfViewer pdfSource={source} onDocumentReady={onDocumentReady} suppressLoadingUI />);
    await finishLoading();
    expect(screen.getByTestId('page-1')).toBeInTheDocument();
    const previousMount = screen.getByTestId('document').getAttribute('data-mount-id');

    fireEvent.click(screen.getByText(failure));
    expect(screen.getByRole('alert')).toHaveTextContent('signing.pdf.loadError');
    expect(onDocumentReady).toHaveBeenCalledTimes(2);
    expect(onDocumentReady).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole('button', { name: 'common.retry' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByTestId('document').getAttribute('data-mount-id')).not.toBe(previousMount);
    expect(mockDocumentProps.file).toBe(source);
    await finishLoading();
    expect(screen.getByTestId('page-1')).toBeInTheDocument();
    expect(onDocumentReady).toHaveBeenLastCalledWith(true);
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

// JSDOM has no layout. Model the incumbent canvas max-width:100% constraint so
// a stale measured width on its parent reproduces the real browser feedback loop.
function responsivePdfMeasurements(initialColumnWidth) {
    let columnWidth = initialColumnWidth;
    let bitmapWidth = null;
    const observers = [];
    const originalRect = HTMLElement.prototype.getBoundingClientRect;
    jest.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function () {
        if (this.classList.contains('lw-signing-pdfViewerMain')) {
            return { width: columnWidth };
        }
        if (this.tagName === 'CANVAS') {
            // CSS layout emulation needs the real parent, not an accessibility query.
            // eslint-disable-next-line testing-library/no-node-access
            const inner = this.closest('.lw-signing-pageInner');
            const width = Math.min(bitmapWidth ?? Number(this.width), Number.parseFloat(inner.style.width), columnWidth);
            return { width, height: width * 4 / 3, left: 0, top: 0, right: width, bottom: width * 4 / 3 };
        }
        return originalRect.call(this);
    });
    window.ResizeObserver = class {
        constructor(callback) {
            this.callback = callback;
            this.active = true;
            observers.push(this);
        }
        observe() {}
        disconnect() { this.active = false; }
    };
    const publishResize = () => act(() => {
        observers.slice().filter((observer) => observer.active).forEach((observer) => observer.callback([]));
    });
    return {
        resize(width) { columnWidth = width; publishResize(); },
        bitmap(width) { bitmapWidth = width; publishResize(); },
        finishRender() {
            const { onRenderSuccess } = mockPageProps.get(1);
            act(onRenderSuccess);
        },
    };
}

test.each(['rtl', 'ltr'])('responsive PDF grows and shrinks in %s without changing canonical field positions', async (direction) => {
    const measure = responsivePdfMeasurements(324);
    const originalSpot = Object.freeze({ pageNum: 1, x: 195, y: 396, width: 161, height: 28 });
    const onUpdateSpot = jest.fn();
    const { container } = render(<div dir={direction} className="lw-signing-pdfViewerMain">
        <PdfViewer pdfSource={source} spots={[originalSpot]} suggestedSpots={[originalSpot]} onUpdateSpot={onUpdateSpot} />
    </div>);
    await finishLoading();
    const mount = screen.getByTestId('document').getAttribute('data-mount-id');
    // Physical PDF layers intentionally have no interactive accessibility role.
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const inner = container.querySelector('.lw-signing-pageInner');
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const suggestion = container.querySelector('.lw-detectedSignaturePreview');
    const expectGeometry = (width) => {
        expect(inner.style.width).toBe(`${width}px`);
        expect(Number(inner.dataset.measuredWidth)).toBe(width);
        for (const [property, coordinate] of Object.entries({ left: originalSpot.x, top: originalSpot.y, width: originalSpot.width, height: originalSpot.height })) {
            expect(Number.parseFloat(suggestion.style[property])).toBeCloseTo(coordinate * width / 800, 5);
        }
    };
    expectGeometry(308);
    measure.resize(696);
    measure.finishRender();
    expectGeometry(680);
    measure.resize(324);
    measure.finishRender();
    expectGeometry(308);
    expect(screen.getByTestId('document').getAttribute('data-mount-id')).toBe(mount);
    expect(onUpdateSpot).not.toHaveBeenCalled();
    expect(originalSpot).toEqual({ pageNum: 1, x: 195, y: 396, width: 161, height: 28 });
});

test('responsive PDF overlays follow the measured bitmap while a wider render is pending', async () => {
    const measure = responsivePdfMeasurements(324);
    measure.bitmap(308);
    const { container } = render(<div className="lw-signing-pdfViewerMain">
        <PdfViewer pdfSource={source} suggestedSpots={[{ pageNum: 1, x: 400, y: 400, width: 160, height: 40 }]} />
    </div>);
    await finishLoading();
    // Physical PDF layers intentionally have no interactive accessibility role.
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const inner = container.querySelector('.lw-signing-pageInner');
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const suggestion = container.querySelector('.lw-detectedSignaturePreview');
    measure.resize(696);
    expect(inner.style.width).toBe('680px');
    expect(inner).toHaveAttribute('data-measured-width', '308');
    expect(suggestion).toHaveStyle({ left: '154px', top: '154px' });
    measure.bitmap(680);
    measure.finishRender();
    expect(inner).toHaveAttribute('data-measured-width', '680');
    expect(suggestion).toHaveStyle({ left: '340px', top: '340px' });
});

test('Word authoring text and overlays are opt-in; the incumbent signing viewer stays non-selectable', async () => {
    const { rerender } = render(<PdfViewer pdfSource={source} />); await finishLoading();
    expect(mockPageProps.get(1).renderTextLayer).toBe(false); expect(mockPageProps.get(1).onGetTextSuccess).toBeUndefined();
    const onPageTextReady = jest.fn(); const content = { items: [{ str: 'original text' }] };
    const renderPageOverlay = jest.fn(({ pageNumber }) => <span>authoring-page-{pageNumber}</span>);
    const authoringLayer = { onPageTextReady, renderPageOverlay };
    rerender(<PdfViewer pdfSource={source} authoringLayer={authoringLayer} />);
    expect(mockPageProps.get(1).renderTextLayer).toBe(true); expect(screen.getByText('authoring-page-1')).toBeInTheDocument();
    expect(renderPageOverlay).toHaveBeenLastCalledWith(expect.objectContaining({ pageNumber: 1,
        displayWidth: mockPageProps.get(1).width, host: expect.any(HTMLElement) }));
    act(() => { mockPageProps.get(1).onGetTextSuccess(content); mockPageProps.get(1).onRenderTextLayerSuccess(); });
    expect(onPageTextReady).toHaveBeenCalledWith(expect.objectContaining({ pageNumber: 1, content, host: expect.any(HTMLElement), pdfProxy: expect.any(Object) }));
    rerender(<PdfViewer pdfSource={source} />); expect(mockPageProps.get(1).renderTextLayer).toBe(false);
    expect(screen.queryByText('authoring-page-1')).not.toBeInTheDocument();
});

// Adds the authoring-enabled resize path to QA's existing geometry/bitmap cases.
test('a narrow measured PDF grows then shrinks while overlay scale follows the actual bitmap and authoring stays opt-in', async () => {
    const measure = responsivePdfMeasurements(324); measure.bitmap(308);
    const originalSpot = Object.freeze({ pageNum: 1, x: 195, y: 396, width: 161, height: 28 }); const spots = [originalSpot];
    const onUpdateSpot = jest.fn();
    const { container, rerender } = render(<div className="lw-signing-pdfViewerMain"><PdfViewer pdfSource={source} spots={spots} onUpdateSpot={onUpdateSpot} /></div>);
    await finishLoading();
    // Physical PDF geometry is not an interactive accessibility surface.
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const inner = container.querySelector('.lw-signing-pageInner');
    const mount = screen.getByTestId('document').getAttribute('data-mount-id');
    expect(inner.style.width).toBe('308px'); expect(mockSpotsLayerProps.scale).toBeCloseTo(308 / 800, 8);
    expect(mockPageProps.get(1).renderTextLayer).toBe(false);
    const renderPageOverlay = jest.fn(({ pageNumber }) => <span>readable-authoring-page-{pageNumber}</span>);
    const authoringLayer = { renderPageOverlay };
    rerender(<div className="lw-signing-pdfViewerMain"><PdfViewer pdfSource={source} spots={spots} onUpdateSpot={onUpdateSpot} authoringLayer={authoringLayer} /></div>);
    measure.resize(696);
    expect(inner.style.width).toBe('680px'); expect(inner).toHaveAttribute('data-measured-width', '308');
    expect(mockSpotsLayerProps.scale).toBeCloseTo(308 / 800, 8); expect(mockPageProps.get(1).renderTextLayer).toBe(true);
    expect(renderPageOverlay).toHaveBeenLastCalledWith(expect.objectContaining({ pageNumber: 1, displayWidth: 680 }));
    measure.bitmap(680); measure.finishRender();
    expect(inner).toHaveAttribute('data-measured-width', '680'); expect(mockSpotsLayerProps.scale).toBeCloseTo(680 / 800, 8);
    measure.resize(324); measure.finishRender();
    expect(inner.style.width).toBe('308px'); expect(inner).toHaveAttribute('data-measured-width', '308');
    expect(mockSpotsLayerProps.scale).toBeCloseTo(308 / 800, 8); expect(mockSpotsLayerProps.spots[0]).toBe(originalSpot);
    expect(screen.getByTestId('document').getAttribute('data-mount-id')).toBe(mount); expect(onUpdateSpot).not.toHaveBeenCalled();
    expect(originalSpot).toEqual({ pageNum: 1, x: 195, y: 396, width: 161, height: 28 });
});
