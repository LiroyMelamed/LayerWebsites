import React, { useState } from 'react';
import { colorForKey } from '../utils/lawyerColors';
import { calendarInitials, calendarOwners } from '../utils/calendarPresentation';

function CalendarAvatar({ person, small = false }) {
    const [failedPhoto, setFailedPhoto] = useState('');
    const showPhoto = person.photo && failedPhoto !== person.photo;
    return <span className={`lw-calendarAvatar${small ? ' lw-calendarAvatar--small' : ''}`}
        style={{ '--calendar-person-color': colorForKey(person.id || person.name) }} title={person.name} aria-label={person.name}>
        {showPhoto ? <img src={person.photo} alt="" onError={() => setFailedPhoto(person.photo)} /> : calendarInitials(person.name)}
    </span>;
}

export function CalendarOwners({ event, lawyers = [], small = false, names = false }) {
    const owners = calendarOwners(event, lawyers);
    if (!owners.length) return null;
    return <span className={`lw-calendarOwners${names ? ' lw-calendarOwners--names' : ''}`}>
        <span className="lw-calendarOwners__avatars">{owners.map((person) => <CalendarAvatar key={person.id} person={person} small={small} />)}</span>
        {names && <span className="lw-calendarOwners__names">{owners.map((person) => person.name).filter(Boolean).join(' · ')}</span>}
    </span>;
}

