# MelamedLaw Database — Column Schema Report

**Generated:** September 06, 2026  
**Source:** Production PostgreSQL `melamedlaw` (live query)  
**Scope:** `public` schema — columns only (no row data)

---

## Summary

| Metric | Value |
|--------|-------|
| Database | `melamedlaw` |
| Schema | `public` |
| Tables | **49** |
| Total columns | **504** |
| Architecture | Single-DB-per-firm (MelamedLaw tenant) |

---

## 1. Users & Auth (4 tables, 32 columns)

### `users` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `userid` | integer | NO | nextval('users_userid_seq'::regclass) |
| `name` | character varying | YES | — |
| `email` | character varying | YES | — |
| `phonenumber` | character varying | YES | — |
| `passwordhash` | character varying | YES | — |
| `role` | character varying | YES | — |
| `companyname` | character varying | YES | — |
| `createdat` | timestamp with time zone | YES | now() |
| `dateofbirth` | date | YES | — |
| `profilepicurl` | text | YES | — |

### `refresh_tokens` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `refresh_token_id` | bigint | NO | nextval('refresh_tokens_refresh_token_id_seq'::regclass) |
| `userid` | integer | NO | — |
| `token_hash` | text | NO | — |
| `created_at` | timestamp with time zone | NO | now() |
| `expires_at` | timestamp with time zone | NO | — |
| `revoked_at` | timestamp with time zone | YES | — |
| `replaced_by_token_hash` | text | YES | — |
| `user_agent` | text | YES | — |
| `ip_address` | text | YES | — |

### `otps` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `phonenumber` | character varying | YES | — |
| `otp` | character varying | NO | — |
| `expiry` | timestamp with time zone | NO | — |
| `userid` | integer | NO | — |
| `createdat` | timestamp with time zone | YES | now() |
| `email` | character varying | YES | — |
| `id` | integer | NO | nextval('otps_id_seq'::regclass) |

### `platform_admins` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('platform_admins_id_seq'::regclass) |
| `user_id` | integer | NO | — |
| `name` | character varying | YES | — |
| `added_by` | integer | YES | — |
| `added_at` | timestamp with time zone | NO | now() |
| `is_active` | boolean | NO | true |

---

## 2. Cases & CRM (7 tables, 48 columns)

### `cases` (17 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `caseid` | integer | NO | nextval('cases_caseid_seq'::regclass) |
| `casename` | character varying | YES | — |
| `casetypeid` | integer | YES | — |
| `userid` | integer | YES | — |
| `companyname` | character varying | YES | — |
| `currentstage` | integer | YES | — |
| `isclosed` | boolean | YES | — |
| `istagged` | boolean | YES | — |
| `createdat` | timestamp with time zone | YES | now() |
| `updatedat` | timestamp with time zone | YES | — |
| `casetypename` | character varying | YES | — |
| `whatsappgrouplink` | text | YES | — |
| `casemanager` | character varying | YES | — |
| `casemanagerid` | integer | YES | — |
| `estimatedcompletiondate` | date | YES | — |
| `licenseexpirydate` | date | YES | — |
| `haslicenseexpiry` | boolean | NO | false |

### `case_users` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('case_users_id_seq'::regclass) |
| `caseid` | integer | NO | — |
| `userid` | integer | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

### `casetypes` (3 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `casetypeid` | integer | NO | nextval('casetypes_casetypeid_seq'::regclass) |
| `casetypename` | character varying | YES | — |
| `numberofstages` | integer | YES | — |

### `casetypedescriptions` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `casetypedescriptionid` | integer | NO | nextval('casetypedescriptions_casetypedescriptionid_seq'::re |
| `casetypeid` | integer | YES | — |
| `stage` | integer | YES | — |
| `text` | text | YES | — |

### `casedescriptions` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `descriptionid` | integer | NO | nextval('casedescriptions_descriptionid_seq'::regclass) |
| `caseid` | integer | YES | — |
| `stage` | integer | YES | — |
| `text` | text | YES | — |
| `timestamp` | timestamp with time zone | YES | now() |
| `isnew` | boolean | YES | — |

