import React from 'react';
import SimpleImage from './SimpleImage';
import SimpleNav from './SimpleNav';
import SimpleContainer from './SimpleContainer';

const SimpleHeader = ({ logoSrc, logoAlt, navLinks, style }) => {
  const headerStyle = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '10px 20px',
    backgroundColor: '#f8f8f8',
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
