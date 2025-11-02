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
        borderRadius: 12,
        padding: 18,
        boxShadow: '0px 1px 4px rgba(0, 0, 0, 0.18)', // softer box shadow
        margin: 8,
    },
};

export default SimpleCard;
