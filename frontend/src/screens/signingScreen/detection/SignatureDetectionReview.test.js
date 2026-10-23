import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import SignatureDetectionReview from './SignatureDetectionReview';
import '@testing-library/jest-dom';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: (key, args = {}) => {
    let value = key.split('.').reduce((v, part) => v?.[part], require('../../../i18n/locales/en.json')) || key;
    for (const [name, entry] of Object.entries(args)) value = value.replace(`{{${name}}}`, entry);
    return value;
} }) }));
jest.mock('../../../components/styledComponents/buttons/PrimaryButton', () => ({ children, onPress, disabled }) => <button disabled={disabled} onClick={onPress}>{children}</button>);
jest.mock('../../../components/styledComponents/buttons/SecondaryButton', () => ({ children, onPress }) => <button onClick={onPress}>{children}</button>);
jest.mock('../templates/SigningSelect', () => props => <select {...props} />);

const signer = { UserId: 13, Name: 'Tenant' };
const spot = { pageNum: 2, x: 50, y: 100, width: 160, height: 50, assignmentStatus: 'unassigned' };

test('even one signer needs an explicit assignment for an unresolved proposal', () => {
    const apply = jest.fn(); render(<SignatureDetectionReview review={{ spots: [spot] }} signers={[signer]} onApply={apply} onDismiss={() => {}} />);
    expect(screen.getByRole('button', { name: 'Add selected locations' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Signer for location 1'), { target: { value: '13' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add selected locations' }));
    expect(apply).toHaveBeenCalledWith([expect.objectContaining({ signerUserId: 13, signerIndex: 0, assignmentStatus: 'reviewed', pageNum: 2 })]);
});

test('can exclude an ambiguous proposal while accepting another matched location', () => {
    const apply = jest.fn(); render(<SignatureDetectionReview review={{ spots: [{ ...spot, signerUserId: 13, assignmentStatus: 'matched' }, spot] }} signers={[signer]} onApply={apply} onDismiss={() => {}} />);
    fireEvent.click(screen.getAllByRole('checkbox')[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Add selected locations' }));
    expect(apply.mock.calls[0][0]).toHaveLength(1);
});

test('empty text-layer result explains the limit and can be dismissed without applying', () => {
    const dismiss = jest.fn(), apply = jest.fn(); render(<SignatureDetectionReview review={{ spots: [], noTextPages: [1] }} signers={[]} onApply={apply} onDismiss={dismiss} />);
    expect(screen.getByText(/no readable text layer/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Finish without adding' }));
    expect(dismiss).toHaveBeenCalledTimes(1); expect(apply).not.toHaveBeenCalled();
});

test.each([{ spots: [] }, { spots: [spot] }])('cramped signing lines truthfully require manual placement even when some proposals remain', ({ spots }) => {
    render(<SignatureDetectionReview review={{ spots, crampedSignatureCount: 1 }} signers={[signer]} onApply={jest.fn()} onDismiss={jest.fn()} />);
    expect(screen.getByText(/enough room for a safe field/)).toBeInTheDocument();
    expect(screen.queryByText('No automatic signature spots found. You can add manually.')).not.toBeInTheDocument();
});
