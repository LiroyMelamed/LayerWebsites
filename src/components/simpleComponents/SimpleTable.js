import React from 'react';
import SimpleContainer from './SimpleContainer';
import SimpleLoader from './SimpleLoader';
import colors from '../../constant/colors';
import { Text20 } from '../specializedComponents/text/AllTextKindFile';
import Separator from '../styledComponents/separators/Separator';

const SimpleTable = ({ titles, data, isLoading, noDataMessage, style, rowStyle, cellStyle, ...props }) => {
    console.log("tableeee", data);

    return (
        <SimpleContainer style={{ ...styles.containerStyle, ...style }}>
            {isLoading ? (<SimpleLoader />) : (
                <>
                    {data.length === 0 ? (
                        <p style={styles.noDataMessage}>{noDataMessage}</p>
                    ) :
                        <>
                            <SimpleContainer style={styles.titleRow}>
                                {titles?.map((title, index) => (
                                    <Text20 style={{ flex: 1 }}>{title}</Text20>
                                ))}
                            </SimpleContainer>
                            <Separator />

                        </>
                        // <table style={styles.tableStyle} {...props}>
                        //     <thead>
                        //         <tr>
                        //             {columns.map((column, index) => (
                        //                 <th key={index} style={styles.headerCellStyle}>{column}</th>
                        //             ))}
                        //         </tr>
                        //     </thead>
                        //     <tbody>
                        //         {data.map((row, rowIndex) => (
                        //             <tr key={rowIndex} style={rowStyle ? rowStyle(rowIndex) : styles.defaultRowStyle(rowIndex)}>
                        //                 {columns.map((column, colIndex) => (
                        //                     <td key={colIndex} style={cellStyle ? cellStyle : styles.defaultCellStyle}>{row[column]}</td>
                        //                 ))}
                        //             </tr>
                        //         ))}
                        //     </tbody>
                        // </table>
                    }
                </>
            )}

        </SimpleContainer>
    );
};

// Define all styles in a single object
const styles = {
    containerStyle: {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-start',
        border: '1px solid #ddd',
        backgroundColor: '#f8f8f8',
        borderRadius: '8px',
        padding: '20px',
        marginTop: '20px',
        width: '100%'
    },
    titleRow: {
        display: 'flex',
        flexDirection: 'row-reverse',
        width: '100%'
    },

    tableStyle: {
        width: '100%',
        borderCollapse: 'collapse',
    },
    headerCellStyle: {
        padding: '12px 15px',
        color: colors.lightText,
        borderBottom: '1px solid #ddd',
    },
    defaultRowStyle: (index) => ({
        backgroundColor: index % 2 === 0 ? '#f8f8f8' : 'white',
    }),
    defaultCellStyle: {
        padding: '12px 15px',
        textAlign: 'right', // Align text to the right for RTL
        borderBottom: '1px solid #ddd',
    },
    noDataMessage: {
        textAlign: 'center',
        color: '#888',
        padding: '20px',
    },
};

export default SimpleTable;
