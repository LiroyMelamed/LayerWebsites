--
-- PostgreSQL database dump
--

\restrict fmUQUUEUH4BLPAm6xkgc3eqb6vMvXtuum72xw6mhGbZfZNKqLiftYR8LAmMs0H7

-- Dumped from database version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.13 (Ubuntu 16.13-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: block_audit_events_modification(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.block_audit_events_modification() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF current_setting('app.audit_events_allow_delete', true) = 'true' THEN
            RETURN OLD;
        END IF;
    END IF;

    IF TG_OP = 'UPDATE' THEN
        IF current_setting('app.audit_events_allow_delete', true) = 'true' THEN
            RETURN NEW;
        END IF;
    END IF;

    RAISE EXCEPTION 'audit_events is append-only';
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.audit_events (
    eventid uuid NOT NULL,
    occurred_at_utc timestamp with time zone DEFAULT now() NOT NULL,
    event_type text NOT NULL,
    signingfileid integer,
    signaturespotid integer,
    actor_userid integer,
    actor_type text,
    ip inet,
    user_agent text,
    signing_session_id uuid,
    request_id uuid,
    success boolean DEFAULT true NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    prev_event_hash text,
    event_hash text
);


--
-- Name: birthday_greetings_sent; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.birthday_greetings_sent (
    id integer NOT NULL,
    user_id integer NOT NULL,
    sent_date date DEFAULT CURRENT_DATE NOT NULL,
    sent_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: birthday_greetings_sent_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.birthday_greetings_sent_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: birthday_greetings_sent_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.birthday_greetings_sent_id_seq OWNED BY public.birthday_greetings_sent.id;


--
-- Name: case_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.case_users (
    id integer NOT NULL,
    caseid integer NOT NULL,
    userid integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: case_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.case_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: case_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.case_users_id_seq OWNED BY public.case_users.id;


--
-- Name: casedescriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.casedescriptions (
    descriptionid integer NOT NULL,
    caseid integer,
    stage integer,
    text text,
    "timestamp" timestamp with time zone DEFAULT now(),
    isnew boolean
);


--
-- Name: casedescriptions_descriptionid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.casedescriptions_descriptionid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: casedescriptions_descriptionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.casedescriptions_descriptionid_seq OWNED BY public.casedescriptions.descriptionid;


--
-- Name: cases; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.cases (
    caseid integer NOT NULL,
    casename character varying(100),
    casetypeid integer,
    userid integer,
    companyname character varying(100),
    currentstage integer,
    isclosed boolean,
    istagged boolean,
    createdat timestamp with time zone DEFAULT now(),
    updatedat timestamp with time zone,
    casetypename character varying(100),
    whatsappgrouplink text,
    casemanager character varying(255),
    casemanagerid integer,
    estimatedcompletiondate date,
    licenseexpirydate date,
    haslicenseexpiry boolean DEFAULT false NOT NULL
);


--
-- Name: cases_caseid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.cases_caseid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: cases_caseid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.cases_caseid_seq OWNED BY public.cases.caseid;


--
-- Name: casetypedescriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.casetypedescriptions (
    casetypedescriptionid integer NOT NULL,
    casetypeid integer,
    stage integer,
    text text
);


--
-- Name: casetypedescriptions_casetypedescriptionid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.casetypedescriptions_casetypedescriptionid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: casetypedescriptions_casetypedescriptionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.casetypedescriptions_casetypedescriptionid_seq OWNED BY public.casetypedescriptions.casetypedescriptionid;


--
-- Name: casetypes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.casetypes (
    casetypeid integer NOT NULL,
    casetypename character varying(100),
    numberofstages integer
);


--
-- Name: casetypes_casetypeid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.casetypes_casetypeid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: casetypes_casetypeid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.casetypes_casetypeid_seq OWNED BY public.casetypes.casetypeid;


--
-- Name: chatbot_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_messages (
    id integer NOT NULL,
    session_id integer NOT NULL,
    role text DEFAULT 'user'::text NOT NULL,
    message text NOT NULL,
    response text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chatbot_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_messages_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_messages_id_seq OWNED BY public.chatbot_messages.id;


--
-- Name: chatbot_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chatbot_sessions (
    id integer NOT NULL,
    phone text,
    verified boolean DEFAULT false NOT NULL,
    user_id integer,
    ip_address text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone
);


--
-- Name: chatbot_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chatbot_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chatbot_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chatbot_sessions_id_seq OWNED BY public.chatbot_sessions.id;


--
-- Name: data_retention_runs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.data_retention_runs (
    run_id uuid NOT NULL,
    tenant_id integer,
    plan_key text,
    dry_run boolean NOT NULL,
    started_at timestamp with time zone NOT NULL,
    finished_at timestamp with time zone,
    summary_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    deleted_counts_json jsonb DEFAULT '{}'::jsonb NOT NULL,
    errors_json jsonb DEFAULT '[]'::jsonb NOT NULL
);


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    template_key character varying(80) NOT NULL,
    label character varying(200) NOT NULL,
    subject_template text DEFAULT ''::text NOT NULL,
    html_body text DEFAULT ''::text NOT NULL,
    available_vars jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_by integer
);


--
-- Name: knowledge_chunks_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knowledge_chunks_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knowledge_documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.knowledge_documents (
    id integer NOT NULL,
    title text NOT NULL,
    source_file text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: knowledge_documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.knowledge_documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: knowledge_documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.knowledge_documents_id_seq OWNED BY public.knowledge_documents.id;


--
-- Name: message_delivery_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.message_delivery_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel text NOT NULL,
    type text,
    idempotency_key text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: notification_channel_config; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_channel_config (
    id integer NOT NULL,
    notification_type character varying(50) NOT NULL,
    label character varying(200),
    push_enabled boolean DEFAULT true NOT NULL,
    email_enabled boolean DEFAULT true NOT NULL,
    sms_enabled boolean DEFAULT true NOT NULL,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    admin_cc boolean DEFAULT false NOT NULL,
    manager_cc boolean DEFAULT true NOT NULL
);


--
-- Name: notification_channel_config_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_channel_config_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_channel_config_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_channel_config_id_seq OWNED BY public.notification_channel_config.id;


--
-- Name: otps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.otps (
    phonenumber character varying(20) NOT NULL,
    otp character varying(64) NOT NULL,
    expiry timestamp with time zone NOT NULL,
    userid integer NOT NULL,
    createdat timestamp with time zone DEFAULT now()
);


--
-- Name: platform_admins; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_admins (
    id integer NOT NULL,
    user_id integer NOT NULL,
    name character varying(200),
    added_by integer,
    added_at timestamp with time zone DEFAULT now() NOT NULL,
    is_active boolean DEFAULT true NOT NULL
);


--
-- Name: platform_admins_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_admins_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_admins_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_admins_id_seq OWNED BY public.platform_admins.id;


--
-- Name: platform_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.platform_settings (
    id integer NOT NULL,
    category character varying(50) NOT NULL,
    setting_key character varying(100) NOT NULL,
    setting_value text,
    value_type character varying(20) DEFAULT 'string'::character varying NOT NULL,
    label character varying(200),
    description text,
    updated_by integer,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: platform_settings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.platform_settings_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: platform_settings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.platform_settings_id_seq OWNED BY public.platform_settings.id;


--
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.refresh_tokens (
    refresh_token_id bigint NOT NULL,
    userid integer NOT NULL,
    token_hash text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    replaced_by_token_hash text,
    user_agent text,
    ip_address text
);


--
-- Name: refresh_tokens_refresh_token_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.refresh_tokens_refresh_token_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: refresh_tokens_refresh_token_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.refresh_tokens_refresh_token_id_seq OWNED BY public.refresh_tokens.refresh_token_id;


--
-- Name: reminder_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.reminder_templates (
    id integer NOT NULL,
    template_key character varying(100) NOT NULL,
    label character varying(255) NOT NULL,
    description text DEFAULT ''::text,
    subject_template text DEFAULT 'תזכורת: [[subject]]'::text NOT NULL,
    body_html text DEFAULT 'שלום [[client_name]],<br><br>[[body]]<br><br>בברכה,<br>[[firm_name]]'::text NOT NULL,
    created_by integer,
    created_at timestamp with time zone DEFAULT now(),
    updated_at timestamp with time zone DEFAULT now()
);


--
-- Name: reminder_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.reminder_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: reminder_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.reminder_templates_id_seq OWNED BY public.reminder_templates.id;


--
-- Name: scheduled_email_reminders; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.scheduled_email_reminders (
    id integer NOT NULL,
    user_id integer,
    client_name text NOT NULL,
    to_email text NOT NULL,
    subject text,
    template_key text DEFAULT 'GENERAL'::text NOT NULL,
    template_data jsonb DEFAULT '{}'::jsonb NOT NULL,
    scheduled_for timestamp with time zone NOT NULL,
    status text DEFAULT 'PENDING'::text NOT NULL,
    error text,
    created_by integer,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    sent_at timestamp with time zone,
    cancelled_at timestamp with time zone,
    CONSTRAINT scheduled_email_reminders_status_check CHECK ((status = ANY (ARRAY['PENDING'::text, 'SENT'::text, 'FAILED'::text, 'CANCELLED'::text])))
);


--
-- Name: scheduled_email_reminders_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.scheduled_email_reminders_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: scheduled_email_reminders_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.scheduled_email_reminders_id_seq OWNED BY public.scheduled_email_reminders.id;


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    filename text NOT NULL,
    applied_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: signaturespots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signaturespots (
    signaturespotid integer NOT NULL,
    signingfileid integer NOT NULL,
    pagenumber integer DEFAULT 1 NOT NULL,
    x double precision DEFAULT 0 NOT NULL,
    y double precision DEFAULT 0 NOT NULL,
    width double precision DEFAULT 150 NOT NULL,
    height double precision DEFAULT 75 NOT NULL,
    signername text,
    isrequired boolean DEFAULT true NOT NULL,
    issigned boolean DEFAULT false NOT NULL,
    signaturedata text,
    signedat timestamp with time zone,
    createdat timestamp with time zone DEFAULT now() NOT NULL,
    signeruserid integer,
    signerip inet,
    signeruseragent text,
    signingsessionid uuid,
    presentedpdfsha256 text,
    otpverificationid uuid,
    consentid uuid,
    signatureimagesha256 text,
    signaturestorageetag text,
    signaturestorageversionid text,
    fieldtype text DEFAULT 'signature'::text NOT NULL,
    signerindex integer,
    fieldlabel text,
    fieldvalue text,
    CONSTRAINT signaturespots_presentedpdfsha256_len_chk CHECK (((presentedpdfsha256 IS NULL) OR (length(presentedpdfsha256) = 64))),
    CONSTRAINT signaturespots_signatureimagesha256_len_chk CHECK (((signatureimagesha256 IS NULL) OR (length(signatureimagesha256) = 64)))
);


--
-- Name: signaturespots_signaturespotid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.signaturespots ALTER COLUMN signaturespotid ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.signaturespots_signaturespotid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: signing_consents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signing_consents (
    consentid uuid NOT NULL,
    signingfileid integer NOT NULL,
    signeruserid integer,
    signingsessionid uuid NOT NULL,
    consentversion text NOT NULL,
    consenttextsha256 text NOT NULL,
    acceptedatutc timestamp with time zone NOT NULL,
    ip inet,
    user_agent text
);


--
-- Name: signing_otp_challenges; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signing_otp_challenges (
    challengeid uuid NOT NULL,
    signingfileid integer NOT NULL,
    signeruserid integer,
    signingsessionid uuid NOT NULL,
    phone_e164 text NOT NULL,
    presentedpdfsha256 text NOT NULL,
    otp_hash text NOT NULL,
    otp_salt text NOT NULL,
    provider_message_id text,
    sent_at_utc timestamp with time zone NOT NULL,
    expires_at_utc timestamp with time zone NOT NULL,
    attempt_count integer DEFAULT 0 NOT NULL,
    locked_until_utc timestamp with time zone,
    verified_at_utc timestamp with time zone,
    verified boolean DEFAULT false NOT NULL,
    request_ip inet,
    request_user_agent text,
    verify_ip inet,
    verify_user_agent text,
    CONSTRAINT signing_otp_challenges_presentedpdfsha256_len_chk CHECK ((length(presentedpdfsha256) = 64))
);


--
-- Name: signing_retention_warnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signing_retention_warnings (
    warning_id uuid NOT NULL,
    tenant_id integer NOT NULL,
    signingfileid integer NOT NULL,
    warn_at_utc timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    status text DEFAULT 'scheduled'::text NOT NULL,
    sent_at_utc timestamp with time zone,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


--
-- Name: signingfiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.signingfiles (
    signingfileid integer NOT NULL,
    caseid integer,
    lawyerid integer NOT NULL,
    clientid integer,
    filename text NOT NULL,
    filekey text,
    originalfilekey text,
    status text,
    notes text,
    createdat timestamp with time zone DEFAULT now() NOT NULL,
    expiresat timestamp with time zone,
    signedfilekey text,
    signedat timestamp with time zone,
    rejectionreason text,
    requireotp boolean DEFAULT false NOT NULL,
    signingpolicyversion text DEFAULT '2026-01-11'::text NOT NULL,
    policyselectedbyuserid integer,
    policyselectedatutc timestamp with time zone,
    otpwaiveracknowledged boolean DEFAULT false NOT NULL,
    otpwaiveracknowledgedatutc timestamp with time zone,
    otpwaiveracknowledgedbyuserid integer,
    originalpdfsha256 text,
    presentedpdfsha256 text,
    signedpdfsha256 text,
    originalstoragebucket text,
    originalstoragekey text,
    originalstorageetag text,
    originalstorageversionid text,
    signedstoragebucket text,
    signedstoragekey text,
    signedstorageetag text,
    signedstorageversionid text,
    immutableatutc timestamp with time zone,
    otpwaivedbyuserid integer,
    otpwaivedatutc timestamp with time zone,
    legalhold boolean DEFAULT false NOT NULL,
    legalholdatutc timestamp with time zone,
    legalholdreason text,
    pendingdeleteatutc timestamp with time zone,
    pendingdeletereason text,
    plan_key_at_signing text,
    retention_days_core_at_signing integer,
    retention_days_pii_at_signing integer,
    retention_policy_hash_at_signing text,
    unsignedpdfbytes bigint,
    signedpdfbytes bigint,
    signingorder text DEFAULT 'parallel'::text NOT NULL,
    completionemail character varying(255) DEFAULT NULL::character varying,
    CONSTRAINT signingfiles_originalpdfsha256_len_chk CHECK (((originalpdfsha256 IS NULL) OR (length(originalpdfsha256) = 64))),
    CONSTRAINT signingfiles_presentedpdfsha256_len_chk CHECK (((presentedpdfsha256 IS NULL) OR (length(presentedpdfsha256) = 64))),
    CONSTRAINT signingfiles_signedpdfsha256_len_chk CHECK (((signedpdfsha256 IS NULL) OR (length(signedpdfsha256) = 64)))
);


--
-- Name: signingfiles_signingfileid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

ALTER TABLE public.signingfiles ALTER COLUMN signingfileid ADD GENERATED BY DEFAULT AS IDENTITY (
    SEQUENCE NAME public.signingfiles_signingfileid_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1
);


--
-- Name: stage_files; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.stage_files (
    id integer NOT NULL,
    caseid integer NOT NULL,
    stage integer NOT NULL,
    file_key text NOT NULL,
    file_name character varying(500) NOT NULL,
    file_ext character varying(20),
    file_mime character varying(200),
    file_size bigint,
    uploaded_by integer NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT stage_files_stage_check CHECK ((stage >= 1))
);


--
-- Name: stage_files_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.stage_files_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: stage_files_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.stage_files_id_seq OWNED BY public.stage_files.id;


--
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.subscription_plans (
    plan_key text NOT NULL,
    name text NOT NULL,
    documents_retention_days integer NOT NULL,
    cases_quota integer,
    clients_quota integer,
    storage_gb_quota integer,
    documents_monthly_quota integer,
    feature_flags jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    price_monthly_cents integer,
    price_currency text,
    documents_retention_days_core integer,
    documents_retention_days_pii integer,
    users_quota integer,
    otp_sms_monthly_quota integer,
    evidence_generations_monthly_quota integer,
    evidence_cpu_seconds_monthly_quota integer,
    CONSTRAINT subscription_plans_documents_retention_days_chk CHECK ((documents_retention_days > 0)),
    CONSTRAINT subscription_plans_documents_retention_days_core_chk CHECK (((documents_retention_days_core IS NULL) OR (documents_retention_days_core > 0))),
    CONSTRAINT subscription_plans_documents_retention_days_pii_chk CHECK (((documents_retention_days_pii IS NULL) OR (documents_retention_days_pii > 0)))
);


--
-- Name: template_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.template_attachments (
    id integer NOT NULL,
    template_type character varying(20) NOT NULL,
    template_key character varying(100) NOT NULL,
    file_key text NOT NULL,
    filename character varying(255) NOT NULL,
    mime_type character varying(100) DEFAULT 'application/octet-stream'::character varying NOT NULL,
    file_size integer DEFAULT 0 NOT NULL,
    uploaded_by integer,
    created_at timestamp with time zone DEFAULT now(),
    CONSTRAINT template_attachments_template_type_check CHECK (((template_type)::text = ANY (ARRAY[('email'::character varying)::text, ('reminder'::character varying)::text])))
);


--
-- Name: template_attachments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.template_attachments_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: template_attachments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.template_attachments_id_seq OWNED BY public.template_attachments.id;


--
-- Name: tenant_subscriptions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tenant_subscriptions (
    tenant_id integer NOT NULL,
    plan_key text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: uploadedfiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.uploadedfiles (
    uploadedfileid integer NOT NULL,
    caseid integer,
    filepath text,
    uploaddate timestamp with time zone DEFAULT now()
);


--
-- Name: TABLE uploadedfiles; Type: COMMENT; Schema: public; Owner: -
--

COMMENT ON TABLE public.uploadedfiles IS 'DEPRECATED 2026-02-15: No active application code references. File uploads use R2 presigned URLs. Pending DROP after confirming zero production rows.';


--
-- Name: uploadedfiles_uploadedfileid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.uploadedfiles_uploadedfileid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: uploadedfiles_uploadedfileid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.uploadedfiles_uploadedfileid_seq OWNED BY public.uploadedfiles.uploadedfileid;


--
-- Name: userdevices; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.userdevices (
    deviceid integer NOT NULL,
    userid integer,
    fcmtoken character varying(255) NOT NULL,
    devicetype character varying(50),
    createdat timestamp with time zone DEFAULT now()
);


--
-- Name: userdevices_deviceid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.userdevices_deviceid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: userdevices_deviceid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.userdevices_deviceid_seq OWNED BY public.userdevices.deviceid;


--
-- Name: usernotifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.usernotifications (
    notificationid integer NOT NULL,
    userid integer NOT NULL,
    title character varying(100),
    message character varying(500),
    isread boolean DEFAULT false,
    createdat timestamp with time zone DEFAULT now()
);


--
-- Name: usernotifications_notificationid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.usernotifications_notificationid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: usernotifications_notificationid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.usernotifications_notificationid_seq OWNED BY public.usernotifications.notificationid;


--
-- Name: users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.users (
    userid integer NOT NULL,
    name character varying(100),
    email character varying(100),
    phonenumber character varying(20),
    passwordhash character varying(255),
    role character varying(50),
    companyname character varying(100),
    createdat timestamp with time zone DEFAULT now(),
    dateofbirth date,
    profilepicurl text
);


--
-- Name: users_userid_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.users_userid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: users_userid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.users_userid_seq OWNED BY public.users.userid;


--
-- Name: birthday_greetings_sent id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthday_greetings_sent ALTER COLUMN id SET DEFAULT nextval('public.birthday_greetings_sent_id_seq'::regclass);


--
-- Name: case_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_users ALTER COLUMN id SET DEFAULT nextval('public.case_users_id_seq'::regclass);


--
-- Name: casedescriptions descriptionid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casedescriptions ALTER COLUMN descriptionid SET DEFAULT nextval('public.casedescriptions_descriptionid_seq'::regclass);


--
-- Name: cases caseid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases ALTER COLUMN caseid SET DEFAULT nextval('public.cases_caseid_seq'::regclass);


--
-- Name: casetypedescriptions casetypedescriptionid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casetypedescriptions ALTER COLUMN casetypedescriptionid SET DEFAULT nextval('public.casetypedescriptions_casetypedescriptionid_seq'::regclass);


--
-- Name: casetypes casetypeid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casetypes ALTER COLUMN casetypeid SET DEFAULT nextval('public.casetypes_casetypeid_seq'::regclass);


--
-- Name: chatbot_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_messages ALTER COLUMN id SET DEFAULT nextval('public.chatbot_messages_id_seq'::regclass);


--
-- Name: chatbot_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_sessions ALTER COLUMN id SET DEFAULT nextval('public.chatbot_sessions_id_seq'::regclass);


--
-- Name: knowledge_documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents ALTER COLUMN id SET DEFAULT nextval('public.knowledge_documents_id_seq'::regclass);


--
-- Name: notification_channel_config id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_channel_config ALTER COLUMN id SET DEFAULT nextval('public.notification_channel_config_id_seq'::regclass);


--
-- Name: platform_admins id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins ALTER COLUMN id SET DEFAULT nextval('public.platform_admins_id_seq'::regclass);


--
-- Name: platform_settings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings ALTER COLUMN id SET DEFAULT nextval('public.platform_settings_id_seq'::regclass);


--
-- Name: refresh_tokens refresh_token_id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN refresh_token_id SET DEFAULT nextval('public.refresh_tokens_refresh_token_id_seq'::regclass);


--
-- Name: reminder_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_templates ALTER COLUMN id SET DEFAULT nextval('public.reminder_templates_id_seq'::regclass);


--
-- Name: scheduled_email_reminders id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_email_reminders ALTER COLUMN id SET DEFAULT nextval('public.scheduled_email_reminders_id_seq'::regclass);


--
-- Name: stage_files id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_files ALTER COLUMN id SET DEFAULT nextval('public.stage_files_id_seq'::regclass);


--
-- Name: template_attachments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_attachments ALTER COLUMN id SET DEFAULT nextval('public.template_attachments_id_seq'::regclass);


--
-- Name: uploadedfiles uploadedfileid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploadedfiles ALTER COLUMN uploadedfileid SET DEFAULT nextval('public.uploadedfiles_uploadedfileid_seq'::regclass);


--
-- Name: userdevices deviceid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.userdevices ALTER COLUMN deviceid SET DEFAULT nextval('public.userdevices_deviceid_seq'::regclass);


--
-- Name: usernotifications notificationid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usernotifications ALTER COLUMN notificationid SET DEFAULT nextval('public.usernotifications_notificationid_seq'::regclass);


--
-- Name: users userid; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users ALTER COLUMN userid SET DEFAULT nextval('public.users_userid_seq'::regclass);


--
-- Data for Name: audit_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.audit_events (eventid, occurred_at_utc, event_type, signingfileid, signaturespotid, actor_userid, actor_type, ip, user_agent, signing_session_id, request_id, success, metadata, prev_event_hash, event_hash) FROM stdin;
\.


--
-- Data for Name: birthday_greetings_sent; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.birthday_greetings_sent (id, user_id, sent_date, sent_at) FROM stdin;
\.


--
-- Data for Name: case_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.case_users (id, caseid, userid, created_at) FROM stdin;
\.


--
-- Data for Name: casedescriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.casedescriptions (descriptionid, caseid, stage, text, "timestamp", isnew) FROM stdin;
\.


--
-- Data for Name: cases; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.cases (caseid, casename, casetypeid, userid, companyname, currentstage, isclosed, istagged, createdat, updatedat, casetypename, whatsappgrouplink, casemanager, casemanagerid, estimatedcompletiondate, licenseexpirydate, haslicenseexpiry) FROM stdin;
\.


--
-- Data for Name: casetypedescriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.casetypedescriptions (casetypedescriptionid, casetypeid, stage, text) FROM stdin;
\.


--
-- Data for Name: casetypes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.casetypes (casetypeid, casetypename, numberofstages) FROM stdin;
\.


--
-- Data for Name: chatbot_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chatbot_messages (id, session_id, role, message, response, created_at) FROM stdin;
\.


--
-- Data for Name: chatbot_sessions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chatbot_sessions (id, phone, verified, user_id, ip_address, created_at, expires_at) FROM stdin;
\.


--
-- Data for Name: data_retention_runs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.data_retention_runs (run_id, tenant_id, plan_key, dry_run, started_at, finished_at, summary_json, deleted_counts_json, errors_json) FROM stdin;
\.


--
-- Data for Name: email_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_templates (template_key, label, subject_template, html_body, available_vars, updated_at, updated_by) FROM stdin;
\.


--
-- Data for Name: knowledge_documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.knowledge_documents (id, title, source_file, created_at) FROM stdin;
\.


--
-- Data for Name: message_delivery_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.message_delivery_events (id, channel, type, idempotency_key, metadata, created_at) FROM stdin;
\.


--
-- Data for Name: notification_channel_config; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.notification_channel_config (id, notification_type, label, push_enabled, email_enabled, sms_enabled, updated_by, updated_at, admin_cc, manager_cc) FROM stdin;
\.


--
-- Data for Name: otps; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.otps (phonenumber, otp, expiry, userid, createdat) FROM stdin;
\.


--
-- Data for Name: platform_admins; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_admins (id, user_id, name, added_by, added_at, is_active) FROM stdin;
1	1	\N	\N	2026-04-15 01:18:01.501685+02	t
\.


--
-- Data for Name: platform_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.platform_settings (id, category, setting_key, setting_value, value_type, label, description, updated_by, updated_at) FROM stdin;
\.


--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.refresh_tokens (refresh_token_id, userid, token_hash, created_at, expires_at, revoked_at, replaced_by_token_hash, user_agent, ip_address) FROM stdin;
\.


--
-- Data for Name: reminder_templates; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.reminder_templates (id, template_key, label, description, subject_template, body_html, created_by, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: scheduled_email_reminders; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.scheduled_email_reminders (id, user_id, client_name, to_email, subject, template_key, template_data, scheduled_for, status, error, created_by, created_at, sent_at, cancelled_at) FROM stdin;
\.


--
-- Data for Name: schema_migrations; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.schema_migrations (filename, applied_at) FROM stdin;
\.


--
-- Data for Name: signaturespots; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.signaturespots (signaturespotid, signingfileid, pagenumber, x, y, width, height, signername, isrequired, issigned, signaturedata, signedat, createdat, signeruserid, signerip, signeruseragent, signingsessionid, presentedpdfsha256, otpverificationid, consentid, signatureimagesha256, signaturestorageetag, signaturestorageversionid, fieldtype, signerindex, fieldlabel, fieldvalue) FROM stdin;
\.


--
-- Data for Name: signing_consents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.signing_consents (consentid, signingfileid, signeruserid, signingsessionid, consentversion, consenttextsha256, acceptedatutc, ip, user_agent) FROM stdin;
\.


--
-- Data for Name: signing_otp_challenges; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.signing_otp_challenges (challengeid, signingfileid, signeruserid, signingsessionid, phone_e164, presentedpdfsha256, otp_hash, otp_salt, provider_message_id, sent_at_utc, expires_at_utc, attempt_count, locked_until_utc, verified_at_utc, verified, request_ip, request_user_agent, verify_ip, verify_user_agent) FROM stdin;
\.


--
-- Data for Name: signing_retention_warnings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.signing_retention_warnings (warning_id, tenant_id, signingfileid, warn_at_utc, created_at, status, sent_at_utc, metadata) FROM stdin;
\.


--
-- Data for Name: signingfiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.signingfiles (signingfileid, caseid, lawyerid, clientid, filename, filekey, originalfilekey, status, notes, createdat, expiresat, signedfilekey, signedat, rejectionreason, requireotp, signingpolicyversion, policyselectedbyuserid, policyselectedatutc, otpwaiveracknowledged, otpwaiveracknowledgedatutc, otpwaiveracknowledgedbyuserid, originalpdfsha256, presentedpdfsha256, signedpdfsha256, originalstoragebucket, originalstoragekey, originalstorageetag, originalstorageversionid, signedstoragebucket, signedstoragekey, signedstorageetag, signedstorageversionid, immutableatutc, otpwaivedbyuserid, otpwaivedatutc, legalhold, legalholdatutc, legalholdreason, pendingdeleteatutc, pendingdeletereason, plan_key_at_signing, retention_days_core_at_signing, retention_days_pii_at_signing, retention_policy_hash_at_signing, unsignedpdfbytes, signedpdfbytes, signingorder, completionemail) FROM stdin;
\.


--
-- Data for Name: stage_files; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.stage_files (id, caseid, stage, file_key, file_name, file_ext, file_mime, file_size, uploaded_by, created_at) FROM stdin;
\.


--
-- Data for Name: subscription_plans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.subscription_plans (plan_key, name, documents_retention_days, cases_quota, clients_quota, storage_gb_quota, documents_monthly_quota, feature_flags, created_at, updated_at, price_monthly_cents, price_currency, documents_retention_days_core, documents_retention_days_pii, users_quota, otp_sms_monthly_quota, evidence_generations_monthly_quota, evidence_cpu_seconds_monthly_quota) FROM stdin;
\.


--
-- Data for Name: template_attachments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.template_attachments (id, template_type, template_key, file_key, filename, mime_type, file_size, uploaded_by, created_at) FROM stdin;
\.


--
-- Data for Name: tenant_subscriptions; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.tenant_subscriptions (tenant_id, plan_key, status, starts_at, ends_at, updated_at, created_at) FROM stdin;
\.


--
-- Data for Name: uploadedfiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.uploadedfiles (uploadedfileid, caseid, filepath, uploaddate) FROM stdin;
\.


--
-- Data for Name: userdevices; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.userdevices (deviceid, userid, fcmtoken, devicetype, createdat) FROM stdin;
\.


--
-- Data for Name: usernotifications; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.usernotifications (notificationid, userid, title, message, isread, createdat) FROM stdin;
\.


--
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.users (userid, name, email, phonenumber, passwordhash, role, companyname, createdat, dateofbirth, profilepicurl) FROM stdin;
1	מור לוי	mor@levylaw.co.il	0507299064	\N	Admin	\N	2026-04-15 01:17:51.156403+02	\N	\N
\.


--
-- Name: birthday_greetings_sent_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.birthday_greetings_sent_id_seq', 1, false);


--
-- Name: case_users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.case_users_id_seq', 1, false);


--
-- Name: casedescriptions_descriptionid_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.casedescriptions_descriptionid_seq', 1, false);


--
-- Name: cases_caseid_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.cases_caseid_seq', 1, false);


--
-- Name: casetypedescriptions_casetypedescriptionid_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.casetypedescriptions_casetypedescriptionid_seq', 1, false);


--
-- Name: casetypes_casetypeid_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.casetypes_casetypeid_seq', 1, false);


--
-- Name: chatbot_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.chatbot_messages_id_seq', 1, false);


--
-- Name: chatbot_sessions_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.chatbot_sessions_id_seq', 1, false);


--
-- Name: knowledge_chunks_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.knowledge_chunks_id_seq', 1, false);


--
-- Name: knowledge_documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.knowledge_documents_id_seq', 1, false);


--
-- Name: notification_channel_config_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.notification_channel_config_id_seq', 1, false);


--
-- Name: platform_admins_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.platform_admins_id_seq', 1, true);


--
-- Name: platform_settings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.platform_settings_id_seq', 1, false);


--
-- Name: refresh_tokens_refresh_token_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.refresh_tokens_refresh_token_id_seq', 1, false);


--
-- Name: reminder_templates_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.reminder_templates_id_seq', 1, false);


--
-- Name: scheduled_email_reminders_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.scheduled_email_reminders_id_seq', 1, false);


--
-- Name: signaturespots_signaturespotid_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.signaturespots_signaturespotid_seq', 1, false);


--
-- Name: signingfiles_signingfileid_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.signingfiles_signingfileid_seq', 1, false);


--
-- Name: stage_files_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.stage_files_id_seq', 1, false);


--
-- Name: template_attachments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.template_attachments_id_seq', 1, false);


--
-- Name: uploadedfiles_uploadedfileid_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.uploadedfiles_uploadedfileid_seq', 1, false);


--
-- Name: userdevices_deviceid_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.userdevices_deviceid_seq', 1, false);


--
-- Name: usernotifications_notificationid_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.usernotifications_notificationid_seq', 1, false);


--
-- Name: users_userid_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.users_userid_seq', 1, true);


--
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (eventid);


--
-- Name: birthday_greetings_sent birthday_greetings_sent_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthday_greetings_sent
    ADD CONSTRAINT birthday_greetings_sent_pkey PRIMARY KEY (id);


--
-- Name: birthday_greetings_sent birthday_greetings_sent_user_id_sent_date_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthday_greetings_sent
    ADD CONSTRAINT birthday_greetings_sent_user_id_sent_date_key UNIQUE (user_id, sent_date);


--
-- Name: case_users case_users_caseid_userid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_users
    ADD CONSTRAINT case_users_caseid_userid_key UNIQUE (caseid, userid);


--
-- Name: case_users case_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_users
    ADD CONSTRAINT case_users_pkey PRIMARY KEY (id);


--
-- Name: casedescriptions casedescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casedescriptions
    ADD CONSTRAINT casedescriptions_pkey PRIMARY KEY (descriptionid);


--
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (caseid);


--
-- Name: casetypedescriptions casetypedescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casetypedescriptions
    ADD CONSTRAINT casetypedescriptions_pkey PRIMARY KEY (casetypedescriptionid);


--
-- Name: casetypes casetypes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casetypes
    ADD CONSTRAINT casetypes_pkey PRIMARY KEY (casetypeid);


--
-- Name: chatbot_messages chatbot_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_pkey PRIMARY KEY (id);


--
-- Name: chatbot_sessions chatbot_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_sessions
    ADD CONSTRAINT chatbot_sessions_pkey PRIMARY KEY (id);


--
-- Name: data_retention_runs data_retention_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.data_retention_runs
    ADD CONSTRAINT data_retention_runs_pkey PRIMARY KEY (run_id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (template_key);


--
-- Name: knowledge_documents knowledge_documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.knowledge_documents
    ADD CONSTRAINT knowledge_documents_pkey PRIMARY KEY (id);


--
-- Name: message_delivery_events message_delivery_events_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_delivery_events
    ADD CONSTRAINT message_delivery_events_idempotency_key_key UNIQUE (idempotency_key);


--
-- Name: message_delivery_events message_delivery_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.message_delivery_events
    ADD CONSTRAINT message_delivery_events_pkey PRIMARY KEY (id);


--
-- Name: notification_channel_config notification_channel_config_notification_type_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_channel_config
    ADD CONSTRAINT notification_channel_config_notification_type_key UNIQUE (notification_type);


--
-- Name: notification_channel_config notification_channel_config_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_channel_config
    ADD CONSTRAINT notification_channel_config_pkey PRIMARY KEY (id);


--
-- Name: otps otps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otps
    ADD CONSTRAINT otps_pkey PRIMARY KEY (phonenumber);


--
-- Name: platform_admins platform_admins_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_pkey PRIMARY KEY (id);


--
-- Name: platform_admins platform_admins_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_user_id_key UNIQUE (user_id);


--
-- Name: platform_settings platform_settings_category_setting_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_category_setting_key_key UNIQUE (category, setting_key);


--
-- Name: platform_settings platform_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_pkey PRIMARY KEY (id);


--
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (refresh_token_id);


--
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- Name: reminder_templates reminder_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_templates
    ADD CONSTRAINT reminder_templates_pkey PRIMARY KEY (id);


--
-- Name: reminder_templates reminder_templates_template_key_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_templates
    ADD CONSTRAINT reminder_templates_template_key_key UNIQUE (template_key);


--
-- Name: scheduled_email_reminders scheduled_email_reminders_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_email_reminders
    ADD CONSTRAINT scheduled_email_reminders_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (filename);


--
-- Name: signaturespots signaturespots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signaturespots
    ADD CONSTRAINT signaturespots_pkey PRIMARY KEY (signaturespotid);


--
-- Name: signing_consents signing_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_consents
    ADD CONSTRAINT signing_consents_pkey PRIMARY KEY (consentid);


--
-- Name: signing_otp_challenges signing_otp_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_otp_challenges
    ADD CONSTRAINT signing_otp_challenges_pkey PRIMARY KEY (challengeid);


--
-- Name: signing_retention_warnings signing_retention_warnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_retention_warnings
    ADD CONSTRAINT signing_retention_warnings_pkey PRIMARY KEY (warning_id);


--
-- Name: signingfiles signingfiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signingfiles
    ADD CONSTRAINT signingfiles_pkey PRIMARY KEY (signingfileid);


--
-- Name: stage_files stage_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_files
    ADD CONSTRAINT stage_files_pkey PRIMARY KEY (id);


--
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (plan_key);


--
-- Name: template_attachments template_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_attachments
    ADD CONSTRAINT template_attachments_pkey PRIMARY KEY (id);


--
-- Name: tenant_subscriptions tenant_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_pkey PRIMARY KEY (tenant_id);


--
-- Name: uploadedfiles uploadedfiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploadedfiles
    ADD CONSTRAINT uploadedfiles_pkey PRIMARY KEY (uploadedfileid);


--
-- Name: userdevices userdevices_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.userdevices
    ADD CONSTRAINT userdevices_pkey PRIMARY KEY (deviceid);


--
-- Name: usernotifications usernotifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usernotifications
    ADD CONSTRAINT usernotifications_pkey PRIMARY KEY (notificationid);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (userid);


--
-- Name: audit_events_signingfile_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_signingfile_time ON public.audit_events USING btree (signingfileid, occurred_at_utc);


--
-- Name: audit_events_type_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX audit_events_type_time ON public.audit_events USING btree (event_type, occurred_at_utc);


--
-- Name: idx_case_users_caseid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_case_users_caseid ON public.case_users USING btree (caseid);


--
-- Name: idx_case_users_userid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_case_users_userid ON public.case_users USING btree (userid);


--
-- Name: idx_cases_whatsappgrouplink; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_cases_whatsappgrouplink ON public.cases USING btree (whatsappgrouplink);


--
-- Name: idx_chatbot_messages_session_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_messages_session_id ON public.chatbot_messages USING btree (session_id);


--
-- Name: idx_chatbot_sessions_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_sessions_expires_at ON public.chatbot_sessions USING btree (expires_at) WHERE (expires_at IS NOT NULL);


--
-- Name: idx_chatbot_sessions_phone; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_chatbot_sessions_phone ON public.chatbot_sessions USING btree (phone) WHERE (phone IS NOT NULL);


--
-- Name: idx_data_retention_runs_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_data_retention_runs_started_at ON public.data_retention_runs USING btree (started_at DESC);


--
-- Name: idx_mde_channel_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_mde_channel_created ON public.message_delivery_events USING btree (channel, created_at);


--
-- Name: idx_platform_settings_category; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_platform_settings_category ON public.platform_settings USING btree (category);


--
-- Name: idx_refresh_tokens_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_expires_at ON public.refresh_tokens USING btree (expires_at);


--
-- Name: idx_refresh_tokens_userid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_refresh_tokens_userid ON public.refresh_tokens USING btree (userid);


--
-- Name: idx_ser_status_scheduled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ser_status_scheduled ON public.scheduled_email_reminders USING btree (status, scheduled_for) WHERE (status = 'PENDING'::text);


--
-- Name: idx_signaturespots_signeruserid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signaturespots_signeruserid ON public.signaturespots USING btree (signeruserid);


--
-- Name: idx_signaturespots_signingfile_page; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signaturespots_signingfile_page ON public.signaturespots USING btree (signingfileid, pagenumber);


--
-- Name: idx_signaturespots_signingfileid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signaturespots_signingfileid ON public.signaturespots USING btree (signingfileid);


--
-- Name: idx_signaturespots_signingfileid_required_signed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signaturespots_signingfileid_required_signed ON public.signaturespots USING btree (signingfileid, isrequired, issigned);


--
-- Name: idx_signing_retention_warnings_warn_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signing_retention_warnings_warn_at ON public.signing_retention_warnings USING btree (warn_at_utc);


--
-- Name: idx_signingfiles_clientid_createdat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signingfiles_clientid_createdat ON public.signingfiles USING btree (clientid, createdat DESC);


--
-- Name: idx_signingfiles_lawyerid_createdat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signingfiles_lawyerid_createdat ON public.signingfiles USING btree (lawyerid, createdat DESC);


--
-- Name: idx_signingfiles_pendingdeleteatutc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_signingfiles_pendingdeleteatutc ON public.signingfiles USING btree (pendingdeleteatutc);


--
-- Name: idx_stage_files_caseid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stage_files_caseid ON public.stage_files USING btree (caseid);


--
-- Name: idx_stage_files_caseid_stage; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_stage_files_caseid_stage ON public.stage_files USING btree (caseid, stage);


--
-- Name: idx_template_attachments_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_template_attachments_lookup ON public.template_attachments USING btree (template_type, template_key);


--
-- Name: idx_tenant_subscriptions_plan_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_tenant_subscriptions_plan_key ON public.tenant_subscriptions USING btree (plan_key);


--
-- Name: idx_userdevices_userid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_userdevices_userid ON public.userdevices USING btree (userid);


--
-- Name: idx_usernotifications_userid_createdat; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_usernotifications_userid_createdat ON public.usernotifications USING btree (userid, createdat DESC);


--
-- Name: signing_consents_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX signing_consents_unique ON public.signing_consents USING btree (signingfileid, signeruserid, signingsessionid);


--
-- Name: signing_otp_challenges_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX signing_otp_challenges_lookup ON public.signing_otp_challenges USING btree (signingfileid, signingsessionid, expires_at_utc);


--
-- Name: uniq_signing_retention_warnings_signingfile; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uniq_signing_retention_warnings_signingfile ON public.signing_retention_warnings USING btree (signingfileid);


--
-- Name: uq_userdevices_fcmtoken_notnull; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_userdevices_fcmtoken_notnull ON public.userdevices USING btree (fcmtoken) WHERE (fcmtoken IS NOT NULL);


--
-- Name: audit_events audit_events_no_delete; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.block_audit_events_modification();


--
-- Name: audit_events audit_events_no_update; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.block_audit_events_modification();


--
-- Name: audit_events audit_events_actor_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_actor_userid_fkey FOREIGN KEY (actor_userid) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: audit_events audit_events_signaturespotid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_signaturespotid_fkey FOREIGN KEY (signaturespotid) REFERENCES public.signaturespots(signaturespotid) ON DELETE SET NULL;


--
-- Name: audit_events audit_events_signingfileid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_signingfileid_fkey FOREIGN KEY (signingfileid) REFERENCES public.signingfiles(signingfileid) ON DELETE SET NULL;


--
-- Name: birthday_greetings_sent birthday_greetings_sent_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.birthday_greetings_sent
    ADD CONSTRAINT birthday_greetings_sent_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(userid) ON DELETE CASCADE;


--
-- Name: case_users case_users_caseid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_users
    ADD CONSTRAINT case_users_caseid_fkey FOREIGN KEY (caseid) REFERENCES public.cases(caseid) ON DELETE CASCADE;


--
-- Name: case_users case_users_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.case_users
    ADD CONSTRAINT case_users_userid_fkey FOREIGN KEY (userid) REFERENCES public.users(userid) ON DELETE CASCADE;


--
-- Name: casedescriptions casedescriptions_caseid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casedescriptions
    ADD CONSTRAINT casedescriptions_caseid_fkey FOREIGN KEY (caseid) REFERENCES public.cases(caseid);


--
-- Name: cases cases_casetypeid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_casetypeid_fkey FOREIGN KEY (casetypeid) REFERENCES public.casetypes(casetypeid);


--
-- Name: cases cases_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_userid_fkey FOREIGN KEY (userid) REFERENCES public.users(userid);


--
-- Name: casetypedescriptions casetypedescriptions_casetypeid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.casetypedescriptions
    ADD CONSTRAINT casetypedescriptions_casetypeid_fkey FOREIGN KEY (casetypeid) REFERENCES public.casetypes(casetypeid);


--
-- Name: chatbot_messages chatbot_messages_session_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_messages
    ADD CONSTRAINT chatbot_messages_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.chatbot_sessions(id) ON DELETE CASCADE;


--
-- Name: chatbot_sessions chatbot_sessions_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chatbot_sessions
    ADD CONSTRAINT chatbot_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: email_templates email_templates_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: notification_channel_config notification_channel_config_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_channel_config
    ADD CONSTRAINT notification_channel_config_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: otps otps_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.otps
    ADD CONSTRAINT otps_userid_fkey FOREIGN KEY (userid) REFERENCES public.users(userid);


--
-- Name: platform_admins platform_admins_added_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_added_by_fkey FOREIGN KEY (added_by) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: platform_admins platform_admins_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_admins
    ADD CONSTRAINT platform_admins_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(userid) ON DELETE CASCADE;


--
-- Name: platform_settings platform_settings_updated_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.platform_settings
    ADD CONSTRAINT platform_settings_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: refresh_tokens refresh_tokens_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_userid_fkey FOREIGN KEY (userid) REFERENCES public.users(userid) ON DELETE CASCADE;


--
-- Name: reminder_templates reminder_templates_created_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.reminder_templates
    ADD CONSTRAINT reminder_templates_created_by_fkey FOREIGN KEY (created_by) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: scheduled_email_reminders scheduled_email_reminders_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.scheduled_email_reminders
    ADD CONSTRAINT scheduled_email_reminders_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: signaturespots signaturespots_signeruserid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signaturespots
    ADD CONSTRAINT signaturespots_signeruserid_fkey FOREIGN KEY (signeruserid) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: signaturespots signaturespots_signingfileid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signaturespots
    ADD CONSTRAINT signaturespots_signingfileid_fkey FOREIGN KEY (signingfileid) REFERENCES public.signingfiles(signingfileid) ON DELETE CASCADE;


--
-- Name: signing_consents signing_consents_signeruserid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_consents
    ADD CONSTRAINT signing_consents_signeruserid_fkey FOREIGN KEY (signeruserid) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: signing_consents signing_consents_signingfileid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_consents
    ADD CONSTRAINT signing_consents_signingfileid_fkey FOREIGN KEY (signingfileid) REFERENCES public.signingfiles(signingfileid) ON DELETE CASCADE;


--
-- Name: signing_otp_challenges signing_otp_challenges_signeruserid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_otp_challenges
    ADD CONSTRAINT signing_otp_challenges_signeruserid_fkey FOREIGN KEY (signeruserid) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: signing_otp_challenges signing_otp_challenges_signingfileid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_otp_challenges
    ADD CONSTRAINT signing_otp_challenges_signingfileid_fkey FOREIGN KEY (signingfileid) REFERENCES public.signingfiles(signingfileid) ON DELETE CASCADE;


--
-- Name: signing_retention_warnings signing_retention_warnings_signingfile_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_retention_warnings
    ADD CONSTRAINT signing_retention_warnings_signingfile_fkey FOREIGN KEY (signingfileid) REFERENCES public.signingfiles(signingfileid) ON DELETE CASCADE;


--
-- Name: signing_retention_warnings signing_retention_warnings_tenant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signing_retention_warnings
    ADD CONSTRAINT signing_retention_warnings_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES public.users(userid) ON DELETE CASCADE;


--
-- Name: signingfiles signingfiles_caseid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signingfiles
    ADD CONSTRAINT signingfiles_caseid_fkey FOREIGN KEY (caseid) REFERENCES public.cases(caseid) ON DELETE SET NULL;


--
-- Name: signingfiles signingfiles_clientid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signingfiles
    ADD CONSTRAINT signingfiles_clientid_fkey FOREIGN KEY (clientid) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: signingfiles signingfiles_lawyerid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signingfiles
    ADD CONSTRAINT signingfiles_lawyerid_fkey FOREIGN KEY (lawyerid) REFERENCES public.users(userid);


--
-- Name: signingfiles signingfiles_otpwaiveracknowledgedbyuserid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signingfiles
    ADD CONSTRAINT signingfiles_otpwaiveracknowledgedbyuserid_fkey FOREIGN KEY (otpwaiveracknowledgedbyuserid) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: signingfiles signingfiles_policyselectedbyuserid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.signingfiles
    ADD CONSTRAINT signingfiles_policyselectedbyuserid_fkey FOREIGN KEY (policyselectedbyuserid) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: stage_files stage_files_caseid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_files
    ADD CONSTRAINT stage_files_caseid_fkey FOREIGN KEY (caseid) REFERENCES public.cases(caseid) ON DELETE CASCADE;


--
-- Name: stage_files stage_files_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.stage_files
    ADD CONSTRAINT stage_files_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: template_attachments template_attachments_uploaded_by_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.template_attachments
    ADD CONSTRAINT template_attachments_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- Name: tenant_subscriptions tenant_subscriptions_plan_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_plan_key_fkey FOREIGN KEY (plan_key) REFERENCES public.subscription_plans(plan_key);


--
-- Name: tenant_subscriptions tenant_subscriptions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.users(userid) ON DELETE CASCADE;


--
-- Name: uploadedfiles uploadedfiles_caseid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.uploadedfiles
    ADD CONSTRAINT uploadedfiles_caseid_fkey FOREIGN KEY (caseid) REFERENCES public.cases(caseid);


--
-- Name: userdevices userdevices_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.userdevices
    ADD CONSTRAINT userdevices_userid_fkey FOREIGN KEY (userid) REFERENCES public.users(userid);


--
-- Name: usernotifications usernotifications_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.usernotifications
    ADD CONSTRAINT usernotifications_userid_fkey FOREIGN KEY (userid) REFERENCES public.users(userid);


--
-- PostgreSQL database dump complete
--

\unrestrict fmUQUUEUH4BLPAm6xkgc3eqb6vMvXtuum72xw6mhGbZfZNKqLiftYR8LAmMs0H7

