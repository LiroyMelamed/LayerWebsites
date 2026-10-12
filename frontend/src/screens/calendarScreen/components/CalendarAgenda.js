import React, { useMemo } from 'react';
import { ChevronLeft, ChevronRight, Repeat2, MapPin, Check, Clock3, CircleAlert, X } from 'lucide-react';
import SimpleButton from '../../../components/simpleComponents/SimpleButton';
import { colorForKey } from '../utils/lawyerColors';
import { CalendarOwners } from './CalendarOwners';
export { CalendarOwners } from './CalendarOwners';
import {
    calendarConflictOwners, calendarDateKey, calendarEventPeopleText, calendarEventStartTime,
    calendarEventsForDay, calendarEventTime, calendarEventTypeKey, calendarFormatDate,
    calendarIsCancelled, calendarIsDisplayOnly, calendarOwners, calendarRawEvent,
    calendarRsvp, calendarRsvpLabel, calendarWeekDates,
} from '../utils/calendarPresentation';
import './CalendarAgenda.scss';

function CalendarRsvpBadge({ event, t }) {
    const state = calendarRsvp(event);
    return state ? <span className={`lw-calendarRsvp lw-calendarRsvp--${state.status}`}>{calendarRsvpLabel(event, t)}</span> : null;
}

function EventIndicators({ event, t }) {
    const raw = calendarRawEvent(event);
    return <span className="lw-calendarMeeting__indicators">
        <span className="lw-calendarMeeting__type">{t(`calendar.${calendarEventTypeKey(event)}`)}</span>
        {calendarIsCancelled(event) ? <span className="lw-calendarMeeting__cancelled">{t('calendar.meetingCancelled')}</span> : <CalendarRsvpBadge event={event} t={t} />}
        {raw.rrule && <span className="lw-calendarMeeting__type"><Repeat2 size={12} aria-hidden="true" />{t('calendar.recurringMeeting')}</span>}
    </span>;
}

function CalendarMeeting({ event, events, lawyers, onOpenEvent, t, language, compact = false, day }) {
    const raw = calendarRawEvent(event);
    const title = event.title || raw.title || '';
    const displayOnly = calendarIsDisplayOnly(event);
    const people = calendarEventPeopleText(event) || raw.clientName;
    const owners = calendarOwners(event, lawyers);
    const conflictOwners = calendarConflictOwners(event, events, lawyers);
    const conflictLabel = t('calendar.overlapNotice', { names: conflictOwners.map((person) => person.name).filter(Boolean).join(' · ') });
    const Chevron = /^(he|ar)(?:-|$)/.test(language || 'he') ? ChevronLeft : ChevronRight;
    const classes = `lw-calendarMeeting${compact ? ' lw-calendarMeeting--compact' : ''}${calendarIsCancelled(event) ? ' is-cancelled' : ''}${displayOnly ? ' is-displayOnly' : ''}`;
    const content = <>
        <span className="lw-calendarMeeting__main">
            {compact && <bdi className="lw-calendarMeeting__start">{calendarEventStartTime(event, language, t, day)}</bdi>}
            <CalendarOwners event={event} lawyers={lawyers} small={compact} />
            <span className="lw-calendarMeeting__content">
                <strong className="lw-calendarMeeting__title" title={title}>{title}</strong>
                {owners.length > 0 && <span className="lw-calendarMeeting__people" title={owners.map((person) => person.name).join(' · ')}>{owners.map((person) => person.name).filter(Boolean).join(' · ')}</span>}
                {people && <span className="lw-calendarMeeting__clients" title={people}>{people}</span>}
                {!compact && <span className="lw-calendarMeeting__meta">
                    <bdi>{calendarEventTime(event, language, t)}</bdi>
                    {raw.location && <span title={raw.location}><MapPin size={12} aria-hidden="true" />{raw.location}</span>}
                    {raw.caseName && <span title={raw.caseName}>{raw.caseName}</span>}
                </span>}
            </span>
            {!displayOnly && <Chevron className="lw-calendarMeeting__chevron" size={17} aria-hidden="true" />}
        </span>
        <EventIndicators event={event} t={t} />
        {conflictOwners.length > 0 && <span className="lw-calendarMeeting__conflict">{conflictLabel}</span>}
    </>;
    if (displayOnly) return <div className={classes} style={{ '--calendar-event-color': event.backgroundColor || colorForKey(owners[0]?.id) }}>{content}</div>;
    return <SimpleButton type="button" className={classes}
        style={{ '--calendar-event-color': event.backgroundColor || colorForKey(owners[0]?.id) }}
        aria-label={t('calendar.openEventAria', { title, time: calendarEventTime(event, language, t) })}
        onPress={() => onOpenEvent?.(event)}>{content}</SimpleButton>;
}

export function CalendarDayRibbon({ events = [], date, onSelectDate, t, language }) {
    const selected = calendarDateKey(date);
    const dates = calendarWeekDates(date);
    return <div className="lw-calendarDayRibbon" aria-label={t('calendar.weekDaysAria')}>
        {dates.map((day) => <SimpleButton type="button" key={day}
            className={`lw-calendarDayChoice${day === selected ? ' is-selected' : ''}`}
            aria-label={calendarFormatDate(day, language, { weekday: 'long', day: 'numeric', month: 'long' })}
            aria-pressed={day === selected} onPress={() => onSelectDate?.(day)}>
            <span>{calendarFormatDate(day, language, { weekday: 'short' })}</span>
            <strong>{calendarFormatDate(day, language, { day: 'numeric' })}</strong>
            <span className="lw-calendarDayChoice__dot" aria-hidden="true">{calendarEventsForDay(events, day).length > 0 && <i />}</span>
        </SimpleButton>)}
    </div>;
}