### `stage_files` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('stage_files_id_seq'::regclass) |
| `caseid` | integer | NO | — |
| `stage` | integer | NO | — |
| `file_key` | text | NO | — |
| `file_name` | character varying | NO | — |
| `file_ext` | character varying | YES | — |
| `file_mime` | character varying | YES | — |
| `file_size` | bigint | YES | — |
| `uploaded_by` | integer | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

### `uploadedfiles` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `uploadedfileid` | integer | NO | nextval('uploadedfiles_uploadedfileid_seq'::regclass) |
| `caseid` | integer | YES | — |
| `filepath` | text | YES | — |
| `uploaddate` | timestamp with time zone | YES | now() |

---

## 3. Digital Signing (9 tables, 148 columns)

### `signingfiles` (48 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `signingfileid` | integer | NO | — |
| `caseid` | integer | YES | — |
| `lawyerid` | integer | NO | — |
| `clientid` | integer | YES | — |
| `filename` | text | NO | — |
| `filekey` | text | YES | — |
| `originalfilekey` | text | YES | — |
| `status` | text | YES | — |
| `notes` | text | YES | — |
| `createdat` | timestamp with time zone | NO | now() |
| `expiresat` | timestamp with time zone | YES | — |
| `signedfilekey` | text | YES | — |
| `signedat` | timestamp with time zone | YES | — |
| `rejectionreason` | text | YES | — |
| `requireotp` | boolean | NO | false |
| `signingpolicyversion` | text | NO | '2026-01-11'::text |
| `policyselectedbyuserid` | integer | YES | — |
| `policyselectedatutc` | timestamp with time zone | YES | — |
| `otpwaiveracknowledged` | boolean | NO | false |
| `otpwaiveracknowledgedatutc` | timestamp with time zone | YES | — |
| `otpwaiveracknowledgedbyuserid` | integer | YES | — |
| `originalpdfsha256` | text | YES | — |
| `presentedpdfsha256` | text | YES | — |
| `signedpdfsha256` | text | YES | — |
| `originalstoragebucket` | text | YES | — |
| `originalstoragekey` | text | YES | — |
| `originalstorageetag` | text | YES | — |
| `originalstorageversionid` | text | YES | — |
| `signedstoragebucket` | text | YES | — |
| `signedstoragekey` | text | YES | — |
| `signedstorageetag` | text | YES | — |
| `signedstorageversionid` | text | YES | — |
| `immutableatutc` | timestamp with time zone | YES | — |
| `otpwaivedbyuserid` | integer | YES | — |
| `otpwaivedatutc` | timestamp with time zone | YES | — |
| `legalhold` | boolean | NO | false |
| `legalholdatutc` | timestamp with time zone | YES | — |
| `legalholdreason` | text | YES | — |
| `pendingdeleteatutc` | timestamp with time zone | YES | — |
| `pendingdeletereason` | text | YES | — |
| `plan_key_at_signing` | text | YES | — |
| `retention_days_core_at_signing` | integer | YES | — |
| `retention_days_pii_at_signing` | integer | YES | — |
| `retention_policy_hash_at_signing` | text | YES | — |
| `unsignedpdfbytes` | bigint | YES | — |
| `signedpdfbytes` | bigint | YES | — |
| `signingorder` | text | NO | 'parallel'::text |
| `completionemail` | character varying | YES | NULL::character varying |

### `signaturespots` (27 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `signaturespotid` | integer | NO | — |
| `signingfileid` | integer | NO | — |
| `pagenumber` | integer | NO | 1 |
| `x` | double precision | NO | 0 |
| `y` | double precision | NO | 0 |
| `width` | double precision | NO | 150 |
| `height` | double precision | NO | 75 |
| `signername` | text | YES | — |
| `isrequired` | boolean | NO | true |
| `issigned` | boolean | NO | false |
| `signaturedata` | text | YES | — |
| `signedat` | timestamp with time zone | YES | — |
| `createdat` | timestamp with time zone | NO | now() |
| `signeruserid` | integer | YES | — |
| `signerip` | inet | YES | — |
| `signeruseragent` | text | YES | — |
| `signingsessionid` | uuid | YES | — |
| `presentedpdfsha256` | text | YES | — |
| `otpverificationid` | uuid | YES | — |
| `consentid` | uuid | YES | — |
| `signatureimagesha256` | text | YES | — |
| `signaturestorageetag` | text | YES | — |
| `signaturestorageversionid` | text | YES | — |
| `fieldtype` | text | NO | 'signature'::text |
| `signerindex` | integer | YES | — |
| `fieldlabel` | text | YES | — |
| `fieldvalue` | text | YES | — |

