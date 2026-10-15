import SimpleContainer from '../simpleComponents/SimpleContainer';
import { getMelaMediaMarkUrl } from '../../lib/tenantBranding';
import './MelaMediaLogo.scss';

const MEDIA_GRADIENT = 'linear-gradient(135deg, #22D3EE 0%, #2DD4BF 45%, #34D399 100%)';

export default function MelaMediaLogo({ markSize = 64, className = '' }) {
    const rootClass = ['lw-melaMediaLogo', className].filter(Boolean).join(' ');

    return (
        <SimpleContainer className={rootClass}>
            <img
                src={getMelaMediaMarkUrl()}
                alt=""
                aria-hidden
                className="lw-melaMediaLogo__mark"
                width={markSize}
                height={markSize}
                decoding="async"
            />
            <span className="lw-melaMediaLogo__wordmark">
                Mela
                <span
                    style={{
                        background: MEDIA_GRADIENT,
                        WebkitBackgroundClip: 'text',
                        backgroundClip: 'text',
                        color: 'transparent',
                    }}
                >
                    Media
                </span>
            </span>
        </SimpleContainer>
    );
}
