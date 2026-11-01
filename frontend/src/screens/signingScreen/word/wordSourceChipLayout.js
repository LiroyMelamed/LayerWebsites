const GAP = 3;
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
const overlaps = (a, b) => a.left < b.left + b.width + GAP && a.left + a.width + GAP > b.left &&
    a.top < b.top + b.height + GAP && a.top + a.height + GAP > b.top;

// This is display-only label placement. Source rectangles and persisted selectors
// are never changed to make room for a label.
export function layoutSourceChips(chips, pageWidth, pageHeight) {
    const placed = [];
    const result = new Array(chips.length);
    chips.map((chip, index) => ({ ...chip, index })).sort((a, b) =>
        a.anchor.top - b.anchor.top || a.anchor.left - b.anchor.left || a.index - b.index).forEach(chip => {
        const { anchor, index } = chip;
        const width = Math.min(chip.width, pageWidth); const height = chip.height;
        const maxLeft = Math.max(0, pageWidth - width); const maxTop = Math.max(0, pageHeight - height);
        const leftRoom = anchor.left - 6; const rightEdge = anchor.left + anchor.width + 6;
        const preferredLeft = leftRoom >= width ? leftRoom - width : pageWidth - rightEdge >= width ? rightEdge : anchor.left;
        const preferredTop = leftRoom >= width || pageWidth - rightEdge >= width ? anchor.top : anchor.top - height - 4;
        const preferred = { left: clamp(preferredLeft, 0, maxLeft), top: clamp(preferredTop, 0, maxTop), width, height };
        const tops = [...new Set([preferred.top, 0, maxTop, ...placed.flatMap(other =>
            [clamp(other.top - height - GAP, 0, maxTop), clamp(other.top + other.height + GAP, 0, maxTop)])])]
            .sort((a, b) => Math.abs(a - preferred.top) - Math.abs(b - preferred.top) || b - a);
        const lefts = [...new Set([preferred.left, 0, maxLeft, ...placed.flatMap(other =>
            [clamp(other.left - width - GAP, 0, maxLeft), clamp(other.left + other.width + GAP, 0, maxLeft)])])];
        let position;
        for (const left of lefts) {
            position = tops.map(top => ({ left, top, width, height })).find(candidate => !placed.some(other => overlaps(candidate, other)));
            if (position) break;
        }
        // An overfull page cannot fit unlimited labels. Keep its labels inside
        // the page rather than shifting source highlights or overflowing it.
        position ||= preferred;
        const moved = position.left !== preferred.left || position.top !== preferred.top;
        const x1 = anchor.left + anchor.width / 2; const y1 = anchor.top + anchor.height / 2;
        result[index] = { ...position, leader: moved ? {
            x1, y1, x2: clamp(x1, position.left, position.left + width), y2: clamp(y1, position.top, position.top + height),
        } : null };
        placed.push(position);
    });
    return result;
}