### `signing_consents` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `consentid` | uuid | NO | — |
| `signingfileid` | integer | NO | — |
| `signeruserid` | integer | YES | — |
| `signingsessionid` | uuid | NO | — |
| `consentversion` | text | NO | — |
| `consenttextsha256` | text | NO | — |
| `acceptedatutc` | timestamp with time zone | NO | — |
| `ip` | inet | YES | — |
| `user_agent` | text | YES | — |

### `signing_otp_challenges` (21 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `challengeid` | uuid | NO | — |
| `signingfileid` | integer | NO | — |
| `signeruserid` | integer | YES | — |
| `signingsessionid` | uuid | NO | — |
| `phone_e164` | text | YES | — |
| `presentedpdfsha256` | text | NO | — |
| `otp_hash` | text | NO | — |
| `otp_salt` | text | NO | — |
| `provider_message_id` | text | YES | — |
| `sent_at_utc` | timestamp with time zone | NO | — |
| `expires_at_utc` | timestamp with time zone | NO | — |
| `attempt_count` | integer | NO | 0 |
| `locked_until_utc` | timestamp with time zone | YES | — |
| `verified_at_utc` | timestamp with time zone | YES | — |
| `verified` | boolean | NO | false |
| `request_ip` | inet | YES | — |
| `request_user_agent` | text | YES | — |
| `verify_ip` | inet | YES | — |
| `verify_user_agent` | text | YES | — |
| `email` | text | YES | — |
| `delivery_channel` | text | NO | 'sms'::text |

### `signing_file_reminders` (12 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('signing_file_reminders_id_seq'::regclass) |
| `signing_file_id` | integer | NO | — |
| `signer_user_id` | integer | NO | — |
| `scheduled_for` | timestamp with time zone | NO | — |
| `status` | text | NO | 'PENDING'::text |
| `auto_managed` | boolean | NO | true |
| `offset_hours` | integer | NO | — |
| `invited_at` | timestamp with time zone | NO | now() |
| `error` | text | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `sent_at` | timestamp with time zone | YES | — |
| `cancelled_at` | timestamp with time zone | YES | — |

### `signing_signer_delivery` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `signing_file_id` | integer | NO | — |
| `signer_user_id` | integer | NO | — |
| `delivery_method` | character varying | NO | 'phone'::character varying |
| `updated_at` | timestamp with time zone | NO | now() |

### `signing_short_links` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `slug` | character varying | NO | — |
| `token` | text | NO | — |
| `expires_at` | timestamp with time zone | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

### `signing_retention_warnings` (8 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `warning_id` | uuid | NO | — |
| `tenant_id` | integer | NO | — |
| `signingfileid` | integer | NO | — |
| `warn_at_utc` | timestamp with time zone | NO | — |
| `created_at` | timestamp with time zone | NO | now() |
| `status` | text | NO | 'scheduled'::text |
| `sent_at_utc` | timestamp with time zone | YES | — |
| `metadata` | jsonb | NO | '{}'::jsonb |

### `audit_events` (15 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `eventid` | uuid | NO | — |
| `occurred_at_utc` | timestamp with time zone | NO | now() |
| `event_type` | text | NO | — |
| `signingfileid` | integer | YES | — |
| `signaturespotid` | integer | YES | — |
| `actor_userid` | integer | YES | — |
| `actor_type` | text | YES | — |
| `ip` | inet | YES | — |
| `user_agent` | text | YES | — |
| `signing_session_id` | uuid | YES | — |
| `request_id` | uuid | YES | — |
| `success` | boolean | NO | true |
| `metadata` | jsonb | NO | '{}'::jsonb |
| `prev_event_hash` | text | YES | — |
| `event_hash` | text | YES | — |

