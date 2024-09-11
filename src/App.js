import React, { useState } from 'react';
import CreateCaseType from './components/CreateCaseType';
import { casesApi } from './api/casesApi';
import useHttpRequest from './hooks/useHttpRequest';
import TopAndRightNavBar from './components/navBars/TopAndRightNavBar';

const App = () => {
  const [error, setError] = useState(null);

  const handleSuccess = (data) => {
    // Handle success, e.g., show a success message
    console.log('Data fetched successfully:', data);
  };

  const handleFailure = (error) => {
    // Custom failure handling
    setError(`Oops! Something went wrong: ${error.message}`);
  };

  const { result: cases, isPerforming } = useHttpRequest(
    casesApi.getAllCases,
    handleSuccess,
    handleFailure // This will override the default onFailure if provided
  );

  const handleCloseError = () => {
    setError(null);
  };

  return (
    <div>
          <TopAndRightNavBar />

      <h1>Cases</h1>
      <CreateCaseType />
      {isPerforming && <p>Loading...</p>}
      {cases ? (
        <ul>
          {Object.keys(cases).map(caseId => (
            <li key={caseId}>
              <h2>Case Number: {cases[caseId].case_number}</h2>
              <p><strong>Company Name:</strong> {cases[caseId].company_name}</p>
              <p><strong>Current Level:</strong> {cases[caseId].curr_Level}</p>
              <p><strong>Description:</strong> {cases[caseId].discreption01}</p>
              <p><strong>Name:</strong> {cases[caseId].name}</p>
              <p><strong>Phone Number:</strong> {cases[caseId].phone_num}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p>No cases found.</p>
      )}
      {error && (
        <div className="error-popup">
          <p>{error}</p>
          <button onClick={handleCloseError}>Close</button>
        </div>
      )}
    </div>
  );
};

export default App;
