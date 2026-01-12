import i18next from 'i18next';

export function NumberOfStagesValidation(numberOfStages) {

    if (!numberOfStages) return null;

    if (typeof numberOfStages != 'number') return i18next.t('errors.numbersOnly');

    if (Number(numberOfStages) > 15) return i18next.t('errors.maxStages15');

    return null;

}