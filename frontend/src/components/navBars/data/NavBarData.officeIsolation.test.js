import { getNavBarData } from './NavBarData';
jest.mock('../../styledComponents/cases/CaseFullView',()=>()=>null);
jest.mock('../../../navigation/AdminStack',()=>({AdminStackName:'/AdminStack'}));
jest.mock('../../../services/firmSettings',()=>({loadFirmSettings:jest.fn(),getCalendarModuleEnabledCached:()=>true}));
const links=context=>getNavBarData(jest.fn(),jest.fn(),jest.fn(),false,key=>key,context).NavBarLinks.map(item=>item.navKey);
beforeEach(()=>localStorage.clear());
test('business owner can reach billing without receiving global administration',()=>{
 const owner=links({canManageBilling:true});
 expect(owner).toContain('planUsage');expect(owner).not.toContain('platformSettings');
 expect(links(null)).not.toContain('planUsage');
 localStorage.setItem('isPlatformAdmin','true');expect(links(null)).toContain('platformSettings');
});
