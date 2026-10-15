import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import ApiUtils from '../../api/apiUtils';
import { PRICING_CONFIG, resolvePricingLineItems, yearlyTotalIls } from '../../components/pricing/pricingConfig';
import { tenantPath } from '../../lib/tenantSlug';
import './SignupScreen.scss';

const STEPS = ['firm', 'contact', 'package', 'payment'];
const PRACTICE_AREAS = [
    'דיני משפחה',
    'דיני עבודה',
    'נזיקין',
    'מקרקעין',
    'פלילי',
    'מסחרי',
    'Other',
];

const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

export default function SignupScreen() {
    const navigate = useNavigate();
    const [step, setStep] = useState(0);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [form, setForm] = useState({
        firmName: '',
        slug: '',
        adminName: '',
        adminPhone: '',
        adminEmail: '',
        lawyerCount: '1',
        practiceAreas: [],
        platformId: 'site_app',
        resourceId: 'pro',
        signingId: '500',
        billingInterval: 'monthly',
    });

    const pricing = useMemo(
        () => resolvePricingLineItems({
            platformId: form.platformId,
            resourceId: form.resourceId,
            signingId: form.signingId,
        }),
        [form.platformId, form.resourceId, form.signingId]
    );

    const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

    const toggleArea = (area) => {
        setForm((prev) => ({
            ...prev,
            practiceAreas: prev.practiceAreas.includes(area)
                ? prev.practiceAreas.filter((a) => a !== area)
                : [...prev.practiceAreas, area],
        }));
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
                lawyerCount: Number(form.lawyerCount) || 1,
                practiceAreas: form.practiceAreas,
                platformId: form.platformId,
                resourceId: form.resourceId,
                signingId: form.signingId,
                billingInterval: form.billingInterval,
            });
            const intentId = res.data?.intentId;
            const checkout = await ApiUtils.post(`/public/signup/${intentId}/checkout`);
            if (checkout.data?.redirectUrl) {
                window.location.href = checkout.data.redirectUrl;
                return;
            }
            setError('לא התקבלה כתובת תשלום');
        } catch (e) {
            setError(e?.response?.data?.message || e?.response?.data?.error || 'הרשמה נכשלה');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="lw-signup" dir="rtl">
            <div className="lw-signup__card">
                <header className="lw-signup__header">
                    <h1>פתיחת משרד עורכי דין</h1>
                    <p>3 חודשים חינם · נדרש כרטיס אשראי לאימות (₪1)</p>
                </header>

                <div className="lw-signup__steps">
                    {STEPS.map((id, i) => (
                        <span key={id} className={i <= step ? 'active' : ''}>{i + 1}</span>
                    ))}
                </div>

                {error && <div className="lw-signup__error">{error}</div>}

                {step === 0 && (
                    <section>
                        <label>שם המשרד</label>
                        <input value={form.firmName} onChange={(e) => update({ firmName: e.target.value })} />
                        <label>כתובת המשרד (באנגלית)</label>
                        <div className="lw-signup__slug">
                            <span>lawyer.mela-media.co.il/</span>
                            <input
                                value={form.slug}
                                onChange={(e) => update({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') })}
                                placeholder="cohen-law"
                            />
                        </div>
                    </section>
                )}

                {step === 1 && (
                    <section>
                        <label>שם מנהל/ת המשרד</label>
                        <input value={form.adminName} onChange={(e) => update({ adminName: e.target.value })} />
                        <label>טלפון (לכניסה עם OTP)</label>
                        <input value={form.adminPhone} onChange={(e) => update({ adminPhone: e.target.value })} />
                        <label>דוא״ל (אופציונלי)</label>
                        <input type="email" value={form.adminEmail} onChange={(e) => update({ adminEmail: e.target.value })} />
                        <label>מספר עורכי דין במשרד</label>
                        <input type="number" min={1} value={form.lawyerCount} onChange={(e) => update({ lawyerCount: e.target.value })} />
                        <label>תחומי עיסוק</label>
                        <div className="lw-signup__tags">
                            {PRACTICE_AREAS.map((area) => (
                                <button
                                    key={area}
                                    type="button"
                                    className={form.practiceAreas.includes(area) ? 'selected' : ''}
                                    onClick={() => toggleArea(area)}
                                >
                                    {area}
                                </button>
                            ))}
                        </div>
                    </section>
                )}

                {step === 2 && (
                    <section className="lw-signup__package">
                        <p className="lw-signup__price">
                            {PRICING_CONFIG.currency}{pricing.total}
                            <span>/חודש</span>
                        </p>
                        <label>פלטפורמה</label>
                        <select value={form.platformId} onChange={(e) => update({ platformId: e.target.value })}>
                            {PRICING_CONFIG.platforms.map((p) => (
                                <option key={p.id} value={p.id}>{p.label} (+{p.amount}₪)</option>
                            ))}
                        </select>
                        <label>משאבים</label>
                        <select value={form.resourceId} onChange={(e) => update({ resourceId: e.target.value })}>
                            {PRICING_CONFIG.resources.map((r) => (
                                <option key={r.id} value={r.id}>{r.label} (+{r.amount}₪)</option>
                            ))}
                        </select>
                        <label>חתימות</label>
                        <select value={form.signingId} onChange={(e) => update({ signingId: e.target.value })}>
                            {PRICING_CONFIG.signing.map((s) => (
                                <option key={s.id} value={s.id}>{s.label} (+{s.amount}₪)</option>
                            ))}
                        </select>
                        <label>מחזור חיוב</label>
                        <select value={form.billingInterval} onChange={(e) => update({ billingInterval: e.target.value })}>
                            <option value="monthly">חודשי</option>
                            <option value="yearly">שנתי (10% הנחה — {PRICING_CONFIG.currency}{yearlyTotalIls(pricing.total)})</option>
                        </select>
                    </section>
                )}

                {step === 3 && (
                    <section>
                        <p>לאחר לחיצה תועברו לדף תשלום מאובטח (Takbull) לאימות כרטיס ב-₪1.</p>
                        <p>החיוב החודשי יתחיל רק לאחר 3 חודשים חינם.</p>
                        <ul className="lw-signup__summary">
                            <li>משרד: {form.firmName}</li>
                            <li>כתובת: lawyer.mela-media.co.il/{form.slug}</li>
                            <li>חבילה: {PRICING_CONFIG.currency}{pricing.total}/חודש</li>
                        </ul>
                    </section>
                )}

                <footer className="lw-signup__footer">
                    {step > 0 && (
                        <button type="button" className="secondary" onClick={back} disabled={loading}>חזרה</button>
                    )}
                    {step < STEPS.length - 1 ? (
                        <button type="button" className="primary" onClick={next}>המשך</button>
                    ) : (
                        <button type="button" className="primary" onClick={submitSignup} disabled={loading}>
                            {loading ? 'מעבד...' : 'אימות כרטיס ופתיחת משרד'}
                        </button>
                    )}
                </footer>
            </div>
        </div>
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
                    navigate(tenantPath(res.data.slug, '/LoginStack/LoginScreen'), { replace: true });
                    return;
                }
            } catch (_) { /* retry */ }
            tries += 1;
            if (tries < 20) setTimeout(poll, 2000);
        };
        poll();
    }, [intentId, navigate]);

    return (
        <div className="lw-signup" dir="rtl">
            <div className="lw-signup__card">
                <h1>מאמתים את התשלום...</h1>
                <p>המשרד שלכם נפתח. מיד תועברו להתחברות.</p>
            </div>
        </div>
    );
}
