import { forwardRef } from 'react';
import SecondaryButton from '../styledComponents/buttons/SecondaryButton';
import './StatusNotice.scss';

const StatusNotice = forwardRef(function StatusNotice({
    actionLabel,
    onAction,
    className = '',
    children,
    embedded = false,
    ...rest
}, ref) {
    const classes = ['lw-statusNotice', embedded ? 'is-embedded' : '', className].filter(Boolean).join(' ');
    return (
        <div ref={ref} className={classes} role="alert" {...rest}>
            <span className="lw-statusNotice__mark" aria-hidden="true" />
            <div className="lw-statusNotice__body">{children}</div>
            {onAction ? <SecondaryButton onPress={onAction}>{actionLabel}</SecondaryButton> : null}
        </div>
    );
});

export default StatusNotice;