---

## 4. Calendar (6 tables, 86 columns)

### `calendar_events` (43 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('calendar_events_id_seq'::regclass) |
| `owner_id` | integer | NO | — |
| `case_id` | integer | YES | — |
| `title` | text | NO | — |
| `description` | text | YES | — |
| `location` | text | YES | — |
| `start_time` | timestamp with time zone | NO | — |
| `end_time` | timestamp with time zone | NO | — |
| `all_day` | boolean | NO | false |
| `rrule` | text | YES | — |
| `google_event_id` | text | YES | — |
| `reminder_sent_30m` | boolean | NO | false |
| `reminder_sent_1d` | boolean | NO | false |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `client_name` | text | YES | — |
| `manager_name` | text | YES | — |
| `color` | text | YES | — |
| `client_user_id` | integer | YES | — |
| `manager_user_id` | integer | YES | — |
| `event_type` | text | NO | 'appointment'::text |
| `lead_name` | text | YES | — |
| `lead_phone` | text | YES | — |
| `lead_email` | text | YES | — |
| `last_reminder_sent_at` | timestamp with time zone | YES | — |
| `lead_case_name` | text | YES | — |
| `outlook_event_id` | text | YES | — |
| `reminder_offsets` | jsonb | NO | '[]'::jsonb |
| `reminders_sent_offsets` | jsonb | NO | '[]'::jsonb |
| `reminder_channels` | jsonb | NO | '{"sms": false, "push": false, "email": false}'::jsonb |
| `reminder_targets` | jsonb | NO | '{"client": true, "managers": true}'::jsonb |
| `invite_status` | text | NO | 'none'::text |
| `invite_token` | text | YES | — |
| `invite_responded_at` | timestamp with time zone | YES | — |
| `client_reminder_sms` | text | YES | — |
| `invite_sms` | text | YES | — |
| `lawyer_reminder_offsets` | jsonb | NO | '[]'::jsonb |
| `client_reminder_offsets` | jsonb | NO | '[]'::jsonb |
| `reminder_deferred_until` | jsonb | NO | '{}'::jsonb |
| `invite_deferred_until` | timestamp with time zone | YES | — |
| `meeting_type` | character varying | YES | — |
| `lead_participants` | jsonb | NO | '[]'::jsonb |
| `updated_by` | integer | YES | — |

### `calendar_event_clients` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `event_id` | integer | NO | — |
| `user_id` | integer | NO | — |
| `invite_token` | text | YES | — |
| `invite_status` | text | NO | 'none'::text |
| `invite_responded_at` | timestamp with time zone | YES | — |
| `sort_order` | integer | NO | 0 |

### `calendar_event_managers` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('calendar_event_managers_id_seq'::regclass) |
| `event_id` | integer | NO | — |
| `user_id` | integer | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

### `user_calendar_tokens` (16 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `user_id` | integer | NO | — |
| `ical_feed_token` | text | YES | — |
| `google_connected` | boolean | NO | false |
| `google_email` | text | YES | — |
| `google_access_token` | text | YES | — |
| `google_refresh_token` | text | YES | — |
| `google_token_expiry` | timestamp with time zone | YES | — |
| `google_scope` | text | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `outlook_connected` | boolean | NO | false |
| `outlook_email` | text | YES | — |
| `outlook_access_token` | text | YES | — |
| `outlook_refresh_token` | text | YES | — |
| `outlook_token_expiry` | timestamp with time zone | YES | — |
| `outlook_scope` | text | YES | — |

### `holidays_date` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('holidays_date_id_seq'::regclass) |
| `holiday_date` | date | NO | — |
| `title` | text | NO | — |
| `title_he` | text | YES | — |
| `category` | text | NO | 'holiday'::text |
| `hebcal_uid` | text | YES | — |
| `is_business_day` | boolean | NO | false |
| `source` | text | NO | 'hebcal'::text |
| `synced_at` | timestamp with time zone | NO | now() |
| `created_at` | timestamp with time zone | NO | now() |

