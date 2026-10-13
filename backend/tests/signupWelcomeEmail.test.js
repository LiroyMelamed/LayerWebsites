'use strict';
const test=require('node:test'), assert=require('node:assert/strict');
const {renderWelcome,validEmail}=require('../lib/tenant/signupWelcomeTemplate');
const sample={toEmail:'owner@synthetic.invalid',adminName:'דנה <img src=x>',firmName:'משרד "דוגמה" & שות׳',adminPhone:'+972500000091',loginUrl:'https://lawyer.mela-media.co.il/example/LoginStack/LoginScreen',trialEndsAt:'2027-01-13T12:00:00Z',recurringAmountIls:5746,billingInterval:'yearly'};
test('welcome is RTL, escaped, includes login/OTP and frozen final annual price',()=>{
 const mail=renderWelcome(sample);assert.match(mail.html,/dir="rtl"/);assert.match(mail.html,/5,746\.00/);assert.match(mail.html,/לשנה/);
 assert.match(mail.html,/ללא תוספת מע״מ/);assert.match(mail.html,/13 בינואר 2027/);assert.match(mail.html,/0500000091/);
 assert.ok(mail.html.includes(sample.loginUrl));assert.ok(mail.text.includes(sample.loginUrl));assert.ok(!mail.html.includes('<img src=x>'));assert.match(mail.html,/&lt;img src=x&gt;/);
 assert.ok(!/synthetic-card-token|token_encrypted|password/.test(mail.html));
 assert.match(renderWelcome({...sample,billingInterval:'monthly',recurringAmountIls:532}).text,/₪532.00 לחודש/);
 assert.throws(()=>renderWelcome({...sample,loginUrl:'javascript:alert(1)'}),/INVALID_WELCOME_URL/);
 for(const email of ['',null,'person@example.com\r\nBcc:other@example.com','one@example.com,two@example.com','not-mail']) assert.equal(validEmail(email),false);
 assert.equal(validEmail(sample.toEmail),true);
});
test('SMTP sends only to new owner from MelaMedia, deterministic ID, and distinguishes rejection from unknown delivery',async()=>{
 const saved={...process.env};Object.assign(process.env,{IS_PRODUCTION:'true',SMTP_HOST:'smtp.synthetic.invalid',SMTP_USER:'synthetic',SMTP_PASS:'synthetic',SMTP_FROM_EMAIL:'noreply-melamedia@mela-media.co.il'});delete process.env.QA_OUTBOUND_MODE;
 const nodemailer=require('nodemailer'),original=nodemailer.createTransport;let options,closed=0,error;
 nodemailer.createTransport=()=>({sendMail:async input=>{options=input;if(error)throw error;return {accepted:[sample.toEmail]};},close:()=>closed++});
 try {
  const {deliverWelcome}=require('../lib/tenant/signupWelcomeEmail');
  assert.deepEqual(await deliverWelcome(sample,'synthetic-id'),{status:'sent'});
  assert.equal(options.to,sample.toEmail);assert.equal(options.from.name,'MelaMedia | מלמדיה');assert.equal(options.cc,undefined);assert.equal(options.bcc,undefined);
  assert.equal(options.messageId,'<legal-welcome-synthetic-id@mela-media.co.il>');assert.ok(options.text);assert.ok(options.html);
  error={responseCode:451,command:'DATA'};assert.equal((await deliverWelcome(sample,'synthetic-id')).status,'retry');
  error={code:'ETIMEDOUT',command:'DATA'};assert.equal((await deliverWelcome(sample,'synthetic-id')).status,'uncertain');
  error={code:'ECONNREFUSED',command:'CONN'};assert.equal((await deliverWelcome(sample,'synthetic-id')).status,'retry');
  assert.equal(closed,4);
  process.env.IS_PRODUCTION='false';delete process.env.FORCE_SEND_EMAIL_ALL;assert.equal((await deliverWelcome(sample,'synthetic-id')).status,'simulated');
 }finally{nodemailer.createTransport=original;for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);}
});
