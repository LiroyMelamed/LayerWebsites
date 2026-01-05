import React from 'react';
import SimpleButton from '../../simpleComponents/SimpleButton';
import CaseFullView from '../../styledComponents/cases/CaseFullView';
import { usePopup } from '../../../providers/PopUpProvider';

import './CaseMenuItem.scss';

export default function CaseMenuItem({ optionalOnPress, rePerformRequest, caseNumber, children, style: _style, className }) {
  const { openPopup } = usePopup(); // Get the openPopup method from the context

  function OnPressItem() {
    if (optionalOnPress) {
      optionalOnPress();
    } else {
      openPopup(<CaseFullView caseName={caseNumber} rePerformRequest={rePerformRequest} />); // Open the global popup with CaseFullView
    }
  }

  return (
    <SimpleButton
      className={['lw-caseMenuItemButton', className].filter(Boolean).join(' ')}
      onClick={OnPressItem}
    >
      {children}
    </SimpleButton>
  );
}
