import { SignupLogoPicker } from './SignupLogoPicker';
import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ApiUtils from '../../api/apiUtils';
import { getPricingSelectionDefaults } from '../../components/pricing/pricingConfig';
import { signupSelection, signupQuote } from '../../lib/signupPricing';
import PoweredByMela from '../../components/PoweredByMela';
import SimpleCard from '../../components/simpleComponents/SimpleCard';
import SimpleContainer from '../../components/simpleComponents/SimpleContainer';
import SimpleInput from '../../components/simpleComponents/SimpleInput';
import PrimaryButton from '../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../components/styledComponents/buttons/SecondaryButton';
import { Text14, TextBold14, TextBold24 } from '../../components/specializedComponents/text/AllTextKindFile';
import MelaMediaLogo from '../../components/branding/MelaMediaLogo';
import { isSignupEmbedded, navigateAfterSignup } from '../../lib/signupEmbed';
import { bindSignupAttribution } from '../../lib/signupAttribution';

import LoginSimpleScreen from '../loginScreen/components/LoginSimpleScreen';
import './SignupScreen.scss';

const STEPS = ['firm', 'contact', 'confirm'];
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const TRIAL_POINTS = [
    '3 חודשים ללא דמי מנוי; חיוב חד־פעמי של ₪1 בהרשמה',
    'כניסה מיידית עם OTP לטלפון',
    'הכרטיס יישמר אצל ספק הסליקה לצורך חידוש המנוי',
    'ניתן לבטל את המנוי בכל עת — ללא חיובים עתידיים',
];

