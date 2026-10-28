import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import PdfViewer from '../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer';
import StatusNotice from '../../../components/ui/StatusNotice';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import SimpleTextArea from '../../../components/simpleComponents/SimpleTextArea';
import SegmentedSwitch from '../../../components/styledComponents/SegmentedSwitch';
import SigningSelect from '../templates/SigningSelect';
import { itemTuple, selectorForTextItem, selectorFromDom, sha256Bytes, tagVerifiedTextLayer, verifyPageGeometry, verifyPageItems } from './wordAuthoringSelection';

function PageMarks({ host, page, bindings, selection, fieldLabel, text, revision, displayWidth }) {
    const [marks, setMarks] = useState([]);
    useEffect(() => {
        if (!host || !page || !revision) { setMarks([]); return undefined; }
        const measure = () => {
            const origin = host.getBoundingClientRect(); const next = [];
            const visibleMarks = selection ? [...bindings, { ...selection.anchor, id: 'pending-selection', kind: selection.kind, pending: true }] : bindings;
            visibleMarks.forEach(binding => {
                const boxes = [];
                page.items.forEach(item => {
                    const span = Array.from(host.querySelectorAll('[data-word-item]')).find(node => node.dataset.wordItem === item.id);
                    if (!span || span.firstChild?.nodeType !== 3) return;
                    item.segments.forEach(segment => {
                        if (segment.part !== binding.part || segment.paragraphId !== binding.paragraphId ||
                            segment.itemEnd - segment.itemStart !== segment.sourceEnd - segment.sourceStart) return;
                        const insert = binding.kind === 'insert';
                        const from = Math.max(binding.start, segment.sourceStart); const to = Math.min(binding.end, segment.sourceEnd);
                        if (insert ? binding.start < segment.sourceStart || binding.start > segment.sourceEnd : to <= from) return;
                        const range = document.createRange();
                        range.setStart(span.firstChild, segment.itemStart + from - segment.sourceStart);
                        range.setEnd(span.firstChild, segment.itemStart + (insert ? from : to) - segment.sourceStart);
                        Array.from(range.getClientRects()).forEach(rect => {
                            if (rect.height > 0) boxes.push({ left: rect.left - origin.left, top: rect.top - origin.top,
                                width: insert ? 2 : rect.width, height: rect.height });
                        });
                    });
                });
                if (boxes.length) {
                    const first = boxes[0]; const pageWidth = displayWidth || 600;
                    const leftRoom = first.left - 6; const rightEdge = first.left + first.width + 6;
                    const labelStyle = leftRoom >= 120
                        ? { left: leftRoom, top: first.top, transform: 'translateX(-100%)', maxWidth: leftRoom }
                        : pageWidth - rightEdge >= 120
                            ? { left: rightEdge, top: first.top, maxWidth: pageWidth - rightEdge }
                            : { left: Math.max(0, Math.min(first.left, pageWidth - 150)), top: Math.max(0, first.top - 23) };
                    next.push({ id: binding.id, label: binding.pending ? text(binding.kind === 'insert' ? 'insertionSelected' : 'selectedLocation') : fieldLabel(binding.field), pending: binding.pending, boxes, labelStyle });
                }
            });
            setMarks(next);
        };
        measure(); const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
        observer?.observe(host); return () => observer?.disconnect();
    }, [host, page, bindings, selection, fieldLabel, text, revision, displayWidth]);
    return <div className="lw-word-source__marks" aria-hidden="true">{marks.map(mark => <React.Fragment key={mark.id}>
        {mark.boxes.map((box, index) => <span key={index} className={`lw-word-source__mark${mark.pending ? ' is-pending' : ''}`} style={box} />)}
        <span className={`lw-word-source__chip${mark.pending ? ' is-pending' : ''}`} style={mark.labelStyle}>{mark.label}</span>
    </React.Fragment>)}</div>;
}

