// Private component/effect code is read from the actual candidate (or its
// immutable pre-repair backup), then run with React. No copied reset logic.
import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');
const babel = require('@babel/core');
const traverse = require('@babel/traverse').default;

function source(rel) {
  const root = process.env.CI_REPAIR_BASELINE === 'true'
    ? path.resolve(process.cwd(), '../../ci-repair-20261005/before') : process.cwd();
  return fs.readFileSync(path.join(root, rel), 'utf8');
}
function definitions(rel, names, bindings) {
  const text = source(rel);
  const ast = parser.parse(text, { sourceType: 'module', plugins: ['jsx'] });
  const nodes = ast.program.body.filter(n => names.includes(n.id?.name) || n.declarations?.some(d => names.includes(d.id.name)));
  const fragment = nodes.map(n => text.slice(n.start, n.end)).join('\n');
  const code = babel.transformSync(fragment, { babelrc: false, configFile: false, plugins: ['@babel/plugin-transform-react-jsx'] }).code;
  return new Function(...Object.keys(bindings), code + `\nreturn ${names[names.length - 1]};`)(...Object.values(bindings));
}
const Box = ({ children }) => <div>{children}</div>;
const Button = ({ children, onPress, disabled }) => <button onClick={onPress} disabled={disabled}>{children}</button>;
const translate = key => key;

test('template refresh preserves an unsaved subject and HTML mode; selecting another template resets them', () => {
  const Editor = definitions('src/screens/platformSettingsScreen/PlatformSettingsScreen.js',
    ['CONTENT_DIV_REGEX', 'htmlToPlainText', 'plainTextToHtml', 'EmailTemplateEditor'], {
      React, useState: React.useState, useEffect: React.useEffect, useRef: React.useRef,
      useCallback: React.useCallback, useMemo: React.useMemo, useTranslation: () => ({ t: translate }),
      withLogoCacheBust: value => value, SimpleContainer: Box, Text12: Box, TextBold14: Box,
      SimpleInput: ({ value, onChange, title }) => <input aria-label={title} value={value} onChange={onChange} />,
      SimpleTextArea: ({ value, onChange, title }) => <textarea aria-label={title} value={value} onChange={e => onChange(e.target.value)} />,
      PrimaryButton: Button, SecondaryButton: Button, TertiaryButton: Button, TemplateAttachmentsSection: () => null,
    });
  const template = { template_key: 'A', subject_template: 'First', html_body: '<div style="font-size:1rem;line-height:1.7;">First body</div>', available_vars: [] };
  const view = render(<Editor template={template} />);
  fireEvent.change(screen.getByLabelText('platformSettings.subject'), { target: { value: 'Unsaved subject' } });
  fireEvent.click(screen.getByText('platformSettings.editHtmlCode'));
  view.rerender(<Editor template={{ ...template, subject_template: 'Server refresh', html_body: '<div>Refresh</div>' }} />);
  expect(screen.getByLabelText('platformSettings.subject').value).toBe('Unsaved subject');
  expect(screen.getByText('platformSettings.backToSimple')).toBeTruthy();
  view.rerender(<Editor template={{ ...template, template_key: 'B', subject_template: 'Second' }} />);
  expect(screen.getByLabelText('platformSettings.subject').value).toBe('Second');
  expect(screen.getByText('platformSettings.editHtmlCode')).toBeTruthy();
});

test('button style follows disabled/pressed props while blocked actions cannot fire', () => {
  const Wrapped = React.forwardRef(({ children, onPress, ...props }, ref) =>
    <button ref={ref} onClick={onPress} onMouseDown={props.onMouseDown} onMouseUp={props.onMouseUp} disabled={props.disabled}>{children}</button>);
  const Generic = definitions('src/components/styledComponents/buttons/GenericButton.js', ['getButtonHeightBySize', 'GenericButton'], {
    React, forwardRef: React.forwardRef, useState: React.useState, useEffect: React.useEffect, useRef: React.useRef,
    useCallback: React.useCallback, colors: { transparent: 'transparent', black: '#000000' },
    buttonSizes: { SMALL: 'SMALL_BUTTON', MEDIUM: 'MEDIUM_BUTTON', LARGE: 'LARGE_BUTTON' },
    TextButtonWithTwoOptionalIcons: Wrapped, SimpleLoader: () => null,
  });
  const press = jest.fn();
  const props = { backgroundColor: '#123456', pressedBackgroundColor: '#abcdef', disabledBackgroundColor: '#222222', onPress: press };
  const view = render(<Generic {...props}>Action</Generic>);
  const button = screen.getByRole('button');
  expect(button.style.backgroundColor).toBe('rgb(18, 52, 86)');
  fireEvent.mouseDown(button);
  expect(button.style.backgroundColor).toBe('rgb(171, 205, 239)');
  view.rerender(<Generic {...props} disabled>Action</Generic>);
  expect(button.style.backgroundColor).toBe('rgb(34, 34, 34)');
  fireEvent.click(button); expect(press).not.toHaveBeenCalled();
  view.rerender(<Generic {...props} isPerforming>Action</Generic>);
  fireEvent.click(button); expect(press).not.toHaveBeenCalled();
});

test('translation updates preserve drawn signature; changing field or stamp phase clears it', () => {
  const text = source('src/components/specializedComponents/signFiles/SignatureCanvas.js');
  const ast = parser.parse(text, { sourceType: 'module', plugins: ['jsx'] });
  let effect;
  traverse(ast, { CallExpression(p) {
    if (p.node.callee.name === 'useEffect' && text.slice(p.node.start, p.node.end).includes('ctx.clearRect(0, 0, canvas.width, canvas.height)')) effect = text.slice(p.node.start, p.node.end);
  } });
  expect(effect).toBeTruthy();
  const runEffect = new Function('useEffect', 'canvasRef', 'initializedCanvasRef', 'currentSpot', 'stampSignPhase', 't', 'setHasUserDrawn', 'lastPointRef', effect);
  let pixels = '';
  const ctx = { clearRect: jest.fn(() => { pixels = ''; }), fillText: jest.fn() };
  const canvas = { getContext: () => ctx };
  function Harness({ spot, phase = false, t = translate }) {
    const initialized = React.useRef(null), lastPoint = React.useRef(null);
    runEffect(React.useEffect, { current: canvas }, initialized, spot, phase, t, jest.fn(), lastPoint);
    return <span>Canvas harness</span>;
  }
  const spot = { id: 1 }; const view = render(<Harness spot={spot} />);
  pixels = 'user signature';
  view.rerender(<Harness spot={spot} t={key => 'translated ' + key} />);
  expect(pixels).toBe('user signature'); expect(ctx.clearRect).toHaveBeenCalledTimes(1);
  const secondSpot = { id: 2 };
  view.rerender(<Harness spot={secondSpot} />);
  expect(pixels).toBe(''); expect(ctx.clearRect).toHaveBeenCalledTimes(2);
  view.rerender(<Harness spot={secondSpot} phase />);
  expect(ctx.clearRect).toHaveBeenCalledTimes(3);
});