export default function SignupScreen() {
    const navigate = useNavigate();
    const embedded = isSignupEmbedded();
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [signupAvailable, setSignupAvailable] = useState(null);
    useEffect(() => {
        let active = true;
        ApiUtils.get('/public/signup/config').then(({data}) => { if (active) setSignupAvailable(data?.available === true); }).catch(() => { if (active) setSignupAvailable(false); });
        return () => { active = false; };
    }, []);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        logoDataUrl: '',
        firmName: '',
        slug: '',
        adminName: '',
        adminPhone: '',
        adminEmail: '',
        ...getPricingSelectionDefaults(),
    });

    useEffect(() => {
        let saved = {};
        try { saved = JSON.parse(sessionStorage.getItem('legal-signup-form') || '{}') || {}; } catch (_) {}
        // An explicit new choice from the price list wins over a saved draft.
        const choice = signupSelection(window.location.search);
        setForm(previous => {
            const restored = { ...previous, ...saved, ...choice };
            const valid = signupSelection(new URLSearchParams(restored).toString());
            return { ...restored, ...getPricingSelectionDefaults(), ...valid };
        });
    }, []);
    const [billingConsent, setBillingConsent] = useState(false);
    const price = signupQuote(form);
    const recurringPrice = price.recurringAmountIls.toLocaleString('he-IL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const pricingLink = 'https://mela-media.co.il/platform/pricing/?' + new URLSearchParams({ platformId: form.platformId, resourceId: form.resourceId, signingId: form.signingId, billingInterval: form.billingInterval || 'monthly' }).toString();

    const update = (patch) => {
        setError('');
        setForm((prev) => ({ ...prev, ...patch }));
    };

    const handlePhoneChange = (event) => {
        const raw = event?.target?.value ?? '';
        const digitsOnly = String(raw).replace(/\D/g, '');
        let normalized = digitsOnly;
        if (normalized.startsWith('972') && normalized.length >= 11) {
            normalized = `0${normalized.slice(3)}`;
        }
        update({ adminPhone: normalized.slice(0, 10) });
    };

    const validateStep = () => {
        setError('');
        if (step === 0) {
            if (!form.logoDataUrl) return setError('יש להעלות לוגו למשרד כדי להמשיך.');
            if (!form.firmName.trim()) return setError('נא להזין שם משרד');
            const slug = form.slug.trim().toLowerCase();
            if (!SLUG_RE.test(slug)) return setError('כתובת משרד: אותיות באנגלית, מספרים ומקף בלבד');
        }
        if (step === 1) {
            if (!form.adminName.trim()) return setError('נא להזין שם מנהל');
            if (!form.adminPhone.trim()) return setError('נא להזין טלפון');
            if (!/^[^\s@<>,;:]+@[^\s@<>,;:]+\.[^\s@<>,;:]+$/.test(form.adminEmail.trim()) || form.adminEmail.trim().length > 254) return setError('נא להזין כתובת דוא״ל תקינה לקבלת פרטי החשבון');
        }
        return true;
    };

    const next = () => {
        if (validateStep() !== true) return;
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    };

    const back = () => { setError(''); setStep((s) => Math.max(s - 1, 0)); };

    const submitSignup = async () => {
        if (signupAvailable !== true) { setError('הרשמה אוטומטית אינה זמינה כרגע. לא יבוצע חיוב.'); return; }
        if (!billingConsent) { setError('יש לאשר את תנאי התשלום ושמירת הכרטיס'); return; }
        sessionStorage.setItem('legal-signup-form',JSON.stringify(form));
        setLoading(true);
        setError('');
        try {
            const key=sessionStorage.getItem('legal-signup-key')||crypto.randomUUID();
            sessionStorage.setItem('legal-signup-key',key);
            const res = await ApiUtils.post('/public/signup/start', {
                logoDataUrl: form.logoDataUrl,
                firmName: form.firmName.trim(),
                slug: form.slug.trim().toLowerCase(),
                adminName: form.adminName.trim(),
                adminPhone: form.adminPhone.trim(),
                adminEmail: form.adminEmail.trim() || null,
                platformId: form.platformId,
                resourceId: form.resourceId,
                signingId: form.signingId,
                billingInterval: form.billingInterval,
                billingConsent: true, consentVersion: 'signup-1ils-3months-v2',
                idempotencyKey:key,expectedPriceIls:price.recurringAmountIls,
            });
            const intentId = res.data?.intentId;
            if (!intentId) {
                setError('הרשמה נכשלה');
                return;
            }
            sessionStorage.setItem('legal-signup-intent', intentId);
            await bindSignupAttribution(intentId);
            const checkout = await ApiUtils.post(`/public/signup/${intentId}/checkout`);
            if(checkout.data?.status==='completed'){sessionStorage.removeItem('legal-signup-key');sessionStorage.removeItem('legal-signup-intent');navigateAfterSignup(checkout.data.slug,navigate);return;}
            const target = checkout.data?.redirectUrl;
            if (target) {
                const url = new URL(target);
                if (url.protocol !== 'https:' || !(url.hostname === 'takbull.co.il' || url.hostname.endsWith('.takbull.co.il'))) throw new Error('Invalid checkout');
                window.location.assign(target);
                return;
            }
            setError('פתיחת המשרד נכשלה');
        } catch (e) {
            setError(({LOGO_REQUIRED:'יש להעלות לוגו למשרד.',LOGO_INVALID:'בחרו קובץ לוגו PNG או JPG תקין.',LOGO_DIMENSIONS:'נדרש לוגו ריבועי בגודל 1,024–4,096 פיקסלים.',LOGO_TOO_LARGE:'גודל הלוגו המרבי הוא 2MB.',LOGO_STORAGE_UNAVAILABLE:'שמירת הלוגו נכשלה. לא נוצר תשלום; נסו שוב.'}[e?.response?.data?.error]) || e?.response?.data?.message || e?.response?.data?.error || 'הרשמה נכשלה');
        } finally {
            setLoading(false);
        }
    };

    const footer = (
        <SimpleContainer className="lw-signup__footer">
            {error && (
                <div className="lw-signup__feedback" role="alert" aria-atomic="true">
                    <span>{error}</span>
                    <button type="button" className="lw-signup__feedbackClose" aria-label="סגירת הודעת השגיאה" onClick={() => setError('')}>×</button>
                </div>
            )}
            {step > 0 && (
                <SecondaryButton onPress={back} disabled={loading}>
                    חזרה
                </SecondaryButton>
            )}
            {step < STEPS.length - 1 ? (
                <PrimaryButton onPress={next} disabled={signupAvailable !== true}>
                    המשך
                </PrimaryButton>
            ) : (
                <PrimaryButton isPerforming={loading} onPress={submitSignup} disabled={loading || signupAvailable !== true}>
                    המשיכו לתשלום ₪1
                </PrimaryButton>
            )}
        </SimpleContainer>
    );

    return (
        <LoginSimpleScreen
            unScrollableTopComponent={(
                <MelaMediaLogo markSize={embedded ? 56 : 72} className="lw-melaMediaLogo--signup" />
            )}
            unScrollableBottomComponent={(
                <>
                    {footer}
                    {!embedded && <PoweredByMela />}
                </>
            )}
        >
            <SimpleContainer className={embedded ? 'lw-signup__content lw-signup__content--embed' : 'lw-signup__content'}>
                <TextBold24 className="lw-signup__title">פתיחת משרד עורכי דין</TextBold24>
                <Text14 className="lw-signup__subtitle">
                    3 חודשים ללא דמי מנוי · ₪1 בהרשמה · כרטיס לחידוש עתידי
                </Text14>

                {signupAvailable !== true && <SimpleContainer className="lw-signup__error" role="status">{signupAvailable === null ? 'בודקים זמינות הרשמה…' : 'ההרשמה האוטומטית למשרדים חדשים אינה זמינה כרגע. לא יבוצע חיוב. משרדים קיימים יכולים להמשיך להתחבר כרגיל.'}</SimpleContainer>}

                <SimpleCard className="lw-signup__trialCard">
                    <TextBold14>החבילה שבחרתם</TextBold14>
                    <Text14>{price.platform.label} · {price.resource.label} · {price.signing.label}</Text14>
                    <Text14>בתום 3 חודשי הניסיון: ₪{recurringPrice} {form.billingInterval === 'yearly' ? 'לשנה' : 'לחודש'}, מחיר סופי ללא תוספת מע״מ. הכרטיס יחויב אוטומטית, אלא אם ביטלתם את החידוש.</Text14>
                    <a href={pricingLink} target={embedded ? '_top' : '_self'}>שינוי החבילה במחירון</a>
                </SimpleCard>

                <SimpleContainer className="lw-signup__steps" aria-label="שלבי הרשמה">
                    {STEPS.map((id, i) => (
                        <span key={id} className={i <= step ? 'is-active' : ''}>{i + 1}</span>
                    ))}
                </SimpleContainer>

                {step === 0 && (
                    <SimpleContainer className="lw-signup__fields">
                        <SignupLogoPicker value={form.logoDataUrl || ''} onChange={logoDataUrl=>update({logoDataUrl})} disabled={loading} />
                        <SimpleInput
                            title="שם המשרד"
                            className="lw-signup__input"
                            value={form.firmName}
                            onChange={(e) => update({ firmName: e.target.value })}
                        />
                        <SimpleContainer className="lw-signup__slugBlock">
                            <Text14 className="lw-signup__slugHint">כתובת המשרד</Text14>
                            <Text14 className="lw-signup__slugPrefix" dir="ltr">
                                lawyer.mela-media.co.il/
                            </Text14>
                            <SimpleInput
                                title="שם בכתובת"
                                className="lw-signup__input lw-signup__input--slug"
                                value={form.slug}
                                onChange={(e) => update({
                                    slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''),
                                })}
                                placeholder="cohen-law"
                            />
                            <Text14 className="lw-signup__slugExample">לדוגמה: cohen-law</Text14>
                        </SimpleContainer>
                    </SimpleContainer>
                )}

                {step === 1 && (
                    <SimpleContainer className="lw-signup__fields">
                        <SimpleInput
                            title="שם מנהל/ת המשרד"
                            className="lw-signup__input"
                            value={form.adminName}
                            onChange={(e) => update({ adminName: e.target.value })}
                        />
                        <SimpleInput
                            title="טלפון (לכניסה עם OTP)"
                            type="tel"
                            className="lw-signup__input"
                            value={form.adminPhone}
                            onChange={handlePhoneChange}
                            maxLength={10}
                        />
                        <SimpleInput
                            title="דוא״ל לקבלת פרטי החשבון"
                            required
                            maxLength={254}
                            type="email"
                            className="lw-signup__input"
                            value={form.adminEmail}
                            onChange={(e) => update({ adminEmail: e.target.value })}
                        />
                    </SimpleContainer>
                )}

                {step === 2 && (
                    <SimpleContainer className="lw-signup__confirm">
                        <SimpleCard className="lw-signup__trialCard">
                            <TextBold14>מה מקבלים עכשיו</TextBold14>
                        <Text14>לאחר שלושה חודשים: ₪{recurringPrice} {form.billingInterval === 'yearly' ? 'לשנה' : 'לחודש'}, מחיר סופי ללא תוספת מע״מ, בהתאם לחבילה שנבחרה. ניתן לבטל לפני החידוש.</Text14>
                        <label><input type="checkbox" checked={billingConsent} onChange={(e) => setBillingConsent(e.target.checked)} />אני מאשר/ת חיוב חד־פעמי של ₪1, שמירת הכרטיס אצל ספק הסליקה וחידוש המנוי לפי המחיר המוצג לאחר שלושה חודשים.</label>
                            <ul className="lw-signup__trialList">
                                {TRIAL_POINTS.map((line) => (
                                    <li key={line}><Text14>{line}</Text14></li>
                                ))}
                            </ul>
                        </SimpleCard>

                        <Text14>המשרד ייפתח לאחר אימות חיוב ₪1 ושמירת הכרטיס.</Text14>

                        <ul className="lw-signup__summary">
                            <li><Text14>משרד: {form.firmName}</Text14></li>
                            <li><Text14>כתובת: lawyer.mela-media.co.il/{form.slug}</Text14></li>
                            <li><Text14>מנהל/ת: {form.adminName}</Text14></li>
                        </ul>
                    </SimpleContainer>
                )}
            </SimpleContainer>
        </LoginSimpleScreen>
    );
}

