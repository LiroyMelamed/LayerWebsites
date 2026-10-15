-- Firm-level signing policy (module enablement + client OTP requirement)
-- This table is the single source of truth for firm signing configuration.

create table if not exists firm_signing_policy (
    firmid int primary key references firms(firmid) on delete cascade,
    signing_enabled boolean not null default false,
    signing_client_otp_required boolean not null default false,
    updated_at timestamptz not null default now()
);

-- Safety: if the table already exists from an earlier run, enforce correct defaults.
alter table firm_signing_policy alter column signing_enabled set default false;
alter table firm_signing_policy alter column signing_client_otp_required set default false;

create index if not exists idx_firm_signing_policy_enabled
    on firm_signing_policy (signing_enabled);
