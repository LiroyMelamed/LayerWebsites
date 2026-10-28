/* MelaMedia display preferences. This tool does not certify site accessibility. */
(() => {
  'use strict';
  if (document.getElementById('mela-accessibility-tools')) return;
  const host = document.createElement('div');
  host.id = 'mela-accessibility-tools';
  const shadow = host.attachShadow({mode:'open'});
  const language = () => !document.documentElement.lang.toLowerCase().startsWith('en');
  const translations = { he: {
    open:'נגישות', title:'העדפות נגישות', close:'סגירת תפריט הנגישות', intro:'התאימו את התצוגה. ההעדפות נשמרות בדפדפן הזה.',
    size:'גודל טקסט', links:'הדגשת קישורים', motion:'הפחתת תנועה', system:'פעיל לפי הגדרות המכשיר', reset:'איפוס העדפות',
    statement:'הצהרת נגישות', contact:'דיווח על קושי בנגישות', skip:'דילוג לתוכן הראשי', hide:'הסתרת כפתור הנגישות', restored:'כפתור הנגישות מוצג שוב.',
    hideTitle:'לכמה זמן להסתיר את הכפתור?', hideIntro:'העדפות התצוגה יישארו פעילות. הבחירה נשמרת בדפדפן הזה.', day:'ליום', week:'לשבוע', month:'לחודש (30 יום)', forever:'ללא הגבלת זמן', cancel:'ביטול', restoreHint:'אפשר להחזיר את הכפתור בכל עת דרך הצהרת הנגישות.'
  }, en: {
    open:'Accessibility', title:'Accessibility preferences', close:'Close accessibility menu', intro:'Adjust the display. Preferences are saved in this browser.',
    size:'Text size', links:'Highlight links', motion:'Reduce motion', system:'Enabled by your device settings', reset:'Reset preferences',
    statement:'Accessibility statement', contact:'Report an accessibility barrier', skip:'Skip to main content', hide:'Hide accessibility button', restored:'The accessibility button is visible again.',
    hideTitle:'How long should the button stay hidden?', hideIntro:'Your display preferences will stay active. This choice is saved in this browser.', day:'One day', week:'One week', month:'One month (30 days)', forever:'Indefinitely', cancel:'Cancel', restoreHint:'You can restore the button at any time from the accessibility statement.'
  }};
  let he = language(), t = he ? translations.he : translations.en;
  const statementPath = document.currentScript?.getAttribute('data-statement') || '/accessibility.html';
  const key='mela_accessibility_web_v1';
  const defaults=()=>({size:100,links:false,motion:false,hidden:false,hiddenUntil:null});
  const normalize=saved=>{
    if(!saved||typeof saved!=='object')return defaults();
    return {size:[100,125,150,175,200].includes(saved.size)?saved.size:100,links:saved.links===true,motion:saved.motion===true,hidden:saved.hidden===true,hiddenUntil:typeof saved.hiddenUntil==='number'&&Number.isFinite(saved.hiddenUntil)&&saved.hiddenUntil>0?saved.hiddenUntil:null};
  };
  let settings=defaults();
  try {
    const saved=JSON.parse(localStorage.getItem(key)||localStorage.getItem('mela_accessibility_v2')||'null');
    settings=normalize(saved);
  } catch { /* Storage is optional. */ }
  const root=document.documentElement;
  const originalFont=root.style.fontSize;
  const baseSize=parseFloat(getComputedStyle(root).fontSize)||16;
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const style=document.createElement('style');
  style.textContent=`
    :where(a,button,input,select,textarea,[tabindex]):focus-visible {outline:3px solid #fff !important;outline-offset:3px !important;box-shadow:0 0 0 6px #153b46 !important;}
    html[data-mela-a11y-links] a[href] {text-decoration:underline !important;text-underline-offset:.18em !important;}
    html[data-mela-a11y-motion] *,html[data-mela-a11y-motion] *::before,html[data-mela-a11y-motion] *::after {animation-duration:.01ms !important;animation-iteration-count:1 !important;transition-duration:.01ms !important;scroll-behavior:auto !important;}
  `;
  document.head.append(style);
  shadow.innerHTML=`<style>
    :host {font:16px/1.6 Arial,sans-serif;color:#17373e;color-scheme:light;direction:${he?'rtl':'ltr'};}
    *,*::before,*::after {box-sizing:border-box;}
    [hidden] {display:none !important;}
    button,a {font:inherit;touch-action:manipulation;}
    button {cursor:pointer;}
    button:focus-visible,a:focus-visible {outline:3px solid #096c79;outline-offset:3px;}
    .dock {position:fixed;left:12px;bottom:calc(82px + env(safe-area-inset-bottom,0px));z-index:9990;width:46px;height:46px;}
    .launcher {width:46px;height:46px;border:1px solid #8cb8b4;border-radius:50%;background:#fff;color:#134e4a;display:grid;place-items:center;box-shadow:0 2px 12px #0003;}
    .launcher:hover {background:#e9f7f5;}
    .hide {position:absolute;right:-13px;top:-13px;width:26px;height:26px;display:grid;place-items:center;padding:0;border:1px solid #8cb8b4;border-radius:50%;background:#fff;color:#17373e;font-size:20px;line-height:1;box-shadow:0 1px 5px #0002;}
    .hide:hover {background:#e9f7f5;}
    .skip {position:fixed;top:8px;left:8px;z-index:2147483646;padding:12px 18px;background:#fff;color:#17373e;transform:translateY(-200%);border:2px solid #134e4a;border-radius:8px;}
    .skip:focus {transform:none;}
    dialog {margin:auto;padding:0;border:1px solid #a8c2c0;border-radius:18px;width:min(370px,calc(100vw - 24px));max-height:calc(100dvh - 24px);overflow:auto;background:#fff;color:#17373e;box-shadow:0 16px 70px #0005;}
    dialog::backdrop {background:#102a3666;}
    .panel {padding:20px;}
    header {display:flex;align-items:center;gap:12px;}
    h2 {font-size:20px;line-height:1.4;margin:0;flex:1;}
    .close {flex-shrink:0;width:44px;height:44px;border:1px solid #cbd9d8;border-radius:50%;background:#f3f7f7;color:#17373e;font-size:28px;line-height:1;}
    p {font-size:15px;margin:14px 0;}
    fieldset {border:1px solid #a8c2c0;border-radius:10px;padding:10px;margin:16px 0;min-width:0;}
    legend {padding:0 5px;}
    .sizes {display:flex;flex-wrap:wrap;gap:5px;}
    .sizes button {flex:1;min-width:48px;min-height:44px;padding:4px;border:1px solid #b9cecb;border-radius:8px;background:#f3f7f7;color:#17373e;font-size:14px;}
    button[aria-pressed=true] {background:#134e4a;color:#fff;border-color:#134e4a;}
    .option,.reset {display:block;width:100%;min-height:46px;border:1px solid #a8c2c0;border-radius:9px;padding:9px 12px;margin:10px 0;background:#f3f7f7;color:#17373e;text-align:start;}
    .option:disabled {cursor:default;opacity:1;}
    .system {display:block;font-size:13px;}
    footer {border-top:1px solid #d8e4e1;margin-top:16px;padding-top:10px;display:flex;flex-direction:column;gap:6px;}
    footer a {color:#134e4a;text-decoration:underline;min-height:32px;display:flex;align-items:center;}
    .reset {text-align:center;background:#fff;}
    .durations {display:grid;grid-template-columns:1fr 1fr;gap:10px;}
    .durations button,.cancel {min-height:48px;padding:10px;border:1px solid #8cb8b4;border-radius:9px;background:#f3f7f7;color:#17373e;}
    .durations button:hover {background:#e9f7f5;}
    .cancel {width:100%;margin-top:14px;background:#fff;}
    .restore-hint {font-size:14px;}
    .restore-hint a {color:#134e4a;text-decoration:underline;}
    svg {width:25px;height:25px;}
    @media (max-height:500px) {.dock {bottom:12px;}.panel {padding:14px;}}
    @media (forced-colors:active) {button,dialog {border:2px solid ButtonText;}button[aria-pressed=true]{outline:3px solid Highlight;}}
  </style>
  <a class="skip" href="#">${t.skip}</a>
  <div class="dock"><button type="button" class="launcher" aria-label="${t.open}" title="${t.open}" aria-haspopup="dialog" aria-controls="mela-a11y-dialog" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="4" r="2"/><path d="M4 8l8 2 8-2M12 10v5m0 0l-5 6m5-6l5 6"/></svg></button><button type="button" class="hide" aria-label="${t.hide}" title="${t.hide}" aria-haspopup="dialog" aria-controls="mela-a11y-hide-dialog" aria-expanded="false">×</button></div>
  <dialog id="mela-a11y-dialog" aria-labelledby="mela-a11y-title"><div class="panel">
    <header><h2 id="mela-a11y-title">${t.title}</h2><button type="button" class="close" aria-label="${t.close}" autofocus>×</button></header>
    <p>${t.intro}</p>
    <fieldset><legend>${t.size}</legend><div class="sizes">${[100,125,150,175,200].map(size=>`<button type="button" data-size="${size}" aria-pressed="false">${size}%</button>`).join('')}</div></fieldset>
    <button type="button" class="option links" aria-pressed="false">${t.links}</button>
    <button type="button" class="option motion" aria-pressed="false">${t.motion}<span class="system" hidden>${t.system}</span></button>
    <button type="button" class="reset">${t.reset}</button>
    <footer><a class="statement" href="${statementPath}">${t.statement}</a><a class="contact" href="mailto:liroy@mela-media.co.il?subject=Accessibility">${t.contact}</a></footer>
  </div></dialog>
  <dialog id="mela-a11y-hide-dialog" aria-labelledby="mela-a11y-hide-title" aria-describedby="mela-a11y-hide-intro"><div class="panel">
    <h2 id="mela-a11y-hide-title">${t.hideTitle}</h2>
    <p id="mela-a11y-hide-intro">${t.hideIntro}</p>
    <div class="durations"><button type="button" data-hide-days="1">${t.day}</button><button type="button" data-hide-days="7">${t.week}</button><button type="button" data-hide-days="30">${t.month}</button><button type="button" data-hide-days="0">${t.forever}</button></div>
    <p class="restore-hint"><span>${t.restoreHint}</span> <a href="${statementPath}">${t.statement}</a></p>
    <button type="button" class="cancel" autofocus>${t.cancel}</button>
  </div></dialog>`;
  const dialog=shadow.querySelector('#mela-a11y-dialog'), trigger=shadow.querySelector('.launcher');
  const hideDialog=shadow.querySelector('#mela-a11y-hide-dialog'), hideTrigger=shadow.querySelector('.hide');
  const close=()=>dialog.close();
  trigger.addEventListener('click',()=>{dialog.showModal();trigger.setAttribute('aria-expanded','true');shadow.querySelector('.close').focus();});
  shadow.querySelector('.close').addEventListener('click',close);
  dialog.addEventListener('close',()=>{trigger.setAttribute('aria-expanded','false');trigger.focus();});
  dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
  const trapFocus=event=>{
    if(event.key!=='Tab')return;
    const items=[...event.currentTarget.querySelectorAll('button:not(:disabled),a[href]')];
    const first=items[0],last=items[items.length-1];
    if(event.shiftKey && shadow.activeElement===first){event.preventDefault();last.focus();}
    else if(!event.shiftKey && shadow.activeElement===last){event.preventDefault();first.focus();}
  };
  dialog.addEventListener('keydown',trapFocus);
  hideDialog.addEventListener('keydown',trapFocus);
  const focusContent=(scroll=false)=>{
    const target=document.querySelector('main,[role=main],#main-content') || document.querySelector('h1') || document.querySelector('form') || document.querySelector('h2,h3') || document.querySelector('input:not([type=hidden])');
    if(target){if(!target.hasAttribute('tabindex'))target.setAttribute('tabindex','-1');target.focus({preventScroll:true});if(scroll)target.scrollIntoView({block:'start',behavior:'instant'});}
  };
  shadow.querySelector('.skip').addEventListener('click',event=>{
    event.preventDefault();focusContent(true);
  });
  let expiryTimer;
  const refreshVisibility=()=>{
    clearTimeout(expiryTimer);
    if(settings.hidden && settings.hiddenUntil!==null && settings.hiddenUntil<=Date.now()){
      settings.hidden=false;settings.hiddenUntil=null;
    }
    if(!settings.hidden)settings.hiddenUntil=null;
    shadow.querySelector('.dock').hidden=settings.hidden;
    // Browser timers are signed 32-bit: a 30-day choice needs more than one wait.
    if(settings.hidden && settings.hiddenUntil!==null)expiryTimer=setTimeout(()=>apply(),Math.max(1,Math.min(settings.hiddenUntil-Date.now(),2147483647)));
  };
  const apply=(persist=true)=>{
    root.style.fontSize=settings.size===100?originalFont:`${baseSize*settings.size/100}px`;
    root.toggleAttribute('data-mela-a11y-links',settings.links);
    root.toggleAttribute('data-mela-a11y-motion',settings.motion||media.matches);
    for(const [name,enabled] of [['large',settings.size>=150],['links',settings.links],['motion',settings.motion||media.matches]]){
      if(enabled)root.setAttribute('data-a11y-'+name,'true');else root.removeAttribute('data-a11y-'+name);
    }
    refreshVisibility();
    shadow.querySelectorAll('[data-size]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.size)===settings.size)));
    shadow.querySelector('.links').setAttribute('aria-pressed',String(settings.links));
    shadow.querySelector('.motion').setAttribute('aria-pressed',String(settings.motion||media.matches));
    shadow.querySelector('.motion').disabled=media.matches;
    shadow.querySelector('.system').hidden=!media.matches;
    if(settings.motion||media.matches) document.querySelectorAll('video[autoplay]').forEach(v=>v.pause());
    if(persist)try{localStorage.setItem(key,JSON.stringify(settings));}catch{/* Optional storage. */}
    document.dispatchEvent(new CustomEvent('mela-a11y-change',{detail:{...settings,motion:settings.motion||media.matches}}));
  };
  shadow.querySelectorAll('[data-size]').forEach(b=>b.addEventListener('click',()=>{settings.size=Number(b.dataset.size);apply();}));
  shadow.querySelector('.links').addEventListener('click',()=>{settings.links=!settings.links;apply();});
  shadow.querySelector('.motion').addEventListener('click',()=>{settings.motion=!settings.motion;apply();});
  shadow.querySelector('.reset').addEventListener('click',()=>{settings=defaults();apply();});
  hideTrigger.addEventListener('click',()=>{hideDialog.returnValue='';hideDialog.showModal();hideTrigger.setAttribute('aria-expanded','true');shadow.querySelector('.cancel').focus();});
  shadow.querySelector('.cancel').addEventListener('click',()=>hideDialog.close());
  hideDialog.addEventListener('click',event=>{if(event.target===hideDialog)hideDialog.close();});
  hideDialog.addEventListener('close',()=>{hideTrigger.setAttribute('aria-expanded','false');if(settings.hidden)focusContent();else hideTrigger.focus();});
  shadow.querySelectorAll('[data-hide-days]').forEach(button=>button.addEventListener('click',()=>{
    const days=Number(button.dataset.hideDays);
    settings.hidden=true;settings.hiddenUntil=days===0?null:Date.now()+days*86400000;
    apply();hideDialog.close();
  }));
  const restore=()=>{settings.hidden=false;settings.hiddenUntil=null;apply();trigger.focus();document.querySelectorAll('[data-mela-a11y-status]').forEach(e=>{e.textContent=t.restored;});};
  document.addEventListener('mela-a11y-restore',restore);
  document.addEventListener('click',event=>{if(event.target instanceof Element && event.target.closest('[data-mela-a11y-restore]'))restore();});
  const translate=()=>{
    he=language();t=he?translations.he:translations.en;host.style.direction=he?'rtl':'ltr';
    for(const [selector,key] of [['#mela-a11y-title','title'],['#mela-a11y-dialog .panel > p','intro'],['legend','size'],['.links','links'],['.reset','reset'],['.statement','statement'],['.contact','contact'],['.skip','skip'],['#mela-a11y-hide-title','hideTitle'],['#mela-a11y-hide-intro','hideIntro'],['[data-hide-days="1"]','day'],['[data-hide-days="7"]','week'],['[data-hide-days="30"]','month'],['[data-hide-days="0"]','forever'],['.cancel','cancel'],['.restore-hint span','restoreHint'],['.restore-hint a','statement']])shadow.querySelector(selector).textContent=t[key];
    for(const [selector,key] of [['.launcher','open'],['.hide','hide'],['.close','close']]){const e=shadow.querySelector(selector);e.setAttribute('aria-label',t[key]);e.title=t[key];}
    shadow.querySelector('.motion').firstChild.textContent=t.motion;shadow.querySelector('.system').textContent=t.system;
  };
  new MutationObserver(translate).observe(root,{attributes:true,attributeFilter:['lang']});
  media.addEventListener('change',apply);
  const checkExpiry=()=>{if(settings.hidden&&settings.hiddenUntil!==null)apply();};
  window.addEventListener('focus',checkExpiry);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)checkExpiry();});
  window.addEventListener('storage',event=>{
    if(event.key!==key&&event.key!==null)return;
    try{settings=normalize(JSON.parse(event.newValue||'null'));apply(false);}catch{/* Ignore malformed data from another tab. */}
  });
  document.addEventListener('play',event=>{if((settings.motion||media.matches)&&event.target instanceof HTMLVideoElement&&event.target.autoplay)event.target.pause();},true);
  document.body.prepend(host);
  apply();
})();
