import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useState } from 'react';
import { SignupLogoPicker } from './SignupLogoPicker';

let dimensions;
beforeEach(() => {
    dimensions = { width: 1024, height: 1024 };
    jest.spyOn(global, 'Image').mockImplementation(() => ({
        get naturalWidth() { return dimensions.width; },
        get naturalHeight() { return dimensions.height; },
        set src(value) { queueMicrotask(() => this.onload()); },
    }));
});
afterEach(() => jest.restoreAllMocks());

function choose(file) {
    fireEvent.change(screen.getByLabelText('קובץ לוגו המשרד'), { target: { files: file ? [file] : [] } });
}

test('empty upload has a Hebrew keyboard button and required format guidance', () => {
    const change = jest.fn();
    render(<SignupLogoPicker value="" onChange={change} />);
    expect(screen.getByRole('button', { name: 'בחירת קובץ לוגו' }).disabled).toBe(false);
    expect(screen.getByLabelText('קובץ לוגו המשרד').getAttribute('accept')).toBe('image/png,image/jpeg');
    choose();
    expect(change).not.toHaveBeenCalled();
});

test('a valid image is previewed with its filename and can be replaced', async () => {
    function Form() { const [value, setValue] = useState(''); return <SignupLogoPicker value={value} onChange={setValue} />; }
    render(<Form />);
    choose(new File(['synthetic'], 'לוגו המשרד.png', { type: 'image/png' }));
    await screen.findByRole('button', { name: 'החלפת הלוגו' });
    expect(screen.getByAltText('תצוגה מקדימה של לוגו המשרד').getAttribute('src')).toMatch(/^data:image\/png;base64,/);
    expect(screen.getByText('לוגו המשרד.png')).toBeTruthy();
});

test('a rejected replacement preserves the previous valid logo', () => {
    const change = jest.fn();
    render(<SignupLogoPicker value="data:image/png;base64,cHJldmlvdXM=" onChange={change} />);
    choose(new File(['not an image'], 'logo.svg', { type: 'image/svg+xml' }));
    expect(screen.getByRole('alert').textContent).toContain('PNG או JPG');
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByAltText('תצוגה מקדימה של לוגו המשרד').getAttribute('src')).toContain('cHJldmlvdXM=');
});

test('oversized images are rejected before reading', () => {
    const change = jest.fn();
    render(<SignupLogoPicker value="" onChange={change} />);
    choose(new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'large.png', { type: 'image/png' }));
    expect(screen.getByRole('alert').textContent).toContain('2MB');
    expect(change).not.toHaveBeenCalled();
});

test.each([{ width: 1024, height: 900 }, { width: 512, height: 512 }, { width: 4097, height: 4097 }])('invalid dimensions %j do not reach the signup draft', async size => {
    dimensions = size;
    const change = jest.fn();
    render(<SignupLogoPicker value="" onChange={change} />);
    choose(new File(['synthetic'], 'wrong-size.png', { type: 'image/png' }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('1,024–4,096'));
    expect(change).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'בחירת קובץ לוגו' }).disabled).toBe(false);
});

test('disabled signup prevents opening the file dialog', () => {
    render(<SignupLogoPicker value="" onChange={jest.fn()} disabled />);
    expect(screen.getByRole('button', { name: 'בחירת קובץ לוגו' }).disabled).toBe(true);
    expect(screen.getByLabelText('קובץ לוגו המשרד').disabled).toBe(true);
});
