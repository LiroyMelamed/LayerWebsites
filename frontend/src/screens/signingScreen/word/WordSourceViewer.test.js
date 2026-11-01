import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WordSourceViewer from './WordSourceViewer';

const { TextEncoder } = require('util');
const hash = value => require('crypto').createHash('sha256').update(value).digest('hex');
let mockContent;
let mockPageCount = 1;
jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => {
    const React = require('react');
    return ({ authoringLayer }) => {
        const host = React.useRef(null); const callback = React.useRef(authoringLayer); callback.current = authoringLayer;
        React.useEffect(() => {
            callback.current.onPageTextReady({ pageNumber: 1, content: mockContent, host: host.current, pdfProxy: { numPages: mockPageCount,
                getPage: async () => ({ rotate: 0, userUnit: 1, view: [0, 0, 600, 800], getViewport: () => ({ width: 600, height: 800, transform: [1, 0, 0, -1, 0, 800] }) }) } });
        }, []);
        return <div data-page-number="1"><div ref={host} data-testid="source-page"><div className="textLayer">
            {mockContent.items.map((item, index) => <React.Fragment key={index}><span role="presentation">{item.str}</span>{item.hasEOL && <br role="presentation" />}</React.Fragment>)}
        </div></div></div>;
    };
});
jest.mock('../../../components/styledComponents/buttons/SecondaryButton', () => ({ children, onPress, ...props }) => <button onClick={onPress} {...props}>{children}</button>);
jest.mock('../../../components/ui/StatusNotice', () => ({ children }) => <div role="alert">{children}</div>);
const create = () => {
    const items = [0, 1].map(index => ({ id: `p1_i${index}`, text: 'שם דוגמה', dir: 'rtl', transform: [11, 0, 0, 11, 50 + index * 100, 700], width: 70, height: 11, hasEOL: true,
        segments: [{ itemStart: 0, itemEnd: 8, sourceStart: index * 9, sourceEnd: index * 9 + 8, part: 'word/document.xml', paragraphId: 'p0', paragraphHash: 'a'.repeat(64) }] }));
    const tuples = items.map(item => [item.text, item.dir, item.transform, item.width, item.height, item.hasEOL]);
    return { renderId: 'render-a', mapHash: 'b'.repeat(64), geometryTolerance: 0.01, pages: [{ pageNum: 1, width: 600, height: 800, rotation: 0, userUnit: 1,
        viewBox: [0, 0, 600, 800], viewportTransform: [1, 0, 0, -1, 0, 800], textContentHash: hash(JSON.stringify(tuples)), items }] };
};
beforeEach(() => {
    mockPageCount = 1;
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: require('crypto').webcrypto }); globalThis.TextEncoder = TextEncoder;
});

test('only the verified actual layer becomes selectable; choosing the second identical text retains its occurrence', async () => {
    const authoring = create(); mockContent = { items: authoring.pages[0].items.map(({ text, ...rest }) => ({ ...rest, str: text })) };
    const onSelect = jest.fn(); const onError = jest.fn();
    render(<React.StrictMode><WordSourceViewer authoring={authoring} pdfFile={new Blob(['%PDF'])} bindings={[]} onSelect={onSelect} onError={onError} fieldLabel={value => value} text={value => value} /></React.StrictMode>);
    await waitFor(() => expect(screen.getByTestId('source-page').querySelectorAll('[data-word-item]')).toHaveLength(2));
    const second = screen.getByTestId('source-page').querySelectorAll('span')[1];
    const range = document.createRange(); range.selectNodeContents(second); const selection = window.getSelection(); selection.removeAllRanges(); selection.addRange(range);
    fireEvent.mouseUp(second);
    expect(onSelect).toHaveBeenCalledWith({ kind: 'range', start: { itemId: 'p1_i1', offset: 0 }, end: { itemId: 'p1_i1', offset: 8 } });
    expect(onError).not.toHaveBeenCalled();
});

test('different actual text items stay untagged and visibly block authoring instead of using the source map as hitboxes', async () => {
    const authoring = create(); mockContent = { items: authoring.pages[0].items.map(({ text, ...rest }) => ({ ...rest, str: text })) };
    mockContent.items[1].str = 'Different'; const onError = jest.fn(); const onSelect = jest.fn();
    render(<WordSourceViewer authoring={authoring} pdfFile={new Blob(['%PDF'])} bindings={[]} onSelect={onSelect} onError={onError} fieldLabel={value => value} text={value => value} />);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('authoringMismatch'));
    expect(screen.getByTestId('source-page').querySelector('[data-word-item]')).toBeNull(); expect(screen.getByRole('alert')).toHaveTextContent('authoringMismatch');
    expect(onSelect).not.toHaveBeenCalled();
});

test('the keyboard fallback selects exact UTF16 offsets of an already verified item without editing the document', async () => {
    const authoring = create(); mockContent = { items: authoring.pages[0].items.map(({ text, ...rest }) => ({ ...rest, str: text })) };
    const onSelect = jest.fn(); render(<WordSourceViewer authoring={authoring} pdfFile={new Blob(['%PDF'])} bindings={[]} onSelect={onSelect} fieldLabel={value => value} text={value => value} />);
    await waitFor(() => expect(screen.getByLabelText('selectExcerptText')).toBeEnabled());
    const input = screen.getByLabelText('selectExcerptText'); input.focus(); input.setSelectionRange(3, 8);
    fireEvent.keyUp(input, { key: 'ArrowRight', shiftKey: true }); fireEvent.click(screen.getByText('confirmTextSelection'));
    expect(input).toHaveAttribute('readonly'); expect(input).toHaveValue('שם דוגמה');
    expect(onSelect).toHaveBeenCalledWith({ kind: 'range', start: { itemId: 'p1_i0', offset: 3 }, end: { itemId: 'p1_i0', offset: 8 } });
});

test('an inconsistent server tuple digest cannot pass through the geometry-tolerance branch', async () => {
    const authoring = create(); authoring.pages[0].textContentHash = '0'.repeat(64);
    mockContent = { items: authoring.pages[0].items.map(({ text, ...rest }) => ({ ...rest, str: text })) };
    const onError = jest.fn(); render(<WordSourceViewer authoring={authoring} pdfFile={new Blob(['%PDF'])} bindings={[]} onSelect={jest.fn()} onError={onError} fieldLabel={value => value} text={value => value} />);
    await waitFor(() => expect(onError).toHaveBeenCalledWith('authoringMismatch'));
    expect(screen.getByTestId('source-page').querySelector('[data-word-item]')).toBeNull(); expect(screen.getByRole('alert')).toHaveTextContent('authoringMismatch');
});

test('an immediate cached-child page-count failure is retained before parent passive effects run', async () => {
    const authoring = create(); mockPageCount = 2; mockContent = { items: authoring.pages[0].items.map(({ text, ...rest }) => ({ ...rest, str: text })) };
    const onError = jest.fn(); render(<WordSourceViewer authoring={authoring} pdfFile={new Blob(['%PDF'])} bindings={[]} onSelect={jest.fn()} onError={onError} fieldLabel={value => value} text={value => value} />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('authoringMismatch'));
    expect(onError).toHaveBeenCalledWith('authoringMismatch'); expect(screen.getByLabelText('selectExcerptText')).toBeDisabled();
});
