import React, { useState, useCallback, useRef } from "react";
import { useTranslation } from "react-i18next";
import SimpleContainer from "../../../components/simpleComponents/SimpleContainer";
import SimpleLoader from "../../../components/simpleComponents/SimpleLoader";
import { Text14, Text24 } from "../../../components/specializedComponents/text/AllTextKindFile";
import PrimaryButton from "../../../components/styledComponents/buttons/PrimaryButton";
import SecondaryButton from "../../../components/styledComponents/buttons/SecondaryButton";
import { customersApi } from "../../../api/customersApi";
import useHttpRequest from "../../../hooks/useHttpRequest";

import "./ImportClientsModal.scss";

export default function ImportClientsModal({ closePopUpFunction, rePerformRequest }) {
    const { t } = useTranslation();
    const [file, setFile] = useState(null);
    const fileInputRef = useRef(null);

    const { result, isPerforming, performRequest } = useHttpRequest(
        () => customersApi.importCustomers(file),
        () => { if (rePerformRequest) rePerformRequest(); },
    );

    const handleFileChange = useCallback((e) => {
        const selected = e.target.files?.[0];
        if (!selected) return;
        setFile(selected);
    }, []);

    const hasResult = result?.created != null;

    return (
        <SimpleContainer className="lw-importClientsModal">
            <Text24 className="lw-importClientsModal__title">
                {t('clientImport.title')}
            </Text24>

            <Text14 className="lw-importClientsModal__instructions">
                {t('clientImport.instructions')}
            </Text14>

            <SimpleContainer className="lw-importClientsModal__fileRow">
                <SimpleContainer className="lw-importClientsModal__fileInput">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept=".xlsx,.xls,.csv"
                        onChange={handleFileChange}
                        disabled={isPerforming}
                        className="lw-importClientsModal__fileInputHidden"
                    />
                    <SecondaryButton onPress={() => fileInputRef.current?.click()} disabled={isPerforming}>
                        {t('clientImport.chooseFile')}
                    </SecondaryButton>
                    {file && (
                        <Text14 className="lw-importClientsModal__fileName">
                            {file.name}
                        </Text14>
                    )}
                </SimpleContainer>
                <a
                    href={`${process.env.PUBLIC_URL}/templates/clients-demo.xlsx`}
                    download="clients-demo.xlsx"
                    style={{ textDecoration: 'none' }}
                >
                    <SecondaryButton onPress={() => { }}>
                        {t('clientImport.downloadDemo')}
                    </SecondaryButton>
                </a>
            </SimpleContainer>

            {isPerforming && <SimpleLoader />}

            {hasResult && (
                <SimpleContainer className="lw-importClientsModal__results">
                    <Text14>{t('clientImport.resultTitle')}</Text14>
                    <SimpleContainer className="lw-importClientsModal__resultRow">
                        <Text14>{t('clientImport.created')}: {result.created}</Text14>
                    </SimpleContainer>
                    <SimpleContainer className="lw-importClientsModal__resultRow">
                        <Text14>{t('clientImport.skipped')}: {result.skipped}</Text14>
                    </SimpleContainer>
                    <SimpleContainer className="lw-importClientsModal__resultRow">
                        <Text14>{t('clientImport.failed')}: {result.failed}</Text14>
                    </SimpleContainer>

                    {result.details?.length > 0 && (
                        <SimpleContainer className="lw-importClientsModal__details">
                            <Text14>{t('clientImport.detailsTitle')}</Text14>
                            <SimpleContainer className="lw-importClientsModal__detailsList">
                                {result.details.slice(0, 50).map((d, i) => (
                                    <Text14 key={i} className={`lw-importClientsModal__detail lw-importClientsModal__detail--${d.status}`}>
                                        {t('clientImport.row')} {d.row}: {d.name || '-'} — {d.status === 'created' ? t('clientImport.statusCreated') : d.status === 'skipped' ? `${t('clientImport.statusSkipped')}: ${d.reason}` : `${t('clientImport.statusFailed')}: ${d.reason}`}
                                    </Text14>
                                ))}
                                {result.details.length > 50 && (
                                    <Text14>… {t('clientImport.andMore', { count: result.details.length - 50 })}</Text14>
                                )}
                            </SimpleContainer>
                        </SimpleContainer>
                    )}
                </SimpleContainer>
            )}

            <SimpleContainer className="lw-importClientsModal__actions">
                {!hasResult && (
                    <PrimaryButton
                        className="lw-importClientsModal__uploadBtn"
                        onPress={performRequest}
                        disabled={!file || isPerforming}
                    >
                        {isPerforming ? t('clientImport.uploading') : t('clientImport.uploadButton')}
                    </PrimaryButton>
                )}
                <SecondaryButton
                    className="lw-importClientsModal__closeBtn"
                    onPress={closePopUpFunction}
                >
                    {t('common.close')}
                </SecondaryButton>
            </SimpleContainer>
        </SimpleContainer>
    );
}
