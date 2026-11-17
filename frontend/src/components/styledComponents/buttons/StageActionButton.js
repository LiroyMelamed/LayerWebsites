import React from 'react';
import SimpleButton from '../../simpleComponents/SimpleButton';
import { Text12 } from '../../specializedComponents/text/AllTextKindFile';
import './StageActionButton.scss';

export default function StageActionButton({ label, showPlus = true, className = '', ...props }) {
    return <SimpleButton type="button" aria-label={label} className={`lw-stageActionButton ${className}`} {...props}>
        <Text12>{showPlus && <span aria-hidden="true">+ </span>}{label}</Text12>
    </SimpleButton>;
}
