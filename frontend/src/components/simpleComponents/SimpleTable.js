import React from 'react';
import SimpleContainer from './SimpleContainer';
import { Text20 } from '../specializedComponents/text/AllTextKindFile';
import CaseMenuItem from '../specializedComponents/menuItems/CaseMenuItem';
import SimpleLoader from './SimpleLoader';

import './SimpleTable.scss';

const SimpleTable = ({
    titles,
    data,
    isLoading,
    noDataMessage,
    rePerformRequest,
    style,
    rowStyle,
    cellStyle,
    ...props
}) => {
    const hasData = Array.isArray(data) && data.length > 0;

    return (
        <SimpleContainer className="lw-simpleTable" style={style}>
            {titles?.length > 0 && (
                <SimpleContainer className="lw-simpleTable__titleRow">
                    {titles.map((title, index) => (
                        <div key={index} className="lw-simpleTable__cell lw-simpleTable__cell--header">
                            <Text20>{title}</Text20>
                        </div>
                    ))}
                </SimpleContainer>
            )}

            {isLoading ? (
                <div className="lw-simpleTable__state" {...props}>
                    <SimpleLoader />
                </div>
            ) : !hasData ? (
                <p className="lw-simpleTable__state lw-simpleTable__noData" {...props}>
                    {noDataMessage}
                </p>
            ) : (
                <div className="lw-simpleTable__body" {...props}>
                    {data.map((item, rowIndex) => (
                        <CaseMenuItem
                            key={item?.Column0 ?? rowIndex}
                            rePerformRequest={rePerformRequest}
                            caseNumber={item?.Column0}
                            className="lw-simpleTable__row"
                            style={rowStyle}
                        >
                            {titles.map((_, colIndex) => (
                                <div key={colIndex} className="lw-simpleTable__cell" style={cellStyle}>
                                    <Text20 className="lw-simpleTable__cellText" title={item?.[`Column${colIndex}`]}>
                                        {item?.[`Column${colIndex}`]}
                                    </Text20>
                                </div>
                            ))}
                        </CaseMenuItem>
                    ))}
                </div>
            )}
        </SimpleContainer>
    );
};

export default SimpleTable;
