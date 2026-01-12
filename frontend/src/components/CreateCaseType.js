// src/components/CreateCaseType.js
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { casesTypeApi } from '../api/casesApi';

const CreateCaseType = () => {
  const { t } = useTranslation();
  const [caseTypeId, setCaseTypeId] = useState('');
  const [caseTypeData, setCaseTypeData] = useState({
    case_level: '',
    case_type: '',
    discriptions: {} // For holding descriptions
  });
  const [error, setError] = useState(null);

  const handleDescriptionChange = (index, value) => {
    setCaseTypeData(prevState => ({
      ...prevState,
      discriptions: {
        ...prevState.discriptions,
        [`discreption${index < 10 ? '0' : ''}${index}`]: value
      }
    }));
  };

  const handleSubmit = async () => {
    try {
      await casesTypeApi.createOrUpdateCaseType(caseTypeId, caseTypeData);
      alert(t('caseTypes.createCaseType.success'));
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1>{t('caseTypes.createCaseType.title')}</h1>
      <input
        type="text"
        value={caseTypeId}
        onChange={(e) => setCaseTypeId(e.target.value)}
        placeholder={t('caseTypes.createCaseType.caseTypeIdPlaceholder')}
      />
      <input
        type="text"
        value={caseTypeData.case_level}
        onChange={(e) => setCaseTypeData(prevState => ({ ...prevState, case_level: e.target.value }))}
        placeholder={t('caseTypes.createCaseType.caseLevelPlaceholder')}
      />
      <input
        type="text"
        value={caseTypeData.case_type}
        onChange={(e) => setCaseTypeData(prevState => ({ ...prevState, case_type: e.target.value }))}
        placeholder={t('caseTypes.createCaseType.caseTypePlaceholder')}
      />
      {[...Array(16)].map((_, i) => (
        <input
          key={i}
          type="text"
          value={caseTypeData.discriptions[`discreption${i < 10 ? '0' : ''}${i}`] || ''}
          onChange={(e) => handleDescriptionChange(i + 1, e.target.value)}
          placeholder={t('caseTypes.createCaseType.descriptionPlaceholder', { number: i + 1 })}
        />
      ))}
      <button onClick={handleSubmit}>{t('common.submit')}</button>
      {error && <p>{t('errors.errorPrefix')}{error}</p>}
    </div>
  );
};

export default CreateCaseType;