### `user_daily_agenda_settings` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `user_id` | integer | NO | — |
| `enabled` | boolean | NO | false |
| `channels` | text | NO | 'email'::text |
| `recipients` | text | NO | ''::text |
| `send_time` | text | NO | '07:30'::text |
| `last_sent_date` | text | NO | ''::text |
| `updated_at` | timestamp with time zone | NO | now() |

---

## 5. Notifications & Messaging (6 tables, 47 columns)

### `usernotifications` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `notificationid` | integer | NO | nextval('usernotifications_notificationid_seq'::regclass) |
| `userid` | integer | NO | — |
| `title` | character varying | YES | — |
| `message` | text | YES | — |
| `isread` | boolean | YES | false |
| `createdat` | timestamp with time zone | YES | now() |
| `data` | jsonb | YES | — |

### `userdevices` (5 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `deviceid` | integer | NO | nextval('userdevices_deviceid_seq'::regclass) |
| `userid` | integer | YES | — |
| `fcmtoken` | character varying | NO | — |
| `devicetype` | character varying | YES | — |
| `createdat` | timestamp with time zone | YES | now() |

### `notification_channel_config` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('notification_channel_config_id_seq'::regclass) |
| `notification_type` | character varying | NO | — |
| `label` | character varying | YES | — |
| `push_enabled` | boolean | NO | true |
| `email_enabled` | boolean | NO | true |
| `sms_enabled` | boolean | NO | true |
| `updated_by` | integer | YES | — |
| `updated_at` | timestamp with time zone | NO | now() |
| `admin_cc` | boolean | NO | false |
| `manager_cc` | boolean | NO | true |

### `message_delivery_events` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | gen_random_uuid() |
| `channel` | text | NO | — |
| `type` | text | YES | — |
| `idempotency_key` | text | YES | — |
| `metadata` | jsonb | YES | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |

### `scheduled_email_reminders` (15 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('scheduled_email_reminders_id_seq'::regclass) |
| `user_id` | integer | YES | — |
| `client_name` | text | NO | — |
| `to_email` | text | NO | — |
| `subject` | text | YES | — |
| `template_key` | text | NO | 'GENERAL'::text |
| `template_data` | jsonb | NO | '{}'::jsonb |
| `scheduled_for` | timestamp with time zone | NO | — |
| `status` | text | NO | 'PENDING'::text |
| `error` | text | YES | — |
| `created_by` | integer | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `sent_at` | timestamp with time zone | YES | — |
| `cancelled_at` | timestamp with time zone | YES | — |
| `calendar_event_id` | integer | YES | — |

### `birthday_greetings_sent` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('birthday_greetings_sent_id_seq'::regclass) |
| `user_id` | integer | NO | — |
| `sent_date` | date | NO | CURRENT_DATE |
| `sent_at` | timestamp with time zone | NO | now() |

---

## 6. Email & Templates (3 tables, 25 columns)

### `email_templates` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `template_key` | character varying | NO | — |
| `label` | character varying | NO | — |
| `subject_template` | text | NO | ''::text |
| `html_body` | text | NO | ''::text |
| `available_vars` | jsonb | NO | '[]'::jsonb |
| `updated_at` | timestamp with time zone | NO | now() |
| `updated_by` | integer | YES | — |

### `reminder_templates` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('reminder_templates_id_seq'::regclass) |
| `template_key` | character varying | NO | — |
| `label` | character varying | NO | — |
| `description` | text | YES | ''::text |
| `subject_template` | text | NO | 'תזכורת: [[subject]]'::text |
| `body_html` | text | NO | 'שלום [[client_name]],<br><br>[[body]]<br><br>בברכה,<br>[[fi |
| `created_by` | integer | YES | — |
| `created_at` | timestamp with time zone | YES | now() |
| `updated_at` | timestamp with time zone | YES | now() |

### `template_attachments` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('template_attachments_id_seq'::regclass) |
| `template_type` | character varying | NO | — |
| `template_key` | character varying | NO | — |
| `file_key` | text | NO | — |
| `filename` | character varying | NO | — |
| `mime_type` | character varying | NO | 'application/octet-stream'::character varying |
| `file_size` | integer | NO | 0 |
| `uploaded_by` | integer | YES | — |
| `created_at` | timestamp with time zone | YES | now() |

