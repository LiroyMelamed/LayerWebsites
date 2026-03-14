// Global frontend feature flags.
// Toggle these to control behavior across the entire app.

// Signing OTP (SMS verification) feature.
// When false: no OTP UI is shown and signing flows will not require OTP on the client.
// When true: OTP UI + client-side gating is enabled (server must also support/enforce it).
export const SIGNING_OTP_ENABLED = false;

// AI Chatbot feature.
// When false: the /chatbot route is hidden from navigation (page still accessible via direct URL).
// When true: chatbot link is visible in the app navigation.
export const AI_CHATBOT_ENABLED = true;
