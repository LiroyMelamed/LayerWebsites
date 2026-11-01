import { act, render, screen, waitFor } from '@testing-library/react';
import TakbullCheckoutDialog from './TakbullCheckoutDialog';
import billingApi from '../../api/billingApi';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../../api/billingApi', () => ({ __esModule: true, default: { confirmCheckout: jest.fn() } }));
jest.mock('../simpleComponents/SimpleContainer', () => ({ children, ...props }) => <div {...props}>{children}</div>);
jest.mock('../simpleComponents/SimpleButton', () => ({ children, onPress, ...props }) => <button onClick={onPress} {...props}>{children}</button>);
jest.mock('../specializedComponents/text/AllTextKindFile', () => {
    const Text = ({ children, ...props }) => <span {...props}>{children}</span>;
    return { Text14: Text, TextBold20: Text };
});
const URL = 'https://api.takbull.co.il/PaymentGateway?orderUniqId=synthetic-order';
let props;
beforeEach(() => {
    jest.clearAllMocks();
    props = { open: true, gatewayUrl: URL, intentId: 'synthetic-intent', uniqId: 'synthetic-order',
        onPaid: jest.fn(), onFailed: jest.fn(), onClose: jest.fn() };
});
function replay({ source = screen.getByTitle('Takbull checkout').contentWindow,
    origin = 'https://api.takbull.co.il', code = 0 } = {}) {
    act(() => window.dispatchEvent(new MessageEvent('message', { source, origin,
        data: { message: 'paymentreplay', value: { InternalCode: code } } })));
}

test('provider approval is only a wake-up; only exact server confirmation can show paid', async () => {
    let confirm;
    billingApi.confirmCheckout.mockReturnValue(new Promise(resolve => { confirm = resolve; }));
    render(<TakbullCheckoutDialog {...props} />);
    replay();
    expect(billingApi.confirmCheckout).toHaveBeenCalledWith({ intentId: 'synthetic-intent', uniqId: 'synthetic-order' });
    expect(props.onPaid).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-busy', 'true');
    await act(async () => confirm({ success: true, data: { success: true } }));
    expect(props.onPaid).toHaveBeenCalledTimes(1);
    expect(props.onFailed).not.toHaveBeenCalled();
    expect(props.onClose).toHaveBeenCalledTimes(1);
});

for (const result of [
    { success: true, data: { success: false, cardVerified: true, billing: { status: 'active' } } },
    { success: false, data: null },
    { success: true, data: {} },
    undefined,
]) {
    test('card verification, transport success, and incomplete responses cannot imply subscription payment: ' + JSON.stringify(result), async () => {
        billingApi.confirmCheckout.mockResolvedValue(result);
        render(<TakbullCheckoutDialog {...props} />);
        replay();
        await waitFor(() => expect(props.onFailed).toHaveBeenCalledWith('billing.paymentUnconfirmed'));
        expect(props.onPaid).not.toHaveBeenCalled();
    });
}

test('a lost confirmation response is unconfirmed and never sends a second payment request', async () => {
    billingApi.confirmCheckout.mockRejectedValue(Error('synthetic timeout'));
    render(<TakbullCheckoutDialog {...props} />);
    replay(); replay();
    await waitFor(() => expect(props.onFailed).toHaveBeenCalledTimes(1));
    expect(billingApi.confirmCheckout).toHaveBeenCalledTimes(1);
    expect(props.onPaid).not.toHaveBeenCalled();
});

test('messages from a foreign origin or another window cannot confirm or resize this checkout', () => {
    render(<TakbullCheckoutDialog {...props} />);
    replay({ origin: 'https://synthetic.attacker.invalid' });
    replay({ source: window });
    act(() => window.dispatchEvent(new MessageEvent('message', { source: window, origin: 'https://api.takbull.co.il', data: 100 } )));
    expect(billingApi.confirmCheckout).not.toHaveBeenCalled();
    expect(props.onPaid).not.toHaveBeenCalled();
    expect(screen.getByTitle('Takbull checkout')).toHaveStyle({ height: '640px' });
});

test('duplicate replies across a parent rerender confirm once and notify the current callbacks', async () => {
    let confirm;
    billingApi.confirmCheckout.mockReturnValue(new Promise(resolve => { confirm = resolve; }));
    const view = render(<TakbullCheckoutDialog {...props} />);
    replay(); replay();
    const updated = { ...props, onPaid: jest.fn(), onClose: jest.fn() };
    view.rerender(<TakbullCheckoutDialog {...updated} />);
    replay();
    await act(async () => confirm({ success: true, data: { success: true } }));
    expect(billingApi.confirmCheckout).toHaveBeenCalledTimes(1);
    expect(updated.onPaid).toHaveBeenCalledTimes(1);
    expect(props.onPaid).not.toHaveBeenCalled();
});

test('a provider decline still reconciles the same order before final feedback', async () => {
    billingApi.confirmCheckout.mockResolvedValue({ success: true, data: { success: false } });
    render(<TakbullCheckoutDialog {...props} />);
    replay({ code: 5 });
    await waitFor(() => expect(props.onFailed).toHaveBeenCalledTimes(1));
    expect(billingApi.confirmCheckout).toHaveBeenCalledTimes(1);
    expect(props.onPaid).not.toHaveBeenCalled();
});

test('a checkout without its persisted identity cannot be reported paid', async () => {
    render(<TakbullCheckoutDialog {...props} intentId={null} uniqId={null} />);
    replay();
    await waitFor(() => expect(props.onFailed).toHaveBeenCalledTimes(1));
    expect(billingApi.confirmCheckout).not.toHaveBeenCalled();
    expect(props.onPaid).not.toHaveBeenCalled();
});
