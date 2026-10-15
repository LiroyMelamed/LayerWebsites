import { useState, useRef } from 'react';

/** Keep the original raster in the draft; the server decodes and sanitizes it. */
export function SignupLogoPicker({ value, onChange, disabled }) {
 const [error,setError]=useState(''),[reading,setReading]=useState(false);
 const sequence=useRef(0);
 async function choose(file) {
  const current=++sequence.current; setError(''); onChange('');
  if(!file)return;
  if(!['image/png','image/jpeg'].includes(file.type)){setError('יש לבחור קובץ PNG או JPG.');return;}
  if(file.size>2*1024*1024){setError('גודל הלוגו המרבי הוא 2MB.');return;}
  setReading(true);
  try {
   const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=reject;reader.readAsDataURL(file);});
   const dimensions=await new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight});img.onerror=reject;img.src=data;});
   if(dimensions.width!==dimensions.height||dimensions.width<1024||dimensions.width>4096)throw Error('SIZE');
   if(current===sequence.current)onChange(data);
  } catch(e) {if(current===sequence.current)setError(e.message==='SIZE'?'בחרו לוגו ריבועי, ברוחב ובגובה של 1,024–4,096 פיקסלים.':'לא ניתן לקרוא את התמונה. בחרו קובץ PNG או JPG תקין.');}
  finally {if(current===sequence.current)setReading(false);}
 }
 return <div style={{border:'1px solid #d4d4d8',borderRadius:12,padding:16,background:'#fff',color:'#18181b'}}>
  <label htmlFor="signup-business-logo" style={{display:'block',fontWeight:700,marginBottom:8}}>לוגו העסק <span>(חובה)</span></label>
  <p id="signup-logo-help" style={{fontSize:14,lineHeight:1.7,margin:'0 0 12px'}}>הלוגו יופיע באתר ובממשק העסק שלכם, ויישמר גם להכנת האפליקציה בהמשך. PNG או JPG ריבועי, 1,024–4,096 פיקסלים, עד 2MB.</p>
  <input id="signup-business-logo" type="file" accept="image/png,image/jpeg" required={!value} disabled={disabled||reading} aria-describedby="signup-logo-help signup-logo-status" aria-invalid={!!error} onChange={e=>void choose(e.target.files?.[0])} style={{display:'block',maxWidth:'100%',minHeight:44}} />
  <div id="signup-logo-status" role={error?'alert':'status'} style={{fontSize:14,lineHeight:1.7,marginTop:8}}>{error|| (reading?'קוראים את הלוגו…':value?'הלוגו נבחר. הוא יישמר עם פתיחת העסק.':'יש להעלות לוגו כדי להמשיך.')}</div>
  {value&&<img src={value} alt="תצוגה מקדימה של לוגו העסק" width={104} height={104} style={{display:'block',marginTop:12,objectFit:'contain',border:'1px solid #e4e4e7',borderRadius:8}} />}
 </div>;
}
