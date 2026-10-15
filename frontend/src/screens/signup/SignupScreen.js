import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ApiUtils from '../../api/apiUtils';
import { getPricingSelectionDefaults } from '../../components/pricing/pricingConfig';
import PoweredByMela from '../../components/PoweredByMela';
import SimpleCard from '../../components/simpleComponents/SimpleCard';
import SimpleContainer from '../../components/simpleComponents/SimpleContainer';
import SimpleInput from '../../components/simpleComponents/SimpleInput';
import PrimaryButton from '../../components/styledComponents/buttons/PrimaryButton';
import SecondaryButton from '../../components/styledComponents/buttons/SecondaryButton';
import { Text14, TextBold14, TextBold24 } from '../../components/specializedComponents/text/AllTextKindFile';
import MelaMediaLogo from '../../components/branding/MelaMediaLogo';
import { isSignupEmbedded, navigateAfterSignup } from '../../lib/signupEmbed';
import { tenantPath } from '../../lib/tenantSlug';
import LoginSimpleScreen from '../loginScreen/components/LoginSimpleScreen';
import './SignupScreen.scss';

const STEPS = ['firm', 'contact', 'confirm'];
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;
const TRIAL_POINTS = [
    '3 חודשים חינם — ללא התחייבות',
    'כניסה מיידית עם OTP לטלפון',
    'בחירת חבילה ותמחור — אחרי תקופת הניסיון, מהגדרות המערכת',
    'ניתן לבטל את המנוי בכל עת — ללא חיובים עתידיים',
];

export default function SignupScreen() {
    const navigate = useNavigate();
    const embedded = isSignupEmbedded();
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        firmName: '',
        slug: '',
        adminName: '',
        adminPhone: '',
        adminEmail: '',
        ...getPricingSelectionDefaults(),
    });

    const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

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
            if (!form.firmName.trim()) return setError('נא להזין שם משרד');
            const slug = form.slug.trim().toLowerCase();
            if (!SLUG_RE.test(slug)) return setError('כתובת משרד: אותיות באנגלית, מספרים ומקף בלבד');
        }
        if (step === 1) {
            if (!form.adminName.trim()) return setError('נא להזין שם מנהל');
            if (!form.adminPhone.trim()) return setError('נא להזין טלפון');
        }
        return true;
    };

    const next = () => {
        if (validateStep() !== true) return;
        setStep((s) => Math.min(s + 1, STEPS.length - 1));
    };

    const back = () => setStep((s) => Math.max(s - 1, 0));

    const submitSignup = async () => {
        setLoading(true);
        setError('');
        try {
            const res = await ApiUtils.post('/public/signup/start', {
                firmName: form.firmName.trim(),
                slug: form.slug.trim().toLowerCase(),
                adminName: form.adminName.trim(),
                adminPhone: form.adminPhone.trim(),
                adminEmail: form.adminEmail.trim() || null,
                platformId: form.platformId,
                resourceId: form.resourceId,
                signingId: form.signingId,
                billingInterval: form.billingInterval,
            });
            const intentId = res.data?.intentId;
            if (!intentId) {
                setError('הרשמה נכשלה');
                return;
            }
            const complete = await ApiUtils.post(`/public/signup/${intentId}/complete`);
            const slug = complete.data?.slug;
            if (slug) {
                navigateAfterSignup(slug, navigate);
                return;
            }
            setError('פתיחת המשרד נכשלה');
        } catch (e) {
            setError(e?.response?.data?.message || e?.response?.data?.error || 'הרשמה נכשלה');
        } finally {
            setLoading(false);
        }
    };

    const footer = (
        <SimpleContainer className="lw-signup__footer">
            {step > 0 && (
                <SecondaryButton onPress={back} disabled={loading}>
                    חזרה
                </SecondaryButton>
            )}
            {step < STEPS.length - 1 ? (
                <PrimaryButton onPress={next}>
                    המשך
                </PrimaryButton>
            ) : (
                <PrimaryButton isPerforming={loading} onPress={submitSignup} disabled={loading}>
                    התחילו 3 חודשים חינם
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
                    3 חודשים חינם · ביטול בכל עת · ללא כרטיס אשראי
                </Text14>

                <SimpleContainer className="lw-signup__steps" aria-label="שלבי הרשמה">
                    {STEPS.map((id, i) => (
                        <span key={id} className={i <= step ? 'is-active' : ''}>{i + 1}</span>
                    ))}
                </SimpleContainer>

                {error && <SimpleContainer className="lw-signup__error">{error}</SimpleContainer>}

                {step === 0 && (
                    <SimpleContainer className="lw-signup__fields">
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
                            title="דוא״ל (אופציונלי)"
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
                            <ul className="lw-signup__trialList">
                                {TRIAL_POINTS.map((line) => (
                                    <li key={line}><Text14>{line}</Text14></li>
                                ))}
                            </ul>
                        </SimpleCard>

                        <Text14>לאחר לחיצה המשרד ייפתח מיד ותועברו למסך ההתחברות.</Text14>

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
    const params = new URLSearchParams(window.location.search);
    const intentId = params.get('intentId');

    useEffect(() => {
        if (!intentId) return;
        let tries = 0;
        const poll = async () => {
            try {
                const res = await ApiUtils.get(`/public/signup/${intentId}/status`);
                if (res.data?.status === 'completed' && res.data?.slug) {
                    navigateAfterSignup(res.data.slug, navigate);
                    return;
                }
            } catch (_) { /* retry */ }
            tries += 1;
            if (tries < 20) setTimeout(poll, 2000);
        };
        poll();
    }, [intentId, navigate]);

    return (
        <LoginSimpleScreen
            unScrollableTopComponent={(
                <MelaMediaLogo markSize={72} className="lw-melaMediaLogo--signup" />
            )}
        >
            <SimpleContainer className="lw-signup__content lw-signup__content--center">
                <TextBold24>פותחים את המשרד...</TextBold24>
                <Text14 className="lw-signup__subtitle">מיד תועברו להתחברות.</Text14>
            </SimpleContainer>
        </LoginSimpleScreen>
    );
}
