import React from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import TertiaryButton from '../../../components/styledComponents/buttons/TertiaryButton';
import useSigningLocale from './useSigningLocale';
import './signingBackButton.scss';

export default function SigningBackButton({ children, ...props }) {
    const { direction } = useSigningLocale();
    const Arrow = direction === 'rtl' ? ArrowRight : ArrowLeft;
    return <TertiaryButton {...props} className="lw-signingBack" dir={direction}
        style={{ minHeight: '2.75rem', height: 'auto', padding: '.5rem .25rem', border: 0, boxShadow: 'none', marginBottom: 0 }}>
        <Arrow size={18} aria-hidden="true" /><span>{children}</span>
    </TertiaryButton>;
}
