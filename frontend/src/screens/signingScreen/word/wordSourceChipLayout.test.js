import { layoutSourceChips } from './wordSourceChipLayout';

const chip = (top, extra = {}) => ({ anchor: { left: 170, top, width: 14, height: 8 }, width: 105, height: 19, ...extra });
const separated = (a, b) => a.left + a.width + 3 <= b.left || b.left + b.width + 3 <= a.left ||
    a.top + a.height + 3 <= b.top || b.top + b.height + 3 <= a.top;
function expectContainedAndSeparated(result, width, height) {
    result.forEach((box, index) => {
        expect(box.left).toBeGreaterThanOrEqual(0); expect(box.top).toBeGreaterThanOrEqual(0);
        expect(box.left + box.width).toBeLessThanOrEqual(width); expect(box.top + box.height).toBeLessThanOrEqual(height);
        result.slice(index + 1).forEach(other => expect(separated(box, other)).toBe(true));
    });
}

test('dense saved and pending labels keep readable measured sizes without moving their source anchors', () => {
    const chips = [chip(50), chip(61), chip(50, { width: 94 })];
    const before = JSON.parse(JSON.stringify(chips));
    const result = layoutSourceChips(chips, 272, 360);
    expectContainedAndSeparated(result, 272, 360);
    expect(chips).toEqual(before);
    expect(result.map(box => box.height)).toEqual([19, 19, 19]);
    result.forEach((position, index) => {
        if (position.leader) {
            expect(position.leader.x1).toBe(chips[index].anchor.left + 7);
            expect(position.leader.y1).toBe(chips[index].anchor.top + 4);
        }
    });
    expect(result.filter(box => box.leader).length).toBeGreaterThanOrEqual(1);
});

test('long RTL labels at both page edges remain contained and attach displaced leaders to exact source rectangles', () => {
    const chips = [chip(0, { anchor: { left: 2, top: 0, width: 12, height: 8 }, width: 250 }),
        chip(0, { anchor: { left: 250, top: 0, width: 12, height: 8 }, width: 256 }),
        chip(150, { anchor: { left: 250, top: 150, width: 12, height: 8 }, width: 256 }),
        chip(150, { anchor: { left: 2, top: 150, width: 12, height: 8 }, width: 256 })];
    expectContainedAndSeparated(layoutSourceChips(chips, 272, 160), 272, 160);
});

test('layout recomputes from measured sizes after a font or narrow-page change and is deterministic', () => {
    const chips = [chip(100), chip(111)];
    const wide = layoutSourceChips(chips, 600, 800);
    const narrowChips = chips.map(item => ({ ...item, anchor: { ...item.anchor, top: item.anchor.top / 2 }, width: 145, height: 26 }));
    const narrow = layoutSourceChips(narrowChips, 272, 363);
    expectContainedAndSeparated(narrow, 272, 363);
    expect(narrow).toEqual(layoutSourceChips(narrowChips, 272, 363));
    expect(narrow).not.toEqual(wide);
    expect(narrow.map(box => box.height)).toEqual([26, 26]);
});

test('labels on nonintersecting sides preserve their nearby source placement', () => {
    const chips = [chip(30, { anchor: { left: 10, top: 30, width: 12, height: 8 }, width: 80 }),
        chip(30, { anchor: { left: 270, top: 30, width: 12, height: 8 }, width: 80 })];
    const result = layoutSourceChips(chips, 300, 400);
    expectContainedAndSeparated(result, 300, 400);
    expect(result.map(box => box.top)).toEqual([30, 30]);
    expect(result.map(box => box.leader)).toEqual([null, null]);
});

test('the maximum 1000 dense bindings retain source order, exact anchor leaders and separated contained labels when the page has room', () => {
    const count = 1000; const height = count * 22 + 80;
    const chips = Array.from({ length: count }, (_, index) => chip(20 + (count - index - 1) * 11));
    const before = JSON.parse(JSON.stringify(chips));
    const result = layoutSourceChips(chips, 272, height);
    expect(result).toHaveLength(count);
    const inSourceOrder = result.map((box, index) => ({ ...box, anchor: chips[index].anchor }))
        .sort((a, b) => a.anchor.top - b.anchor.top);
    inSourceOrder.forEach((box, index) => {
        expect(box.left).toBe(59); expect(box.width).toBe(105); expect(box.height).toBe(19);
        expect(box.top).toBeGreaterThanOrEqual(0); expect(box.top + box.height).toBeLessThanOrEqual(height);
        if (index) expect(box.top - inSourceOrder[index - 1].top).toBeGreaterThanOrEqual(22);
        if (box.leader) {
            expect(box.leader.x1).toBe(box.anchor.left + 7);
            expect(box.leader.y1).toBe(box.anchor.top + 4);
        }
    });
    expect(chips).toEqual(before);
    expect(layoutSourceChips(chips, 272, height)).toEqual(result);
});

test('the maximum binding count on an overfull narrow page still keeps measured labels and source geometry inside bounds', () => {
    const chips = Array.from({ length: 1000 }, (_, index) => chip(40 + (index % 22) * 11));
    const result = layoutSourceChips(chips, 272, 360);
    expect(result).toHaveLength(1000);
    result.forEach(box => {
        expect(box.left).toBeGreaterThanOrEqual(0); expect(box.left + box.width).toBeLessThanOrEqual(272);
        expect(box.top).toBeGreaterThanOrEqual(0); expect(box.top + box.height).toBeLessThanOrEqual(360);
        expect(box.height).toBe(19);
    });
});
