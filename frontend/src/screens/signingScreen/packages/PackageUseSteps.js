import React from 'react';
import useSigningLocale from '../templates/useSigningLocale';

export default function PackageUseSteps({current,complete=false}) {
    const {t,number}=useSigningLocale();
    return <ol className="lw-signingCompose__steps" aria-label={t('signingV2.compose.stepsLabel')}>
        {['peopleAndDetails','reviewDocuments','sendStage'].map((key,index)=><li key={key}
            aria-current={!complete&&index===current?'step':undefined}
            className={complete||index<current?'is-done':index===current?'is-current':''}>
            <span aria-hidden="true">{number(index+1)}</span>{t(`documentPackages.${key}`)}
        </li>)}
    </ol>;
}
