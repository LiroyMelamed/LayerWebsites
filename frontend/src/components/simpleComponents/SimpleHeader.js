import React from 'react';
import SimpleImage from './SimpleImage';
import SimpleNav from './SimpleNav';
import SimpleContainer from './SimpleContainer';
import { colors } from '../../constant/colors';

const SimpleHeader = ({ logoSrc, logoAlt, navLinks, style }) => {
  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 24px',
    backgroundColor: colors.greyBackground,
    ...style
  };

  const logoContainerStyle = {
    display: 'flex',
    alignItems: 'center',
  };

  return (
    <header style={headerStyle}>
      <SimpleContainer style={logoContainerStyle}>
        <SimpleImage src={logoSrc} alt={logoAlt} width="150px" height="50px" />
      </SimpleContainer>
      <SimpleNav links={navLinks} />
    </header>
  );
};

export default SimpleHeader;
