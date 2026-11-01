import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import FileUploadBox from './FileUploadBox';

jest.mock('react-i18next', () => ({ useTranslation: () => ({ t: key => key }) }));
jest.mock('../../simpleComponents/SimpleLoader', () => () => <span>Uploading</span>);

test.each(['Enter', ' '])('file upload trigger has a name and activates once with %j without submitting its form', key => {
    const submit = jest.fn(), changed = jest.fn();
    const view = render(<form onSubmit={submit}><FileUploadBox label="Choose Word source" accept=".docx" onFileSelected={changed} /></form>);
    const trigger = screen.getByRole('button', { name: 'Choose Word source' });
    const input = view.container.querySelector('input[type="file"]');
    const click = jest.spyOn(input, 'click');
    expect(trigger).toHaveAttribute('tabindex', '0');
    expect(trigger).toHaveAttribute('aria-disabled', 'false');
    expect(fireEvent.keyDown(trigger, { key })).toBe(false);
    expect(click).toHaveBeenCalledTimes(1);
    fireEvent.keyDown(trigger, { key, repeat: true });
    fireEvent.keyUp(trigger, { key });
    fireEvent.keyDown(trigger, { key: 'a' });
    fireEvent.keyDown(input, { key });
    expect(click).toHaveBeenCalledTimes(1);
    expect(submit).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
    click.mockRestore();
});

test('pointer activation does not bubble a second click from the hidden input, and change/drop retain the callback', () => {
    const outerClick = jest.fn(), changed = jest.fn();
    const view = render(<div onClick={outerClick}><FileUploadBox label="Choose source" onFileSelected={changed} /></div>);
    const trigger = screen.getByRole('button', { name: 'Choose source' });
    const input = view.container.querySelector('input[type="file"]');
    const click = jest.spyOn(input, 'click');
    fireEvent.click(trigger);
    expect(click).toHaveBeenCalledTimes(1); expect(outerClick).toHaveBeenCalledTimes(1);
    const first = new File(['synthetic'], 'first.docx');
    fireEvent.change(input, { target: { files: [first] } });
    expect(changed).toHaveBeenLastCalledWith(first); expect(input.value).toBe('');
    const second = new File(['synthetic'], 'second.docx');
    fireEvent.drop(trigger, { dataTransfer: { files: [second] } });
    expect(changed).toHaveBeenCalledTimes(2); expect(changed).toHaveBeenLastCalledWith(second);
    click.mockRestore();
});

test.each([{ disabled: true }, { uploading: true }])('disabled or uploading trigger stays named but cannot activate or drop: %j', props => {
    const changed = jest.fn();
    const view = render(<FileUploadBox label="Choose source" onFileSelected={changed} {...props} />);
    const trigger = screen.getByRole('button', { name: 'Choose source' });
    const input = view.container.querySelector('input[type="file"]');
    const click = jest.spyOn(input, 'click');
    expect(trigger).toHaveAttribute('tabindex', '-1'); expect(trigger).toHaveAttribute('aria-disabled', 'true'); expect(input).toBeDisabled();
    fireEvent.keyDown(trigger, { key: 'Enter' }); fireEvent.keyDown(trigger, { key: ' ' }); fireEvent.click(trigger);
    fireEvent.drop(trigger, { dataTransfer: { files: [new File(['synthetic'], 'source.docx')] } });
    expect(click).not.toHaveBeenCalled(); expect(changed).not.toHaveBeenCalled();
    click.mockRestore();
});
