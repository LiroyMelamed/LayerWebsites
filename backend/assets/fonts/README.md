# Hebrew PDF font

`NotoSansHebrew-Regular.ttf` is bundled in Git so a clean checkout can generate
Hebrew PDFs and run `tests/signatureDetection.geometry.test.js` without a manual
font download. Keep this file and its license together when packaging the backend.

## Provenance

- Upstream: https://github.com/notofonts/noto-fonts
- Immutable revision: `ffebf8c1ee449e544955a7e813c54f9b73848eac`
- Font: https://raw.githubusercontent.com/notofonts/noto-fonts/ffebf8c1ee449e544955a7e813c54f9b73848eac/hinted/ttf/NotoSansHebrew/NotoSansHebrew-Regular.ttf
- SHA-256: `a7fa16fffb27bedb060a0866267c29e9859aeb9c21cc33f5b3aaf6eb062eca85`
- License: SIL Open Font License 1.1; upstream copyright and complete license
  are included unchanged in `OFL.txt` from the same revision.
- The font binary is unmodified.

The evidence certificate generator prefers this font, then falls back to optional
`Rubik-Regular.ttf` or `Assistant-Regular.ttf`. Those optional local fonts remain
ignored by Git. The geometry test deliberately uses the bundled font for stable
fixture metrics.

From `backend/`, run:

```sh
node --test tests/signatureDetection.geometry.test.js
```
