import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import {BrowserRouter,useLocation} from 'react-router-dom';
import {I18nextProvider} from 'react-i18next';
import i18next from 'i18next';
import he from '@reminder-frontend/src/i18n/locales/he.json';
import ReminderDetailPopup from '@reminder-frontend/src/screens/remindersScreen/components/ReminderDetailPopup';
import SimpleTable from '@reminder-frontend/src/components/simpleComponents/SimpleTable';
import ReminderMenuItem from '@reminder-frontend/src/components/specializedComponents/menuItems/ReminderMenuItem';
import {Text14} from '@reminder-frontend/src/components/specializedComponents/text/AllTextKindFile';
import '@reminder-frontend/src/screens/remindersScreen/RemindersScreen.scss';
import SimplePopUp from '@reminder-frontend/src/components/simpleComponents/SimplePopUp';
import '@reminder-frontend/src/index.scss';
i18next.init({lng:'he',resources:{he:{translation:he}},interpolation:{escapeValue:false}});
const params=new URLSearchParams(location.search);const variant=params.get('variant')||'calendar';
const reminder={id:'synthetic-reminder',source:variant==='regular'?'email':'calendar',status:'PENDING',client_name:'לקוח בדיקה',to_email:'qa@example.invalid',subject:'פגישת בדיקה ביומן',template_key:'CALENDAR_REMINDER',scheduled_for:'2026-12-05T06:00:00Z',dispatch_not_before:variant==='no-delay'?'2026-12-05T06:00:00Z':'2026-12-05T19:00:00Z',audience:variant==='client'?'client':'staff',channels:variant==='empty'?{}:{sms:true,...(variant==='multi'?{email:true,push:true}:{})},calendar_event_id:999999};
function Preview(){const [open,setOpen]=useState(variant!=='list');const compact=window.innerWidth<800;const titles=compact?['שם לקוח','תאריך שליחה','סטטוס']:['שם לקוח','אימייל','תבנית','תאריך שליחה','סטטוס','נשלח ב','פעולות'];const badge=<span className="lw-reminders__badge lw-reminders__badge--pending"><Text14>ממתין</Text14></span>;const names=['לקוח בדיקה ראשון, לקוח בדיקה שני, לקוח בדיקה שלישי, לקוח בדיקה רביעי','לקוח בדיקה נוסף','שםלקוחארוךמאודמאודלבדיקהבלבדושםלקוחנוסף'];const rows=names.map(name=>compact?{Column0:name,Column1:<time dateTime="2026-12-05T19:00:00Z" dir="ltr">05/12/2026, 21:00</time>,Column2:badge}:{Column0:name,Column1:'synthetic-long-address@example.invalid',Column2:'תזכורת לפגישה',Column3:'05/12/2026, 21:00',Column4:badge,Column5:'—',Column6:null});const route=useLocation();return <><button onClick={()=>setOpen(true)}>פתח פרטי תזכורת לבדיקה</button>{variant==='list'&&<div style={{margin:16}} className={`lw-reminders__list${compact?' lw-reminders__list--compact':''}`}><SimpleTable titles={titles} data={rows} RowComponent={ReminderMenuItem} CellTextComponent={Text14} onRowClick={()=>setOpen(true)}/></div>}<p data-testid="route">{route.pathname+route.search}</p><SimplePopUp isOpen={open} onClose={()=>setOpen(false)}><ReminderDetailPopup reminder={reminder} closePopUpFunction={()=>setOpen(false)} resolveTemplateLabel={()=>'תזכורת יומן'} onCancel={()=>{}} onDelete={()=>{}} /></SimplePopUp></>}
createRoot(document.getElementById('root')).render(<BrowserRouter><I18nextProvider i18n={i18next}><Preview/></I18nextProvider></BrowserRouter>);
