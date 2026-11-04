import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import PdfViewer from '../../../components/specializedComponents/signFiles/pdfViewer/PdfViewer';
import StatusNotice from '../../../components/ui/StatusNotice';
import SecondaryButton from '../../../components/styledComponents/buttons/SecondaryButton';
import SimpleTextArea from '../../../components/simpleComponents/SimpleTextArea';
import SegmentedSwitch from '../../../components/styledComponents/SegmentedSwitch';
import SigningSelect from '../templates/SigningSelect';
import { itemTuple, selectorForTextItem, selectorFromDom, sha256Bytes, tagVerifiedTextLayer, verifyPageGeometry, verifyPageItems } from './wordAuthoringSelection';
import { layoutSourceChips } from './wordSourceChipLayout';

function PageMarks({ host, page, bindings, selection, activeBindingId, onSelectBinding, disabled, fieldLabel, text, revision, displayWidth, viewportWidth }) {
    const [measurement, setMeasurement] = useState({ marks: [], width: 0, viewportWidth });
    const { marks } = measurement;
    const overlay = useRef(null);
    const focusedBinding = useRef(null);
    const focusedSelection = useRef(null);
    const [layout, setLayout] = useState({ marks: null, positions: [] });
    useEffect(() => {
        if (!host || !page || !revision) { setMeasurement({ marks: [], width: 0, viewportWidth }); return undefined; }
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
                    next.push({ id: binding.id, label: binding.pending ? text(binding.kind === 'insert' ? 'insertionSelected' : 'selectedLocation') : fieldLabel(binding.field), pending: binding.pending, boxes });
                }
            });
            setMeasurement({ marks: next, width: origin.width || displayWidth || 600, viewportWidth });
        };
        let active = true;
        const measureActive = () => { if (active) measure(); };
        measure(); const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureActive);
        observer?.observe(host);
        document.fonts?.addEventListener?.('loadingdone', measureActive);
        document.fonts?.ready?.then(measureActive);
        return () => { active = false; observer?.disconnect(); document.fonts?.removeEventListener?.('loadingdone', measureActive); };
    }, [host, page, bindings, selection, fieldLabel, text, revision, displayWidth, viewportWidth]);
    useLayoutEffect(() => {
        if (!host || !page || !marks.length || !overlay.current) return undefined;
        const chips = Array.from(overlay.current.querySelectorAll('[data-word-chip]'));
        const measureLabels = () => {
            const bounds = host.getBoundingClientRect();
            const width = bounds.width || displayWidth || 600;
            const height = bounds.height || page.height * width / page.width;
            const measured = marks.map((mark, index) => {
                const size = chips[index]?.getBoundingClientRect();
                return { anchor: mark.boxes[0], width: size?.width || 0, height: size?.height || 0 };
            });
            if (measured.some(chip => chip.width <= 0 || chip.height <= 0)) return;
            const positions = layoutSourceChips(measured, width, height);
            setLayout(previous => previous.marks === marks && JSON.stringify(previous.positions) === JSON.stringify(positions)
                ? previous : { marks, positions });
        };
        measureLabels();
        const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureLabels);
        chips.forEach(chip => observer?.observe(chip));
        return () => observer?.disconnect();
    }, [marks, host, page, displayWidth]);
    const positions = layout.marks === marks ? layout.positions : [];
    useEffect(() => {
        if (!activeBindingId) { focusedBinding.current = null; return; }
        const key = `${activeBindingId}:${Math.round(measurement.width * 100)}:${measurement.viewportWidth}`;
        if (!positions.length || measurement.viewportWidth !== viewportWidth || focusedBinding.current?.key === key) return;
        const chip = Array.from(overlay.current?.querySelectorAll('[data-word-binding-id]') || []).find(node => node.dataset.wordBindingId === activeBindingId);
        const firstChip = Array.from(host.closest('.lw-word-source')?.querySelectorAll('[data-word-binding-id]') || []).find(node => node.dataset.wordBindingId === activeBindingId);
        if (chip && chip === firstChip) {
            if (focusedBinding.current?.id !== activeBindingId) chip.focus({ preventScroll: true });
            focusedBinding.current = { id: activeBindingId, key };
            chip.scrollIntoView?.({ block: viewportWidth <= 768 ? 'center' : 'nearest', inline: 'nearest' });
        }
    }, [activeBindingId, marks, positions, measurement, viewportWidth, host]);
    useEffect(() => {
        if (!selection) { focusedSelection.current = null; return; }
        if (viewportWidth > 768 || measurement.viewportWidth !== viewportWidth || !positions.length) return;
        const key = JSON.stringify([selection.anchor, Math.round(measurement.width * 100), measurement.viewportWidth]);
        if (focusedSelection.current === key) return;
        const highlight = overlay.current?.querySelector('.lw-word-source__mark.is-pending');
        if (highlight && highlight === host.closest('.lw-word-source')?.querySelector('.lw-word-source__mark.is-pending')) {
            focusedSelection.current = key; highlight.scrollIntoView?.({ block: 'center', inline: 'nearest' });
        }
    }, [selection, marks, positions, host, measurement, viewportWidth]);
    return <div ref={overlay} className="lw-word-source__marks">
        <svg className="lw-word-source__leaders" aria-hidden="true">{positions.map((position, index) => position.leader &&
            <line key={marks[index].id} {...position.leader} className={marks[index].pending ? 'is-pending' : undefined} />)}</svg>
        {marks.map((mark, index) => <React.Fragment key={mark.id}>
            {mark.boxes.map((box, boxIndex) => <span key={boxIndex} aria-hidden="true" className={`lw-word-source__mark${mark.pending ? ' is-pending' : ''}${activeBindingId === mark.id ? ' is-active' : ''}`} style={box} />)}
            {mark.pending ? <span data-word-chip="" aria-hidden="true" className="lw-word-source__chip is-pending"
                style={{ left: positions[index]?.left || 0, top: positions[index]?.top || 0, visibility: positions[index] ? 'visible' : 'hidden' }}>{mark.label}</span> :
                <button type="button" data-word-chip="" data-word-binding-id={mark.id} disabled={disabled} aria-pressed={activeBindingId === mark.id}
                    aria-label={text('editReplacement', { field: mark.label })} onClick={() => onSelectBinding?.(mark.id)}
                    className={`lw-word-source__chip${activeBindingId === mark.id ? ' is-active' : ''}`}
                    style={{ left: positions[index]?.left || 0, top: positions[index]?.top || 0, visibility: positions[index] ? 'visible' : 'hidden' }}>{mark.label}</button>}
        </React.Fragment>)}
    </div>;
}