export function CalendarAgenda({ events = [], date, lawyers = [], onOpenEvent, t, language, heading = false }) {
    const day = calendarDateKey(date);
    const list = useMemo(() => calendarEventsForDay(events, day), [events, day]);
    const groups = useMemo(() => {
        const grouped = new Map();
        list.forEach((event) => {
            const key = calendarEventStartTime(event, language, t, day);
            if (!grouped.has(key)) grouped.set(key, []);
            grouped.get(key).push(event);
        });
        return [...grouped.entries()];
    }, [list, day, language, t]);
    return <section className="lw-calendarAgenda" aria-label={calendarFormatDate(day, language, { weekday: 'long', day: 'numeric', month: 'long' })}>
        {heading && <div className="lw-calendarAgenda__heading">
            <strong>{calendarFormatDate(day, language, { weekday: 'long', day: 'numeric', month: 'long' })}</strong>
            <span>{t('calendar.eventsCount', { count: list.length })}</span>
        </div>}
        {!list.length ? <div className="lw-calendarAgenda__empty">{t('calendar.noMeetingsOnDay')}</div> : groups.map(([time, group]) => <div key={time} className="lw-calendarTimeGroup">
            <div className="lw-calendarTimeGroup__time"><bdi>{time}</bdi><i aria-hidden="true" /></div>
            <div className="lw-calendarTimeGroup__events">
                {group.filter((event) => !event.allDay && !calendarIsCancelled(event)).length > 1 && <span className="lw-calendarTimeGroup__parallel">{t('calendar.parallelEvents', { count: group.filter((event) => !event.allDay && !calendarIsCancelled(event)).length })}</span>}
                {group.map((event) => <CalendarMeeting key={event.id} event={event} events={events} day={day} lawyers={lawyers} onOpenEvent={onOpenEvent} t={t} language={language} />)}
            </div>
        </div>)}
    </section>;
}

export function CalendarWeekOverview({ events = [], date, lawyers = [], onOpenEvent, onOpenDay, t, language }) {
    const selected = calendarDateKey(date);
    const days = calendarWeekDates(date);
    return <section className="lw-calendarWeekOverview">
        <div className="lw-calendarWeekOverview__heading"><strong>{t('calendar.weekOverviewTitle')}</strong><span>{t('calendar.weekOverviewHint')}</span></div>
        {days.map((day) => {
            const list = calendarEventsForDay(events, day);
            return <section key={day} className={`lw-calendarWeekDay${day === selected ? ' is-selected' : ''}`}>
                <SimpleButton type="button" className="lw-calendarWeekDay__heading" onPress={() => onOpenDay?.(day)}>
                    <span><strong>{calendarFormatDate(day, language, { weekday: 'long' })}</strong><span>{calendarFormatDate(day, language, { day: 'numeric', month: 'long' })}</span></span>
                    <span>{list.length ? t('calendar.eventsCount', { count: list.length }) : t('calendar.freeDay')}</span>
                </SimpleButton>
                {list.length > 0 && <div className="lw-calendarWeekDay__events">
                    {list.slice(0, 2).map((event) => <CalendarMeeting key={event.id} compact event={event} events={events} day={day} lawyers={lawyers} onOpenEvent={onOpenEvent} t={t} language={language} />)}
                    {list.length > 2 && <SimpleButton type="button" className="lw-calendarWeekDay__more" onPress={() => onOpenDay?.(day)}>{t('calendar.moreEventsOpenDay', { count: list.length - 2 })}</SimpleButton>}
                </div>}
            </section>;
        })}
    </section>;
}

/** FullCalendar owns positioning and interaction; only its inner content changes here. */
export function CalendarGridEventContent({ info, lawyers = [], events = [], t, language }) {
    const event = info.event;
    const month = info.view?.type === 'dayGridMonth';
    const status = calendarRsvp(event);
    const title = event.title || '';
    const conflictOwners = calendarConflictOwners(event, events, lawyers);
    const conflictLabel = t('calendar.overlapNotice', { names: conflictOwners.map((person) => person.name).filter(Boolean).join(' · ') });
    return <div className={`lw-calendarGridEvent${month ? ' lw-calendarGridEvent--month' : ''}`} title={[title, calendarOwners(event, lawyers).map((person) => person.name).join(' · '), calendarRsvpLabel(event, t)].filter(Boolean).join(' — ')}>
        <span className="lw-calendarGridEvent__header">
            {!event.allDay && <bdi>{calendarEventStartTime(event, language, t)}</bdi>}
            <CalendarOwners event={event} lawyers={lawyers} small />
        </span>
        <strong>{title}</strong>
        {calendarIsCancelled(event) ? <span className="lw-calendarGridEvent__cancelled" title={t('calendar.meetingCancelled')}>{t('calendar.meetingCancelled')}</span>
            : status && status.status !== 'none' && <span className={`lw-calendarGridEvent__status lw-calendarGridEvent__status--${status.status}`} title={calendarRsvpLabel(event, t)} aria-label={calendarRsvpLabel(event, t)}>
                {status.status === 'accepted' ? <Check size={12} aria-hidden="true" /> : status.status === 'partial' ? `${status.accepted}/${status.count}` : status.status === 'declined' ? <X size={12} aria-hidden="true" /> : <Clock3 size={12} aria-hidden="true" />}
            </span>}
        {conflictOwners.length > 0 && <span className="lw-calendarGridEvent__conflict" title={conflictLabel} aria-label={conflictLabel}><CircleAlert size={12} aria-hidden="true" /></span>}
    </div>;
}

export default CalendarAgenda;
