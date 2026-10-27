import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SignatureSpot from './SignatureSpot';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));

const pointerDescriptor = Object.getOwnPropertyDescriptor(window, 'PointerEvent');
const hitTestDescriptor = Object.getOwnPropertyDescriptor(document, 'elementsFromPoint');
const SCALE = 315 / 800;
const POINTER = 37;

beforeEach(() => {
    // JSDOM has no PointerEvent geometry. Use real MouseEvent coordinates while
    // retaining a pointer ID so the production pointer handlers run unchanged.
    class TestPointerEvent extends MouseEvent {
        constructor(type, options = {}) {
            super(type, options);
            this.pointerId = options.pointerId ?? POINTER;
        }
    }
    Object.defineProperty(window, 'PointerEvent', { configurable: true, value: TestPointerEvent });
    jest.spyOn(Date, 'now').mockReturnValue(1000);
});

afterEach(() => {
    fireEvent.pointerUp(window, { pointerId: POINTER });
    jest.restoreAllMocks();
    if (pointerDescriptor) Object.defineProperty(window, 'PointerEvent', pointerDescriptor);
    else delete window.PointerEvent;
    if (hitTestDescriptor) Object.defineProperty(document, 'elementsFromPoint', hitTestDescriptor);
    else delete document.elementsFromPoint;
});

function fixture() {
    const nativeField = Object.freeze({ id: 'tenant-name', roleKey: 'tenant', occurrence: 0 });
    const spot = Object.freeze({ id: 'tenant-name', pageNum: 1, x: 100, y: 200,
        width: 180, height: 48, type: 'text', fieldType: 'text', roleId: 'tenant',
        occurrence: 0, fieldLabel: 'שם שוכר QA', isRequired: true, nativeField });
    let updatedSpot = spot;
    const onUpdateSpot = jest.fn((index, patch) => { updatedSpot = { ...spot, ...patch }; });
    const onSelectSpot = jest.fn();
    const onEditSpot = jest.fn();
    const onRemoveSpot = jest.fn();
    const onRequestRemove = jest.fn();
    const { container } = render(<div className="lw-signing-pageInner" data-page-number="1" data-measured-width="315">
        <SignatureSpot spot={spot} index={2} scale={SCALE} signerName="שוכר בדיקה QA"
            onUpdateSpot={onUpdateSpot} onSelectSpot={onSelectSpot} onEditSpot={onEditSpot}
            onRemoveSpot={onRemoveSpot} onRequestRemove={onRequestRemove} />
    </div>);
    // These physical PDF layers intentionally are not accessibility controls.
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const page = container.querySelector('.lw-signing-pageInner');
    // eslint-disable-next-line testing-library/no-container, testing-library/no-node-access
    const overlay = container.querySelector('.lw-signing-spotOverlay');
    jest.spyOn(page, 'getBoundingClientRect').mockReturnValue({
        left: 17, top: 31, right: 332, bottom: 472, width: 315, height: 441,
    });
    Object.defineProperty(document, 'elementsFromPoint', {
        configurable: true, value: jest.fn(() => [page]),
    });
    return { spot, overlay, onUpdateSpot, onSelectSpot, onEditSpot, onRemoveSpot, onRequestRemove,
        updated: () => updatedSpot };
}

test('a short pointer tap selects a narrow field without moving it or opening its editor', () => {
    const f = fixture();
    fireEvent.pointerDown(f.overlay, { clientX: 65, clientY: 115, button: 0, pointerId: POINTER });
    fireEvent.pointerMove(window, { clientX: 72, clientY: 120, pointerId: POINTER });
    Date.now.mockReturnValue(1100);
    fireEvent.pointerUp(window, { pointerId: POINTER });
    expect(f.onSelectSpot).toHaveBeenCalledTimes(1);
    expect(f.onSelectSpot).toHaveBeenCalledWith(2);
    expect(f.onEditSpot).not.toHaveBeenCalled();
    expect(f.onUpdateSpot).not.toHaveBeenCalled();
    expect(f.updated()).toBe(f.spot);
});

