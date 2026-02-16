import React from 'react';
import SimpleContainer from './SimpleContainer';
import { Text20 } from '../specializedComponents/text/AllTextKindFile';
import CaseMenuItem from '../specializedComponents/menuItems/CaseMenuItem';
import SimpleLoader from './SimpleLoader';
import './SimpleTable.scss';

const isElement = (v) => React.isValidElement(v);

const SimpleTable = ({
    titles,
    data,
    isLoading,
    noDataMessage,
    rePerformRequest,
    onRowClick,
    RowComponent,
    CellTextComponent,
    style: _style,
    rowStyle: _rowStyle,
    cellStyle: _cellStyle,
    ...props
}) => {
    const hasData = Array.isArray(data) && data.length > 0;
    const RowComp = RowComponent || CaseMenuItem;
    const CellText = CellTextComponent || Text20;

    return (
        <SimpleContainer className="lw-simpleTable">
            {titles?.length > 0 && (
                <SimpleContainer className="lw-simpleTable__titleRow">
                    {titles.map((title, index) => (
                        <SimpleContainer key={index} className="lw-simpleTable__cell lw-simpleTable__cell--header">
                            <CellText>{title}</CellText>
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
                    {data.map((item, rowIndex) => {
                        const rowProps = RowComponent
                            ? { onPress: onRowClick ? () => onRowClick(item, rowIndex) : undefined }
                            : {
                                rePerformRequest,
                                caseNumber: item?.Column0,
                                optionalOnPress: onRowClick ? () => onRowClick(item, rowIndex) : undefined,
                            };
                        return (
                            <RowComp
                                key={rowIndex}
                                className="lw-simpleTable__row"
                                {...rowProps}
                            >
                                {titles.map((_, colIndex) => {
                                    const cellValue = item?.[`Column${colIndex}`];
                                    return (
                                        <SimpleContainer key={colIndex} className="lw-simpleTable__cell">
                                            {isElement(cellValue) ? cellValue : (
                                                <CellText className="lw-simpleTable__cellText" title={cellValue}>
                                                    {cellValue}
                                                </CellText>
                                            )}
                                        </SimpleContainer>
                                    );
                                })}
                            </RowComp>
                        );
                    })}
                </SimpleContainer>
            )}
        </SimpleContainer>
    );
};

export default SimpleTable;
