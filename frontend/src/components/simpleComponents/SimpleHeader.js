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
    padding: '0.75rem 1.5rem',
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
        <SimpleImage src={logoSrc} alt={logoAlt} width="9.375rem" height="3.125rem" />
      </SimpleContainer>
      <SimpleNav links={navLinks} />
    </header>
  );
};

export default SimpleHeader;
