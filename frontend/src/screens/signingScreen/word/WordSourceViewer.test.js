import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import WordSourceViewer from './WordSourceViewer';

const { TextEncoder } = require('util');
const hash = value => require('crypto').createHash('sha256').update(value).digest('hex');
let mockContent;
let mockPageCount = 1;
let mockVerifyPage;
jest.mock('../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer', () => {
    const React = require('react');
    return ({ authoringLayer }) => {
        const host = React.useRef(null); const callback = React.useRef(authoringLayer); callback.current = authoringLayer;
        mockVerifyPage = () => callback.current.onPageTextReady({ pageNumber: 1, content: mockContent, host: host.current, pdfProxy: { numPages: mockPageCount,
                getPage: async () => ({ rotate: 0, userUnit: 1, view: [0, 0, 600, 800], getViewport: () => ({ width: 600, height: 800, transform: [1, 0, 0, -1, 0, 800] }) }) } });
        React.useEffect(() => { mockVerifyPage(); }, []);
        return <div data-page-number="1"><div ref={host} data-testid="source-page"><div className="textLayer">
            {mockContent.items.map((item, index) => <React.Fragment key={index}><span role="presentation">{item.str}</span>{item.hasEOL && <br role="presentation" />}</React.Fragment>)}
        </div>{authoringLayer.renderPageOverlay({ pageNumber: 1, host: host.current, displayWidth: 600 })}</div></div>;
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
    Range.prototype.getClientRects = jest.fn(() => [{ left: 25, top: 50, width: 70, height: 12 }]);
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
    fireEvent.click(screen.getByText('keyboardSelection'));
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
    expect(onError).toHaveBeenCalledWith('authoringMismatch'); fireEvent.click(screen.getByText('keyboardSelection')); expect(screen.getByLabelText('selectExcerptText')).toBeDisabled();
});


test('confirmed selection remains highlighted on the document after the native selection is lost', async () => {
    const authoring = create(); mockContent = { items: authoring.pages[0].items.map(({ text, ...rest }) => ({ ...rest, str: text })) };
    const props = { authoring, pdfFile: new Blob(['%PDF']), bindings: [], onSelect: jest.fn(), fieldLabel: value => value, text: value => value };
    const view = render(<WordSourceViewer {...props} />);
    await waitFor(() => expect(screen.getByTestId('source-page').querySelectorAll('[data-word-item]')).toHaveLength(2));
    const selection = { kind: 'range', anchor: { part: 'word/document.xml', paragraphId: 'p0', start: 3, end: 8 } };
    view.rerender(<WordSourceViewer {...props} selection={selection} />);
    await screen.findByText('selectedLocation');
    window.getSelection().removeAllRanges();
    expect(view.container.querySelector('.lw-word-source__mark.is-pending')).toBeInTheDocument();
    view.rerender(<WordSourceViewer {...props} selection={null} bindings={[{ ...selection.anchor, id: 'bound', kind: 'range', field: 'client.fullName' }]} />);
    await screen.findByText('client.fullName');
    expect(screen.queryByText('selectedLocation')).not.toBeInTheDocument();
    expect(view.container.querySelector('.lw-word-source__mark')).toBeInTheDocument();
});


test('reverified replacement text layers restore marks after a responsive page render', async () => {
    const authoring = create(); mockContent = { items: authoring.pages[0].items.map(({ text, ...rest }) => ({ ...rest, str: text })) };
    const bindings = [{ id: 'bound', kind: 'range', field: 'client.fullName', part: 'word/document.xml', paragraphId: 'p0', start: 3, end: 8 }];
    const view = render(<WordSourceViewer authoring={authoring} pdfFile={new Blob(['%PDF'])} bindings={bindings} onSelect={jest.fn()} fieldLabel={value => value} text={value => value} />);
    await screen.findByText('client.fullName');
    Range.prototype.getClientRects.mockReturnValue([{ left: 40, top: 80, width: 35, height: 8 }]);
    screen.getByTestId('source-page').querySelectorAll('[data-word-item]').forEach(span => { delete span.dataset.wordItem; });
    await act(async () => mockVerifyPage());
    await waitFor(() => expect(view.container.querySelector('.lw-word-source__mark')).toHaveStyle({ left: '40px', top: '80px', width: '35px' }));
    expect(screen.getByText('client.fullName')).toBeInTheDocument();
});

test('dense saved and pending chip labels separate after resize while exact source highlights and selection stay unchanged', async () => {
    const authoring = create(); mockContent = { items: authoring.pages[0].items.map(({ text, ...rest }) => ({ ...rest, str: text })) };
    let pageWidth = 390; let scale = 1;
    const resizeCallbacks = new Set();
    const originalObserver = global.ResizeObserver;
    const originalBounds = HTMLElement.prototype.getBoundingClientRect;
    global.ResizeObserver = class {
        constructor(callback) { this.callback = callback; resizeCallbacks.add(callback); }
        observe() {}
        disconnect() { resizeCallbacks.delete(this.callback); }
    };
    HTMLElement.prototype.getBoundingClientRect = function () {
        if (this.matches('[data-word-chip]')) return { left: 0, top: 0, width: this.classList.contains('is-pending') ? 94 : 105, height: 19 };
        if (this.dataset.testid === 'source-page') return { left: 0, top: 0, width: pageWidth, height: 520 * scale };
        return originalBounds.call(this);
    };
    Range.prototype.getClientRects.mockImplementation(function () {
        const second = this.startContainer.parentElement.dataset.wordItem === 'p1_i1';
        return [{ left: 170 * scale, top: (second ? 61 : 50) * scale, width: 14 * scale, height: 8 * scale }];
    });
    const bindings = [{ id: 'name', kind: 'range', field: 'client.fullName', part: 'word/document.xml', paragraphId: 'p0', start: 3, end: 8 },
        { id: 'id', kind: 'range', field: 'client.identityNumber', part: 'word/document.xml', paragraphId: 'p0', start: 12, end: 17 }];
    const selection = { kind: 'range', anchor: { part: 'word/document.xml', paragraphId: 'p0', start: 0, end: 3 } };
    const before = JSON.parse(JSON.stringify({ bindings, selection }));
    const onSelect = jest.fn();
    let view;
    try {
        view = render(<WordSourceViewer authoring={authoring} pdfFile={new Blob(['%PDF'])} bindings={bindings} selection={selection}
            onSelect={onSelect} fieldLabel={value => value} text={value => value} />);
        await waitFor(() => expect(view.container.querySelectorAll('[data-word-chip]')).toHaveLength(3));
        const readLabels = () => Array.from(view.container.querySelectorAll('[data-word-chip]')).map(node =>
            ({ left: parseFloat(node.style.left), top: parseFloat(node.style.top), width: node.classList.contains('is-pending') ? 94 : 105, height: 19 }));
        const expectNoOverlap = () => readLabels().forEach((a, index, all) => all.slice(index + 1).forEach(b =>
            expect(a.left + a.width + 3 <= b.left || b.left + b.width + 3 <= a.left || a.top + a.height + 3 <= b.top || b.top + b.height + 3 <= a.top).toBe(true)));
        await waitFor(expectNoOverlap);
        expect(view.container.querySelector('.lw-word-source__mark')).toHaveStyle({ left: '170px', top: '50px', width: '14px', height: '8px' });
        expect(view.container.querySelector('line')).toHaveAttribute('x1', '177');
        pageWidth = 320; scale = 0.8;
        await act(async () => { resizeCallbacks.forEach(callback => callback()); });
        await waitFor(expectNoOverlap);
        expect(view.container.querySelector('.lw-word-source__mark')).toHaveStyle({ left: '136px', top: '40px', height: '6.4px' });
        expect(parseFloat(view.container.querySelector('.lw-word-source__mark').style.width)).toBeCloseTo(11.2);
        readLabels().forEach(box => { expect(box.left).toBeGreaterThanOrEqual(0); expect(box.left + box.width).toBeLessThanOrEqual(320); });
        const item = screen.getByTestId('source-page').querySelector('[data-word-item="p1_i1"]');
        const range = document.createRange(); range.selectNodeContents(item); const native = window.getSelection(); native.removeAllRanges(); native.addRange(range);
        fireEvent.mouseUp(item);
        expect(onSelect).toHaveBeenCalledWith({ kind: 'range', start: { itemId: 'p1_i1', offset: 0 }, end: { itemId: 'p1_i1', offset: 8 } });
        expect({ bindings, selection }).toEqual(before);
    } finally {
        view?.unmount();
        global.ResizeObserver = originalObserver;
        HTMLElement.prototype.getBoundingClientRect = originalBounds;
    }
});

test('saved labels are accessible controls; selecting one never reuses native text selection, and list selection focuses it', async () => {
    const authoring = create(); mockContent = { items: authoring.pages[0].items.map(({ text, ...rest }) => ({ ...rest, str: text })) };
    const originalBounds = HTMLElement.prototype.getBoundingClientRect;
    const originalScroll = HTMLElement.prototype.scrollIntoView; const originalWidth = window.innerWidth;
    HTMLElement.prototype.scrollIntoView = jest.fn(); Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    HTMLElement.prototype.getBoundingClientRect = function () {
        if (this.matches('[data-word-chip]')) return { left: 0, top: 0, width: 120, height: 19 };
        if (this.dataset.testid === 'source-page') return { left: 0, top: 0, width: 600, height: 800 };
        return originalBounds.call(this);
    };
    const onSelect = jest.fn(); const onSelectBinding = jest.fn();
    const binding = { id: 'saved-name', kind: 'range', field: 'client.fullName', part: 'word/document.xml', paragraphId: 'p0', start: 3, end: 8 };
    const props = { authoring, pdfFile: new Blob(['%PDF']), bindings: [binding], onSelect, onSelectBinding, fieldLabel: value => value, text: (key, values) => values?.field ? `${key} ${values.field}` : key };
    let view;
    try {
        view = render(<WordSourceViewer {...props} />);
        const chip = await screen.findByRole('button', { name: 'editReplacement client.fullName' });
        expect(chip.closest('[aria-hidden="true"]')).toBeNull();
        const sourceText = screen.getByTestId('source-page').querySelector('[data-word-item]');
        const range = document.createRange(); range.selectNodeContents(sourceText); window.getSelection().removeAllRanges(); window.getSelection().addRange(range);
        fireEvent.mouseUp(chip); fireEvent.click(chip);
        expect(onSelectBinding).toHaveBeenCalledWith('saved-name'); expect(onSelect).not.toHaveBeenCalled();
        view.rerender(<WordSourceViewer {...props} activeBindingId="saved-name" />);
        await waitFor(() => expect(chip).toHaveFocus()); expect(chip).toHaveAttribute('aria-pressed', 'true');
        expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' });
        expect(view.container.querySelector('.lw-word-source__mark')).toHaveStyle({ left: '25px', top: '50px', width: '70px', height: '12px' });
        fireEvent.mouseUp(sourceText);
        expect(onSelect).toHaveBeenCalledWith({ kind: 'range', start: { itemId: 'p1_i0', offset: 0 }, end: { itemId: 'p1_i0', offset: 8 } });
        expect(binding).toEqual(props.bindings[0]);
        HTMLElement.prototype.scrollIntoView.mockClear();
        view.rerender(<WordSourceViewer {...props} activeBindingId={null} selection={{ kind: 'range', anchor: { ...binding, start: 0, end: 3 } }} />);
        await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledWith({ block: 'center', inline: 'nearest' }));
    } finally {
        view?.unmount(); HTMLElement.prototype.getBoundingClientRect = originalBounds; HTMLElement.prototype.scrollIntoView = originalScroll;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
});

test('only an actually verified RTL neutral layer receives caret presentation and a later mismatch removes it', async () => {
    const authoring = create(); const paragraph = { part: 'word/document.xml', id: 'p0', text: '\u05e9\u05dd ____', editable: true, textHash: hash('\u05e9\u05dd ____') };
    authoring.pages[0].items.forEach((item, index) => {
        item.text = '__'; item.dir = 'ltr'; item.segments = [{ itemStart: 0, itemEnd: 2, sourceStart: 3 + index * 2,
            sourceEnd: 5 + index * 2, part: paragraph.part, paragraphId: paragraph.id, paragraphHash: paragraph.textHash }];
    });
    authoring.pages[0].textContentHash = hash(JSON.stringify(authoring.pages[0].items.map(item => [item.text, item.dir, item.transform, item.width, item.height, item.hasEOL])));
    const before = JSON.parse(JSON.stringify(authoring)); const onError = jest.fn();
    mockContent = { items: authoring.pages[0].items.map(({ text, ...rest }) => ({ ...rest, str: text })) };
    render(<WordSourceViewer authoring={authoring} paragraphs={[paragraph]} pdfFile={new Blob(['%PDF'])} bindings={[]}
        onSelect={jest.fn()} onError={onError} fieldLabel={value => value} text={value => value} />);
    await waitFor(() => expect(screen.getByTestId('source-page').querySelectorAll('[data-word-neutral-rtl="true"]')).toHaveLength(2));
    expect(authoring).toEqual(before); expect(onError).not.toHaveBeenCalled();
    mockContent.items[1].str = 'Different'; await act(async () => mockVerifyPage());
    expect(onError).toHaveBeenCalledWith('authoringMismatch');
    expect(screen.getByTestId('source-page').querySelector('[data-word-neutral-rtl]')).toBeNull();
    expect(screen.getByTestId('source-page').querySelector('[data-word-verified]')).toBeNull();
});

test('an active saved label recenters once after desktop-to-mobile resize without stealing input focus or changing its anchor', async () => {
    const authoring = create(); mockContent = { items: authoring.pages[0].items.map(({ text, ...rest }) => ({ ...rest, str: text })) };
    const originalBounds = HTMLElement.prototype.getBoundingClientRect; const originalScroll = HTMLElement.prototype.scrollIntoView;
    const originalWidth = window.innerWidth; const originalObserver = global.ResizeObserver;
    let pageWidth = 600; const callbacks = new Set();
    global.ResizeObserver = class { constructor(callback) { this.callback = callback; callbacks.add(callback); } observe() {} disconnect() { callbacks.delete(this.callback); } };
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1200 });
    HTMLElement.prototype.scrollIntoView = jest.fn();
    HTMLElement.prototype.getBoundingClientRect = function () {
        if (this.matches('[data-word-chip]')) return { left: 0, top: 0, width: 120, height: 19 };
        if (this.dataset.testid === 'source-page') return { left: 0, top: 0, width: pageWidth, height: pageWidth * 4 / 3 };
        return originalBounds.call(this);
    };
    const binding = { id: 'resize-name', kind: 'range', field: 'client.fullName', part: 'word/document.xml', paragraphId: 'p0', start: 3, end: 8 };
    const before = JSON.parse(JSON.stringify(binding)); const onSelect = jest.fn(); let view; let input;
    try {
        view = render(<WordSourceViewer authoring={authoring} pdfFile={new Blob(['%PDF'])} bindings={[binding]} activeBindingId={binding.id}
            onSelect={onSelect} fieldLabel={value => value} text={(key, values) => values?.field ? `${key} ${values.field}` : key} />);
        const chip = await screen.findByRole('button', { name: 'editReplacement client.fullName' });
        await waitFor(() => expect(chip).toHaveFocus());
        expect(HTMLElement.prototype.scrollIntoView).toHaveBeenLastCalledWith({ block: 'nearest', inline: 'nearest' });
        const focus = jest.spyOn(chip, 'focus'); HTMLElement.prototype.scrollIntoView.mockClear();
        input = document.createElement('input'); document.body.append(input); input.focus();
        pageWidth = 278; Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
        fireEvent(window, new Event('resize'));
        await waitFor(() => expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1));
        expect(HTMLElement.prototype.scrollIntoView).toHaveBeenLastCalledWith({ block: 'center', inline: 'nearest' });
        expect(input).toHaveFocus(); expect(focus).not.toHaveBeenCalled();
        await act(async () => { [...callbacks].forEach(callback => callback()); });
        fireEvent(window, new Event('resize'));
        expect(HTMLElement.prototype.scrollIntoView).toHaveBeenCalledTimes(1);
        expect(binding).toEqual(before); expect(onSelect).not.toHaveBeenCalled(); focus.mockRestore();
    } finally {
        view?.unmount(); input?.remove(); global.ResizeObserver = originalObserver;
        HTMLElement.prototype.getBoundingClientRect = originalBounds; HTMLElement.prototype.scrollIntoView = originalScroll;
        Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalWidth });
    }
});
