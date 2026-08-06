// Global frontend feature flags.
// Prefer platform_settings for product toggles so platform admins can change
// them anytime without a rebuild. Keep this file only for true build-time
// compile switches (or deprecated shims).

// Signing OTP — deprecated build-time shim.
// Runtime: platform setting SIGNING_OTP_ENABLED.
export const SIGNING_OTP_ENABLED = false;

// AI Chatbot nav — deprecated build-time shim.
// Runtime: platform setting AI_CHATBOT_ENABLED.
export const AI_CHATBOT_ENABLED = false;

// Calendar module — deprecated build-time shim.
// Runtime: platform setting ENABLE_CALENDAR_MODULE.
export const ENABLE_CALENDAR_MODULE = true;
