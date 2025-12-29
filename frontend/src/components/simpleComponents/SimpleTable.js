import React from 'react';
import SimpleContainer from './SimpleContainer';
import { Text20 } from '../specializedComponents/text/AllTextKindFile';
import Separator from '../styledComponents/separators/Separator';
import CaseMenuItem from '../specializedComponents/menuItems/CaseMenuItem';

import './SimpleTable.scss';

const SimpleTable = ({ titles, data, isLoading, noDataMessage, rePerformRequest, style, rowStyle, cellStyle, ...props }) => {
    return (
        <SimpleContainer className="lw-simpleTable" style={style}>
            {data.length === 0 ? (
                <p className="lw-simpleTable__noData">{noDataMessage}</p>
            ) : (
                <>
                    <SimpleContainer className="lw-simpleTable__titleRow">
                        {titles?.map((title, index) => (
                            <div key={index} className="lw-simpleTable__cell">
                                <Text20>{title}</Text20>
                            </div>
                        ))}
                    </SimpleContainer>

                    {data.map((item, rowIndex) => (
                        <>
                            {rowIndex != 0 && <Separator />}
                            <CaseMenuItem
                                key={rowIndex}
                                rePerformRequest={rePerformRequest}
                                caseNumber={item.Column0}
                                className="lw-simpleTable__row"
                                style={rowStyle}
                            >
                                {titles.map((_, colIndex) => (
                                    <div key={colIndex} className="lw-simpleTable__cell" style={cellStyle}>
                                        <Text20 className="lw-simpleTable__cellText" title={item[`Column${colIndex}`]}>
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

export default SimpleTable;
