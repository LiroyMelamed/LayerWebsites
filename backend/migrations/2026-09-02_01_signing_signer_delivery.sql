-- Per-signer delivery channel preference for pending signing invites (phone vs email).

CREATE TABLE IF NOT EXISTS signing_signer_delivery (
    signing_file_id INTEGER NOT NULL REFERENCES signingfiles(signingfileid) ON DELETE CASCADE,
    signer_user_id  INTEGER NOT NULL REFERENCES users(userid) ON DELETE CASCADE,
    delivery_method VARCHAR(16) NOT NULL DEFAULT 'phone',
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (signing_file_id, signer_user_id)
);

CREATE INDEX IF NOT EXISTS idx_signing_signer_delivery_signer
    ON signing_signer_delivery (signer_user_id);