---

## 7. Billing & Subscriptions (7 tables, 80 columns)

### `firm_billing` (16 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | 1 |
| `platform_id` | text | NO | 'site_app'::text |
| `resource_id` | text | NO | 'pro'::text |
| `signing_id` | text | NO | '500'::text |
| `price_monthly_ils` | numeric | NO | 0 |
| `status` | text | NO | 'complimentary'::text |
| `billing_enabled` | boolean | NO | true |
| `complimentary_until` | timestamp with time zone | YES | — |
| `renews_at` | timestamp with time zone | YES | — |
| `grace_until` | timestamp with time zone | YES | — |
| `last_payment_error` | text | YES | — |
| `last_failed_at` | timestamp with time zone | YES | — |
| `last_paid_at` | timestamp with time zone | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `billing_interval` | text | NO | 'monthly'::text |

### `firm_payment_methods` (10 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('firm_payment_methods_id_seq'::regclass) |
| `provider` | text | NO | 'takbull'::text |
| `token_encrypted` | text | NO | — |
| `last4` | text | YES | — |
| `exp_month` | text | YES | — |
| `exp_year` | text | YES | — |
| `card_brand` | text | YES | — |
| `is_active` | boolean | NO | true |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |

### `firm_payment_intents` (14 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | uuid | NO | — |
| `kind` | text | NO | — |
| `status` | text | NO | 'pending'::text |
| `amount_ils` | numeric | NO | — |
| `currency` | text | NO | 'ILS'::text |
| `order_reference` | text | NO | — |
| `takbull_uniq_id` | text | YES | — |
| `takbull_transaction_id` | text | YES | — |
| `purpose` | text | YES | — |
| `error_message` | text | YES | — |
| `package_snapshot` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `settled_at` | timestamp with time zone | YES | — |

### `firm_payment_events` (5 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('firm_payment_events_id_seq'::regclass) |
| `intent_id` | uuid | YES | — |
| `event_type` | text | NO | — |
| `payload` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |

### `subscription_plans` (19 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `plan_key` | text | NO | — |
| `name` | text | NO | — |
| `documents_retention_days` | integer | NO | — |
| `cases_quota` | integer | YES | — |
| `clients_quota` | integer | YES | — |
| `storage_mb_quota` | integer | YES | — |
| `documents_monthly_quota` | integer | YES | — |
| `feature_flags` | jsonb | NO | '{}'::jsonb |
| `created_at` | timestamp with time zone | NO | now() |
| `updated_at` | timestamp with time zone | NO | now() |
| `price_monthly_cents` | integer | YES | — |
| `price_currency` | text | YES | — |
| `documents_retention_days_core` | integer | YES | — |
| `documents_retention_days_pii` | integer | YES | — |
| `users_quota` | integer | YES | — |
| `otp_sms_monthly_quota` | integer | YES | — |
| `evidence_generations_monthly_quota` | integer | YES | — |
| `evidence_cpu_seconds_monthly_quota` | integer | YES | — |
| `storage_gb_quota` | integer | YES | — |

### `tenant_subscriptions` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `tenant_id` | integer | NO | — |
| `plan_key` | text | NO | — |
| `status` | text | NO | 'active'::text |
| `starts_at` | timestamp with time zone | YES | — |
| `ends_at` | timestamp with time zone | YES | — |
| `updated_at` | timestamp with time zone | NO | now() |
| `created_at` | timestamp with time zone | NO | now() |

### `data_retention_runs` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `run_id` | uuid | NO | — |
| `tenant_id` | integer | YES | — |
| `plan_key` | text | YES | — |
| `dry_run` | boolean | NO | — |
| `started_at` | timestamp with time zone | NO | — |
| `finished_at` | timestamp with time zone | YES | — |
| `summary_json` | jsonb | NO | '{}'::jsonb |
| `deleted_counts_json` | jsonb | NO | '{}'::jsonb |
| `errors_json` | jsonb | NO | '[]'::jsonb |

---

## 8. AI Chatbot / RAG (4 tables, 22 columns)

