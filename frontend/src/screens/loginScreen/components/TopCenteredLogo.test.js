import React from 'react';
import { render } from '@testing-library/react';
import TopCenteredLogo from './TopCenteredLogo';
import TopCenteredLogoOtp from '../../otpScreen/components/TopCenteredLogoOtp';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../../../components/compliance/ComplianceBadges', () => () => null);

const previousName = process.env.REACT_APP_APP_NAME;
const previousMultiTenant = process.env.REACT_APP_MULTI_TENANT;
afterEach(() => {
    if (previousName === undefined) delete process.env.REACT_APP_APP_NAME;
    else process.env.REACT_APP_APP_NAME = previousName;
    if (previousMultiTenant === undefined) delete process.env.REACT_APP_MULTI_TENANT;
    else process.env.REACT_APP_MULTI_TENANT = previousMultiTenant;
});

describe.each([
    ['login', TopCenteredLogo],
    ['OTP', TopCenteredLogoOtp],
])('%s logo', (_name, Logo) => {
    test.each([100, 180])('tinted tenant logo reserves %ipx of height instead of collapsing', width => {
        process.env.REACT_APP_APP_NAME = 'melamedlaw';
        process.env.REACT_APP_MULTI_TENANT = 'false';
        const { container } = render(<Logo logoSrc="/test-office-logo.png" logoWidth={width} />);
        const logo = container.querySelector('[style*="mask-image"]');
        expect(logo).not.toBeNull();
        expect(logo.style.height).toBe(`${width}px`);
        expect(logo.style.maskImage).toContain('/test-office-logo.png');
    });

    test.each(['melamedia', 'idm'])('%s full-color logo keeps its original image proportions', tenant => {
        process.env.REACT_APP_APP_NAME = tenant;
        process.env.REACT_APP_MULTI_TENANT = 'false';
        const { container } = render(<Logo />);
        const logo = container.querySelector('img');
        expect(logo).not.toBeNull();
        expect(logo.getAttribute('src')).toBe('/firm-logo.png');
        expect(logo.style.height).toBe('auto');
        expect(logo.style.maskImage).toBe('');
    });
});
