// Global frontend feature flags.
// Toggle these to control behavior across the entire app.

// Signing OTP (SMS verification) — deprecated build-time flag.
// Runtime source of truth is platform setting SIGNING_OTP_ENABLED
// (admin UI + API file.OtpEnabled). Keep false; do not gate UI on this.
export const SIGNING_OTP_ENABLED = false;

// AI Chatbot feature.
// When false: the /chatbot route is hidden from navigation (page still accessible via direct URL).
// When true: chatbot link is visible in the app navigation.
// Set to false until the navigation entry is wired up.
export const AI_CHATBOT_ENABLED = false;

// Calendar module.
// When true: CalendarScreen and the dashboard widget are visible.
// Requires backend migration 2026-06-05_00_create_calendar_tables.sql to be applied.
export const ENABLE_CALENDAR_MODULE = true;
