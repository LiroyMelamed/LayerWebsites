import React from 'react';
import SimpleButton from '../../simpleComponents/SimpleButton';
import CaseFullView from '../../styledComponents/cases/CaseFullView';
import { usePopup } from '../../../providers/PopUpProvider';

export default function CaseMenuItem({ optionalOnPress, rePerformRequest, caseNumber, children, style, className }) {
  const { openPopup } = usePopup(); // Get the openPopup method from the context

  const buttonStyle = {
    width: '100%',
    ...style
  };

  function OnPressItem() {
    if (optionalOnPress) {
      optionalOnPress();
    } else {
      openPopup(<CaseFullView caseName={caseNumber} rePerformRequest={rePerformRequest} />); // Open the global popup with CaseFullView
    }
  }

  return (
    <SimpleButton style={buttonStyle} className={className} onClick={OnPressItem}>
      {children}
    </SimpleButton>
  );
}