export function SignupCompleteScreen() {
    const navigate = useNavigate();
    const intentId = new URLSearchParams(window.location.search).get('intentId');
    const [status,setStatus]=useState('בודקים את התשלום ושמירת הכרטיס…');
    const [busy,setBusy]=useState(false);
    const check=useCallback(async()=>{if(!intentId)return;setBusy(true);try{await ApiUtils.post(`/public/signup/${intentId}/sync`);}catch(_){setStatus('התשלום או שמירת הכרטיס טרם אומתו. אין לשלם שוב; אפשר לבדוק שוב או לפנות לתמיכה.');}finally{setBusy(false);}},[intentId]);
    useEffect(() => {
        if (!intentId) {setStatus('קישור הרשמה אינו תקין');return;}
        let stopped=false,timer;
        const poll = async () => {
            try {
                const res = await ApiUtils.get(`/public/signup/${intentId}/status`);
                if (res.data?.status === 'completed' && res.data?.slug) {
                    await bindSignupAttribution(intentId);
                    ['legal-signup-intent','legal-signup-key','legal-signup-form'].forEach(k=>sessionStorage.removeItem(k));
                    navigateAfterSignup(res.data.slug, navigate);return;
                }
            } catch (_) { /* retry only status; never another charge */ }
            if(!stopped)timer=setTimeout(poll,3000);
        };
        check();poll();return()=>{stopped=true;clearTimeout(timer);};
    }, [check, intentId, navigate]);
    return <LoginSimpleScreen unScrollableTopComponent={<MelaMediaLogo markSize={72} className="lw-melaMediaLogo--signup" />}>
        <SimpleContainer className="lw-signup__content lw-signup__content--center"><TextBold24>השלמת ההרשמה</TextBold24><Text14>{status}</Text14>
        <PrimaryButton onPress={check} disabled={busy||!intentId} isPerforming={busy}>בדקו שוב</PrimaryButton></SimpleContainer>
    </LoginSimpleScreen>;
}