### `chatbot_sessions` (7 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('chatbot_sessions_id_seq'::regclass) |
| `phone` | text | YES | — |
| `verified` | boolean | NO | false |
| `user_id` | integer | YES | — |
| `ip_address` | text | YES | — |
| `created_at` | timestamp with time zone | NO | now() |
| `expires_at` | timestamp with time zone | YES | — |

### `chatbot_messages` (6 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('chatbot_messages_id_seq'::regclass) |
| `session_id` | integer | NO | — |
| `role` | text | NO | 'user'::text |
| `message` | text | NO | — |
| `response` | text | YES | — |
| `created_at` | timestamp with time zone | NO | now() |

### `knowledge_documents` (4 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('knowledge_documents_id_seq'::regclass) |
| `title` | text | NO | — |
| `source_file` | text | NO | — |
| `created_at` | timestamp with time zone | NO | now() |

### `knowledge_chunks` (5 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('knowledge_chunks_id_seq'::regclass) |
| `document_id` | integer | NO | — |
| `content` | text | NO | — |
| `embedding` | USER-DEFINED | YES | — |
| `created_at` | timestamp with time zone | NO | now() |

---

## 9. Platform Config & Utilities (3 tables, 16 columns)

### `platform_settings` (9 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `id` | integer | NO | nextval('platform_settings_id_seq'::regclass) |
| `category` | character varying | NO | — |
| `setting_key` | character varying | NO | — |
| `setting_value` | text | YES | — |
| `value_type` | character varying | NO | 'string'::character varying |
| `label` | character varying | YES | — |
| `description` | text | YES | — |
| `updated_by` | integer | YES | — |
| `updated_at` | timestamp with time zone | NO | now() |

### `public_short_links` (5 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `slug` | character varying | NO | — |
| `target_url` | text | NO | — |
| `kind` | character varying | NO | 'nav'::character varying |
| `created_at` | timestamp with time zone | NO | now() |
| `expires_at` | timestamp with time zone | YES | — |

### `schema_migrations` (2 columns)

| Column | Type | Nullable | Default |
|--------|------|----------|---------|
| `filename` | text | NO | — |
| `applied_at` | timestamp with time zone | NO | now() |

---

## Column Count by Table

| Table | Columns | | Table | Columns |
|-------|---------|---|-------|---------|
| `signingfiles` | 48 | | `calendar_events` | 43 |
| `signaturespots` | 27 | | `signing_otp_challenges` | 21 |
| `subscription_plans` | 19 | | `cases` | 17 |
| `firm_billing` | 16 | | `user_calendar_tokens` | 16 |
| `audit_events` | 15 | | `scheduled_email_reminders` | 15 |
| `firm_payment_intents` | 14 | | `signing_file_reminders` | 12 |
| `firm_payment_methods` | 10 | | `holidays_date` | 10 |
| `notification_channel_config` | 10 | | `stage_files` | 10 |
| `users` | 10 | | `data_retention_runs` | 9 |
| `platform_settings` | 9 | | `refresh_tokens` | 9 |
| `reminder_templates` | 9 | | `signing_consents` | 9 |
| `template_attachments` | 9 | | `signing_retention_warnings` | 8 |
| `chatbot_sessions` | 7 | | `email_templates` | 7 |
| `otps` | 7 | | `tenant_subscriptions` | 7 |
| `user_daily_agenda_settings` | 7 | | `usernotifications` | 7 |
| `calendar_event_clients` | 6 | | `casedescriptions` | 6 |
| `chatbot_messages` | 6 | | `message_delivery_events` | 6 |
| `platform_admins` | 6 | | `firm_payment_events` | 5 |
| `knowledge_chunks` | 5 | | `public_short_links` | 5 |
| `userdevices` | 5 | | `birthday_greetings_sent` | 4 |
| `calendar_event_managers` | 4 | | `case_users` | 4 |
| `casetypedescriptions` | 4 | | `knowledge_documents` | 4 |
| `signing_short_links` | 4 | | `signing_signer_delivery` | 4 |
| `uploadedfiles` | 4 | | `casetypes` | 3 |
| `schema_migrations` | 2 | | | |