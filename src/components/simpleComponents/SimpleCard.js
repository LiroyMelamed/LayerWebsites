import React from 'react';
import SimpleContainer from './SimpleContainer';

const SimpleCard = ({ style, children, ...props }) => {

    const CardStyle = {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        border: '1px solid #ddd',
        backgroundColor: '#f8f8f8', // Light background color
        borderRadius: '8px', // Rounded corners
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)', // Soft shadow
        padding: '20px', // Padding inside the card
        minHeight: '50px', // Minimum height of the card
        flex: 1, // Full width by default
        ...style,
    }

    return (
        <SimpleContainer
            style={CardStyle}
            {...props}
        >
            {children}
        </SimpleContainer>
    );
};

export default SimpleCard;
