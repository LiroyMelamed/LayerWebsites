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
    style: _style,
    rowStyle: _rowStyle,
    cellStyle: _cellStyle,
    ...props
}) => {
    const hasData = Array.isArray(data) && data.length > 0;

    return (
        <SimpleContainer className="lw-simpleTable">
            {titles?.length > 0 && (
                <SimpleContainer className="lw-simpleTable__titleRow">
                    {titles.map((title, index) => (
                        <SimpleContainer key={index} className="lw-simpleTable__cell lw-simpleTable__cell--header">
                            <Text20>{title}</Text20>
                        </SimpleContainer>
                    ))}
                </SimpleContainer>
            )}

            {isLoading ? (
                <SimpleContainer className="lw-simpleTable__state" {...props}>
                    <SimpleLoader />
                </SimpleContainer>
            ) : !hasData ? (
                <p className="lw-simpleTable__state lw-simpleTable__noData" {...props}>
                    {noDataMessage}
                </p>
            ) : (
                <SimpleContainer className="lw-simpleTable__body" {...props}>
                    {data.map((item, rowIndex) => (
                        <CaseMenuItem
                            key={item?.Column0 ?? rowIndex}
                            rePerformRequest={rePerformRequest}
                            caseNumber={item?.Column0}
                            className="lw-simpleTable__row"
                        >
                            {titles.map((_, colIndex) => (
                                <SimpleContainer key={colIndex} className="lw-simpleTable__cell">
                                    <Text20 className="lw-simpleTable__cellText" title={item?.[`Column${colIndex}`]}>
                                        {item?.[`Column${colIndex}`]}
                                    </Text20>
                                </SimpleContainer>
                            ))}
                        </CaseMenuItem>
                    ))}
                </SimpleContainer>
            )}
        </SimpleContainer>
    );
};

export default SimpleTable;
