import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import TopAndRightNavBar from './components/navBars/TopAndRightNavBar';
import MainScreen, { MainScreenName } from './screens/mainScreen/MainScreen';
import SimpleScreen from './components/simpleComponents/SimpleScreen';

const App = () => {
  return (
    <>
      <TopAndRightNavBar />

      <Routes>
        <Route path={MainScreenName} element={<MainScreen />} />
        {/* <Route path="/AnotherScreen" element={<AnotherScreen />} /> */}
        <Route path="*" element={<Navigate to={MainScreenName} />} />
      </Routes>
    </>
  );
};

export default App;



{/* <SimpleScrollView style={layoutStyles.content}>


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
<Text20>0507299064</Text20>



<PrimaryButton style={{ marginBottom: 20, alignSelf: 'flex-end' }}>לחץ כאן</PrimaryButton>
</SimpleScrollView> */}


// const layoutStyles = {
//   mainContainer: {
//     display: 'flex',
//     flexDirection: 'row',
//     height: '100vh',
//   },
//   content: {
//     flexGrow: 1,
//     backgroundColor: '#f5f5f5',
//     overflowY: 'auto',
//     height: '100dvh'
//   },
// };

// const [error, setError] = useState(null);

// const handleSuccess = (data) => {
//   // Handle success, e.g., show a success message
//   console.log('Data fetched successfully:', data);
// };

// const handleFailure = (error) => {
//   // Custom failure handling
//   setError(`Oops! Something went wrong: ${error.message}`);
// };

// const { result: cases, isPerforming } = useHttpRequest(
//   casesApi.getAllCases,
//   handleSuccess,
//   handleFailure // This will override the default onFailure if provided
// );

// const handleCloseError = () => {
//   setError(null);
// };

