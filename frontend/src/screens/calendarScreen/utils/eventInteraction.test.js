/* These integration tests drive FullCalendar's actual touch/mouse engine. */
/* eslint-disable testing-library/no-node-access */
import { fireEvent } from '@testing-library/react';
import interactionPlugin from '@fullcalendar/interaction';
import { calendarEventInteractionOptions } from './eventInteraction';

let wrapper, event, dragging, dragStart;
function mountGesture(delay, touch = true) {
    wrapper = document.createElement('div');
    event = document.createElement('div');
    event.className = 'fc-event';
    event.textContent = 'Synthetic appointment';
    wrapper.appendChild(event);
    document.body.appendChild(wrapper);
    dragging = new interactionPlugin.elementDraggingImpl(wrapper, '.fc-event');
    // EventDragging disables scrolling only after a deliberate drag begins.
    dragging.touchScrollAllowed = false;
    dragging.delay = touch ? delay : null;
    dragging.minDistance = touch ? 0 : 5;
    dragStart = jest.fn();
    dragging.emitter.on('dragstart', dragStart);
}
const point = { identifier: 1, clientX: 40, clientY: 80, pageX: 40, pageY: 80 };
function touchStart() { fireEvent.touchStart(event, { touches: [point], changedTouches: [point] }); }
function touchEnd() { fireEvent.touchEnd(event, { touches: [], changedTouches: [point] }); }
function mouseEvent(target, type, x, y) {
    const ev = new MouseEvent(type, { bubbles: true, button: 0, clientX: x, clientY: y });
    // jsdom does not derive page coordinates from client coordinates as browsers do.
    Object.defineProperties(ev, { pageX: { value: x }, pageY: { value: y } });
    fireEvent(target, ev);
}
beforeEach(() => jest.useFakeTimers());
afterEach(() => {
    dragging?.destroy();
    wrapper?.remove();
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
});

test('the former zero-delay setting starts a drag on touch-down itself', () => {
    mountGesture(0);
    touchStart();
    jest.advanceTimersByTime(0);
    expect(dragStart).toHaveBeenCalledTimes(1);
    touchEnd();
});
test('a normal tap, with slight finger movement, does not start an event drag', () => {
    mountGesture(calendarEventInteractionOptions(true).eventLongPressDelay);
    touchStart();
    jest.advanceTimersByTime(180);
    fireEvent.touchMove(event, { touches: [{ ...point, pageX: 43 }], changedTouches: [{ ...point, pageX: 43 }] });
    touchEnd();
    jest.advanceTimersByTime(1000);
    expect(dragStart).not.toHaveBeenCalled();
});
test('scrolling from an event cancels the pending long-press drag', () => {
    mountGesture(calendarEventInteractionOptions(true).eventLongPressDelay);
    touchStart();
    jest.advanceTimersByTime(180);
    fireEvent.scroll(window);
    jest.advanceTimersByTime(1000);
    expect(dragStart).not.toHaveBeenCalled();
    touchEnd();
});
test('deliberate long-press still permits event dragging', () => {
    const options = calendarEventInteractionOptions(true);
    mountGesture(options.eventLongPressDelay);
    touchStart();
    jest.advanceTimersByTime(options.eventLongPressDelay - 1);
    expect(dragStart).not.toHaveBeenCalled();
    jest.advanceTimersByTime(1);
    expect(dragStart).toHaveBeenCalledTimes(1);
    touchEnd();
});
test('mouse dragging starts with movement without waiting for the touch delay', () => {
    mountGesture(calendarEventInteractionOptions(false).eventLongPressDelay, false);
    mouseEvent(event, 'mousedown', 40, 80);
    mouseEvent(document, 'mousemove', 60, 100);
    expect(dragStart).toHaveBeenCalledTimes(1);
    mouseEvent(document, 'mouseup', 60, 100);
});
test('short mobile events have a finger-size target while desktop sizing stays with FullCalendar', () => {
    expect(calendarEventInteractionOptions(true).eventMinHeight).toBeGreaterThanOrEqual(44);
    expect(calendarEventInteractionOptions(false)).not.toHaveProperty('eventMinHeight');
});
