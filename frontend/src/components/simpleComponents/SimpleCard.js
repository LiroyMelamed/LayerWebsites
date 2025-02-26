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
        borderRadius: 8,
        padding: 16,
        boxShadow: '0px 2px 4px rgba(0, 0, 0, 0.3)', // Box shadow for all platforms
        margin: 8,
    },
};

export default SimpleCard;
