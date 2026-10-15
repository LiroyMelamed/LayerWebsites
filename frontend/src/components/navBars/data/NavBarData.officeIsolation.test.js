import { getNavBarData } from './NavBarData';
jest.mock('../../styledComponents/cases/CaseFullView',()=>()=>null);
jest.mock('../../../navigation/AdminStack',()=>({AdminStackName:'/AdminStack'}));
jest.mock('../../../services/firmSettings',()=>({loadFirmSettings:jest.fn(),getCalendarModuleEnabledCached:()=>true}));
const links=context=>getNavBarData(jest.fn(),jest.fn(),jest.fn(),false,key=>key,context).NavBarLinks.map(item=>item.navKey);
beforeEach(()=>localStorage.clear());
test('business owner can reach billing without receiving global administration',()=>{
 const owner=links({scope:{isOfficeOwner:true}});
 expect(owner).toContain('planUsage');expect(owner).not.toContain('platformSettings');
 expect(owner).toContain('officeIntegrations');expect(links(null)).not.toContain('officeIntegrations');
 expect(links(null)).not.toContain('planUsage');
 localStorage.setItem('isPlatformAdmin','true');expect(links(null)).toContain('platformSettings');
});
test('role-based office owner alone sees integrations regardless of staff page settings',()=>{
 expect(links({permissionMode:'role',scope:{isOfficeOwner:true},canPage:()=>false,canAction:()=>false})).toContain('officeIntegrations');
 expect(links({permissionMode:'role',scope:{isOfficeOwner:false},canPage:()=>true,canAction:()=>true})).not.toContain('officeIntegrations');
});
