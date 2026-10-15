'use strict';
const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const validEmail = value => typeof value === 'string' && value.length <= 254 && /^[^\s@<>,;:]+@[^\s@<>,;:]+\.[^\s@<>,;:]+$/.test(value);

function renderWelcome(data) {
    const login = new URL(data.loginUrl);
    if (login.protocol !== 'https:' && !(login.protocol === 'http:' && login.hostname === '127.0.0.1')) throw Error('INVALID_WELCOME_URL');
    const date = new Intl.DateTimeFormat('he-IL', { timeZone:'Asia/Jerusalem', day:'numeric',month:'long',year:'numeric' }).format(new Date(data.trialEndsAt));
    const amount = Number(data.recurringAmountIls);
    if (!Number.isFinite(amount) || amount <= 0) throw Error('INVALID_WELCOME_AMOUNT');
    const price = amount.toLocaleString('he-IL', {minimumFractionDigits:2,maximumFractionDigits:2});
    const interval = data.billingInterval === 'yearly' ? 'לשנה' : 'לחודש';
    const phone = String(data.adminPhone).replace(/^\+?972/, '0');
    const subject = 'החשבון שלכם מוכן | MelaMedia';
    const text = `שלום ${data.adminName},\nהמשרד ${data.firmName} מוכן במערכת המשפטית של MelaMedia.\nכניסה לניהול המשרד: ${login.href}\nמספר הטלפון להתחברות: ${phone}\nמזינים את המספר ומתחברים עם קוד חד־פעמי שנשלח לטלפון. אין צורך בסיסמה קבועה.\nחויבתם ב־₪1 לאימות ושמירת הכרטיס אצל ספק הסליקה. שלושת חודשי הניסיון ללא דמי מנוי מסתיימים ב־${date}.\nבתום הניסיון הכרטיס יחויב אוטומטית ב־₪${price} ${interval}, בהתאם לחבילה שבחרתם. זהו מחיר סופי, ללא תוספת מע״מ. ניתן לבטל את החידוש במסך המנוי לפני החיוב.\nMelaMedia | https://mela-media.co.il/`;
    const html = `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f4f7f6;color:#172c2a;font-family:Arial,Helvetica,sans-serif;direction:rtl">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">המשרד שלכם מוכן. קישור הכניסה וכל מה שצריך כדי להתחיל.</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f7f6"><tr><td align="center" style="padding:32px 12px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="width:100%;max-width:600px;background:#fff;border:1px solid #dce7e3;border-radius:20px;overflow:hidden">
<tr><td style="padding:28px 28px 22px;border-bottom:1px solid #e5ece9"><a href="https://mela-media.co.il/" style="color:#132a26;text-decoration:none;font-size:25px;font-weight:bold;letter-spacing:-1px" dir="ltr">MelaMedia<span style="color:#087a70">.</span></a><p style="margin:8px 0 0;font-size:13px;color:#46615b">המערכת המשפטית · החשבון החדש שלכם</p></td></tr>
<tr><td style="padding:30px 28px 12px;text-align:right"><p style="margin:0 0 12px;font-size:16px;line-height:1.7">שלום ${escape(data.adminName)},</p><h1 style="font-size:29px;line-height:1.3;letter-spacing:-.5px;margin:0 0 14px;color:#132a26">המשרד שלכם מוכן.</h1><p style="font-size:17px;line-height:1.8;margin:0 0 24px">ברוכים הבאים ל־MelaMedia. החשבון של <strong>${escape(data.firmName)}</strong> נפתח, ואפשר להתחיל לעבוד.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="background:#087a70;border-radius:10px"><a href="${escape(login.href)}" style="display:block;padding:17px 12px;color:#fff;font-size:17px;font-weight:bold;text-decoration:none;text-align:center">לכניסה לניהול המשרד ←</a></td></tr></table>
<p style="font-size:12px;line-height:1.8;margin:12px 0 26px;text-align:center;color:#46615b">הכפתור לא נפתח? אפשר להעתיק את הקישור:<br><a dir="ltr" href="${escape(login.href)}" style="color:#076b61;word-break:break-all">${escape(login.href)}</a></p>
<h2 style="font-size:18px;margin:0 0 14px">כך מתחברים</h2><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f8f6;border-radius:12px"><tr><td style="padding:20px;color:#244b42;font-size:15px;line-height:1.9">מספר הטלפון שלכם לכניסה<br><strong dir="ltr" style="font-size:23px;color:#123d32">${escape(phone)}</strong><br>פותחים את הקישור, מזינים את המספר ומאשרים את הקוד החד־פעמי שנשלח לטלפון. אין צורך בסיסמה קבועה.</td></tr></table>
<h2 style="font-size:18px;margin:28px 0 12px">הניסיון והמנוי שלכם</h2><p style="font-size:15px;line-height:1.9;margin:0 0 12px">חויבתם ב־<strong>₪1</strong> לאימות הכרטיס ושמירתו אצל ספק הסליקה.<br>שלושה חודשים ללא דמי מנוי, עד <strong>${escape(date)}</strong>.</p><p style="font-size:15px;line-height:1.9;margin:0 0 16px">בתום הניסיון הכרטיס יחויב אוטומטית ב־<strong dir="rtl">₪${escape(price)} ${interval}</strong>, בהתאם לחבילה שבחרתם. מחיר סופי, ללא תוספת מע״מ. ניתן לבטל את החידוש במסך המנוי לפני החיוב.</p></td></tr>
<tr><td style="padding:22px 28px;border-top:1px solid #e5ece9;color:#46615b;font-size:13px;line-height:1.8">שמרו את המייל — הקישור יחזיר אתכם למשרד שלכם בכל פעם.<br><a href="https://mela-media.co.il/" style="color:#076b61;text-decoration:underline">MelaMedia · כאן כדי לעזור לכם להתחיל</a></td></tr>
</table><p style="font-size:11px;line-height:1.6;color:#46615b;margin:16px 0 0">הודעת שירות שנשלחה בעקבות פתיחת חשבון במערכת המשפטית.</p></td></tr></table></body></html>`;
    return { subject, text, html };
}
module.exports = { renderWelcome, validEmail };
