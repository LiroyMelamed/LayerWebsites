import React from 'react';
import {render,screen} from '@testing-library/react';
import CaseTimeline from './CaseTimeline';
jest.mock('react-i18next',()=>({useTranslation:()=>({t:key=>key})}));
jest.mock('./CaseDocumentRequests',()=>()=>null);
jest.mock('./CaseIntegrationUpdates',()=>()=>null);
jest.mock('./StageFileUpload',()=>()=>null);
const stages=[{Text:'Completed stage',Timestamp:'2026-11-17T20:45:00.000Z',UpdatedByName:'Office updater'},{Text:'Current stage'}];
test('client timeline never renders the internal updater name',()=>{
 render(<CaseTimeline stages={stages} currentStage={2} isClient/>);
 expect(screen.getByText('Completed stage')).toBeVisible();
 expect(screen.queryByText(/Office updater/)).toBeNull();
 expect(screen.queryByText(/cases.stageUpdatedBy/)).toBeNull();
});
test('management timeline retains updater attribution for completed stages',()=>{
 render(<CaseTimeline stages={stages} currentStage={2}/>);
 expect(screen.getByText(/Office updater/)).toBeVisible();
});
