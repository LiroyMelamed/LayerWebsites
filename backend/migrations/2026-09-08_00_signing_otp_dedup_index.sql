-- Prevent duplicate active (unverified, unexpired) OTP challenges for the same
-- signing session. The partial unique index ensures that at most ONE unverified
-- challenge can exist per (signingfileid, signeruserid, signingsessionid) at a
-- time. INSERT ... ON CONFLICT DO NOTHING in the controller makes creation atomic.
--
-- Verified or expired challenges are excluded (verified=false filter), so
-- legitimate sequential OTPs (after verify or expiry) are not blocked.

CREATE UNIQUE INDEX IF NOT EXISTS signing_otp_challenges_active_session_uniq
    ON signing_otp_challenges (signingfileid, signeruserid, signingsessionid)
    WHERE verified = false;
