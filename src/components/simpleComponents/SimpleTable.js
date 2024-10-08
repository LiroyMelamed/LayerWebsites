import React from 'react';
import SimpleContainer from './SimpleContainer';
import { Text20 } from '../specializedComponents/text/AllTextKindFile';
import Separator from '../styledComponents/separators/Separator';
import CaseMenuItem from '../specializedComponents/menuItems/CaseMenuItem';

const SimpleTable = ({ titles, data, isLoading, noDataMessage, rePerformRequest, style, rowStyle, cellStyle, ...props }) => {
    return (
        <SimpleContainer style={{ ...styles.container, ...style }}>
            {data.length === 0 ? (
                <p style={styles.noDataMessage}>{noDataMessage}</p>
            ) : (
                <>
                    <SimpleContainer style={styles.titleRow}>
                        {titles?.map((title, index) => (
                            <Text20 key={index} style={{ ...styles.cell }}>
                                {title}
                            </Text20>
                        ))}
                    </SimpleContainer>

                    {data.map((item, rowIndex) => (
                        <>
                            {rowIndex != 0 && <Separator />}
                            <CaseMenuItem
                                key={rowIndex}
                                rePerformRequest={rePerformRequest}
                                caseNumber={item.Column0}
                                style={{ ...styles.row, ...rowStyle }}
                            >
                                {titles.map((_, colIndex) => (
                                    <div key={colIndex} style={{ ...styles.cell, ...cellStyle }}>
                                        <Text20 style={{ ...styles.cellText }} title={item[`Column${colIndex}`]}>
                                            {item[`Column${colIndex}`]}
                                        </Text20>
                                    </div>
                                ))}
                            </CaseMenuItem>
                        </>
                    ))}
                </>
            )}
        </SimpleContainer>
    );
};

const styles = {
    container: {
        maxHeight: '100%', // Prevent overflow by restricting max height
        overflow: 'hidden', // Hide overflow content
        display: 'flex',
        flexDirection: 'column',
    },
    titleRow: {
        display: 'flex',
        flexDirection: 'row-reverse',
        width: '100%',
        borderBottom: '1px solid #ddd',
        flexWrap: 'wrap', // Enable wrapping for small screens
    },
    row: {
        display: 'flex',
        flexDirection: 'row-reverse',
        width: '100%',
        borderBottom: '1px solid #f0f0f0',
        padding: '8px 0',
        flexWrap: 'wrap', // Enable wrapping for small screens
    },
    cell: {
        flex: 1,
        padding: '8px',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        minWidth: '60px', // Set a minimum width for cells to prevent them from shrinking too much
    },
    cellText: {
        display: 'block',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        whiteSpace: 'nowrap',
        width: '100%',
    },
    noDataMessage: {
        textAlign: 'center',
        color: '#888',
        padding: '20px',
    },
};

export default SimpleTable;
