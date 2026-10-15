import React from 'react';
import SimpleButton from '../../simpleComponents/SimpleButton';

import './ReminderMenuItem.scss';

export default function ReminderMenuItem({ onPress, children, className }) {
    return (
        <SimpleButton
            className={['lw-reminderMenuItem', className].filter(Boolean).join(' ')}
            onPress={onPress}
        >
            {children}
        </SimpleButton>
    );
}
