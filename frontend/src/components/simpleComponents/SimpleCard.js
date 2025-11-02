import React from 'react';
import SimpleContainer from './SimpleContainer';
import { colors } from '../../constant/colors';

const SimpleCard = ({ style, children, ...props }) => {

    const cardStyle = {
        justifyContent: 'flex-end',
        ...styles.card,
        ...style,
    }

    return (
        <SimpleContainer
            style={cardStyle}
            {...props}
        >
            {children}
        </SimpleContainer>
    );
};

const styles = {
    card: {
        backgroundColor: colors.white,
        borderRadius: 16,
        padding: 24,
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        margin: 12,
        border: '1px solid rgba(226, 232, 240, 0.8)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        ':hover': {
            transform: 'translateY(-2px)',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        }
    },
};

export default SimpleCard;