test('dragging the actual overlay uses measured mobile scale and preserves its role, label and native metadata', () => {
    const f = fixture();
    fireEvent.pointerDown(f.overlay, { clientX: 65, clientY: 115, button: 0, pointerId: POINTER });
    fireEvent.pointerMove(window, { clientX: 80, clientY: 150, pointerId: POINTER });
    fireEvent.pointerUp(window, { pointerId: POINTER });
    expect(f.onUpdateSpot).toHaveBeenCalledTimes(1);
    const [index, patch] = f.onUpdateSpot.mock.calls[0];
    expect(index).toBe(2);
    expect(patch.x).toBeCloseTo(100 + 15 * 800 / 315, 8);
    expect(patch.y).toBeCloseTo(200 + 35 * 800 / 315, 8);
    expect(patch).toMatchObject({ pageNum: 1, PageNumber: 1 });
    expect(f.updated()).toMatchObject({ roleId: 'tenant', occurrence: 0, fieldLabel: 'שם שוכר QA',
        width: 180, height: 48, isRequired: true });
    expect(f.updated().nativeField).toBe(f.spot.nativeField);
    expect(f.spot).toMatchObject({ x: 100, y: 200, roleId: 'tenant', fieldLabel: 'שם שוכר QA' });
    expect(f.onSelectSpot).not.toHaveBeenCalled();
    expect(f.onEditSpot).not.toHaveBeenCalled();
    fireEvent.pointerMove(window, { clientX: 120, clientY: 190, pointerId: POINTER });
    expect(f.onUpdateSpot).toHaveBeenCalledTimes(1);
});

test('the resize control changes size independently without dragging or selecting the field', () => {
    const f = fixture();
    fireEvent.pointerDown(screen.getByRole('button', { name: 'signing.fieldSettings.resize' }),
        { clientX: 130, clientY: 140, button: 0, pointerId: POINTER });
    fireEvent.pointerMove(window, { clientX: 145, clientY: 160, pointerId: POINTER });
    fireEvent.pointerUp(window, { pointerId: POINTER });
    expect(f.onUpdateSpot).toHaveBeenCalledTimes(1);
    const [index, patch] = f.onUpdateSpot.mock.calls[0];
    expect(index).toBe(2);
    expect(Object.keys(patch).sort()).toEqual(['height', 'width']);
    expect(patch.width).toBeCloseTo(180 + 15 * 800 / 315, 8);
    expect(patch.height).toBeCloseTo(48 + 20 * 800 / 315, 8);
    expect(f.updated()).toMatchObject({ x: 100, y: 200, roleId: 'tenant', occurrence: 0,
        fieldLabel: 'שם שוכר QA', nativeField: f.spot.nativeField });
    expect(f.onSelectSpot).not.toHaveBeenCalled();
    expect(f.onEditSpot).not.toHaveBeenCalled();
});

test('the remove control requests removal without starting a drag or selecting the field', () => {
    const f = fixture();
    const remove = screen.getByText('X', { exact: true });
    fireEvent.pointerDown(remove, { clientX: 130, clientY: 100, button: 0, pointerId: POINTER });
    fireEvent.click(remove);
    fireEvent.pointerMove(window, { clientX: 170, clientY: 150, pointerId: POINTER });
    fireEvent.pointerUp(window, { pointerId: POINTER });
    expect(f.onRequestRemove).toHaveBeenCalledTimes(1);
    expect(f.onRequestRemove).toHaveBeenCalledWith(2);
    expect(f.onRemoveSpot).not.toHaveBeenCalled();
    expect(f.onUpdateSpot).not.toHaveBeenCalled();
    expect(f.onSelectSpot).not.toHaveBeenCalled();
    expect(f.onEditSpot).not.toHaveBeenCalled();
});
