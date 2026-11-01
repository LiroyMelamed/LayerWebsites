import he from '../../../i18n/locales/he.json';
import ar from '../../../i18n/locales/ar.json';
import en from '../../../i18n/locales/en.json';

const leafKeys = (object, prefix = '') => Object.entries(object).flatMap(([key, value]) =>
    typeof value === 'object' ? leafKeys(value, `${prefix}${key}.`) : [`${prefix}${key}`]).sort();

test('the Word authoring vocabulary has matching Hebrew, Arabic and English keys', () => {
    expect(leafKeys(ar.signingWord)).toEqual(leafKeys(he.signingWord));
    expect(leafKeys(en.signingWord)).toEqual(leafKeys(he.signingWord));
    for (const locale of [he, ar, en]) {
        for (const key of ['whatReplacesText', 'cancelSelection', 'templateSettings', 'selectionOptions', 'editReplacement', 'fieldUpdated', 'allChangesSaved', 'unsavedChanges'])
            expect(locale.signingWord[key]).toEqual(expect.any(String));
        expect(locale.signingWord.bindingsSummary).toContain('{{count}}');
        expect(locale.signingWord.editReplacement).toContain('{{field}}');
    }
});
