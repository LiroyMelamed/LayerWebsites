// Deterministic mapping from signerId to signer color index (0..N-1)
export function signerColorIndex(signerId, paletteSize = 8) {
  if (signerId === undefined || signerId === null) return 0;
  const s = String(signerId);
  // simple hash
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % paletteSize;
}

export function signerColorClass(signerId, paletteSize = 8) {
  const idx = signerColorIndex(signerId, paletteSize);
  return `lw-signer-color-${idx}`;
}

export function signerPaletteIndex(signerId, paletteSize = 4) {
  if (signerId === undefined || signerId === null) return 0;
  const s = String(signerId);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % paletteSize;
}

export function signerPaletteClass(signerId, paletteSize = 4) {
  const idx = signerPaletteIndex(signerId, paletteSize);
  return `lw-signer-palette-${idx}`;
}
