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

/** Prefer ordinal signer index (0,1,2…) so adjacent signers never collide. */
export function signerPaletteIndex(signerIdOrIndex, paletteSize = 4) {
  if (signerIdOrIndex === undefined || signerIdOrIndex === null) return 0;
  const asNum = Number(signerIdOrIndex);
  // Numeric index / small ordinal → use directly (no hash).
  if (Number.isInteger(asNum) && asNum >= 0 && asNum < 64) {
    return asNum % paletteSize;
  }
  const s = String(signerIdOrIndex);
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % paletteSize;
}

export function signerPaletteClass(signerIdOrIndex, paletteSize = 4) {
  const idx = signerPaletteIndex(signerIdOrIndex, paletteSize);
  return `lw-signer-palette-${idx}`;
}

/** Always use list ordinal for spot colors (guarantees distinct signers). */
export function signerPaletteClassByIndex(signerIndex, paletteSize = 4) {
  const idx = Math.abs(Number(signerIndex) || 0) % paletteSize;
  return `lw-signer-palette-${idx}`;
}
