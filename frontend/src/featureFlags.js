// Global frontend feature flags.
// Toggle these to control behavior across the entire app.

// Signing OTP (SMS verification) feature.
// When false: no OTP UI is shown and signing flows will not require OTP on the client.
// When true: OTP UI + client-side gating is enabled (server must also support/enforce it).
export const SIGNING_OTP_ENABLED = false;
