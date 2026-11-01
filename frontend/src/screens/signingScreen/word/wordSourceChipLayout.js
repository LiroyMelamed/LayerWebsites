const GAP = 3;
const clamp = (value, min, max) => Math.max(min, Math.min(value, max));
function nearestFreeTop(placed, left, width, height, preferred, maxTop) {
    let down = preferred; let up = preferred;
    // placed stays sorted by top. Each pass skips horizontally separate labels
    // and crosses every relevant occupied interval at most once.
    for (const other of placed) {
        if (left < other.left + other.width + GAP && left + width + GAP > other.left &&
            down > other.top - height - GAP && down < other.top + other.height + GAP) down = other.top + other.height + GAP;
        if (down > maxTop) break;
    }
    for (let index = placed.length - 1; index >= 0; index -= 1) {
        const other = placed[index];
        if (left < other.left + other.width + GAP && left + width + GAP > other.left &&
            up > other.top - height - GAP && up < other.top + other.height + GAP) up = other.top - height - GAP;
        if (up < 0) break;
    }
    if (down > maxTop) return up >= 0 ? up : null;
    if (up < 0) return down;
    return down - preferred <= preferred - up ? down : up;
}

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
        // Three horizontal lanes and two linear interval scans per lane keep
        // the complete layout O(n²), including the allowed 1,000-binding case.
        const lefts = [...new Set([preferred.left, 0, maxLeft])];
        let position;
        for (const left of lefts) {
            const top = nearestFreeTop(placed, left, width, height, preferred.top, maxTop);
            if (top !== null) { position = { left, top, width, height }; break; }
        }
        // An overfull page cannot fit unlimited labels. Keep its labels inside
        // the page rather than shifting source highlights or overflowing it.
        position ||= preferred;
        const moved = position.left !== preferred.left || position.top !== preferred.top;
        const x1 = anchor.left + anchor.width / 2; const y1 = anchor.top + anchor.height / 2;
        result[index] = { ...position, leader: moved ? {
            x1, y1, x2: clamp(x1, position.left, position.left + width), y2: clamp(y1, position.top, position.top + height),
        } : null };
        const insertAt = placed.findIndex(other => other.top > position.top);
        if (insertAt === -1) placed.push(position); else placed.splice(insertAt, 0, position);
    });
    return result;
}
