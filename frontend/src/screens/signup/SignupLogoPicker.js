import { useEffect, useRef, useState } from 'react';
import { Check, ImagePlus, Upload } from 'lucide-react';
import './SignupLogoPicker.scss';

/** The server still decodes and sanitizes the original raster before storing it. */
export function SignupLogoPicker({ value, onChange, disabled }) {
    const [error, setError] = useState('');
    const [reading, setReading] = useState(false);
    const [fileName, setFileName] = useState('');
    const sequence = useRef(0);
    const input = useRef(null);
    useEffect(() => () => { sequence.current += 1; }, []);

    async function choose(file) {
        // Cancelling the file dialog must preserve an already selected logo.
        if (!file) return;
        const current = ++sequence.current;
        setError('');
        setReading(false);
        if (!['image/png', 'image/jpeg'].includes(file.type)) {
            setError('יש לבחור קובץ PNG או JPG.');
            return;
        }
        if (file.size > 2 * 1024 * 1024) {
            setError('גודל הלוגו המרבי הוא 2MB. בחרו קובץ קטן יותר.');
            return;
        }
        setReading(true);
        try {
            const data = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result));
                reader.onerror = reject;
                reader.onabort = reject;
                reader.readAsDataURL(file);
            });
            const dimensions = await new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
                img.onerror = reject;
                img.src = data;
            });
            if (dimensions.width !== dimensions.height || dimensions.width < 1024 || dimensions.width > 4096) throw Error('SIZE');
            if (current === sequence.current) {
                setFileName(file.name);
                onChange(data);
            }
        } catch (e) {
            if (current === sequence.current) setError(e.message === 'SIZE'
                ? 'בחרו לוגו ריבועי, ברוחב ובגובה של 1,024–4,096 פיקסלים.'
                : 'לא ניתן לקרוא את התמונה. בחרו קובץ PNG או JPG תקין.');
        } finally {
            if (current === sequence.current) setReading(false);
        }
    }

    return (
        <section className="lw-signupLogo" aria-labelledby="signup-logo-title" aria-busy={reading}>
            <h3 id="signup-logo-title" className="lw-signupLogo__title">לוגו המשרד <span>(חובה)</span></h3>
            <p id="signup-logo-help" className="lw-signupLogo__help">הלוגו יופיע באתר ובממשק המשרד שלכם, ויישמר גם להכנת האפליקציה בהמשך.</p>
            <div className="lw-signupLogo__selection">
                <div className={`lw-signupLogo__preview${value ? ' is-selected' : ''}`}>
                    {value
                        ? <img src={value} alt="תצוגה מקדימה של לוגו המשרד" width={88} height={88} />
                        : <ImagePlus size={28} strokeWidth={1.5} aria-hidden="true" />}
                </div>
                <div className="lw-signupLogo__actions">
                    <button type="button" className="lw-signupLogo__choose" disabled={disabled || reading}
                        aria-describedby="signup-logo-help signup-logo-requirements signup-logo-status"
                        onClick={() => input.current?.click()}>
                        <Upload size={18} aria-hidden="true" />
                        {reading ? 'בודקים את הלוגו…' : value ? 'החלפת הלוגו' : 'בחירת קובץ לוגו'}
                    </button>
                    {value && <bdi className="lw-signupLogo__fileName">{fileName || 'הלוגו שבחרתם'}</bdi>}
                </div>
            </div>
            <input ref={input} id="signup-business-logo" className="lw-signupLogo__input" type="file"
                accept="image/png,image/jpeg" disabled={disabled || reading} aria-label="קובץ לוגו המשרד"
                aria-required={!value} aria-invalid={!!error}
                onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; void choose(file); }} />
            <p id="signup-logo-requirements" className="lw-signupLogo__requirements">PNG או JPG ריבועי · עד 2MB<br />רוחב וגובה: 1,024–4,096 פיקסלים</p>
            <div id="signup-logo-status" className={`lw-signupLogo__status${error ? ' is-error' : value ? ' is-ready' : ''}`}
                role={error ? 'alert' : 'status'} aria-atomic="true">
                {!error && value && <Check size={16} aria-hidden="true" />}
                <span>{error || (reading ? 'בודקים את התמונה…' : value ? 'הלוגו מוכן. הוא יישמר עם פתיחת המשרד.' : 'בחרו לוגו כדי להמשיך לפתיחת המשרד.')}</span>
            </div>
        </section>
    );
}
