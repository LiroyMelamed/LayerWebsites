-- Widen the otp column to hold HMAC-SHA256 hashes (64 hex chars) instead of
-- the original 6-digit plaintext OTP.
ALTER TABLE otps ALTER COLUMN otp TYPE varchar(64);
