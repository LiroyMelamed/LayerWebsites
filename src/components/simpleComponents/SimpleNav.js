import React from 'react';

const SimpleNav = ({ links = [], orientation = 'horizontal', activeLink, style }) => {
  // Ensure the links prop is an array
  if (!Array.isArray(links)) {
    console.error('Invalid prop `links`. Expected an array.');
    return null;
  }

  // Container style based on orientation
  const containerStyle = {
    display: 'flex',
    flexDirection: orientation === 'vertical' ? 'column' : 'row',
    listStyleType: 'none',
    margin: 0,
    padding: 0,
    ...style
  };

  // Style for individual links, highlighting active link
  const linkStyle = (isActive) => ({
    padding: '10px 20px',
    textDecoration: 'none',
    color: isActive ? '#3498db' : '#333',
    fontWeight: isActive ? 'bold' : 'normal',
    backgroundColor: isActive ? '#f0f0f0' : 'transparent',
    borderRadius: '4px',
    transition: 'background 0.3s',
  });

  return (
    <nav style={containerStyle}>
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          style={linkStyle(link.href === activeLink)}
        >
          {link.label}
        </a>
      ))}
    </nav>
  );
};

export default SimpleNav;