export default function WordSourceViewer({ authoring, pdfFile, bindings, selection, disabled, onSelect, onError, fieldLabel, text }) {
    const root = useRef(null); const generation = useRef(0); const callbacks = useRef({ onSelect, onError });
    callbacks.current = { onSelect, onError };
    const identity = `${authoring.renderId}:${authoring.mapHash}`;
    const [pageState, setPageState] = useState(() => ({ identity, pages: {} }));
    const [pageRevisions, setPageRevisions] = useState({});
    const pageStates = pageState.identity === identity ? pageState.pages : {};
    const [selectionMode, setSelectionMode] = useState('range');
    const [affinity, setAffinity] = useState('after');
    const [selectionError, setSelectionError] = useState(false);
    const [accessibleItemId, setAccessibleItemId] = useState(''); const accessibleText = useRef(null);
    const identityRef = useRef(identity);
    if (identityRef.current !== identity) { identityRef.current = identity; generation.current += 1; }
    const setPageStates = useCallback(update => setPageState(previous => {
        const current = previous.identity === identityRef.current ? previous.pages : {};
        const pages = update(current);
        return previous.identity === identityRef.current && pages === current ? previous : { identity: identityRef.current, pages };
    }), []);
    // Cached child callbacks may precede parent passive effects. Identity-bound
    // state needs no mount reset that could erase their verification or failure.
    useEffect(() => { setSelectionError(false); }, [identity]);
    useEffect(() => () => { generation.current += 1; }, []);

    const pageError = useCallback(pageNumber => {
        root.current?.querySelectorAll(`[data-page-number="${pageNumber}"] [data-word-item]`).forEach(span => { delete span.dataset.wordItem; });
        root.current?.querySelectorAll(`[data-page-number="${pageNumber}"] [data-word-verified]`).forEach(layer => { delete layer.dataset.wordVerified; });
        setPageStates(previous => ({ ...previous, [pageNumber]: 'error' }));
        callbacks.current.onError?.('authoringMismatch');
    }, [setPageStates]);
    const verifyLayer = useCallback(async ({ pageNumber, content, host, pdfProxy }) => {
        const token = generation.current;
        try {
            const page = authoring.pages.find(page => page.pageNum === pageNumber);
            if (!page || !pdfProxy || pdfProxy.numPages !== authoring.pages.length || !host) throw new Error('PAGE_MISMATCH');
            const serverHash = await sha256Bytes(new TextEncoder().encode(JSON.stringify(page.items.map(itemTuple))));
            if (serverHash !== page.textContentHash) throw new Error('SERVER_TEXT_HASH_MISMATCH');
            const actual = verifyPageItems(page, content, authoring.geometryTolerance);
            const exactHash = await sha256Bytes(new TextEncoder().encode(JSON.stringify(actual.map(itemTuple))));
            // A different hash is accepted only after every exact string/order/dir/EOL and
            // every finite geometry component passed the server's explicit <=.01pt policy.
            if (exactHash !== page.textContentHash && authoring.geometryTolerance === 0) throw new Error('TEXT_HASH_MISMATCH');
            const proxy = await pdfProxy.getPage(pageNumber);
            verifyPageGeometry(page, proxy, authoring.geometryTolerance);
            if (token !== generation.current || !root.current?.contains(host)) return;
            tagVerifiedTextLayer(host, page);
            setPageRevisions(previous => ({ ...previous, [pageNumber]: (previous[pageNumber] || 0) + 1 }));
            setPageStates(previous => previous[pageNumber] === 'verified' ? previous : ({ ...previous, [pageNumber]: 'verified' }));
        } catch { if (token === generation.current && root.current?.contains(host)) pageError(pageNumber); }
    }, [authoring, pageError, setPageStates]);

    const readSelection = useCallback(event => {
        if (disabled || !root.current) return;
        if (event?.target?.closest?.('button, input, textarea, select') || document.activeElement === accessibleText.current) return;
        const selection = window.getSelection();
        if (!selection?.anchorNode || !root.current.contains(selection.anchorNode)) return;
        if (selection.isCollapsed && selectionMode === 'range') return;
        try {
            const selector = selectorFromDom(root.current, selection, authoring, selectionMode, affinity);
            setSelectionError(false); callbacks.current.onSelect(selector);
        } catch { setSelectionError(true); }
    }, [authoring, disabled, selectionMode, affinity]);
    useEffect(() => {
        let timer;
        const change = () => { clearTimeout(timer); timer = setTimeout(readSelection, 160); };
        document.addEventListener('selectionchange', change);
        return () => { clearTimeout(timer); document.removeEventListener('selectionchange', change); };
    }, [readSelection]);
    const layer = useMemo(() => ({ onPageTextReady: verifyLayer, onPageError: pageError,
        renderPageOverlay: ({ pageNumber, host, displayWidth }) => <PageMarks host={host}
            page={authoring.pages.find(page => page.pageNum === pageNumber)} bindings={bindings} selection={selection} fieldLabel={fieldLabel} text={text}
            revision={pageStates[pageNumber] === 'verified' ? `${identity}:${pageRevisions[pageNumber] || 0}` : null} displayWidth={displayWidth} />,
    }), [verifyLayer, pageError, authoring.pages, bindings, selection, fieldLabel, text, pageStates, pageRevisions, identity]);
    const accessibleItems = authoring.pages.filter(page => pageStates[page.pageNum] === 'verified').flatMap(page =>
        page.items.filter(item => item.text && item.segments.length && !item.readOnlyReason).map(item => ({ ...item, pageNum: page.pageNum })));
    const accessibleItem = accessibleItems.find(item => item.id === accessibleItemId) || accessibleItems[0];
    function chooseAccessibleRange() {
        const input = accessibleText.current;
        if (disabled || !accessibleItem || !input || input.value !== accessibleItem.text) return;
        try {
            callbacks.current.onSelect(selectorForTextItem(authoring, accessibleItem.id, input.selectionStart, input.selectionEnd, selectionMode, affinity));
            setSelectionError(false);
        } catch { setSelectionError(true); }
    }
    return <div className="lw-word-source" ref={root} data-disabled={disabled ? 'true' : undefined}
        onMouseUp={readSelection} onKeyUp={readSelection} onTouchEnd={readSelection}>
        <div className="lw-word__actions" role="group" aria-label={text('selectionMode')}>
            <SegmentedSwitch ariaLabel={text('selectionMode')} value={selectionMode} onChange={setSelectionMode}
                options={[{ value: 'range', label: text('replaceSelection'), disabled }, { value: 'insert', label: text('insertAtBoundary'), disabled }]} />
            {selectionMode === 'insert' && <label>{text('insertionAffinity')}<SigningSelect aria-label={text('insertionAffinity')} value={affinity} disabled={disabled} onChange={event => setAffinity(event.target.value)}>
                <option value="before">{text('beforeSelection')}</option><option value="after">{text('afterSelection')}</option>
            </SigningSelect></label>}
        </div>
        <p>{text(selectionMode === 'insert' ? 'insertionHelp' : 'visualSelectionHelp')}</p>
        {authoring.diagnostics?.length > 0 && <p>{text('partiallySupportedSource')}</p>}
        {selectionError && <StatusNotice><p>{text('selectionInvalid')}</p></StatusNotice>}
        {Object.values(pageStates).includes('error') && <StatusNotice><p>{text('authoringMismatch')}</p></StatusNotice>}
        <details className="lw-word__advanced"><summary>{text('keyboardSelection')}</summary><p>{text('keyboardSelectionHelp')}</p>
            <label>{text('textExcerpt')}<SigningSelect value={accessibleItem?.id || ''} disabled={disabled || !accessibleItems.length}
                onChange={event => setAccessibleItemId(event.target.value)}>
                {!accessibleItems.length && <option value="">{text('authoringLoading')}</option>}
                {accessibleItems.map((item, index) => <option key={item.id} value={item.id}>{text('pageExcerpt', { page: item.pageNum, number: index + 1 })}: {item.text.slice(0, 80)}</option>)}
            </SigningSelect></label>
            <SimpleTextArea textareaRef={accessibleText} title={text('selectExcerptText')} key={accessibleItem?.id} readOnly aria-label={text('selectExcerptText')} value={accessibleItem?.text || ''} disabled={disabled || !accessibleItem} />
            <SecondaryButton disabled={disabled || !accessibleItem} onPress={chooseAccessibleRange}>{text('confirmTextSelection')}</SecondaryButton>
        </details>
        <PdfViewer pdfFile={pdfFile} spots={[]} signers={[]} authoringLayer={layer} />
    </div>;
}