export default function WordSourceViewer({ authoring, pdfFile, paragraphs = [], bindings, selection, activeBindingId, onSelectBinding, disabled, onSelect, onError, fieldLabel, text, controlsContainer }) {
    const root = useRef(null); const generation = useRef(0); const callbacks = useRef({ onSelect, onError });
    const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth);
    useEffect(() => {
        const resize = () => setViewportWidth(window.innerWidth);
        window.addEventListener('resize', resize);
        return () => window.removeEventListener('resize', resize);
    }, []);
    callbacks.current = { onSelect, onError };
    const identity = `${authoring.renderId}:${authoring.mapHash}`;
    const [pageState, setPageState] = useState(() => ({ identity, pages: {} }));
    const [pageRevisions, setPageRevisions] = useState({});
    const pageStates = pageState.identity === identity ? pageState.pages : {};
    const [selectionMode, setSelectionMode] = useState('range');
    const [affinity, setAffinity] = useState('after');
    const [selectionError, setSelectionError] = useState(false);
    const [keyboardOpen, setKeyboardOpen] = useState(false);
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
        root.current?.querySelectorAll(`[data-page-number="${pageNumber}"] [data-word-item], [data-page-number="${pageNumber}"] [data-word-neutral-rtl]`).forEach(span => { delete span.dataset.wordItem; delete span.dataset.wordNeutralRtl; });
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
            tagVerifiedTextLayer(host, page, paragraphs);
            setPageRevisions(previous => ({ ...previous, [pageNumber]: (previous[pageNumber] || 0) + 1 }));
            setPageStates(previous => previous[pageNumber] === 'verified' ? previous : ({ ...previous, [pageNumber]: 'verified' }));
        } catch { if (token === generation.current && root.current?.contains(host)) pageError(pageNumber); }
    }, [authoring, paragraphs, pageError, setPageStates]);

    const readSelection = useCallback(event => {
        if (disabled || !root.current) return;
        if (event?.target?.closest?.('button, input, textarea, select, summary') || (!event && document.activeElement?.closest?.('[data-word-binding-id], .lw-word__mappingForm')) || document.activeElement === accessibleText.current) return;
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
            activeBindingId={activeBindingId} onSelectBinding={onSelectBinding} disabled={disabled} viewportWidth={viewportWidth}
            revision={pageStates[pageNumber] === 'verified' ? `${identity}:${pageRevisions[pageNumber] || 0}` : null} displayWidth={displayWidth} />,
    }), [verifyLayer, pageError, authoring.pages, bindings, selection, fieldLabel, text, pageStates, pageRevisions, identity, activeBindingId, onSelectBinding, disabled, viewportWidth]);
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
    const selectionControls = (
        <div className="lw-word__selectionOptions">
        <div className="lw-word__actions" role="group" aria-label={text('selectionMode')}>
            <SegmentedSwitch ariaLabel={text('selectionMode')} value={selectionMode} onChange={setSelectionMode}
                options={[{ value: 'range', label: text('replaceSelection'), disabled }, { value: 'insert', label: text('insertAtBoundary'), disabled }]} />
            {selectionMode === 'insert' && <label>{text('insertionAffinity')}<SigningSelect aria-label={text('insertionAffinity')} value={affinity} disabled={disabled} onChange={event => setAffinity(event.target.value)}>
                <option value="before">{text('beforeSelection')}</option><option value="after">{text('afterSelection')}</option>
            </SigningSelect></label>}
        </div>
        {selectionMode === 'insert' && <p>{text('insertionHelp')}</p>}
        {authoring.diagnostics?.length > 0 && <p>{text('partiallySupportedSource')}</p>}
        <SecondaryButton onPress={() => setKeyboardOpen(value => !value)} aria-expanded={keyboardOpen}>{text('keyboardSelection')}</SecondaryButton>
        {keyboardOpen && <div className="lw-word__keyboardSelection"><p>{text('keyboardSelectionHelp')}</p>
            <label>{text('textExcerpt')}<SigningSelect value={accessibleItem?.id || ''} disabled={disabled || !accessibleItems.length}
                onChange={event => setAccessibleItemId(event.target.value)}>
                {!accessibleItems.length && <option value="">{text('authoringLoading')}</option>}
                {accessibleItems.map((item, index) => <option key={item.id} value={item.id}>{text('pageExcerpt', { page: item.pageNum, number: index + 1 })}: {item.text.slice(0, 80)}</option>)}
            </SigningSelect></label>
            <SimpleTextArea textareaRef={accessibleText} title={text('selectExcerptText')} key={accessibleItem?.id} readOnly aria-label={text('selectExcerptText')} value={accessibleItem?.text || ''} disabled={disabled || !accessibleItem} />
            <SecondaryButton disabled={disabled || !accessibleItem} onPress={chooseAccessibleRange}>{text('confirmTextSelection')}</SecondaryButton>
        </div>}
        </div>
    );
    return <div className="lw-word-source" ref={root} data-disabled={disabled ? 'true' : undefined}
        onMouseUp={readSelection} onKeyUp={readSelection} onTouchEnd={readSelection}>
        {selectionError && <StatusNotice><p>{text('selectionInvalid')}</p></StatusNotice>}
        {Object.values(pageStates).includes('error') && <StatusNotice><p>{text('authoringMismatch')}</p></StatusNotice>}
        <PdfViewer pdfFile={pdfFile} spots={[]} signers={[]} authoringLayer={layer} />
        {controlsContainer ? createPortal(selectionControls, controlsContainer) : selectionControls}
    </div>;
}
