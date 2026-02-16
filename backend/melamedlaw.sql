--
-- PostgreSQL database dump
--

-- Dumped from database version 17.5
-- Dumped by pg_dump version 17.5

-- Started on 2026-02-16 00:09:27

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 255 (class 1255 OID 98391)
-- Name: block_audit_events_modification(); Type: FUNCTION; Schema: public; Owner: postgres
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

    RAISE EXCEPTION 'audit_events is append-only';
END;
$$;


ALTER FUNCTION public.block_audit_events_modification() OWNER TO postgres;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 242 (class 1259 OID 98364)
-- Name: audit_events; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.audit_events OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 16428)
-- Name: casedescriptions; Type: TABLE; Schema: public; Owner: liroym
--

CREATE TABLE public.casedescriptions (
    descriptionid integer NOT NULL,
    caseid integer,
    stage integer,
    text text,
    "timestamp" timestamp with time zone DEFAULT now(),
    isnew boolean
);


ALTER TABLE public.casedescriptions OWNER TO liroym;

--
-- TOC entry 223 (class 1259 OID 16427)
-- Name: casedescriptions_descriptionid_seq; Type: SEQUENCE; Schema: public; Owner: liroym
--

CREATE SEQUENCE public.casedescriptions_descriptionid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.casedescriptions_descriptionid_seq OWNER TO liroym;

--
-- TOC entry 5244 (class 0 OID 0)
-- Dependencies: 223
-- Name: casedescriptions_descriptionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liroym
--

ALTER SEQUENCE public.casedescriptions_descriptionid_seq OWNED BY public.casedescriptions.descriptionid;


--
-- TOC entry 222 (class 1259 OID 16408)
-- Name: cases; Type: TABLE; Schema: public; Owner: liroym
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
    licenseexpirydate date
);


ALTER TABLE public.cases OWNER TO liroym;

--
-- TOC entry 221 (class 1259 OID 16407)
-- Name: cases_caseid_seq; Type: SEQUENCE; Schema: public; Owner: liroym
--

CREATE SEQUENCE public.cases_caseid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.cases_caseid_seq OWNER TO liroym;

--
-- TOC entry 5245 (class 0 OID 0)
-- Dependencies: 221
-- Name: cases_caseid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liroym
--

ALTER SEQUENCE public.cases_caseid_seq OWNED BY public.cases.caseid;


--
-- TOC entry 226 (class 1259 OID 16443)
-- Name: casetypedescriptions; Type: TABLE; Schema: public; Owner: liroym
--

CREATE TABLE public.casetypedescriptions (
    casetypedescriptionid integer NOT NULL,
    casetypeid integer,
    stage integer,
    text text
);


ALTER TABLE public.casetypedescriptions OWNER TO liroym;

--
-- TOC entry 225 (class 1259 OID 16442)
-- Name: casetypedescriptions_casetypedescriptionid_seq; Type: SEQUENCE; Schema: public; Owner: liroym
--

CREATE SEQUENCE public.casetypedescriptions_casetypedescriptionid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.casetypedescriptions_casetypedescriptionid_seq OWNER TO liroym;

--
-- TOC entry 5246 (class 0 OID 0)
-- Dependencies: 225
-- Name: casetypedescriptions_casetypedescriptionid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liroym
--

ALTER SEQUENCE public.casetypedescriptions_casetypedescriptionid_seq OWNED BY public.casetypedescriptions.casetypedescriptionid;


--
-- TOC entry 220 (class 1259 OID 16401)
-- Name: casetypes; Type: TABLE; Schema: public; Owner: liroym
--

CREATE TABLE public.casetypes (
    casetypeid integer NOT NULL,
    casetypename character varying(100),
    numberofstages integer
);


ALTER TABLE public.casetypes OWNER TO liroym;

--
-- TOC entry 219 (class 1259 OID 16400)
-- Name: casetypes_casetypeid_seq; Type: SEQUENCE; Schema: public; Owner: liroym
--

CREATE SEQUENCE public.casetypes_casetypeid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.casetypes_casetypeid_seq OWNER TO liroym;

--
-- TOC entry 5247 (class 0 OID 0)
-- Dependencies: 219
-- Name: casetypes_casetypeid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liroym
--

ALTER SEQUENCE public.casetypes_casetypeid_seq OWNED BY public.casetypes.casetypeid;


--
-- TOC entry 245 (class 1259 OID 98555)
-- Name: data_retention_runs; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.data_retention_runs OWNER TO postgres;

--
-- TOC entry 251 (class 1259 OID 98648)
-- Name: firm_plan_overrides; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.firm_plan_overrides (
    firmid integer NOT NULL,
    unlimited_until_utc timestamp with time zone,
    notes text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.firm_plan_overrides OWNER TO postgres;

--
-- TOC entry 253 (class 1259 OID 98685)
-- Name: firm_signing_policy; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.firm_signing_policy (
    firmid integer NOT NULL,
    signing_enabled boolean DEFAULT false NOT NULL,
    signing_client_otp_required boolean DEFAULT false NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.firm_signing_policy OWNER TO postgres;

--
-- TOC entry 250 (class 1259 OID 98626)
-- Name: firm_subscriptions; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.firm_subscriptions (
    firmid integer NOT NULL,
    plan_key text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    starts_at timestamp with time zone DEFAULT now() NOT NULL,
    ends_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.firm_subscriptions OWNER TO postgres;

--
-- TOC entry 252 (class 1259 OID 98668)
-- Name: firm_usage_events; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.firm_usage_events (
    event_id uuid NOT NULL,
    firmid integer NOT NULL,
    meter_key text NOT NULL,
    quantity numeric NOT NULL,
    unit text,
    occurred_at timestamp with time zone DEFAULT now() NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL
);


ALTER TABLE public.firm_usage_events OWNER TO postgres;

--
-- TOC entry 249 (class 1259 OID 98606)
-- Name: firm_users; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.firm_users (
    firmid integer NOT NULL,
    userid integer NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.firm_users OWNER TO postgres;

--
-- TOC entry 248 (class 1259 OID 98594)
-- Name: firms; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.firms (
    firmid integer NOT NULL,
    firm_key text NOT NULL,
    name text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.firms OWNER TO postgres;

--
-- TOC entry 247 (class 1259 OID 98593)
-- Name: firms_firmid_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.firms_firmid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.firms_firmid_seq OWNER TO postgres;

--
-- TOC entry 5255 (class 0 OID 0)
-- Dependencies: 247
-- Name: firms_firmid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.firms_firmid_seq OWNED BY public.firms.firmid;


--
-- TOC entry 254 (class 1259 OID 114916)
-- Name: message_delivery_events; Type: TABLE; Schema: public; Owner: liroym
--

CREATE TABLE public.message_delivery_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    channel text NOT NULL,
    type text,
    idempotency_key text,
    metadata jsonb DEFAULT '{}'::jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


ALTER TABLE public.message_delivery_events OWNER TO liroym;

--
-- TOC entry 227 (class 1259 OID 16456)
-- Name: otps; Type: TABLE; Schema: public; Owner: liroym
--

CREATE TABLE public.otps (
    phonenumber character varying(20) NOT NULL,
    otp character varying(10) NOT NULL,
    expiry timestamp with time zone NOT NULL,
    userid integer NOT NULL,
    createdat timestamp with time zone DEFAULT now()
);


ALTER TABLE public.otps OWNER TO liroym;

--
-- TOC entry 239 (class 1259 OID 81924)
-- Name: refresh_tokens; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.refresh_tokens OWNER TO postgres;

--
-- TOC entry 238 (class 1259 OID 81923)
-- Name: refresh_tokens_refresh_token_id_seq; Type: SEQUENCE; Schema: public; Owner: postgres
--

CREATE SEQUENCE public.refresh_tokens_refresh_token_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.refresh_tokens_refresh_token_id_seq OWNER TO postgres;

--
-- TOC entry 5259 (class 0 OID 0)
-- Dependencies: 238
-- Name: refresh_tokens_refresh_token_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: postgres
--

ALTER SEQUENCE public.refresh_tokens_refresh_token_id_seq OWNED BY public.refresh_tokens.refresh_token_id;


--
-- TOC entry 237 (class 1259 OID 65566)
-- Name: signaturespots; Type: TABLE; Schema: public; Owner: liroym
--

CREATE TABLE public.signaturespots (
    signaturespotid integer NOT NULL,
    signingfileid integer NOT NULL,
    pagenumber integer NOT NULL,
    x numeric(6,2) NOT NULL,
    y numeric(6,2) NOT NULL,
    width numeric(8,2) DEFAULT 150 NOT NULL,
    height numeric(8,2) DEFAULT 75 NOT NULL,
    signername character varying(255),
    isrequired boolean DEFAULT true NOT NULL,
    issigned boolean DEFAULT false NOT NULL,
    signaturedata character varying(500),
    signedat timestamp without time zone,
    createdat timestamp without time zone DEFAULT now() NOT NULL,
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


ALTER TABLE public.signaturespots OWNER TO liroym;

--
-- TOC entry 236 (class 1259 OID 65565)
-- Name: signaturespots_signaturespotid_seq; Type: SEQUENCE; Schema: public; Owner: liroym
--

CREATE SEQUENCE public.signaturespots_signaturespotid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.signaturespots_signaturespotid_seq OWNER TO liroym;

--
-- TOC entry 5261 (class 0 OID 0)
-- Dependencies: 236
-- Name: signaturespots_signaturespotid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liroym
--

ALTER SEQUENCE public.signaturespots_signaturespotid_seq OWNED BY public.signaturespots.signaturespotid;


--
-- TOC entry 240 (class 1259 OID 98325)
-- Name: signing_consents; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.signing_consents OWNER TO postgres;

--
-- TOC entry 241 (class 1259 OID 98343)
-- Name: signing_otp_challenges; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.signing_otp_challenges OWNER TO postgres;

--
-- TOC entry 246 (class 1259 OID 98571)
-- Name: signing_retention_warnings; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.signing_retention_warnings OWNER TO postgres;

--
-- TOC entry 235 (class 1259 OID 65540)
-- Name: signingfiles; Type: TABLE; Schema: public; Owner: liroym
--

CREATE TABLE public.signingfiles (
    signingfileid integer NOT NULL,
    caseid integer,
    lawyerid integer NOT NULL,
    clientid integer,
    filename character varying(255) NOT NULL,
    filekey character varying(500) NOT NULL,
    originalfilekey character varying(500),
    status character varying(20) DEFAULT 'pending'::character varying NOT NULL,
    signedfilekey character varying(500),
    signedat timestamp without time zone,
    createdat timestamp without time zone DEFAULT now() NOT NULL,
    expiresat timestamp without time zone,
    rejectionreason text,
    notes text,
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
    firmid integer,
    unsignedpdfbytes bigint,
    signedpdfbytes bigint,
    CONSTRAINT signingfiles_originalpdfsha256_len_chk CHECK (((originalpdfsha256 IS NULL) OR (length(originalpdfsha256) = 64))),
    CONSTRAINT signingfiles_presentedpdfsha256_len_chk CHECK (((presentedpdfsha256 IS NULL) OR (length(presentedpdfsha256) = 64))),
    CONSTRAINT signingfiles_signedpdfsha256_len_chk CHECK (((signedpdfsha256 IS NULL) OR (length(signedpdfsha256) = 64)))
);


ALTER TABLE public.signingfiles OWNER TO liroym;

--
-- TOC entry 234 (class 1259 OID 65539)
-- Name: signingfiles_signingfileid_seq; Type: SEQUENCE; Schema: public; Owner: liroym
--

CREATE SEQUENCE public.signingfiles_signingfileid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.signingfiles_signingfileid_seq OWNER TO liroym;

--
-- TOC entry 5265 (class 0 OID 0)
-- Dependencies: 234
-- Name: signingfiles_signingfileid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liroym
--

ALTER SEQUENCE public.signingfiles_signingfileid_seq OWNED BY public.signingfiles.signingfileid;


--
-- TOC entry 243 (class 1259 OID 98524)
-- Name: subscription_plans; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.subscription_plans OWNER TO postgres;

--
-- TOC entry 244 (class 1259 OID 98535)
-- Name: tenant_subscriptions; Type: TABLE; Schema: public; Owner: postgres
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


ALTER TABLE public.tenant_subscriptions OWNER TO postgres;

--
-- TOC entry 229 (class 1259 OID 16468)
-- Name: uploadedfiles; Type: TABLE; Schema: public; Owner: liroym
--

CREATE TABLE public.uploadedfiles (
    uploadedfileid integer NOT NULL,
    caseid integer,
    filepath text,
    uploaddate timestamp with time zone DEFAULT now()
);


ALTER TABLE public.uploadedfiles OWNER TO liroym;

--
-- TOC entry 228 (class 1259 OID 16467)
-- Name: uploadedfiles_uploadedfileid_seq; Type: SEQUENCE; Schema: public; Owner: liroym
--

CREATE SEQUENCE public.uploadedfiles_uploadedfileid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.uploadedfiles_uploadedfileid_seq OWNER TO liroym;

--
-- TOC entry 5268 (class 0 OID 0)
-- Dependencies: 228
-- Name: uploadedfiles_uploadedfileid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liroym
--

ALTER SEQUENCE public.uploadedfiles_uploadedfileid_seq OWNED BY public.uploadedfiles.uploadedfileid;


--
-- TOC entry 231 (class 1259 OID 16483)
-- Name: userdevices; Type: TABLE; Schema: public; Owner: liroym
--

CREATE TABLE public.userdevices (
    deviceid integer NOT NULL,
    userid integer,
    fcmtoken character varying(255) NOT NULL,
    devicetype character varying(50),
    createdat timestamp with time zone DEFAULT now()
);


ALTER TABLE public.userdevices OWNER TO liroym;

--
-- TOC entry 230 (class 1259 OID 16482)
-- Name: userdevices_deviceid_seq; Type: SEQUENCE; Schema: public; Owner: liroym
--

CREATE SEQUENCE public.userdevices_deviceid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.userdevices_deviceid_seq OWNER TO liroym;

--
-- TOC entry 5269 (class 0 OID 0)
-- Dependencies: 230
-- Name: userdevices_deviceid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liroym
--

ALTER SEQUENCE public.userdevices_deviceid_seq OWNED BY public.userdevices.deviceid;


--
-- TOC entry 233 (class 1259 OID 16496)
-- Name: usernotifications; Type: TABLE; Schema: public; Owner: liroym
--

CREATE TABLE public.usernotifications (
    notificationid integer NOT NULL,
    userid integer NOT NULL,
    title character varying(100),
    message character varying(500),
    isread boolean DEFAULT false,
    createdat timestamp with time zone DEFAULT now()
);


ALTER TABLE public.usernotifications OWNER TO liroym;

--
-- TOC entry 232 (class 1259 OID 16495)
-- Name: usernotifications_notificationid_seq; Type: SEQUENCE; Schema: public; Owner: liroym
--

CREATE SEQUENCE public.usernotifications_notificationid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.usernotifications_notificationid_seq OWNER TO liroym;

--
-- TOC entry 5270 (class 0 OID 0)
-- Dependencies: 232
-- Name: usernotifications_notificationid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liroym
--

ALTER SEQUENCE public.usernotifications_notificationid_seq OWNED BY public.usernotifications.notificationid;


--
-- TOC entry 218 (class 1259 OID 16391)
-- Name: users; Type: TABLE; Schema: public; Owner: liroym
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


ALTER TABLE public.users OWNER TO liroym;

--
-- TOC entry 217 (class 1259 OID 16390)
-- Name: users_userid_seq; Type: SEQUENCE; Schema: public; Owner: liroym
--

CREATE SEQUENCE public.users_userid_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_userid_seq OWNER TO liroym;

--
-- TOC entry 5271 (class 0 OID 0)
-- Dependencies: 217
-- Name: users_userid_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: liroym
--

ALTER SEQUENCE public.users_userid_seq OWNED BY public.users.userid;


--
-- TOC entry 4862 (class 2604 OID 16431)
-- Name: casedescriptions descriptionid; Type: DEFAULT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.casedescriptions ALTER COLUMN descriptionid SET DEFAULT nextval('public.casedescriptions_descriptionid_seq'::regclass);


--
-- TOC entry 4860 (class 2604 OID 16411)
-- Name: cases caseid; Type: DEFAULT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.cases ALTER COLUMN caseid SET DEFAULT nextval('public.cases_caseid_seq'::regclass);


--
-- TOC entry 4864 (class 2604 OID 16446)
-- Name: casetypedescriptions casetypedescriptionid; Type: DEFAULT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.casetypedescriptions ALTER COLUMN casetypedescriptionid SET DEFAULT nextval('public.casetypedescriptions_casetypedescriptionid_seq'::regclass);


--
-- TOC entry 4859 (class 2604 OID 16404)
-- Name: casetypes casetypeid; Type: DEFAULT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.casetypes ALTER COLUMN casetypeid SET DEFAULT nextval('public.casetypes_casetypeid_seq'::regclass);


--
-- TOC entry 4906 (class 2604 OID 98597)
-- Name: firms firmid; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firms ALTER COLUMN firmid SET DEFAULT nextval('public.firms_firmid_seq'::regclass);


--
-- TOC entry 4887 (class 2604 OID 81927)
-- Name: refresh_tokens refresh_token_id; Type: DEFAULT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens ALTER COLUMN refresh_token_id SET DEFAULT nextval('public.refresh_tokens_refresh_token_id_seq'::regclass);


--
-- TOC entry 4880 (class 2604 OID 65569)
-- Name: signaturespots signaturespotid; Type: DEFAULT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.signaturespots ALTER COLUMN signaturespotid SET DEFAULT nextval('public.signaturespots_signaturespotid_seq'::regclass);


--
-- TOC entry 4873 (class 2604 OID 65543)
-- Name: signingfiles signingfileid; Type: DEFAULT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.signingfiles ALTER COLUMN signingfileid SET DEFAULT nextval('public.signingfiles_signingfileid_seq'::regclass);


--
-- TOC entry 4866 (class 2604 OID 16471)
-- Name: uploadedfiles uploadedfileid; Type: DEFAULT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.uploadedfiles ALTER COLUMN uploadedfileid SET DEFAULT nextval('public.uploadedfiles_uploadedfileid_seq'::regclass);


--
-- TOC entry 4868 (class 2604 OID 16486)
-- Name: userdevices deviceid; Type: DEFAULT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.userdevices ALTER COLUMN deviceid SET DEFAULT nextval('public.userdevices_deviceid_seq'::regclass);


--
-- TOC entry 4870 (class 2604 OID 16499)
-- Name: usernotifications notificationid; Type: DEFAULT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.usernotifications ALTER COLUMN notificationid SET DEFAULT nextval('public.usernotifications_notificationid_seq'::regclass);


--
-- TOC entry 4857 (class 2604 OID 16394)
-- Name: users userid; Type: DEFAULT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.users ALTER COLUMN userid SET DEFAULT nextval('public.users_userid_seq'::regclass);


--
-- TOC entry 5223 (class 0 OID 98364)
-- Dependencies: 242
-- Data for Name: audit_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.audit_events (eventid, occurred_at_utc, event_type, signingfileid, signaturespotid, actor_userid, actor_type, ip, user_agent, signing_session_id, request_id, success, metadata, prev_event_hash, event_hash) FROM stdin;
12deee95-6f01-498f-84f3-425096b7c992	2026-01-15 15:12:58.693+02	SIGNING_POLICY_SELECTED	13	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": false, "requireOtp": true, "selectionExplicit": false, "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": false, "selectedByLawyerUserId": 1}	\N	4106f1e2058f8c7687fa1a141f33b6a1b08169492d4e611abdbdf77b31b274fc
2d1bdc91-3b9c-44a7-8564-849d69473377	2026-01-15 15:12:58.996+02	PUBLIC_LINK_ISSUED	13	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": false, "requireOtp": true, "targetSignerUserId": 23, "signingPolicyVersion": "2026-01-11"}	4106f1e2058f8c7687fa1a141f33b6a1b08169492d4e611abdbdf77b31b274fc	d04da7c5353c7c0935f693b212c9998f4434906ce69936c9457bcbe2e198e599
26d6b14b-7a27-443c-a32f-2b35763084d2	2026-01-15 15:12:59.007+02	PUBLIC_LINK_ISSUED	13	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": false, "requireOtp": true, "targetSignerUserId": 2, "signingPolicyVersion": "2026-01-11"}	d04da7c5353c7c0935f693b212c9998f4434906ce69936c9457bcbe2e198e599	a6f6e9cc6223f3d452dbf672b9e62993c66477341b1dfa33c56b8a27e0d53d03
a1257b3f-df12-41be-9466-ff014f5cb60d	2026-01-15 15:13:19.846+02	PDF_VIEWED	13	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	938ff44f-b8f9-4d1d-b94f-800f4b32428d	\N	t	{"range": null}	a6f6e9cc6223f3d452dbf672b9e62993c66477341b1dfa33c56b8a27e0d53d03	0bd9ac942f59149c45dbf382c360784d18021ea65aec5e61c795d8cda938116e
2cbc2233-ab4f-40df-87e9-640fcd096bab	2026-01-15 15:33:22.023+02	PDF_VIEWED	13	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	938ff44f-b8f9-4d1d-b94f-800f4b32428d	\N	t	{"range": null}	0bd9ac942f59149c45dbf382c360784d18021ea65aec5e61c795d8cda938116e	6b2a450f25c9748aa7ccfdbcb8b3ec40d9a12c51a5479b687e3c83ffaa5baa75
d1f511d4-b456-49ac-9b94-b572ec60fe9c	2026-01-15 15:40:53.028+02	PDF_VIEWED	13	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	938ff44f-b8f9-4d1d-b94f-800f4b32428d	\N	t	{"range": null}	6b2a450f25c9748aa7ccfdbcb8b3ec40d9a12c51a5479b687e3c83ffaa5baa75	1d07dc67fe47c3992b694e872e07234704ae8991cbab6811e5acdccac7003ba0
660e257b-2e5f-4974-805b-e1c4e6a9a249	2026-01-15 15:51:55.52+02	PDF_VIEWED	13	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	ef3e1ef4-08b9-44e1-9a66-d1d6ec5797e1	\N	t	{"range": null}	1d07dc67fe47c3992b694e872e07234704ae8991cbab6811e5acdccac7003ba0	32c475229f70760ebced94bc003ff3c26b12f998a674f7be009e8f0a80a41382
b1e77017-163c-4a86-b12c-11188c839b62	2026-01-15 15:54:22.679+02	PDF_VIEWED	13	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	414e0218-1736-4574-8c3a-c40bb57d26cd	\N	t	{"range": null}	32c475229f70760ebced94bc003ff3c26b12f998a674f7be009e8f0a80a41382	03ad0a992208992c6f8b70df845dbe50b55138385843333a3abe9af0de8b3eb9
fbfcc463-635d-4e08-9ef8-26f9beb5ec1f	2026-01-15 15:54:29.758+02	PDF_VIEWED	13	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	d515e31e-b412-4362-be7f-8cdce8142648	\N	t	{"range": null}	03ad0a992208992c6f8b70df845dbe50b55138385843333a3abe9af0de8b3eb9	ad5f7b91321a87f859f1fed82604fb1bacf84eb4d6324a1b68ffa13e9cafa6cd
bb80615d-00ee-4523-aeb9-50b179e0ca19	2026-01-15 15:55:38.313+02	PDF_VIEWED	13	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	35bb4b37-e373-4b8b-a975-4d21788aa5ce	\N	t	{"range": null}	ad5f7b91321a87f859f1fed82604fb1bacf84eb4d6324a1b68ffa13e9cafa6cd	e37fbed39ab9d3eed151229aaa2a792242c4a1b294148e39b8f1494ad25a2ff6
d856dad6-b445-4e5d-9399-12aa12dd06ed	2026-01-15 15:57:21.451+02	SIGNING_POLICY_SELECTED	14	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": false, "requireOtp": true, "selectionExplicit": false, "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": false, "selectedByLawyerUserId": 1}	\N	e3d96cb25e63de60208b1baf049e2830e60db5a34bba5bae97079b30bebb719d
f55d5fd7-5ae3-427c-8d1d-b6705c1e1fc9	2026-01-15 15:57:23.528+02	PUBLIC_LINK_ISSUED	14	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": false, "requireOtp": true, "targetSignerUserId": 2, "signingPolicyVersion": "2026-01-11"}	e3d96cb25e63de60208b1baf049e2830e60db5a34bba5bae97079b30bebb719d	8605d03eda32b09b8bffa9e228766130e93986055fa77fb82ae896ef140c793f
60ca4045-5212-4985-b680-c95f9cc8d126	2026-01-15 15:57:23.535+02	PUBLIC_LINK_ISSUED	14	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": false, "requireOtp": true, "targetSignerUserId": 23, "signingPolicyVersion": "2026-01-11"}	8605d03eda32b09b8bffa9e228766130e93986055fa77fb82ae896ef140c793f	0756c4cb8d2113611d80a7a93868313269ae9e498eeff0ec2bafc7b6073acf24
e3a5daa5-4c61-49fd-91ba-65373d237148	2026-01-15 15:57:33.236+02	PDF_VIEWED	14	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	ee7050f0-5451-4748-a6d6-df63a83f9bd0	\N	t	{"range": null}	0756c4cb8d2113611d80a7a93868313269ae9e498eeff0ec2bafc7b6073acf24	ec5fc468b1e8ebd9b467f363f42dd90686edf1eacb3a9da2c72ac52a13c6ab19
906c104d-6ebf-467f-99e9-e53310fbe568	2026-01-15 15:57:43.12+02	PDF_VIEWED	14	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	ea63706a-dd8d-494d-bc6c-ad00c3d5fe92	\N	t	{"range": null}	ec5fc468b1e8ebd9b467f363f42dd90686edf1eacb3a9da2c72ac52a13c6ab19	987eb5385c45050b4a32267ae32c7ea4d9923578d30476ebec9431f23cbbf613
3f8917f0-ca06-4053-97d3-0e496cddc9b6	2026-01-15 16:14:00.366+02	SIGN_ATTEMPT	14	28	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	ea63706a-dd8d-494d-bc6c-ad00c3d5fe92	\N	f	{"failure": "OTP_REQUIRED", "requireOtp": true, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a"}	987eb5385c45050b4a32267ae32c7ea4d9923578d30476ebec9431f23cbbf613	6dca2dff542e2efdc317ca5e438853c7f41b60821178484a170cb66cd02c21e3
2f86ef2a-b84e-4d72-9ae7-02af0f5f343a	2026-01-15 16:14:13.189+02	SIGN_ATTEMPT	14	28	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	ea63706a-dd8d-494d-bc6c-ad00c3d5fe92	\N	f	{"failure": "OTP_REQUIRED", "requireOtp": true, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a"}	6dca2dff542e2efdc317ca5e438853c7f41b60821178484a170cb66cd02c21e3	69eb2f1d3dd9f9265f631814db4a515d2cb4ccfd1e302e34e9bb475e1016422d
a4c32f7f-fdd1-4c62-94d8-8663f3644640	2026-01-15 16:18:09.128+02	SIGN_ATTEMPT	14	28	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	ea63706a-dd8d-494d-bc6c-ad00c3d5fe92	\N	t	{"consentId": "4c3d771d-2193-4d7f-a9d0-6eeb810b8fa9", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": false}	69eb2f1d3dd9f9265f631814db4a515d2cb4ccfd1e302e34e9bb475e1016422d	32d94747bd4351c6c08bb4213051d11706da58c39139a19f918b829c35030350
66226389-5c29-4536-9c05-9757ad5d779b	2026-01-15 16:18:09.61+02	SIGN_SUCCESS	14	28	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	ea63706a-dd8d-494d-bc6c-ad00c3d5fe92	\N	t	{"consentId": "4c3d771d-2193-4d7f-a9d0-6eeb810b8fa9", "otpWaived": false, "requireOtp": true, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	32d94747bd4351c6c08bb4213051d11706da58c39139a19f918b829c35030350	890d0362d69aceb68b0123449299644e62fa64516e30f9c94885f8697f155b3f
debbe469-016d-4088-a12c-626ef4812d25	2026-01-15 16:51:04.761+02	PDF_VIEWED	14	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"range": null}	890d0362d69aceb68b0123449299644e62fa64516e30f9c94885f8697f155b3f	6dce8c5e4fb4a93ae05f11422ec62e767c554dabe0a142ebda8b30c9f77a905e
3f3c676d-4d85-4bdc-8a0c-88b5c82e20ba	2026-01-15 16:51:16.202+02	PDF_VIEWED	14	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6430d357-ae15-4bce-8c10-28d25dbbd790	\N	t	{"range": null}	6dce8c5e4fb4a93ae05f11422ec62e767c554dabe0a142ebda8b30c9f77a905e	6fc9dc993b528203996cc9fc39fe9cbaf5c0f5f2233055fde2a85d1096d56913
27bccf67-f56d-4c76-b3fa-ca8ff5e7f477	2026-01-15 16:51:19.874+02	PDF_VIEWED	14	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	65f6f1ea-28f2-458f-a43f-f37ad54906b1	\N	t	{"range": null}	6fc9dc993b528203996cc9fc39fe9cbaf5c0f5f2233055fde2a85d1096d56913	cc7b21785cc646e97fc0d9e0f6b639fb374f55e25fc99d76abd65e5130564827
a9a4a7fd-00ea-4adb-b753-06d0f9b1d14c	2026-01-15 16:51:32.215+02	SIGN_ATTEMPT	14	29	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	65f6f1ea-28f2-458f-a43f-f37ad54906b1	\N	t	{"consentId": "b82e2340-8224-4848-a59b-1c2e3fc0752f", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": false}	cc7b21785cc646e97fc0d9e0f6b639fb374f55e25fc99d76abd65e5130564827	8c8102f9346f6c1880d988ac7cf3d904fe56d3387bd72e515357955a8de7af66
a9cd9086-360f-47c4-b5ec-609acf722ab4	2026-01-15 16:51:32.669+02	SIGN_SUCCESS	14	29	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	65f6f1ea-28f2-458f-a43f-f37ad54906b1	\N	t	{"consentId": "b82e2340-8224-4848-a59b-1c2e3fc0752f", "otpWaived": false, "requireOtp": true, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	8c8102f9346f6c1880d988ac7cf3d904fe56d3387bd72e515357955a8de7af66	c2835789e338ad8da5b81f18b32022f181bf687c4a69dd6476764a8aee42bf68
dd6ff935-e970-4c38-be8d-fa81229df3eb	2026-01-15 16:51:34.533+02	SIGN_ATTEMPT	14	36	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	65f6f1ea-28f2-458f-a43f-f37ad54906b1	\N	t	{"consentId": "b82e2340-8224-4848-a59b-1c2e3fc0752f", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": false}	c2835789e338ad8da5b81f18b32022f181bf687c4a69dd6476764a8aee42bf68	9569a6d7677deee5298595272fa8a5901fa9fa5eed3bc3f11c4ae34c1dc9427e
4bc15f40-cb77-4e27-891e-5af9e125d205	2026-01-15 16:51:35.024+02	SIGN_SUCCESS	14	36	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	65f6f1ea-28f2-458f-a43f-f37ad54906b1	\N	t	{"consentId": "b82e2340-8224-4848-a59b-1c2e3fc0752f", "otpWaived": false, "requireOtp": true, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	9569a6d7677deee5298595272fa8a5901fa9fa5eed3bc3f11c4ae34c1dc9427e	26ac85b62bfd4fc5e72d2f1c8a488fc9daf106b747f946a51588545bf3bbcda8
6663328f-752a-4b62-badf-441f7e43f94b	2026-01-15 16:58:19.046+02	PDF_VIEWED	14	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	65f6f1ea-28f2-458f-a43f-f37ad54906b1	\N	t	{"range": null}	26ac85b62bfd4fc5e72d2f1c8a488fc9daf106b747f946a51588545bf3bbcda8	5befca711bbc630722e288b639f408d7f8cd2b6da8eca0bca33505e8bf6726ba
f568ec9d-4f98-4381-9abc-9949e6e3f119	2026-01-15 16:58:19.099+02	PDF_VIEWED	14	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6430d357-ae15-4bce-8c10-28d25dbbd790	\N	t	{"range": null}	5befca711bbc630722e288b639f408d7f8cd2b6da8eca0bca33505e8bf6726ba	79babdfbfa0fd42ad0ad1bb466b0e264b9e2cd73d07ff1afb98478a6d50adfa4
05987e0c-c2d3-4251-b4c1-b4a17ecbaf19	2026-01-15 17:28:28.485+02	SIGNING_POLICY_SELECTED	15	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": true, "requireOtp": false, "selectionExplicit": false, "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true, "selectedByLawyerUserId": 1}	\N	84608c449a8bf5023f91785c4e39f88809682a92f9fcaad7a1ddad98a204a208
068c394e-1599-4225-a26e-12d0af4463e0	2026-01-15 17:28:28.788+02	PUBLIC_LINK_ISSUED	15	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": true, "requireOtp": false, "targetSignerUserId": 2, "signingPolicyVersion": "2026-01-11"}	84608c449a8bf5023f91785c4e39f88809682a92f9fcaad7a1ddad98a204a208	17af2d6a9612f01a94477c1f46645ff9ef9bdc4c0394151ed0a974d5a2abd884
c9afc16c-6d31-4fe1-bd1c-1217fc80d391	2026-01-15 17:28:28.795+02	PUBLIC_LINK_ISSUED	15	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": true, "requireOtp": false, "targetSignerUserId": 23, "signingPolicyVersion": "2026-01-11"}	17af2d6a9612f01a94477c1f46645ff9ef9bdc4c0394151ed0a974d5a2abd884	90e741b75a991b3e89b38f9bad9389a3e38c2c2857fe5c18e0b4f539523d90d9
b472e762-4c6a-436d-a19d-86b78a52360f	2026-01-15 17:28:35.129+02	PDF_VIEWED	15	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	1b8efe2a-209f-4afc-b2c4-7df7377679e5	\N	t	{"range": null}	90e741b75a991b3e89b38f9bad9389a3e38c2c2857fe5c18e0b4f539523d90d9	3ed0e6826bc5cbbaea9f0a3115c7a264af0e673c42e6ebd28acff3a9a5f7dd90
4646ad4c-228c-422e-8931-e12942557f9b	2026-01-15 17:28:54.465+02	PDF_VIEWED	15	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	f23d1c00-636b-4096-8f56-53c19bb3e084	\N	t	{"range": null}	3ed0e6826bc5cbbaea9f0a3115c7a264af0e673c42e6ebd28acff3a9a5f7dd90	407ed10d469b7af5d17f619cbd977874f96fd29ddef74e4c1b7562f2a2fb4c4b
69193790-710a-4784-84da-b15ce09f0cfb	2026-01-15 17:29:16.8+02	SIGN_ATTEMPT	15	37	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	f23d1c00-636b-4096-8f56-53c19bb3e084	\N	t	{"consentId": "4e6beb55-c7b5-4eef-8432-6eedd3fa76db", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "6825425d09c5e381ee513e64aed18aaf6efbf36f9e893864731afa99ea79ff54", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	407ed10d469b7af5d17f619cbd977874f96fd29ddef74e4c1b7562f2a2fb4c4b	52f5389a3d39c80b7137555d17e86bb048cbd5f173ad6f06429761b40da3ce68
8d39100a-a60a-4eed-8c13-7bca4aaba4a7	2026-01-15 17:29:17.089+02	SIGN_SUCCESS	15	37	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	f23d1c00-636b-4096-8f56-53c19bb3e084	\N	t	{"consentId": "4e6beb55-c7b5-4eef-8432-6eedd3fa76db", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "6825425d09c5e381ee513e64aed18aaf6efbf36f9e893864731afa99ea79ff54", "signingPolicyVersion": "2026-01-11"}	52f5389a3d39c80b7137555d17e86bb048cbd5f173ad6f06429761b40da3ce68	95071b8384cab3686e2b91f6268df80a4c7f97cfe9a3829951fec2578581e754
7e7f20d2-1e90-4b17-ab68-c621f0428c15	2026-01-15 17:29:24.857+02	SIGN_ATTEMPT	15	41	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	1b8efe2a-209f-4afc-b2c4-7df7377679e5	\N	t	{"consentId": "b7077b11-a293-461b-b6b4-6ac803e28daf", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "6825425d09c5e381ee513e64aed18aaf6efbf36f9e893864731afa99ea79ff54", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	95071b8384cab3686e2b91f6268df80a4c7f97cfe9a3829951fec2578581e754	b111155fd730b46271565e9a975c0f31e892eafe01a06193ff45fb8dc4ebbe0c
62ffd32d-5cc7-4c79-b611-f52775cb5a78	2026-01-15 17:29:25.212+02	SIGN_SUCCESS	15	41	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	1b8efe2a-209f-4afc-b2c4-7df7377679e5	\N	t	{"consentId": "b7077b11-a293-461b-b6b4-6ac803e28daf", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "6825425d09c5e381ee513e64aed18aaf6efbf36f9e893864731afa99ea79ff54", "signingPolicyVersion": "2026-01-11"}	b111155fd730b46271565e9a975c0f31e892eafe01a06193ff45fb8dc4ebbe0c	00429fe5374f1a231ba4b2edd0319b0ca832b459a2378c27b6c3cba5b132e84f
4e01526f-7d54-49ed-b105-bb4c3ae689f3	2026-01-15 17:39:43.052+02	PDF_VIEWED	15	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	f23d1c00-636b-4096-8f56-53c19bb3e084	\N	t	{"range": null}	00429fe5374f1a231ba4b2edd0319b0ca832b459a2378c27b6c3cba5b132e84f	60e5b8570e9e13e4048946a7edbcc037106e4245dd5bb184ba4ef5c79811b119
00aa89c6-10fa-455d-88db-76a67d5cdfdc	2026-01-15 17:39:43.053+02	PDF_VIEWED	15	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	1b8efe2a-209f-4afc-b2c4-7df7377679e5	\N	t	{"range": null}	00429fe5374f1a231ba4b2edd0319b0ca832b459a2378c27b6c3cba5b132e84f	d7bdf7c15b739b52d4a6a9e7178b4b3b2b59aa4ad2a9a7a0eb3238a50927afa9
31d1f342-02af-44d5-87d4-183d8d45e2b3	2026-01-15 17:59:08.432+02	SIGNING_POLICY_SELECTED	16	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": true, "requireOtp": false, "selectionExplicit": false, "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true, "selectedByLawyerUserId": 1}	\N	ba6eae1eaf2d2cabb7e33706ad4c9560e4751bbc7010318fe280e7a14fcd2cce
80b62484-03c0-4718-bec0-04c0adfc6503	2026-01-15 17:59:08.756+02	PUBLIC_LINK_ISSUED	16	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": true, "requireOtp": false, "targetSignerUserId": 2, "signingPolicyVersion": "2026-01-11"}	ba6eae1eaf2d2cabb7e33706ad4c9560e4751bbc7010318fe280e7a14fcd2cce	c47737455fae8f5123132c3e474db6479a87876f9707123ce98e8f18b95b4e35
3bd91bd8-901c-4bbc-bb77-99d96665dc2d	2026-01-15 17:59:08.764+02	PUBLIC_LINK_ISSUED	16	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": true, "requireOtp": false, "targetSignerUserId": 23, "signingPolicyVersion": "2026-01-11"}	c47737455fae8f5123132c3e474db6479a87876f9707123ce98e8f18b95b4e35	fdd0c68af3dbc249fbeaf57b0362c45f684eb86f0b6138656522c98809b4fbe0
d0d93147-81fb-4411-91c0-ba66d21d0be6	2026-01-15 17:59:20.821+02	PDF_VIEWED	15	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	1b8efe2a-209f-4afc-b2c4-7df7377679e5	\N	t	{"range": null}	d7bdf7c15b739b52d4a6a9e7178b4b3b2b59aa4ad2a9a7a0eb3238a50927afa9	900882c238ce6165adcd4e60aec91064f57bdd914e772f9ce065db36c722cab9
7933493b-4e79-49d2-b1a1-23d562a39275	2026-01-15 17:59:20.982+02	PDF_VIEWED	15	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	f23d1c00-636b-4096-8f56-53c19bb3e084	\N	t	{"range": null}	900882c238ce6165adcd4e60aec91064f57bdd914e772f9ce065db36c722cab9	fd4183740f701b6c2de0afef20008832af8f88656bc461046798a488f7dea041
4ab07e82-31ba-4d49-a12c-4598a46d2d45	2026-01-15 17:59:25.379+02	PDF_VIEWED	16	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	e0c544d6-f4c5-427b-83bd-1ab3c2acac36	\N	t	{"range": null}	fdd0c68af3dbc249fbeaf57b0362c45f684eb86f0b6138656522c98809b4fbe0	014e404d97cd58dbc3e7dcd5ffca9cbe1dbad69fb22169bac693b6b8a70d0589
d5ca8c3e-38cf-4878-9f87-7d88bad2a910	2026-01-15 18:08:31.044+02	PDF_VIEWED	15	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	f23d1c00-636b-4096-8f56-53c19bb3e084	\N	t	{"range": null}	fd4183740f701b6c2de0afef20008832af8f88656bc461046798a488f7dea041	ae9926f2bae4300443d2d388f09ca557f592c2778fb95236472d91de4cb5c8e6
24106df6-51fe-4f48-8a5c-2dbcc8c8371b	2026-01-15 18:10:07.038+02	PDF_VIEWED	15	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	f23d1c00-636b-4096-8f56-53c19bb3e084	\N	t	{"range": null}	ae9926f2bae4300443d2d388f09ca557f592c2778fb95236472d91de4cb5c8e6	f8c56d2a18cc6d51cdd05055f5929dd5f08db599497e35da7ba52a21d43af9ce
bf8d24b8-802e-4faa-a320-743a68e8dabf	2026-01-15 18:10:07.041+02	PDF_VIEWED	16	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	e0c544d6-f4c5-427b-83bd-1ab3c2acac36	\N	t	{"range": null}	014e404d97cd58dbc3e7dcd5ffca9cbe1dbad69fb22169bac693b6b8a70d0589	d50c83f014d35c09dff936c715e94f1667e3c37f0d20c0ea81e185dc4da04ab1
d05c4da5-7830-44b0-87b1-1fa766ff17ca	2026-01-15 18:16:37.155+02	PDF_VIEWED	15	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	f23d1c00-636b-4096-8f56-53c19bb3e084	\N	t	{"range": null}	f8c56d2a18cc6d51cdd05055f5929dd5f08db599497e35da7ba52a21d43af9ce	f8ac29fd4fbef9da554b6829ae5268aa77685557f9113926dd5349f40728582b
06bfdd31-4b83-49e1-bf82-2c8a7415205b	2026-01-15 18:16:37.156+02	PDF_VIEWED	16	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	e0c544d6-f4c5-427b-83bd-1ab3c2acac36	\N	t	{"range": null}	d50c83f014d35c09dff936c715e94f1667e3c37f0d20c0ea81e185dc4da04ab1	077188887d90f6ccbbcf31af9f90892fbe0f8d0bec5d7abac6cb6c666de0e92e
637f3570-1f6b-49f5-b1cc-2c8374ccaa9a	2026-01-15 18:18:15.744+02	PDF_VIEWED	16	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	9e9d3369-68f4-4bee-9283-93b17f49f0c4	\N	t	{"range": null}	077188887d90f6ccbbcf31af9f90892fbe0f8d0bec5d7abac6cb6c666de0e92e	0201f2680c71676251b5c59ec02c3e1f0784fc922620c22d5a487be27f88d1ea
b12fe582-bdf9-4ebc-a210-c7e4039289df	2026-01-15 18:18:40.311+02	PDF_VIEWED	15	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	49e161ef-367b-410a-85af-e069a854260e	\N	t	{"range": null}	f8ac29fd4fbef9da554b6829ae5268aa77685557f9113926dd5349f40728582b	951bf38f86b7ac53dcbb3f8384fc37fca81b9aea48e39b7b4d7bf4c3dd893929
b56a9a75-f418-4e26-80df-ca2e20c19bae	2026-01-15 18:20:18.079+02	SIGNING_POLICY_SELECTED	17	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": true, "requireOtp": false, "selectionExplicit": false, "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true, "selectedByLawyerUserId": 1}	\N	43c565e7a11adecdb7819134f7893b545df258080f20bad791e24ebe219c68f0
7bbc1dfb-13a4-4893-ab49-6edc1a00dff6	2026-01-15 18:20:18.373+02	PUBLIC_LINK_ISSUED	17	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": true, "requireOtp": false, "targetSignerUserId": 2, "signingPolicyVersion": "2026-01-11"}	43c565e7a11adecdb7819134f7893b545df258080f20bad791e24ebe219c68f0	bab20e3b34e09ae8820f77819f05920d5327286256d856c16c50ce48d7b0485a
0de4cc61-3245-45ff-8c0a-21eca6a8c7ac	2026-01-15 18:20:18.38+02	PUBLIC_LINK_ISSUED	17	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": true, "requireOtp": false, "targetSignerUserId": 23, "signingPolicyVersion": "2026-01-11"}	bab20e3b34e09ae8820f77819f05920d5327286256d856c16c50ce48d7b0485a	1abf897ef0e89ad4845d3a0a6dbda6773af53298f9d46e91b745d794a71b76a9
fe3c8fb9-90bc-4d20-8922-6677354580d6	2026-01-15 18:20:30.729+02	PDF_VIEWED	17	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"range": null}	1abf897ef0e89ad4845d3a0a6dbda6773af53298f9d46e91b745d794a71b76a9	915b23f5049882553a0877d5e8bd99a5b037c75534dc75486243458deda3bcc4
16365cc4-8cd9-420b-a2d0-bd70207085fb	2026-01-15 18:20:58.451+02	SIGN_ATTEMPT	17	62	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"consentId": "bb7b45c8-d521-462c-a4f7-218734cc0a40", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	915b23f5049882553a0877d5e8bd99a5b037c75534dc75486243458deda3bcc4	f4bfc2d134b8b044e0b7a0089ccf3f172fc030bcbae2ec0d826410e64a95df1b
84beb1b2-baf7-4871-9bf4-7ebabaa02ae2	2026-01-15 18:20:58.453+02	SIGN_SUCCESS	17	62	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"consentId": "bb7b45c8-d521-462c-a4f7-218734cc0a40", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	f4bfc2d134b8b044e0b7a0089ccf3f172fc030bcbae2ec0d826410e64a95df1b	d6c925658dee5c773782e68aa29fd29f7b92f1dff2ab83bac8fabbb8679ea03e
eae38b3f-c3a2-4601-8283-32037f05445d	2026-01-15 18:21:05.069+02	SIGN_ATTEMPT	17	61	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"consentId": "bb7b45c8-d521-462c-a4f7-218734cc0a40", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	d6c925658dee5c773782e68aa29fd29f7b92f1dff2ab83bac8fabbb8679ea03e	9033ce38a4cc067983e28265bc9468cb5d0b1b049f37ddb426cc2b797c01712b
f8fba109-1b62-4342-aa70-12d66f3d40c6	2026-01-15 18:21:05.07+02	SIGN_SUCCESS	17	61	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"consentId": "bb7b45c8-d521-462c-a4f7-218734cc0a40", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	9033ce38a4cc067983e28265bc9468cb5d0b1b049f37ddb426cc2b797c01712b	0be9255412dad4e903e7c7d27eb68994f65ae06a4330880f8d8aa71330f1cb5f
f103a051-fc05-4687-b63f-67da3bb13dd2	2026-01-15 18:21:12.975+02	SIGN_ATTEMPT	17	60	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"consentId": "bb7b45c8-d521-462c-a4f7-218734cc0a40", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	0be9255412dad4e903e7c7d27eb68994f65ae06a4330880f8d8aa71330f1cb5f	31d727c0d7dbf9fb0f6802eb0946a140117043917b23afc16de4548f67c9cd21
d063a30c-441c-4572-a588-5a28c150d1b7	2026-01-15 18:21:12.977+02	SIGN_SUCCESS	17	60	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"consentId": "bb7b45c8-d521-462c-a4f7-218734cc0a40", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	31d727c0d7dbf9fb0f6802eb0946a140117043917b23afc16de4548f67c9cd21	7ea72851617516c08c6bc4ea21276591bf657e5e64977099bb71e673a0fde8bf
b7e78142-f026-4ed7-a054-451e2759cb65	2026-01-15 18:21:19.898+02	SIGN_ATTEMPT	17	59	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"consentId": "bb7b45c8-d521-462c-a4f7-218734cc0a40", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	7ea72851617516c08c6bc4ea21276591bf657e5e64977099bb71e673a0fde8bf	1080d83d27e74a95b6e082668bff40d6e01717575b788012d94774fc3e8711d0
e78f8f34-f821-4c92-a959-2c1ff5e04040	2026-01-15 18:21:19.899+02	SIGN_SUCCESS	17	59	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"consentId": "bb7b45c8-d521-462c-a4f7-218734cc0a40", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	1080d83d27e74a95b6e082668bff40d6e01717575b788012d94774fc3e8711d0	170b594f73ab210d1ab01590cdf0e4929c76c92c9d612bd981d78533b995ef09
23c1549a-0293-4465-ad7b-211f4b03038d	2026-01-15 18:22:04.718+02	SIGN_ATTEMPT	17	57	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"consentId": "bb7b45c8-d521-462c-a4f7-218734cc0a40", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	170b594f73ab210d1ab01590cdf0e4929c76c92c9d612bd981d78533b995ef09	48783e4c53e7dcda694fe9fbcf439f7e630182bd518f6be6e4810bf3a08f9fce
a815a6d1-595f-44e2-9b35-90358d915da6	2026-01-15 18:25:37.396+02	PDF_VIEWED	17	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	b6adb3fa-dbc2-48e5-be4d-63bd3126ad86	\N	t	{"range": null}	c4d6f9cd53dd99e7708c5838c5e26554add41e5c4b15c3dba5e0a90696e6334e	9d6f1b9edfd0697165df268c628fc86b520462b79854c8af41c2017ef6530ab7
03016258-35c2-4287-9727-a60855c85c1d	2026-01-15 18:22:04.722+02	SIGN_SUCCESS	17	57	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"consentId": "bb7b45c8-d521-462c-a4f7-218734cc0a40", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	48783e4c53e7dcda694fe9fbcf439f7e630182bd518f6be6e4810bf3a08f9fce	ae5057c2e85efbd6caeba70d5664c002180273f1ba2f2af04d02ed7f54360da1
aaf623a0-9032-46a9-9d68-ce60ed7d2978	2026-01-15 18:22:09.65+02	SIGN_ATTEMPT	17	56	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"consentId": "bb7b45c8-d521-462c-a4f7-218734cc0a40", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	ae5057c2e85efbd6caeba70d5664c002180273f1ba2f2af04d02ed7f54360da1	9c2746b86e5db3aca473434c31e6883abc97633ce33b4bbb3dcbfd15c74aabeb
aa767554-d430-453a-8e19-3f91e2c0a85f	2026-01-15 18:22:09.652+02	SIGN_SUCCESS	17	56	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"consentId": "bb7b45c8-d521-462c-a4f7-218734cc0a40", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	9c2746b86e5db3aca473434c31e6883abc97633ce33b4bbb3dcbfd15c74aabeb	88fcbbcc9a4a6ff660c7a8df354e73069fbd5c1bbbd219e27919c4ec8c6af469
2f1b6c24-8bb7-4232-a169-f7630c86c77f	2026-01-15 18:22:12.993+02	SIGN_ATTEMPT	17	55	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"consentId": "bb7b45c8-d521-462c-a4f7-218734cc0a40", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	88fcbbcc9a4a6ff660c7a8df354e73069fbd5c1bbbd219e27919c4ec8c6af469	17681fcfd62f3bb7cb419742d501ca7304aa768b6bf2c4cdeee4583e3d427772
fbe6efe0-9b31-4d62-a5cd-8c7deaabdde6	2026-01-15 18:22:13.338+02	SIGN_SUCCESS	17	55	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	\N	t	{"consentId": "bb7b45c8-d521-462c-a4f7-218734cc0a40", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	17681fcfd62f3bb7cb419742d501ca7304aa768b6bf2c4cdeee4583e3d427772	d7e8233865154fd9d4e1c9dfd548c71ee59b6a345ea369fb551f1f83f31cb85a
ae612e50-433f-473b-91e2-0fc12ebcaa3d	2026-01-15 18:22:20.802+02	PDF_VIEWED	17	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	ce6db2ad-beca-44e8-8097-097ecd03963d	\N	t	{"range": null}	d7e8233865154fd9d4e1c9dfd548c71ee59b6a345ea369fb551f1f83f31cb85a	0f37edde6bbb142a9a18a697f4c6efc7bb32b4d81f386efa04b73156150d1d30
501e7e9e-5e5b-4cce-81be-45ff2dcb9082	2026-01-15 18:23:21.45+02	PDF_VIEWED	17	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"range": null}	0f37edde6bbb142a9a18a697f4c6efc7bb32b4d81f386efa04b73156150d1d30	3dc26d21e08da4a9a69aeeb948aa38f6df18ff3b07f5aac5b16141d52459c33f
6534e86a-72a4-4dc0-876f-2cedd57fa7e2	2026-01-15 18:23:34.773+02	SIGN_ATTEMPT	17	49	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"consentId": "a98871d3-2ff0-4b30-afa6-2b3942b8a831", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	3dc26d21e08da4a9a69aeeb948aa38f6df18ff3b07f5aac5b16141d52459c33f	616b06e766e0400ed704c00eae2b50f1df12aeeb045f7b696b52e6758f026a50
fed57d10-b652-494a-8b9e-5f6dce86f2f4	2026-01-15 18:23:34.775+02	SIGN_SUCCESS	17	49	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"consentId": "a98871d3-2ff0-4b30-afa6-2b3942b8a831", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	616b06e766e0400ed704c00eae2b50f1df12aeeb045f7b696b52e6758f026a50	72d890ad7cd41ff732581dfc536476d72b3c3e94bec48dd95444ff87987554c6
3d27ab4b-787b-492a-bc04-3f7faff79403	2026-01-15 18:23:40.294+02	SIGN_ATTEMPT	17	50	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"consentId": "a98871d3-2ff0-4b30-afa6-2b3942b8a831", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	72d890ad7cd41ff732581dfc536476d72b3c3e94bec48dd95444ff87987554c6	af0c4becb3a1695800378d049ec350108e8a3a6005783a037a096ff7629d0129
e0f52697-e877-4079-a680-5c74f6b8c6ea	2026-01-15 18:23:40.774+02	SIGN_SUCCESS	17	50	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"consentId": "a98871d3-2ff0-4b30-afa6-2b3942b8a831", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	af0c4becb3a1695800378d049ec350108e8a3a6005783a037a096ff7629d0129	6c98398226ce1527ae497f2646fe546200c10f05f6d059c98cda8f4ff9f80031
dfdd7bd9-5a15-43c3-9714-164f1d9169b4	2026-01-15 18:23:55.546+02	SIGN_ATTEMPT	17	51	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"consentId": "a98871d3-2ff0-4b30-afa6-2b3942b8a831", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	6c98398226ce1527ae497f2646fe546200c10f05f6d059c98cda8f4ff9f80031	7662eeff9eff05cdd7e5c289e80af53271b29df382d94d6f4d7a48e73d9be39e
f3999bac-396d-4198-8b4c-1e57a375804e	2026-01-15 18:23:55.548+02	SIGN_SUCCESS	17	51	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"consentId": "a98871d3-2ff0-4b30-afa6-2b3942b8a831", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	7662eeff9eff05cdd7e5c289e80af53271b29df382d94d6f4d7a48e73d9be39e	882006ec45f0a6e7c58ef2bdbb6424541978487fb5a49de733810d3a72ca5dfa
4f3554a7-a214-4875-8c64-1109b7fee0dc	2026-01-15 18:24:03.734+02	SIGN_ATTEMPT	17	52	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"consentId": "a98871d3-2ff0-4b30-afa6-2b3942b8a831", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	882006ec45f0a6e7c58ef2bdbb6424541978487fb5a49de733810d3a72ca5dfa	d6c7d9a9d2f4e263de811d8cfe6d70744fbbf7ea10ac59af7f432ea3dec08a36
c19d111a-7398-4334-9afe-2906f4c4bdaf	2026-01-15 18:24:03.736+02	SIGN_SUCCESS	17	52	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"consentId": "a98871d3-2ff0-4b30-afa6-2b3942b8a831", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	d6c7d9a9d2f4e263de811d8cfe6d70744fbbf7ea10ac59af7f432ea3dec08a36	94df4b55d0ef4d116f749b9904a7263515d2048f048a3a316f2baa08fdbd56f3
a2bb5ad4-6fac-47b5-b222-ca053c1dce16	2026-01-15 18:24:07.077+02	SIGN_ATTEMPT	17	53	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"consentId": "a98871d3-2ff0-4b30-afa6-2b3942b8a831", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	94df4b55d0ef4d116f749b9904a7263515d2048f048a3a316f2baa08fdbd56f3	fe24fba9b67d94e563f80cc62b367414cc09acafbbb89734cdec06ebb6cbc138
653c51a1-d0ad-457d-8c40-15c1c85673e6	2026-01-15 18:24:07.079+02	SIGN_SUCCESS	17	53	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"consentId": "a98871d3-2ff0-4b30-afa6-2b3942b8a831", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	fe24fba9b67d94e563f80cc62b367414cc09acafbbb89734cdec06ebb6cbc138	a2d7a7dce178cc58749f5eba03d0dbe7fe26257e7316b324118f01364ecbf123
fda0585e-5434-4384-b59f-183ee301dc77	2026-01-15 18:24:14.992+02	SIGN_ATTEMPT	17	54	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"consentId": "a98871d3-2ff0-4b30-afa6-2b3942b8a831", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	a2d7a7dce178cc58749f5eba03d0dbe7fe26257e7316b324118f01364ecbf123	8e585e41112ce21e4c6f95eb175822c1a109b06672332cfb933f13b10b27e9e2
34d3a364-b80d-4494-893b-c5be35ef2995	2026-01-15 18:24:14.994+02	SIGN_SUCCESS	17	54	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"consentId": "a98871d3-2ff0-4b30-afa6-2b3942b8a831", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	8e585e41112ce21e4c6f95eb175822c1a109b06672332cfb933f13b10b27e9e2	67571a0f13f4376baece66b40f1bb8a1e739a298fbcb093f6e1b300ef5be74e3
1a900cdb-0eed-4fba-8f71-18a9fa442ee9	2026-01-15 18:24:19.285+02	SIGN_ATTEMPT	17	47	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"consentId": "a98871d3-2ff0-4b30-afa6-2b3942b8a831", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	67571a0f13f4376baece66b40f1bb8a1e739a298fbcb093f6e1b300ef5be74e3	6a9ac2c95a58751c94817785d32832f7db8b676e1801026afb56e8da7bc06638
e511e924-cb25-436d-adae-0e14615badec	2026-01-15 18:24:19.592+02	SIGN_SUCCESS	17	47	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	\N	t	{"consentId": "a98871d3-2ff0-4b30-afa6-2b3942b8a831", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	6a9ac2c95a58751c94817785d32832f7db8b676e1801026afb56e8da7bc06638	0b2194c707703f1342ad47b59f4fbeb439aee1611c99e071e1133bcc071817b4
5b31010d-55be-46a1-abb1-0dce82b20086	2026-01-15 18:25:00.255+02	PDF_VIEWED	17	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"range": null}	0b2194c707703f1342ad47b59f4fbeb439aee1611c99e071e1133bcc071817b4	262a0c56f66889ebb163b2241c895cb8af3371ebedd10f214805465b12b46a9f
f2d2541b-a236-42d2-8d40-cd2d18ba3d24	2026-01-15 18:25:11.152+02	SIGNED_PDF_DOWNLOADED	17	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"key": "users/1/c92cbf04-0ecb-4dfd-81e1-d45a4593a571.pdf", "isSignedOutput": false}	262a0c56f66889ebb163b2241c895cb8af3371ebedd10f214805465b12b46a9f	98fda05cf50340fd2428eb82c905c6a3267c4d120690ad3a399b5ca853c18b61
f3392fc9-d01c-4e28-a628-fec2bde3cec5	2026-01-15 18:25:29.297+02	PDF_VIEWED	17	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	0531602c-0c9e-4d6a-a700-092b96d8defc	\N	t	{"range": null}	98fda05cf50340fd2428eb82c905c6a3267c4d120690ad3a399b5ca853c18b61	f5f049b085e8f706861169231be4ab36b28d79f191cbda5826d35211890f21c4
5ad8129d-7bbd-4562-a68e-4da56edef40f	2026-01-15 18:25:29.383+02	PDF_VIEWED	16	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	cc16348c-522e-4a07-aa03-389679134830	\N	t	{"range": null}	0201f2680c71676251b5c59ec02c3e1f0784fc922620c22d5a487be27f88d1ea	dd49f69554886106553270885515491065ca45560a510f4f4596c96aca368891
71947379-3e80-467a-97ed-64da50f66d6b	2026-01-15 18:25:33.686+02	PDF_VIEWED	17	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	1606f9f2-c21a-4755-9ba4-55ea69fa4b50	\N	t	{"range": null}	f5f049b085e8f706861169231be4ab36b28d79f191cbda5826d35211890f21c4	c4d6f9cd53dd99e7708c5838c5e26554add41e5c4b15c3dba5e0a90696e6334e
cc874ff9-baf8-4719-bf27-7d7871b5d7c0	2026-01-15 18:25:33.716+02	PDF_VIEWED	16	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	3d1aae35-523c-4e56-9cac-d1ebd3684f3c	\N	t	{"range": null}	dd49f69554886106553270885515491065ca45560a510f4f4596c96aca368891	14a2c8a41be4b738cfa8acf83d683ebdb4e3a4e8147f5c15fb7a34f85120c713
e9ad0ab9-808d-47a4-9b8a-e180f2a77549	2026-01-15 18:25:37.377+02	PDF_VIEWED	16	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	976be268-fd3d-4a39-ac67-2422b5182824	\N	t	{"range": null}	14a2c8a41be4b738cfa8acf83d683ebdb4e3a4e8147f5c15fb7a34f85120c713	4d6e0a445c31633c50a2b744a8e0161e66a1268835f33ec701d5499909862fda
c2cfc6ad-b89f-4193-be6d-aa93370f4cdc	2026-01-15 18:31:25.015+02	PDF_VIEWED	16	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	976be268-fd3d-4a39-ac67-2422b5182824	\N	t	{"range": null}	4d6e0a445c31633c50a2b744a8e0161e66a1268835f33ec701d5499909862fda	3cb651ebc5e134095bc12b3f022b2ccdbf17490d17c1d279a7922a5f5ed9b83b
4a7ff662-f300-4176-b08e-ce8dff5b60ab	2026-01-15 18:31:25.155+02	PDF_VIEWED	17	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	b6adb3fa-dbc2-48e5-be4d-63bd3126ad86	\N	t	{"range": null}	9d6f1b9edfd0697165df268c628fc86b520462b79854c8af41c2017ef6530ab7	f1eace26fb8a71325525a13406b3b9f485a2f13c9b8cfd54b93eee4e190f78c3
b9a72a8b-0e42-489c-8607-b44d906b605c	2026-01-15 18:36:54.052+02	PDF_VIEWED	17	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	b6adb3fa-dbc2-48e5-be4d-63bd3126ad86	\N	t	{"range": null}	f1eace26fb8a71325525a13406b3b9f485a2f13c9b8cfd54b93eee4e190f78c3	f76e8210da9ee54d582a6917d48861891a8ac42be2fb8ed952ab117e11739245
869328f6-1b8c-4e6b-af14-a5fd50c672b1	2026-01-15 18:36:54.054+02	PDF_VIEWED	16	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	976be268-fd3d-4a39-ac67-2422b5182824	\N	t	{"range": null}	3cb651ebc5e134095bc12b3f022b2ccdbf17490d17c1d279a7922a5f5ed9b83b	cb4a29e7a11c9313c57d2609e81df1992e2a2968da32295bee6eee01b1db927f
578de149-e090-4b6b-93ac-75abab283b38	2026-01-15 18:38:47.184+02	PDF_VIEWED	16	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.108.0 Chrome/142.0.7444.235 Electron/39.2.7 Safari/537.36	4fe67edf-005a-414b-a13a-a9cd04d0bf49	\N	t	{"range": null}	cb4a29e7a11c9313c57d2609e81df1992e2a2968da32295bee6eee01b1db927f	ff0a8ccc1c2a8338a6e5cdf1bc69a8fb7c41a51131e5ee0ea1532eefad43ceed
109d2eb9-16c5-4e74-b516-6fbade6812e4	2026-01-15 18:41:24.643+02	PDF_VIEWED	16	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	94a04dd3-096f-4215-874f-703df871dee6	\N	t	{"range": null}	ff0a8ccc1c2a8338a6e5cdf1bc69a8fb7c41a51131e5ee0ea1532eefad43ceed	f36b5d2a29c413302ac50ebcee1c6cb1e3e086afaf754c61efc7340546afed11
9e8255ac-1665-4b98-b48d-358d3ebee4ed	2026-01-15 18:41:37.355+02	SIGN_ATTEMPT	17	48	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	b6adb3fa-dbc2-48e5-be4d-63bd3126ad86	\N	t	{"consentId": "935a6406-714e-4f55-aa7b-dec9e305946a", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	f76e8210da9ee54d582a6917d48861891a8ac42be2fb8ed952ab117e11739245	dba3ec9bf09b270e8921eed4cdb1d201b99b13895ef4ca53f7c6485e43015362
abc8ca25-d1bf-4804-999d-a499008ce5a2	2026-01-15 18:41:37.357+02	SIGN_SUCCESS	17	48	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	b6adb3fa-dbc2-48e5-be4d-63bd3126ad86	\N	t	{"consentId": "935a6406-714e-4f55-aa7b-dec9e305946a", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a", "signingPolicyVersion": "2026-01-11"}	dba3ec9bf09b270e8921eed4cdb1d201b99b13895ef4ca53f7c6485e43015362	13a1b9c18bd6086ef336462b57ccc178fc72d9c3307cf82d38793f465d7340b3
5e1214a0-8683-42f5-ab59-bec98e9abf7f	2026-01-15 18:43:30.887+02	SIGNING_POLICY_SELECTED	18	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": true, "requireOtp": false, "selectionExplicit": false, "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true, "selectedByLawyerUserId": 1}	\N	a6ed8f3d198cd5ac6f5a9aded35a3b0542498ecc4a242443aef105e4e91f4070
6edf16de-27e6-448e-ba82-332a24b703ec	2026-01-15 18:43:31.186+02	PUBLIC_LINK_ISSUED	18	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": true, "requireOtp": false, "targetSignerUserId": 23, "signingPolicyVersion": "2026-01-11"}	a6ed8f3d198cd5ac6f5a9aded35a3b0542498ecc4a242443aef105e4e91f4070	561987e74e20924d164237ed66caff869aa640803e986f37f1e5623cc66f0331
6782eca9-a3e4-4f1e-b64a-013e903eae29	2026-01-15 18:43:31.193+02	PUBLIC_LINK_ISSUED	18	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": true, "requireOtp": false, "targetSignerUserId": 2, "signingPolicyVersion": "2026-01-11"}	561987e74e20924d164237ed66caff869aa640803e986f37f1e5623cc66f0331	5e10d15fe0c495563fda42b01df338cd31e8d6a677a19a9ab9a30a0f8294861f
92720aee-9245-499c-a724-c5f00cd73c3b	2026-01-15 18:43:38.877+02	PDF_VIEWED	18	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	ba836d07-27f9-4bc7-9d0c-0d8c8355e83b	\N	t	{"range": null}	5e10d15fe0c495563fda42b01df338cd31e8d6a677a19a9ab9a30a0f8294861f	9a8f35f49b10cf0c25206856556df27de1b53ecc0287b29594e61d2dc6b2dbc0
4e48f2c4-653c-455c-b81e-1ce477bf328d	2026-01-15 18:43:49.251+02	PDF_VIEWED	18	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6148fa8e-1eca-46ee-9089-5f5b3cb313d0	\N	t	{"range": null}	9a8f35f49b10cf0c25206856556df27de1b53ecc0287b29594e61d2dc6b2dbc0	a5192e789b71a7c6e24cffaf3f794ee3b7632d3c6e0011945e4d8b2b9c3a60c2
73f18203-d5ea-40b5-aa8b-76086828cede	2026-01-15 18:44:20.543+02	SIGN_ATTEMPT	18	64	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6148fa8e-1eca-46ee-9089-5f5b3cb313d0	\N	t	{"consentId": "ace6ad32-ec9c-4d8b-9ee5-c886cbdc6de4", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	a5192e789b71a7c6e24cffaf3f794ee3b7632d3c6e0011945e4d8b2b9c3a60c2	1e8884c1fd45089191c272a3d8d6b59e784f65307d5283ff5181ffd9c40cc69e
a7be03e8-4bfb-4408-b9be-335b86bc746b	2026-01-15 18:44:20.546+02	SIGN_SUCCESS	18	64	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6148fa8e-1eca-46ee-9089-5f5b3cb313d0	\N	t	{"consentId": "ace6ad32-ec9c-4d8b-9ee5-c886cbdc6de4", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	1e8884c1fd45089191c272a3d8d6b59e784f65307d5283ff5181ffd9c40cc69e	570ff9f02e14e0b780b54b2f655544b4f636d8300274e77cc492ba1b47fa79e3
82bc1122-5eaa-4bee-aa24-67a18bece08c	2026-01-15 18:44:30.096+02	SIGN_ATTEMPT	18	65	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6148fa8e-1eca-46ee-9089-5f5b3cb313d0	\N	t	{"consentId": "ace6ad32-ec9c-4d8b-9ee5-c886cbdc6de4", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	570ff9f02e14e0b780b54b2f655544b4f636d8300274e77cc492ba1b47fa79e3	ae337ebfeb959ceef99795a840f8a0d38687fd0f0c98d6557799b4ff7c270320
d38bf479-aca5-4d2d-8903-f2da924f3b50	2026-01-15 18:44:30.098+02	SIGN_SUCCESS	18	65	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6148fa8e-1eca-46ee-9089-5f5b3cb313d0	\N	t	{"consentId": "ace6ad32-ec9c-4d8b-9ee5-c886cbdc6de4", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	ae337ebfeb959ceef99795a840f8a0d38687fd0f0c98d6557799b4ff7c270320	c325a9808cce94b62aeaaa32c1f8b7b641b1d63e69d40f11296c6e036ee4fb99
ebe5465c-617a-494d-bcfc-b0a95b93fc96	2026-01-15 18:44:39.724+02	SIGN_ATTEMPT	18	66	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6148fa8e-1eca-46ee-9089-5f5b3cb313d0	\N	t	{"consentId": "ace6ad32-ec9c-4d8b-9ee5-c886cbdc6de4", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	c325a9808cce94b62aeaaa32c1f8b7b641b1d63e69d40f11296c6e036ee4fb99	197f1ec907b28f318670e7a35ff3078273918b8177956917653ac5cc43494b43
9280f2c4-9310-480b-91aa-ab6995cfd7c2	2026-01-15 18:44:40.211+02	SIGN_SUCCESS	18	66	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6148fa8e-1eca-46ee-9089-5f5b3cb313d0	\N	t	{"consentId": "ace6ad32-ec9c-4d8b-9ee5-c886cbdc6de4", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	197f1ec907b28f318670e7a35ff3078273918b8177956917653ac5cc43494b43	a45057cac80165a1a009496f8d9cdbd1860cb4e66c82ab89dfee7e2dde6a5375
f6ff99cf-f2e7-46f7-be1c-60d5a5816bab	2026-01-15 18:44:47.833+02	SIGN_ATTEMPT	18	63	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6148fa8e-1eca-46ee-9089-5f5b3cb313d0	\N	t	{"consentId": "ace6ad32-ec9c-4d8b-9ee5-c886cbdc6de4", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	a45057cac80165a1a009496f8d9cdbd1860cb4e66c82ab89dfee7e2dde6a5375	aa3082fd8aad044583e06eab2dc5b36764b8bfe2f0347ee048697660a084e6ad
8a601b4d-cb68-4e1b-b3e6-140ffde41dcf	2026-01-15 18:44:48.124+02	SIGN_SUCCESS	18	63	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6148fa8e-1eca-46ee-9089-5f5b3cb313d0	\N	t	{"consentId": "ace6ad32-ec9c-4d8b-9ee5-c886cbdc6de4", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	aa3082fd8aad044583e06eab2dc5b36764b8bfe2f0347ee048697660a084e6ad	55c1079da665b9ac8d87273536b183f84230f97d80d438b708573644bd0ef2f8
8cd3f23c-49d3-4852-a06e-694fbaf0ff72	2026-01-15 18:47:32.337+02	PDF_VIEWED	18	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6edef5b6-679c-4fec-877f-733e4ba034b8	\N	t	{"range": null}	55c1079da665b9ac8d87273536b183f84230f97d80d438b708573644bd0ef2f8	e99d758c7a99205b85361f5f12ad81f2403bcb3c26aef9e1bb6381d41c64c213
3ca9ff93-6ba6-4f52-9669-faff4083ef8b	2026-01-15 18:48:36.431+02	PDF_VIEWED	16	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.108.0 Chrome/142.0.7444.235 Electron/39.2.7 Safari/537.36	83254294-54b1-46b8-9b86-1648c5a9ad42	\N	t	{"range": null}	f36b5d2a29c413302ac50ebcee1c6cb1e3e086afaf754c61efc7340546afed11	d827dc2a51a31a9ae1fa668537f3020e9fbc420861ab3544ea2353f67f6ef2f7
51a3f12e-0c21-4230-b53d-814477eaa123	2026-01-15 18:48:36.987+02	PDF_VIEWED	18	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	c5073674-7510-4c5f-bdc5-bde62bb668f2	\N	t	{"range": null}	e99d758c7a99205b85361f5f12ad81f2403bcb3c26aef9e1bb6381d41c64c213	42c3964993a0b606818337df7feb88a2d90286df5a2e98666e1488e0f6429d36
934a6727-d6b9-443b-9944-044643915b8a	2026-01-15 18:48:37.011+02	PDF_VIEWED	18	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	d1e77d4d-b46f-4d31-813f-a9ecc014dd60	\N	t	{"range": null}	42c3964993a0b606818337df7feb88a2d90286df5a2e98666e1488e0f6429d36	dcea8f744ca30d480a9f46d4d7233ae0e46486aa44b3c46486646d5f029182bd
81869895-53a5-464e-97cd-34ffe9847fb9	2026-01-15 18:53:59.513+02	SIGN_ATTEMPT	18	73	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	c5073674-7510-4c5f-bdc5-bde62bb668f2	\N	t	{"consentId": "bd20bf01-dfd1-4962-9c53-9e624b73654b", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	dcea8f744ca30d480a9f46d4d7233ae0e46486aa44b3c46486646d5f029182bd	d831ad85b215fb67fca17b72fa2f5e4f171281d0562abd4e426bc5523c69f04e
6e97f27f-b868-441b-9f64-f61fdde5f4e2	2026-01-15 18:53:59.516+02	SIGN_SUCCESS	18	73	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	c5073674-7510-4c5f-bdc5-bde62bb668f2	\N	t	{"consentId": "bd20bf01-dfd1-4962-9c53-9e624b73654b", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	d831ad85b215fb67fca17b72fa2f5e4f171281d0562abd4e426bc5523c69f04e	989695b1fc7268696c62d64bcbc6c2b9907a171009def7b78446779a7901c381
aeb49dd8-b624-48c0-a362-3204a472cc72	2026-01-15 19:04:04.046+02	PDF_VIEWED	16	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Code/1.108.0 Chrome/142.0.7444.235 Electron/39.2.7 Safari/537.36	83254294-54b1-46b8-9b86-1648c5a9ad42	\N	t	{"range": null}	d827dc2a51a31a9ae1fa668537f3020e9fbc420861ab3544ea2353f67f6ef2f7	a8ee1c2299b8772c52af1b8a0399772de1e305123fde7192ef255ddae0f64701
5737344d-ff58-4c19-8583-76eeb2012187	2026-01-15 19:04:04.067+02	PDF_VIEWED	18	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	c5073674-7510-4c5f-bdc5-bde62bb668f2	\N	t	{"range": null}	989695b1fc7268696c62d64bcbc6c2b9907a171009def7b78446779a7901c381	48bf4056a7ae1752d91230302ead6837f18f39240ea4441b79c0804047f08480
0cdebf73-20b2-4127-ad82-ca95a95f0ea4	2026-01-15 19:12:55.897+02	PDF_VIEWED	18	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	96763ce2-c723-4e52-8a68-1c3ef92935b2	\N	t	{"range": null}	48bf4056a7ae1752d91230302ead6837f18f39240ea4441b79c0804047f08480	5aa640aad120a256898b9fd48ae71e2218f644442f50642777b62def6341f5e1
d2b537ba-9536-4c88-bd65-b63c1bde443e	2026-01-15 19:12:56.957+02	PDF_VIEWED	18	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	117a2603-04d7-49c7-816f-8834fd65cff2	\N	t	{"range": null}	5aa640aad120a256898b9fd48ae71e2218f644442f50642777b62def6341f5e1	fd617b756fb33924d832ffdc623c198eea9d7404f7498efda8835599b3190ede
b2f7517a-8b12-4418-b94d-e9d4b18723ca	2026-01-15 19:13:19.497+02	SIGN_ATTEMPT	18	70	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	96763ce2-c723-4e52-8a68-1c3ef92935b2	\N	t	{"consentId": "5da49581-6725-4232-9bb4-dd00e1c366cf", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	fd617b756fb33924d832ffdc623c198eea9d7404f7498efda8835599b3190ede	645e777a701e11981a54cc9f2ff8ef72df4d6f2f6815bf00d3aa77a00b31a24e
32d665da-fed6-4f54-a4d6-def3cbecaf9e	2026-01-15 19:13:19.5+02	SIGN_SUCCESS	18	70	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	96763ce2-c723-4e52-8a68-1c3ef92935b2	\N	t	{"consentId": "5da49581-6725-4232-9bb4-dd00e1c366cf", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	645e777a701e11981a54cc9f2ff8ef72df4d6f2f6815bf00d3aa77a00b31a24e	b1f9f2cf6a05a6064b5b9a412d91d065642c68045bddb937af8de7f044e8402a
6e35e361-de3a-4d77-9566-d1ae6a8488d3	2026-01-15 19:13:30.01+02	PDF_VIEWED	18	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	96763ce2-c723-4e52-8a68-1c3ef92935b2	\N	t	{"range": null}	b1f9f2cf6a05a6064b5b9a412d91d065642c68045bddb937af8de7f044e8402a	598aa86078d7125be6143069c186d2b6b2ef61232c8b9e8501829eeb2b120583
10889c06-de91-4e08-a768-e453d7f920cd	2026-01-15 19:13:30.044+02	PDF_VIEWED	18	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	117a2603-04d7-49c7-816f-8834fd65cff2	\N	t	{"range": null}	598aa86078d7125be6143069c186d2b6b2ef61232c8b9e8501829eeb2b120583	674650045c1e07a06f4d15cf52a7a55dd10ffee53951ceddc128c740714f0d0a
b0e29a1b-163d-4cc4-b942-23b4399e3499	2026-01-15 19:24:02.37+02	PDF_VIEWED	18	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	efccc1dd-6121-4c58-9fde-4adc9118da2d	\N	t	{"range": null}	674650045c1e07a06f4d15cf52a7a55dd10ffee53951ceddc128c740714f0d0a	9b825aadd10daa1a7528fa13a879ae348c80c16f85cf679727e187e07a406e05
58b0cbe0-40d2-4612-aaee-7e137c8594c9	2026-01-15 19:24:02.979+02	PDF_VIEWED	18	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	1e640ef4-dd0f-4656-afcb-86fcbb9d0480	\N	t	{"range": null}	9b825aadd10daa1a7528fa13a879ae348c80c16f85cf679727e187e07a406e05	e8aff0bb02e3dc7b896a73d3ce45c0944171f3dcf4bb05ce89e717ee909e112e
f4a8268f-e4ef-432c-9b2b-111cab70d6e7	2026-01-15 19:24:24.235+02	SIGN_ATTEMPT	18	72	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	efccc1dd-6121-4c58-9fde-4adc9118da2d	\N	t	{"consentId": "c614192b-9bc5-461b-bf7c-46974ee8945a", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	e8aff0bb02e3dc7b896a73d3ce45c0944171f3dcf4bb05ce89e717ee909e112e	3fd33b9111159f3f601d16e80adabc1dc06dd32b08401ba2702e5c30d7caf530
520346cf-3d21-43b3-a62c-6edd2e6c815a	2026-01-15 19:24:24.237+02	SIGN_SUCCESS	18	72	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	efccc1dd-6121-4c58-9fde-4adc9118da2d	\N	t	{"consentId": "c614192b-9bc5-461b-bf7c-46974ee8945a", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	3fd33b9111159f3f601d16e80adabc1dc06dd32b08401ba2702e5c30d7caf530	5078cd2270450eb6a6ed612ff63f7f4f2eb26f1d8b4bb90812e0dd45e49cc62d
4995b27d-5d6e-4e31-a854-f7df4e9586ef	2026-01-15 19:29:29.368+02	PDF_VIEWED	18	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	31a9d41e-73cf-46d1-9b85-8a9a8123bfea	\N	t	{"range": null}	5078cd2270450eb6a6ed612ff63f7f4f2eb26f1d8b4bb90812e0dd45e49cc62d	92b84e9c9e1bfdced2c11b4527c8767e42467877b9d599879ba6d41f49254898
591fd162-a107-4736-aa6a-5a9c55720dbf	2026-01-15 19:29:29.986+02	PDF_VIEWED	18	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	c66f8c61-434b-4d53-b425-5378b31411fe	\N	t	{"range": null}	92b84e9c9e1bfdced2c11b4527c8767e42467877b9d599879ba6d41f49254898	034343308b10570d75a85484c513263313e62e06de71ee30060aec868807865c
ff2d746e-247c-4a2b-9b17-db0d9c069690	2026-01-15 20:52:09.04+02	PDF_VIEWED	18	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	c66f8c61-434b-4d53-b425-5378b31411fe	\N	t	{"range": null}	034343308b10570d75a85484c513263313e62e06de71ee30060aec868807865c	36ca6746efae8e3766e782f1c9491b34a95bd594c7262e3cb348c676d922bace
20ee9103-9c23-483e-a583-bd85bb1ea04f	2026-01-15 20:52:09.117+02	PDF_VIEWED	18	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	31a9d41e-73cf-46d1-9b85-8a9a8123bfea	\N	t	{"range": null}	36ca6746efae8e3766e782f1c9491b34a95bd594c7262e3cb348c676d922bace	82945a448a60905b15675040979d34d3227f1e4caa6721b87fd9015f52df7372
68966a57-b947-4f26-aed1-a3d59b9833e2	2026-01-15 20:58:12.863+02	PDF_VIEWED	18	\N	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	4f97a025-f5e4-48a4-8e9f-1f2468de90cc	\N	t	{"range": null}	82945a448a60905b15675040979d34d3227f1e4caa6721b87fd9015f52df7372	d53839196f3118443d0f3403ddd97c389c1ecb22fce9ba6e2a59235a8685bbab
115aedbd-0577-4b84-842e-77c5a809862d	2026-01-15 20:58:28.949+02	SIGN_ATTEMPT	18	67	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	4f97a025-f5e4-48a4-8e9f-1f2468de90cc	\N	t	{"consentId": "07085ab2-a9ff-4536-9d9d-710f78849b53", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	d53839196f3118443d0f3403ddd97c389c1ecb22fce9ba6e2a59235a8685bbab	52b82d5b407afa8b0cce0f052a648ae4c92c14613a7b2bdc91a819cb5c7f1a04
d319a6cb-1dee-4274-8755-c68802fe89a2	2026-01-15 20:58:28.951+02	SIGN_SUCCESS	18	67	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	4f97a025-f5e4-48a4-8e9f-1f2468de90cc	\N	t	{"consentId": "07085ab2-a9ff-4536-9d9d-710f78849b53", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	52b82d5b407afa8b0cce0f052a648ae4c92c14613a7b2bdc91a819cb5c7f1a04	2847a96ad151e01c3549d478253b1484e3b92a6d80d16b2f5c3626bd09ee32f7
be3f6a0f-5b15-42c6-90a7-4c7d92a61d4b	2026-01-15 20:58:36.574+02	SIGN_ATTEMPT	18	68	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	4f97a025-f5e4-48a4-8e9f-1f2468de90cc	\N	t	{"consentId": "07085ab2-a9ff-4536-9d9d-710f78849b53", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	2847a96ad151e01c3549d478253b1484e3b92a6d80d16b2f5c3626bd09ee32f7	4fa7bfa31fcf1fe064fd3dfb6c9cda8ad5f7d71c1c3e0eeb72f9a1c63f64e1eb
ec307f72-ee1a-451b-866a-6700d9826e5a	2026-01-15 20:58:36.576+02	SIGN_SUCCESS	18	68	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	4f97a025-f5e4-48a4-8e9f-1f2468de90cc	\N	t	{"consentId": "07085ab2-a9ff-4536-9d9d-710f78849b53", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	4fa7bfa31fcf1fe064fd3dfb6c9cda8ad5f7d71c1c3e0eeb72f9a1c63f64e1eb	6a18e1e5890d900ea1ba14cbcc5673b8ced856866b64e09d2441a0ae9ee61fa4
2abe90b0-11ad-4cc7-ab39-ae5f6804e22d	2026-01-15 20:58:41.675+02	SIGN_ATTEMPT	18	69	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	4f97a025-f5e4-48a4-8e9f-1f2468de90cc	\N	t	{"consentId": "07085ab2-a9ff-4536-9d9d-710f78849b53", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	6a18e1e5890d900ea1ba14cbcc5673b8ced856866b64e09d2441a0ae9ee61fa4	78be63ba455166cb8fe58b8b8811e2cc299ac9bf0f6be0ebebff3a77bf1a562a
68ad2d43-fa0b-4552-8430-1d24217795b3	2026-01-15 20:58:41.677+02	SIGN_SUCCESS	18	69	23	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	4f97a025-f5e4-48a4-8e9f-1f2468de90cc	\N	t	{"consentId": "07085ab2-a9ff-4536-9d9d-710f78849b53", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	78be63ba455166cb8fe58b8b8811e2cc299ac9bf0f6be0ebebff3a77bf1a562a	2cb92b1846adb1ffd82cb614bfac3afc55826a3fb4dafb6b48ec0e712a2b556f
cbc0cf9d-6804-42e1-8f07-d1945119e6d8	2026-01-15 20:59:20.035+02	PDF_VIEWED	18	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	31a9d41e-73cf-46d1-9b85-8a9a8123bfea	\N	t	{"range": null}	2cb92b1846adb1ffd82cb614bfac3afc55826a3fb4dafb6b48ec0e712a2b556f	2918d4791e943dda01d6a27c56d2c7ad59aa287dc9bfa96fd9232fea5f29f557
c96ab5bc-d808-43fc-b74c-5c077f019663	2026-01-15 20:59:23.682+02	PDF_VIEWED	18	\N	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	\N	t	{"range": null}	2918d4791e943dda01d6a27c56d2c7ad59aa287dc9bfa96fd9232fea5f29f557	156250453b8aa33d496ca0882d573a95d437b08234ebd7d43b1097ac4dd88980
f3331153-fef8-4d44-9db0-81bfb79e8084	2026-01-15 20:59:35.994+02	SIGN_ATTEMPT	18	71	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	\N	t	{"consentId": "75e4c844-04f2-4e19-aa89-c954137fd4d9", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	156250453b8aa33d496ca0882d573a95d437b08234ebd7d43b1097ac4dd88980	4bd88b04e18016fb71f07b0ed45edcbb1528e233c39e8fc7e0e8bc9f3432fedf
98fd2a59-521a-4d09-94d1-d0879a150f98	2026-01-15 20:59:35.996+02	SIGN_SUCCESS	18	71	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	\N	t	{"consentId": "75e4c844-04f2-4e19-aa89-c954137fd4d9", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	4bd88b04e18016fb71f07b0ed45edcbb1528e233c39e8fc7e0e8bc9f3432fedf	a41e2aeb382a67181b92a9b12c9bb858a69a24a9e84bc91a1b150dbf6885b233
132f6d88-6ee2-4531-943f-781b28d8112c	2026-01-15 20:59:47.497+02	SIGN_ATTEMPT	18	74	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	\N	t	{"consentId": "75e4c844-04f2-4e19-aa89-c954137fd4d9", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	a41e2aeb382a67181b92a9b12c9bb858a69a24a9e84bc91a1b150dbf6885b233	2618063122bdd1f8c535283b505c7794404f7c12245d32c67b0f8db99c155456
b68c7547-184d-4e06-b037-94b1798f88cf	2026-01-15 20:59:47.499+02	SIGN_SUCCESS	18	74	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	\N	t	{"consentId": "75e4c844-04f2-4e19-aa89-c954137fd4d9", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	2618063122bdd1f8c535283b505c7794404f7c12245d32c67b0f8db99c155456	04d8439f327bf82478abb8895089b2b4277ff857c4c71980a9a72351f9498ad8
a9877145-3193-4aeb-bf19-7ed0d113b538	2026-01-15 21:00:07.677+02	SIGN_ATTEMPT	18	75	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	\N	t	{"consentId": "75e4c844-04f2-4e19-aa89-c954137fd4d9", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	04d8439f327bf82478abb8895089b2b4277ff857c4c71980a9a72351f9498ad8	cf9005a4fd8f7f574bfa233099438a8d44bfce981ef1c138861a5656274af648
6b24bcbd-b3e6-4466-90a6-ee25d870f1a8	2026-01-15 21:00:08.204+02	SIGN_SUCCESS	18	75	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	\N	t	{"consentId": "75e4c844-04f2-4e19-aa89-c954137fd4d9", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	cf9005a4fd8f7f574bfa233099438a8d44bfce981ef1c138861a5656274af648	e142ea08106805cf6a11bca29c2a5819e35d8c4683d96c05fa1d22a43974e6b4
9194402a-e7bf-4bfe-84c1-4bae84c6c5da	2026-01-15 21:00:15.903+02	SIGN_ATTEMPT	18	76	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	\N	t	{"consentId": "75e4c844-04f2-4e19-aa89-c954137fd4d9", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	e142ea08106805cf6a11bca29c2a5819e35d8c4683d96c05fa1d22a43974e6b4	96e2bb40567b8e0d90f5c0121cc99cbc2c7b05ffe6eb12cf04c475c98b27c785
509348d0-877b-4b9a-ad81-3439e9675346	2026-01-15 21:00:15.904+02	SIGN_SUCCESS	18	76	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	\N	t	{"consentId": "75e4c844-04f2-4e19-aa89-c954137fd4d9", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	96e2bb40567b8e0d90f5c0121cc99cbc2c7b05ffe6eb12cf04c475c98b27c785	d71817de4fa0a899b3ae689c4fc146352939cc64060982ac926f98a152c76452
b7613314-6812-4803-a178-3f208ccc42c2	2026-01-15 21:00:20.268+02	SIGN_ATTEMPT	18	77	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	\N	t	{"consentId": "75e4c844-04f2-4e19-aa89-c954137fd4d9", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	d71817de4fa0a899b3ae689c4fc146352939cc64060982ac926f98a152c76452	536f8c8655fa169af9e5ec98ef9558942d925a785ae5bd28b767e5b166f295d6
394c9230-1753-4352-8371-3aecf3880ceb	2026-01-15 21:00:20.27+02	SIGN_SUCCESS	18	77	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	\N	t	{"consentId": "75e4c844-04f2-4e19-aa89-c954137fd4d9", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	536f8c8655fa169af9e5ec98ef9558942d925a785ae5bd28b767e5b166f295d6	3d4a35f9798bfcf8e625202b237a0bd81f6f25bf85458b3603e6bf512e698c12
d6d36913-a107-4762-96d0-3152631be84b	2026-01-15 21:00:25.355+02	SIGN_ATTEMPT	18	78	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	\N	t	{"consentId": "75e4c844-04f2-4e19-aa89-c954137fd4d9", "otpWaived": true, "requireOtp": false, "policySource": "explicit", "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true}	3d4a35f9798bfcf8e625202b237a0bd81f6f25bf85458b3603e6bf512e698c12	4a5a2f58a82a43521568cbd64eaf6d25596a0cbb2d32354676f045a804c6c8d0
9efbeee7-a2e2-41a6-afea-ab60848c1571	2026-01-15 21:00:25.642+02	SIGN_SUCCESS	18	78	2	signer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	\N	t	{"consentId": "75e4c844-04f2-4e19-aa89-c954137fd4d9", "otpWaived": true, "requireOtp": false, "otpVerificationId": null, "presentedPdfSha256": "42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327", "signingPolicyVersion": "2026-01-11"}	4a5a2f58a82a43521568cbd64eaf6d25596a0cbb2d32354676f045a804c6c8d0	8679c49f3530349bfeff97826689b13e3c9d0aa647eb9fefb5a6b7561936fd76
236733f0-c01c-4afc-a552-338b66c10093	2026-01-15 21:39:27.069+02	SIGNED_PDF_DOWNLOADED	18	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"key": "users/1/238b8d1a-2a39-4ed1-870c-a8716d0a2440.pdf", "isSignedOutput": false}	8679c49f3530349bfeff97826689b13e3c9d0aa647eb9fefb5a6b7561936fd76	f777a962f3719dbca6908de10bc1850bcf9c301d66361f48aa42a93fb85dc9c8
03f052eb-6f01-4768-a0e0-79100497837a	2026-01-15 21:39:39.583+02	PDF_VIEWED	17	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"range": null}	13a1b9c18bd6086ef336462b57ccc178fc72d9c3307cf82d38793f465d7340b3	c0bd4d49c46919f929e0bee1738651ee4364c410953943def0b7f7a2fb25e9c8
bebe4d4f-cfb7-45fe-8447-7169aa4e9730	2026-01-17 22:51:49.383+02	SIGNING_BLOCKED_BY_POLICY	\N	\N	1	admin	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	f	{"path": "/api/SigningFiles/lawyer-files", "firmId": 1, "source": "plan_feature_flags"}	\N	79441fbc1a9789903e407b6d57142b213dc266460df49b27f3115f3995ba9802
8efde48f-ca54-44f3-8c71-2e670ce0f3a9	2026-01-21 15:15:10.072+02	SIGNING_BLOCKED_BY_POLICY	\N	\N	1	admin	::1	Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36	\N	\N	f	{"path": "/api/SigningFiles/lawyer-files", "firmId": 1, "source": "plan_feature_flags"}	\N	4cfa981aeb0385312b09ad8af4c0b1122422823a1290489afe3425402e66c878
efecf34f-05a8-4ad0-8ac9-b8265ee022ee	2026-01-21 15:25:27.831+02	SIGNING_BLOCKED_BY_POLICY	\N	\N	1	admin	::1	Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36	\N	\N	f	{"path": "/api/SigningFiles/lawyer-files", "firmId": 1, "source": "plan_feature_flags"}	\N	18753d5bf109e5f50e5cd77da8acc80cf296fbdaca38286b5364a78ffc3966de
3fa52dbb-b6fc-49ad-b174-8a9906f1af5b	2026-01-21 15:43:52.831+02	SIGNING_BLOCKED_BY_POLICY	\N	\N	1	admin	::1	Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36	\N	\N	f	{"path": "/api/SigningFiles/lawyer-files", "firmId": 1, "source": "plan_feature_flags"}	\N	e1580914d22e817390410c57adf5cf013a122e079122b1b67584bfde26dd3cee
a5f408fd-2260-44da-aa25-b6148f9e3ef4	2026-01-21 15:44:02.913+02	SIGNING_BLOCKED_BY_POLICY	\N	\N	1	admin	::1	Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36	\N	\N	f	{"path": "/api/SigningFiles/lawyer-files", "firmId": 1, "source": "plan_feature_flags"}	\N	c126bd02338f791f6928627a17361ff4afd577c3ad603755b1162f7ecb6a8ee3
ee8b0662-2b52-4987-812d-a94adb9aa5de	2026-01-21 15:46:13.033+02	SIGNING_BLOCKED_BY_POLICY	\N	\N	1	admin	::1	Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36	\N	\N	f	{"path": "/api/SigningFiles/lawyer-files", "firmId": 1, "source": "plan_feature_flags"}	\N	7c43158ba69029bc2b21137ecca0cf24b817faec59ffb5d9b61064185b93e2c1
09bb0417-50de-4dc0-832d-a0a5adf6d084	2026-01-21 15:49:42.825+02	SIGNING_BLOCKED_BY_POLICY	\N	\N	1	admin	::1	Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36	\N	\N	f	{"path": "/api/SigningFiles/lawyer-files", "firmId": 1, "source": "plan_feature_flags"}	\N	4092be3a5b7641feb68a4f2094fb8b0a4e85e3957dfc50638fe1f214511798a0
80b55b8a-8e42-4850-afed-120f24e65353	2026-01-22 13:26:07.723+02	EVIDENCE_PACKAGE_DOWNLOADED	1	\N	1	admin	::1	Mozilla/5.0 (Linux; Android 9.0; SAMSUNG SM-F900U Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36	\N	\N	t	{"zipFilename": "evidence_1_1_20260122_1126.zip", "signingPolicyVersion": "2026-01-11"}	\N	976c61a33c90ab58a0665c787afe479ab79f08e69536582940331e29e11f6eda
31340557-9bd3-4c24-8f1c-ffb5071f3ed5	2026-01-29 11:15:11.142+02	CLIENT_DELETE_CONFIRMED	\N	\N	1	Admin	::1	Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36	\N	\N	t	{"ip": "::1", "clientId": 2, "userAgent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"}	\N	f0a3e907a98eade01f69c4713ebb9352bdc943091c732bde999f88a6daf8e94f
a6c3d19b-7286-4504-9376-859a27c5571c	2026-01-29 16:58:44.737+02	CLIENT_DELETE_CONFIRMED	\N	\N	1	Admin	::1	Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36	\N	\N	t	{"ip": "::1", "clientId": 2, "userAgent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"}	\N	46f1707cf2d6057d2da3c60c1f4091d99bd4946638286527bb4d94041f6ced00
572a8a95-c264-46f3-ac16-e60100231507	2026-01-29 16:58:47.445+02	CLIENT_DELETE_CONFIRMED	\N	\N	1	Admin	::1	Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36	\N	\N	t	{"ip": "::1", "clientId": 2, "userAgent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"}	\N	d6b551e79dca866ef0143265e829af34f69f6bb6e1984cd7c68b2b516f8dd601
5f3ac0e4-7ff1-4811-8555-abb00c4797b0	2026-01-29 18:37:12.524+02	CLIENT_DELETE_CONFIRMED	\N	\N	1	Admin	::1	Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36	\N	\N	t	{"ip": "::1", "clientId": 23, "userAgent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36"}	\N	0b6fb17ab4b4344d108c7911e789350f5f3bbf2eacc215c9ed47275d6280e098
ff214b3c-9cdc-44ec-958f-38acb9a59a00	2026-01-29 18:49:50.182+02	EVIDENCE_PACKAGE_DOWNLOADED	1	\N	1	admin	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"zipFilename": "evidence_noCase_1_20260129_1649.zip", "signingPolicyVersion": "2026-01-11"}	976c61a33c90ab58a0665c787afe479ab79f08e69536582940331e29e11f6eda	1b6c5d766528fffd62a5973775b9caac274ec971638dd826769b06275aac703a
ad86cd50-eb2a-4fcb-8640-3cca1bfb4702	2026-02-11 22:05:10.801+02	SIGNING_POLICY_SELECTED	19	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": true, "requireOtp": false, "selectionExplicit": false, "signingPolicyVersion": "2026-01-11", "otpWaiverAcknowledged": true, "selectedByLawyerUserId": 1}	\N	103db5ddf05153295572418cb794ecefdc12dc6ea119f427d6769d1e8e09d279
60fbf188-5c17-472c-9e85-88bf19b89252	2026-02-11 22:05:11.132+02	PUBLIC_LINK_ISSUED	19	\N	1	lawyer	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	\N	\N	t	{"otpWaived": true, "requireOtp": false, "targetSignerUserId": 25, "signingPolicyVersion": "2026-01-11"}	103db5ddf05153295572418cb794ecefdc12dc6ea119f427d6769d1e8e09d279	7e935a3eadbd9a7bd11931587b732a8254dea2b6ca447f0e4e62c8bf5422e652
\.


--
-- TOC entry 5205 (class 0 OID 16428)
-- Dependencies: 224
-- Data for Name: casedescriptions; Type: TABLE DATA; Schema: public; Owner: liroym
--

COPY public.casedescriptions (descriptionid, caseid, stage, text, "timestamp", isnew) FROM stdin;
8	15	1	1	2026-02-11 22:11:16.461+02	f
9	15	2	2	2026-02-11 22:11:17.13+02	f
10	15	3	3	2026-02-11 22:11:18.192+02	f
11	15	4	4	2026-02-11 22:11:19.12+02	f
12	16	1	תיאור קצר מספר 1	2026-02-11 22:22:19.995+02	f
13	16	2	תיאור בינוני מספר 2 בדיקה 	2026-02-11 22:22:42.433+02	f
14	16	3	תיאור ארוך בדיקה ארוכה תיאור ארוך אפשרות תיאור ארוך	2026-02-11 22:22:44.219+02	f
15	17	1	תיאור קצר מספר 1	2026-02-11 22:26:05.163+02	t
16	17	2	תיאור בינוני מספר 2 בדיקה 	\N	f
17	17	3	תיאור ארוך בדיקה ארוכה תיאור ארוך אפשרות תיאור ארוך	\N	f
\.


--
-- TOC entry 5203 (class 0 OID 16408)
-- Dependencies: 222
-- Data for Name: cases; Type: TABLE DATA; Schema: public; Owner: liroym
--

COPY public.cases (caseid, casename, casetypeid, userid, companyname, currentstage, isclosed, istagged, createdat, updatedat, casetypename, whatsappgrouplink, casemanager, casemanagerid, estimatedcompletiondate, licenseexpirydate) FROM stdin;
15	123/22	3	25	שליאדה	4	t	f	2026-02-11 21:49:51.924694+02	2026-02-11 22:11:19.125856+02	\N	\N	בדיקה מנהל	24	\N	\N
16	123/23	181	25	שליאדה	3	t	f	2026-02-11 22:22:14.963107+02	2026-02-11 22:22:44.233159+02	\N	https://chat.whatsapp.com/D2fRmQk6frAE3Il9ppRwTM	לירוי	1	\N	\N
17	123/24	181	25	שליאדה	1	f	f	2026-02-11 22:26:05.162514+02	2026-02-11 22:26:05.162514+02	\N	\N	לירוי	1	2026-03-26	\N
\.


--
-- TOC entry 5207 (class 0 OID 16443)
-- Dependencies: 226
-- Data for Name: casetypedescriptions; Type: TABLE DATA; Schema: public; Owner: liroym
--

COPY public.casetypedescriptions (casetypedescriptionid, casetypeid, stage, text) FROM stdin;
79	181	1	תיאור קצר מספר 1
80	181	2	תיאור בינוני מספר 2 בדיקה 
81	181	3	תיאור ארוך בדיקה ארוכה תיאור ארוך אפשרות תיאור ארוך
14	3	1	1
15	3	2	2
16	3	3	3
17	3	4	4
\.


--
-- TOC entry 5201 (class 0 OID 16401)
-- Dependencies: 220
-- Data for Name: casetypes; Type: TABLE DATA; Schema: public; Owner: liroym
--

COPY public.casetypes (casetypeid, casetypename, numberofstages) FROM stdin;
3	בדיקהבדיקה	4
181	בדיקה - סוג תיק עובד	3
\.


--
-- TOC entry 5226 (class 0 OID 98555)
-- Dependencies: 245
-- Data for Name: data_retention_runs; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.data_retention_runs (run_id, tenant_id, plan_key, dry_run, started_at, finished_at, summary_json, deleted_counts_json, errors_json) FROM stdin;
\.


--
-- TOC entry 5232 (class 0 OID 98648)
-- Dependencies: 251
-- Data for Name: firm_plan_overrides; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.firm_plan_overrides (firmid, unlimited_until_utc, notes, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5234 (class 0 OID 98685)
-- Dependencies: 253
-- Data for Name: firm_signing_policy; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.firm_signing_policy (firmid, signing_enabled, signing_client_otp_required, updated_at) FROM stdin;
\.


--
-- TOC entry 5231 (class 0 OID 98626)
-- Dependencies: 250
-- Data for Name: firm_subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.firm_subscriptions (firmid, plan_key, status, starts_at, ends_at, created_at, updated_at) FROM stdin;
\.


--
-- TOC entry 5233 (class 0 OID 98668)
-- Dependencies: 252
-- Data for Name: firm_usage_events; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.firm_usage_events (event_id, firmid, meter_key, quantity, unit, occurred_at, metadata) FROM stdin;
3fb2cee6-5486-4029-bba3-d3dfb936b643	1	evidence_generation	1	count	2026-01-22 13:26:07.771178+02	{"kind": "zip", "signingFileId": 1}
d22642c0-a08d-4a47-8b44-f76878a90dca	1	evidence_cpu_seconds	11.5361661	seconds	2026-01-22 13:26:07.773866+02	{"kind": "zip", "signingFileId": 1}
635b4cbe-e9f6-4f5d-ae32-6122018b2eeb	1	evidence_generation	1	count	2026-01-29 18:49:50.232866+02	{"kind": "zip", "signingFileId": 1}
6f900ce7-e677-4f39-a16a-9df89f3459a8	1	evidence_cpu_seconds	12.4040454	seconds	2026-01-29 18:49:50.234916+02	{"kind": "zip", "signingFileId": 1}
96793528-aaf2-4cb0-b55d-77ec60a59e69	1	document_created	1	count	2026-02-11 22:05:10.800284+02	{"signingFileId": 19, "unsignedPdfBytes": 81642}
\.


--
-- TOC entry 5230 (class 0 OID 98606)
-- Dependencies: 249
-- Data for Name: firm_users; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.firm_users (firmid, userid, role, created_at) FROM stdin;
1	1	admin	2026-01-17 17:23:44.993157+02
1	25	member	2026-02-11 22:03:21.714803+02
\.


--
-- TOC entry 5229 (class 0 OID 98594)
-- Dependencies: 248
-- Data for Name: firms; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.firms (firmid, firm_key, name, created_at, updated_at) FROM stdin;
1	default	Default Firm	2026-01-17 17:22:03.836916+02	2026-01-17 17:22:03.836916+02
\.


--
-- TOC entry 5235 (class 0 OID 114916)
-- Dependencies: 254
-- Data for Name: message_delivery_events; Type: TABLE DATA; Schema: public; Owner: liroym
--

COPY public.message_delivery_events (id, channel, type, idempotency_key, metadata, created_at) FROM stdin;
\.


--
-- TOC entry 5208 (class 0 OID 16456)
-- Dependencies: 227
-- Data for Name: otps; Type: TABLE DATA; Schema: public; Owner: liroym
--

COPY public.otps (phonenumber, otp, expiry, userid, createdat) FROM stdin;
\.


--
-- TOC entry 5220 (class 0 OID 81924)
-- Dependencies: 239
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.refresh_tokens (refresh_token_id, userid, token_hash, created_at, expires_at, revoked_at, replaced_by_token_hash, user_agent, ip_address) FROM stdin;
1	2	9e8943aa85f9a1c03ec9061ff1f411c4c4b69bde368c4215ddf55fae3f4bb422	2026-01-13 13:52:30.973477+02	2026-04-13 14:52:30.972+03	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	::1
2	1	cf376c7d27b903abb6ecc7d1145c6a0adcf4a6a65193df032915bcfbbb0124fd	2026-01-13 19:40:18.598295+02	2026-04-13 20:40:18.597+03	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	::1
3	1	711d3d3aabe134914d5cb62821bbbbaec317d7af3971666f86043c24f691ea82	2026-01-15 00:53:53.956309+02	2026-04-15 01:53:53.955+03	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	::1
4	1	04f7c419d06e8a22f2cd22f45ba2657ab154541ab0ab683587a6601d07e86579	2026-01-17 16:35:19.126496+02	2026-04-17 17:35:19.125+03	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	::1
5	2	d81874b8a4030007986cbd84678927d39234aed3768bf886b3e64ddffd8d64c9	2026-01-17 16:43:21.154477+02	2026-04-17 17:43:21.153+03	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	::1
6	1	f501681886253a8f7697db02e5913ff671e0ca36aadff61898b7317392699bca	2026-01-22 13:12:54.369068+02	2026-04-22 14:12:54.367+03	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	::1
7	1	9542d99043724abe0cf6e3e0e2103c9e753998b6d68e937ba7587de6b9644a97	2026-01-27 11:24:06.343156+02	2026-04-27 12:24:06.342+03	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	::1
8	1	03ffc042c0ffe9cbb92561f20a47192c3d99520a21b31d3fcd21ed391f78374f	2026-01-29 08:31:13.778235+02	2026-04-29 09:31:13.777+03	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	::1
9	1	6050f235d4a3bc2d0af3a0170dc4c36e6f88398c0e4dd2394fb4fbb82c5f6b51	2026-02-11 20:24:00.497795+02	2026-05-12 21:24:00.497+03	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	::1
10	25	19666c2320eb54a0f554c91426bbe82cb97fc7d835d8b95ed26c1af4132f3b4e	2026-02-11 22:00:43.918467+02	2026-05-12 23:00:43.917+03	\N	\N	Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Mobile Safari/537.36	::1
11	25	fd828fa6e34af5ccaa579c0347d38cd0c26c4ac0995673fce50f25081cc382fe	2026-02-11 22:02:33.318265+02	2026-05-12 23:02:33.317+03	\N	\N	Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1	::1
12	1	e23ee31187a0a7d6ffc418d9d648137aa069ecb5d17297440e2ffc8eb6edd014	2026-02-11 22:04:03.764328+02	2026-05-12 23:04:03.764+03	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	::1
13	1	2da1efe3a5fc9c859542c811bc8dc0fad7b4bee271949a8ee4c94d85a52a7f77	2026-02-13 13:42:42.555032+02	2026-05-14 14:42:42.554+03	\N	\N	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	::1
\.


--
-- TOC entry 5218 (class 0 OID 65566)
-- Dependencies: 237
-- Data for Name: signaturespots; Type: TABLE DATA; Schema: public; Owner: liroym
--

COPY public.signaturespots (signaturespotid, signingfileid, pagenumber, x, y, width, height, signername, isrequired, issigned, signaturedata, signedat, createdat, signeruserid, signerip, signeruseragent, signingsessionid, presentedpdfsha256, otpverificationid, consentid, signatureimagesha256, signaturestorageetag, signaturestorageversionid, fieldtype, signerindex, fieldlabel, fieldvalue) FROM stdin;
2	1	6	143.00	637.00	161.00	67.00	בדיקה	t	t	signatures/1/2/1_2.png	2026-01-13 13:41:09.443651	2026-01-13 13:38:09.143276	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	0c47f532-da76-43ba-9f28-fe66cedca97d	a21cc985bb0d49806768f6a4f1526c037f38a4de7ba4c188b99b74c236dcfe19	32646b00-5229-45de-bbc8-10babd206148	5c43bf0f-ac24-4316-b799-e6ecc3b39f24	db9218c2941a92f06dc716987a92e29ddcd64bb42b3dbb24abcd3c73f863e98c	bb09609f6cdfdd581b7fe2c096d1b18c	7e6448d716e7ea8716e1a4b83bb4347c	signature	\N	\N	\N
1	1	6	472.00	701.00	161.00	67.00	בדיקה	t	t	signatures/1/2/1_1.png	2026-01-13 13:41:14.663892	2026-01-13 13:38:09.140519	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	0c47f532-da76-43ba-9f28-fe66cedca97d	a21cc985bb0d49806768f6a4f1526c037f38a4de7ba4c188b99b74c236dcfe19	32646b00-5229-45de-bbc8-10babd206148	5c43bf0f-ac24-4316-b799-e6ecc3b39f24	db9218c2941a92f06dc716987a92e29ddcd64bb42b3dbb24abcd3c73f863e98c	bb09609f6cdfdd581b7fe2c096d1b18c	7e6448d7027f706139366a55f3cb8241	signature	\N	\N	\N
4	1	9	281.00	328.00	161.00	67.00	בדיקה	t	t	signatures/1/2/1_4.png	2026-01-13 13:41:15.136029	2026-01-13 13:38:09.144982	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	0c47f532-da76-43ba-9f28-fe66cedca97d	a21cc985bb0d49806768f6a4f1526c037f38a4de7ba4c188b99b74c236dcfe19	32646b00-5229-45de-bbc8-10babd206148	5c43bf0f-ac24-4316-b799-e6ecc3b39f24	db9218c2941a92f06dc716987a92e29ddcd64bb42b3dbb24abcd3c73f863e98c	bb09609f6cdfdd581b7fe2c096d1b18c	7e6448d701387e267d5ceef520d737cf	signature	\N	\N	\N
3	1	9	427.00	355.00	161.00	67.00	בדיקה	t	t	signatures/1/2/1_3.png	2026-01-13 13:41:15.457332	2026-01-13 13:38:09.144231	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	0c47f532-da76-43ba-9f28-fe66cedca97d	a21cc985bb0d49806768f6a4f1526c037f38a4de7ba4c188b99b74c236dcfe19	32646b00-5229-45de-bbc8-10babd206148	5c43bf0f-ac24-4316-b799-e6ecc3b39f24	db9218c2941a92f06dc716987a92e29ddcd64bb42b3dbb24abcd3c73f863e98c	bb09609f6cdfdd581b7fe2c096d1b18c	7e6448d6ff6493043acfb0fae38ccb9c	signature	\N	\N	\N
5	13	1	540.38	1057.43	160.00	60.00	בדיקה 2	t	f	\N	\N	2026-01-15 15:12:58.981517	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
6	13	1	539.30	984.50	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 15:12:58.984002	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
7	13	1	540.38	909.44	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 15:12:58.98463	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
8	13	1	541.45	840.80	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 15:12:58.985317	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
9	13	1	548.95	758.23	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 15:12:58.985995	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
10	13	1	559.68	519.09	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 15:12:58.986705	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
11	13	1	557.53	597.37	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 15:12:58.987386	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
12	13	1	550.03	675.66	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 15:12:58.987951	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
13	13	1	120.00	1071.37	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 15:12:58.988504	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
14	13	1	127.51	537.32	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 15:12:58.989276	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
15	13	1	124.29	618.82	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 15:12:58.992594	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
16	13	1	126.43	692.82	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 15:12:58.993255	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
17	13	1	124.29	771.10	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 15:12:58.993853	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
18	13	1	120.00	848.31	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 15:12:58.994407	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
19	13	1	120.00	926.60	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 15:12:58.995019	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
20	13	1	118.93	998.45	160.00	60.00	בדיקה	t	f	\N	\N	2026-01-15 15:12:58.995668	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
21	14	2	622.95	497.64	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 15:57:23.515179	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
22	14	2	622.95	573.78	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 15:57:23.517438	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
23	14	2	617.59	655.28	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 15:57:23.518287	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
24	14	2	615.44	737.86	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 15:57:23.519129	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
25	14	2	615.44	818.28	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 15:57:23.519875	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
26	14	2	610.08	900.86	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 15:57:23.520655	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
27	14	2	609.01	985.58	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 15:57:23.521528	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
30	14	2	418.12	565.20	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 15:57:23.523745	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
31	14	2	426.70	643.49	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 15:57:23.524652	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
32	14	2	420.27	728.20	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 15:57:23.525421	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
33	14	2	420.27	806.49	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 15:57:23.52625	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
34	14	2	421.34	885.84	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 15:57:23.527098	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
35	14	2	423.49	979.14	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 15:57:23.527872	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	\N	\N	\N
28	14	2	607.94	1058.50	160.00	60.00	בדיקה	t	t	signatures/1/2/14_28.png	2026-01-15 16:18:09.610391	2026-01-15 15:57:23.522294	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	ea63706a-dd8d-494d-bc6c-ad00c3d5fe92	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	4c3d771d-2193-4d7f-a9d0-6eeb810b8fa9	db9218c2941a92f06dc716987a92e29ddcd64bb42b3dbb24abcd3c73f863e98c	bb09609f6cdfdd581b7fe2c096d1b18c	7e643dfaa5c9e7bd528d067f17938c00	signature	\N	\N	\N
29	14	2	417.05	484.77	160.00	60.00	בדיקה 2	f	t	signatures/1/23/14_29.png	2026-01-15 16:51:32.669484	2026-01-15 15:57:23.523032	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	65f6f1ea-28f2-458f-a43f-f37ad54906b1	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	b82e2340-8224-4848-a59b-1c2e3fc0752f	e5d74cce8729c90eadd3c4c2bd4cc1d188ab6580510375850f1dc14ed9a9522b	93127946870d795ad8062de0c8f1f194	7e643ddc150cb6a716d2620e703c384d	signature	\N	\N	\N
36	14	2	422.41	1063.86	160.00	60.00	בדיקה 2	t	t	signatures/1/23/14_36.png	2026-01-15 16:51:35.023771	2026-01-15 15:57:23.528598	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	65f6f1ea-28f2-458f-a43f-f37ad54906b1	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	b82e2340-8224-4848-a59b-1c2e3fc0752f	e5d74cce8729c90eadd3c4c2bd4cc1d188ab6580510375850f1dc14ed9a9522b	93127946870d795ad8062de0c8f1f194	7e643ddc0bf74a2f30316d215a60869f	signature	\N	\N	\N
38	15	1	614.37	858.47	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 17:28:28.78501	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	phone	0	\N	\N
39	15	1	620.80	768.39	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 17:28:28.785703	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	email	0	\N	\N
40	15	1	231.53	879.92	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 17:28:28.786383	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	idnumber	1	\N	\N
42	15	1	47.08	877.77	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 17:28:28.787904	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	email	1	\N	\N
37	15	1	615.44	944.26	160.00	60.00	בדיקה	t	t	signatures/1/2/15_37.png	2026-01-15 17:29:17.088605	2026-01-15 17:28:28.783323	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	f23d1c00-636b-4096-8f56-53c19bb3e084	6825425d09c5e381ee513e64aed18aaf6efbf36f9e893864731afa99ea79ff54	\N	4e6beb55-c7b5-4eef-8432-6eedd3fa76db	db9218c2941a92f06dc716987a92e29ddcd64bb42b3dbb24abcd3c73f863e98c	bb09609f6cdfdd581b7fe2c096d1b18c	7e643db986db3b5ec3bf7435d5e0de21	signature	0	\N	\N
41	15	1	407.40	879.92	160.00	60.00	בדיקה 2	t	t	signatures/1/23/15_41.png	2026-01-15 17:29:25.210997	2026-01-15 17:28:28.78724	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	1b8efe2a-209f-4afc-b2c4-7df7377679e5	6825425d09c5e381ee513e64aed18aaf6efbf36f9e893864731afa99ea79ff54	\N	b7077b11-a293-461b-b6b4-6ac803e28daf	e5d74cce8729c90eadd3c4c2bd4cc1d188ab6580510375850f1dc14ed9a9522b	93127946870d795ad8062de0c8f1f194	7e643db96757ece01049137e88ca5efc	signature	1	\N	\N
43	16	1	118.93	761.96	160.00	60.00	בדיקה	t	f	\N	\N	2026-01-15 17:59:08.750753	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	0	\N	\N
44	16	1	120.00	857.40	160.00	60.00	בדיקה	f	f	\N	\N	2026-01-15 17:59:08.753535	2	\N	\N	\N	\N	\N	\N	\N	\N	\N	email	0	\N	\N
45	16	1	537.16	856.33	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 17:59:08.754654	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	date	1	\N	\N
46	16	1	544.66	761.96	160.00	60.00	בדיקה 2	t	f	\N	\N	2026-01-15 17:59:08.755788	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	1	\N	\N
58	17	1	600.43	776.97	160.00	60.00	בדיקה 2	f	f	\N	\N	2026-01-15 18:20:18.369972	23	\N	\N	\N	\N	\N	\N	\N	\N	\N	initials	1	\N	\N
62	17	1	609.01	469.20	160.00	60.00	בדיקה 2	f	t	\N	2026-01-15 18:20:58.45333	2026-01-15 18:20:18.372925	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	bb7b45c8-d521-462c-a4f7-218734cc0a40	\N	\N	\N	idnumber	1	\N	\N
61	17	1	610.08	545.34	160.00	60.00	בדיקה 2	f	t	\N	2026-01-15 18:21:05.07071	2026-01-15 18:20:18.372199	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	bb7b45c8-d521-462c-a4f7-218734cc0a40	\N	\N	\N	checkbox	1	\N	\N
60	17	1	611.15	624.69	160.00	60.00	בדיקה 2	f	t	\N	2026-01-15 18:21:12.97712	2026-01-15 18:20:18.371449	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	bb7b45c8-d521-462c-a4f7-218734cc0a40	\N	\N	\N	date	1	\N	\N
59	17	1	605.79	700.83	160.00	60.00	בדיקה 2	f	t	\N	2026-01-15 18:21:19.900195	2026-01-15 18:20:18.370763	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	bb7b45c8-d521-462c-a4f7-218734cc0a40	\N	\N	\N	text	1	\N	\N
57	17	1	600.43	854.18	160.00	60.00	בדיקה 2	f	t	\N	2026-01-15 18:22:04.722666	2026-01-15 18:20:18.369339	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	bb7b45c8-d521-462c-a4f7-218734cc0a40	\N	\N	\N	phone	1	\N	\N
56	17	1	595.07	929.25	160.00	60.00	בדיקה 2	f	t	\N	2026-01-15 18:22:09.652846	2026-01-15 18:20:18.368692	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	bb7b45c8-d521-462c-a4f7-218734cc0a40	\N	\N	\N	email	1	\N	\N
55	17	1	597.21	1003.24	160.00	60.00	בדיקה 2	t	t	signatures/1/23/17_55.png	2026-01-15 18:22:13.33839	2026-01-15 18:20:18.367979	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	60c11968-e0fb-4c78-81ae-d67562d9a416	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	bb7b45c8-d521-462c-a4f7-218734cc0a40	e5d74cce8729c90eadd3c4c2bd4cc1d188ab6580510375850f1dc14ed9a9522b	93127946870d795ad8062de0c8f1f194	7e643d890f6b2a5c55fd5879daeeefd4	signature	1	\N	\N
49	17	1	57.80	568.93	160.00	60.00	בדיקה	f	t	\N	2026-01-15 18:23:34.775706	2026-01-15 18:20:18.363372	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	a98871d3-2ff0-4b30-afa6-2b3942b8a831	\N	\N	\N	phone	0	\N	\N
50	17	1	59.95	645.07	160.00	60.00	בדיקה	f	t	signatures/1/2/17_50.png	2026-01-15 18:23:40.774143	2026-01-15 18:20:18.364063	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	a98871d3-2ff0-4b30-afa6-2b3942b8a831	db9218c2941a92f06dc716987a92e29ddcd64bb42b3dbb24abcd3c73f863e98c	bb09609f6cdfdd581b7fe2c096d1b18c	7e643d87ba6367540342660edd4b0072	initials	0	\N	\N
51	17	1	62.09	714.77	160.00	60.00	בדיקה	f	t	\N	2026-01-15 18:23:55.548734	2026-01-15 18:20:18.364793	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	a98871d3-2ff0-4b30-afa6-2b3942b8a831	\N	\N	\N	text	0	\N	\N
52	17	1	55.66	795.20	160.00	60.00	בדיקה	f	t	\N	2026-01-15 18:24:03.737136	2026-01-15 18:20:18.365645	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	a98871d3-2ff0-4b30-afa6-2b3942b8a831	\N	\N	\N	date	0	\N	\N
53	17	1	55.66	870.27	160.00	60.00	בדיקה	f	t	\N	2026-01-15 18:24:07.079487	2026-01-15 18:20:18.366542	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	a98871d3-2ff0-4b30-afa6-2b3942b8a831	\N	\N	\N	checkbox	0	\N	\N
54	17	1	52.44	945.34	160.00	60.00	בדיקה	f	t	\N	2026-01-15 18:24:14.994504	2026-01-15 18:20:18.367246	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	a98871d3-2ff0-4b30-afa6-2b3942b8a831	\N	\N	\N	idnumber	0	\N	\N
47	17	1	52.44	1019.33	160.00	60.00	בדיקה	t	t	signatures/1/2/17_47.png	2026-01-15 18:24:19.592705	2026-01-15 18:20:18.360865	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	150b3301-a38f-4e6a-8cb1-c1832f31b466	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	a98871d3-2ff0-4b30-afa6-2b3942b8a831	db9218c2941a92f06dc716987a92e29ddcd64bb42b3dbb24abcd3c73f863e98c	bb09609f6cdfdd581b7fe2c096d1b18c	7e643d87223ece4248e4e25e4a919794	signature	0	\N	\N
48	17	1	59.95	492.79	160.00	60.00	בדיקה	f	t	\N	2026-01-15 18:41:37.357298	2026-01-15 18:20:18.362494	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	b6adb3fa-dbc2-48e5-be4d-63bd3126ad86	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	935a6406-714e-4f55-aa7b-dec9e305946a	\N	\N	\N	email	0	\N	\N
64	18	2	620.00	356.61	160.00	60.00	בדיקה 2	f	t	\N	2026-01-15 18:44:20.546251	2026-01-15 18:43:31.175739	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6148fa8e-1eca-46ee-9089-5f5b3cb313d0	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	ace6ad32-ec9c-4d8b-9ee5-c886cbdc6de4	\N	\N	\N	email	0	\N	\N
67	18	2	616.43	663.75	160.00	60.00	בדיקה 2	f	t	\N	2026-01-15 20:58:28.951121	2026-01-15 18:43:31.17821	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	4f97a025-f5e4-48a4-8e9f-1f2468de90cc	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	07085ab2-a9ff-4536-9d9d-710f78849b53	\N	\N	\N	text	0	\N	בדיקה אחראית
65	18	2	627.14	456.61	160.00	60.00	בדיקה 2	f	t	\N	2026-01-15 18:44:30.098075	2026-01-15 18:43:31.176468	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6148fa8e-1eca-46ee-9089-5f5b3cb313d0	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	ace6ad32-ec9c-4d8b-9ee5-c886cbdc6de4	\N	\N	\N	phone	0	\N	\N
66	18	2	621.79	553.04	160.00	60.00	בדיקה 2	f	t	signatures/1/23/18_66.png	2026-01-15 18:44:40.210961	2026-01-15 18:43:31.177316	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6148fa8e-1eca-46ee-9089-5f5b3cb313d0	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	ace6ad32-ec9c-4d8b-9ee5-c886cbdc6de4	6a89b8c42e36c7239633852e1d2fde2a1d713be7a55533ea827ccfdd08b1e5b7	e69bea1b00f3565f69b6b62e1eaa95c4	7e643d7482c10e9aa8f5846833105536	initials	0	\N	\N
63	18	2	603.93	1047.68	160.00	60.00	בדיקה 2	t	t	signatures/1/23/18_63.png	2026-01-15 18:44:48.124065	2026-01-15 18:43:31.174043	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	6148fa8e-1eca-46ee-9089-5f5b3cb313d0	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	ace6ad32-ec9c-4d8b-9ee5-c886cbdc6de4	6a89b8c42e36c7239633852e1d2fde2a1d713be7a55533ea827ccfdd08b1e5b7	e69bea1b00f3565f69b6b62e1eaa95c4	7e643d746319f6437daa3bf52cee8bbc	signature	0	\N	\N
73	18	2	78.93	320.89	160.00	60.00	בדיקה	f	t	\N	2026-01-15 18:53:59.517306	2026-01-15 18:43:31.18249	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	c5073674-7510-4c5f-bdc5-bde62bb668f2	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	bd20bf01-dfd1-4962-9c53-9e624b73654b	\N	\N	\N	date	1	\N	\N
70	18	2	602.14	951.25	160.00	60.00	בדיקה 2	f	t	\N	2026-01-15 19:13:19.499497	2026-01-15 18:43:31.180378	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	96763ce2-c723-4e52-8a68-1c3ef92935b2	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	5da49581-6725-4232-9bb4-dd00e1c366cf	\N	\N	\N	idnumber	0	\N	\N
72	18	2	68.21	454.82	160.00	60.00	בדיקה	f	t	\N	2026-01-15 19:24:24.237906	2026-01-15 18:43:31.181733	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	efccc1dd-6121-4c58-9fde-4adc9118da2d	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	c614192b-9bc5-461b-bf7c-46974ee8945a	\N	\N	\N	checkbox	1	\N	\N
68	18	2	620.00	763.75	160.00	60.00	בדיקה 2	f	t	\N	2026-01-15 20:58:36.576546	2026-01-15 18:43:31.178922	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	4f97a025-f5e4-48a4-8e9f-1f2468de90cc	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	07085ab2-a9ff-4536-9d9d-710f78849b53	\N	\N	\N	date	0	\N	1998-02-26
69	18	2	605.71	865.54	160.00	60.00	בדיקה 2	f	t	\N	2026-01-15 20:58:41.677434	2026-01-15 18:43:31.179675	23	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	4f97a025-f5e4-48a4-8e9f-1f2468de90cc	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	07085ab2-a9ff-4536-9d9d-710f78849b53	\N	\N	\N	checkbox	0	\N	true
71	18	2	80.71	570.89	160.00	60.00	בדיקה	f	t	\N	2026-01-15 20:59:35.995677	2026-01-15 18:43:31.181083	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	75e4c844-04f2-4e19-aa89-c954137fd4d9	\N	\N	\N	idnumber	1	\N	209366970
74	18	2	78.93	667.32	160.00	60.00	בדיקה	f	t	\N	2026-01-15 20:59:47.498839	2026-01-15 18:43:31.183164	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	75e4c844-04f2-4e19-aa89-c954137fd4d9	\N	\N	\N	text	1	\N	בדיקהההההה
75	18	2	84.29	747.68	160.00	60.00	בדיקה	f	t	signatures/1/2/18_75.png	2026-01-15 21:00:08.203722	2026-01-15 18:43:31.183828	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	75e4c844-04f2-4e19-aa89-c954137fd4d9	9757f545430242b19ca6040b6344d43322032a244b2702a83c14b744a996c18a	409dc8cc6b5600240ef2891ea0727323	7e643cf87c493c54cc952fe150faa482	initials	1	\N	\N
76	18	2	78.93	842.32	160.00	60.00	בדיקה	f	t	\N	2026-01-15 21:00:15.904526	2026-01-15 18:43:31.184534	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	75e4c844-04f2-4e19-aa89-c954137fd4d9	\N	\N	\N	phone	1	\N	0507299064
77	18	2	73.57	936.96	160.00	60.00	בדיקה	f	t	\N	2026-01-15 21:00:20.270868	2026-01-15 18:43:31.18524	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	75e4c844-04f2-4e19-aa89-c954137fd4d9	\N	\N	\N	email	1	\N	liroymelamed@icloud.com
78	18	2	71.79	1045.89	160.00	60.00	בדיקה	t	t	signatures/1/2/18_78.png	2026-01-15 21:00:25.642817	2026-01-15 18:43:31.185912	2	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	abf3f214-3ae0-43f0-96b9-795ad9040396	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	75e4c844-04f2-4e19-aa89-c954137fd4d9	db9218c2941a92f06dc716987a92e29ddcd64bb42b3dbb24abcd3c73f863e98c	bb09609f6cdfdd581b7fe2c096d1b18c	7e643cf8374498480d6a2a4ea6379f98	signature	1	\N	\N
79	19	1	541.00	970.50	160.00	60.00	שלינקה	t	f	\N	\N	2026-02-11 22:05:11.118573	25	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	0	\N	\N
80	19	2	542.00	970.50	160.00	60.00	שלינקה	t	f	\N	\N	2026-02-11 22:05:11.130497	25	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	0	\N	\N
81	19	3	543.00	971.50	160.00	60.00	שלינקה	t	f	\N	\N	2026-02-11 22:05:11.131375	25	\N	\N	\N	\N	\N	\N	\N	\N	\N	signature	0	\N	\N
\.


--
-- TOC entry 5221 (class 0 OID 98325)
-- Dependencies: 240
-- Data for Name: signing_consents; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.signing_consents (consentid, signingfileid, signeruserid, signingsessionid, consentversion, consenttextsha256, acceptedatutc, ip, user_agent) FROM stdin;
5c43bf0f-ac24-4316-b799-e6ecc3b39f24	1	2	0c47f532-da76-43ba-9f28-fe66cedca97d	2026-01-11	221f2ddb0964967b4338eed81114fd416a86c17260b36b47b02dec599daadebf	2026-01-13 13:41:08.735206+02	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
4c3d771d-2193-4d7f-a9d0-6eeb810b8fa9	14	2	ea63706a-dd8d-494d-bc6c-ad00c3d5fe92	2026-01-11	221f2ddb0964967b4338eed81114fd416a86c17260b36b47b02dec599daadebf	2026-01-15 16:18:09.12712+02	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
b82e2340-8224-4848-a59b-1c2e3fc0752f	14	23	65f6f1ea-28f2-458f-a43f-f37ad54906b1	2026-01-11	221f2ddb0964967b4338eed81114fd416a86c17260b36b47b02dec599daadebf	2026-01-15 16:51:32.214616+02	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
4e6beb55-c7b5-4eef-8432-6eedd3fa76db	15	2	f23d1c00-636b-4096-8f56-53c19bb3e084	2026-01-11	221f2ddb0964967b4338eed81114fd416a86c17260b36b47b02dec599daadebf	2026-01-15 17:29:16.799403+02	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
b7077b11-a293-461b-b6b4-6ac803e28daf	15	23	1b8efe2a-209f-4afc-b2c4-7df7377679e5	2026-01-11	221f2ddb0964967b4338eed81114fd416a86c17260b36b47b02dec599daadebf	2026-01-15 17:29:24.856598+02	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
bb7b45c8-d521-462c-a4f7-218734cc0a40	17	23	60c11968-e0fb-4c78-81ae-d67562d9a416	2026-01-11	221f2ddb0964967b4338eed81114fd416a86c17260b36b47b02dec599daadebf	2026-01-15 18:20:58.450705+02	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
a98871d3-2ff0-4b30-afa6-2b3942b8a831	17	2	150b3301-a38f-4e6a-8cb1-c1832f31b466	2026-01-11	221f2ddb0964967b4338eed81114fd416a86c17260b36b47b02dec599daadebf	2026-01-15 18:23:34.772906+02	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
935a6406-714e-4f55-aa7b-dec9e305946a	17	2	b6adb3fa-dbc2-48e5-be4d-63bd3126ad86	2026-01-11	221f2ddb0964967b4338eed81114fd416a86c17260b36b47b02dec599daadebf	2026-01-15 18:41:37.355155+02	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
ace6ad32-ec9c-4d8b-9ee5-c886cbdc6de4	18	23	6148fa8e-1eca-46ee-9089-5f5b3cb313d0	2026-01-11	221f2ddb0964967b4338eed81114fd416a86c17260b36b47b02dec599daadebf	2026-01-15 18:44:20.542041+02	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
bd20bf01-dfd1-4962-9c53-9e624b73654b	18	2	c5073674-7510-4c5f-bdc5-bde62bb668f2	2026-01-11	221f2ddb0964967b4338eed81114fd416a86c17260b36b47b02dec599daadebf	2026-01-15 18:53:59.512748+02	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
5da49581-6725-4232-9bb4-dd00e1c366cf	18	23	96763ce2-c723-4e52-8a68-1c3ef92935b2	2026-01-11	221f2ddb0964967b4338eed81114fd416a86c17260b36b47b02dec599daadebf	2026-01-15 19:13:19.496558+02	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
c614192b-9bc5-461b-bf7c-46974ee8945a	18	2	efccc1dd-6121-4c58-9fde-4adc9118da2d	2026-01-11	221f2ddb0964967b4338eed81114fd416a86c17260b36b47b02dec599daadebf	2026-01-15 19:24:24.234977+02	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
07085ab2-a9ff-4536-9d9d-710f78849b53	18	23	4f97a025-f5e4-48a4-8e9f-1f2468de90cc	2026-01-11	221f2ddb0964967b4338eed81114fd416a86c17260b36b47b02dec599daadebf	2026-01-15 20:58:28.94886+02	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
75e4c844-04f2-4e19-aa89-c954137fd4d9	18	2	abf3f214-3ae0-43f0-96b9-795ad9040396	2026-01-11	221f2ddb0964967b4338eed81114fd416a86c17260b36b47b02dec599daadebf	2026-01-15 20:59:35.992885+02	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
\.


--
-- TOC entry 5222 (class 0 OID 98343)
-- Dependencies: 241
-- Data for Name: signing_otp_challenges; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.signing_otp_challenges (challengeid, signingfileid, signeruserid, signingsessionid, phone_e164, presentedpdfsha256, otp_hash, otp_salt, provider_message_id, sent_at_utc, expires_at_utc, attempt_count, locked_until_utc, verified_at_utc, verified, request_ip, request_user_agent, verify_ip, verify_user_agent) FROM stdin;
32646b00-5229-45de-bbc8-10babd206148	1	2	0c47f532-da76-43ba-9f28-fe66cedca97d	+972501234567	a21cc985bb0d49806768f6a4f1526c037f38a4de7ba4c188b99b74c236dcfe19	adfc116be4af47cb15a3323854c0baf1f61908adf7824717bc98392da1395895	3e7f85d0-1715-4b6c-94e2-0feecb1efe2a	\N	2026-01-13 13:40:53.781+02	2026-01-13 13:50:53.781+02	0	\N	2026-01-13 13:40:59.871318+02	t	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36	::1	Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36
\.


--
-- TOC entry 5227 (class 0 OID 98571)
-- Dependencies: 246
-- Data for Name: signing_retention_warnings; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.signing_retention_warnings (warning_id, tenant_id, signingfileid, warn_at_utc, created_at, status, sent_at_utc, metadata) FROM stdin;
\.


--
-- TOC entry 5216 (class 0 OID 65540)
-- Dependencies: 235
-- Data for Name: signingfiles; Type: TABLE DATA; Schema: public; Owner: liroym
--

COPY public.signingfiles (signingfileid, caseid, lawyerid, clientid, filename, filekey, originalfilekey, status, signedfilekey, signedat, createdat, expiresat, rejectionreason, notes, requireotp, signingpolicyversion, policyselectedbyuserid, policyselectedatutc, otpwaiveracknowledged, otpwaiveracknowledgedatutc, otpwaiveracknowledgedbyuserid, originalpdfsha256, presentedpdfsha256, signedpdfsha256, originalstoragebucket, originalstoragekey, originalstorageetag, originalstorageversionid, signedstoragebucket, signedstoragekey, signedstorageetag, signedstorageversionid, immutableatutc, otpwaivedbyuserid, otpwaivedatutc, legalhold, legalholdatutc, legalholdreason, pendingdeleteatutc, pendingdeletereason, plan_key_at_signing, retention_days_core_at_signing, retention_days_pii_at_signing, retention_policy_hash_at_signing, firmid, unsignedpdfbytes, signedpdfbytes) FROM stdin;
13	\N	1	23	הסכם קניית סקודה.pdf	users/1/ee7ed5f1-69c7-4ca5-93a6-ea67a8c4a48f.pdf	users/1/ee7ed5f1-69c7-4ca5-93a6-ea67a8c4a48f.pdf	pending	\N	\N	2026-01-15 15:12:58.688027	\N	\N	\N	t	2026-01-11	1	2026-01-15 15:12:58.688027+02	f	\N	\N	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	melamedlaw-files	users/1/ee7ed5f1-69c7-4ca5-93a6-ea67a8c4a48f.pdf	fdb323dfa3310a8d1d10c7b1ba238d5c	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
18	\N	1	23	הסכם קניית סקודה.pdf	users/1/238b8d1a-2a39-4ed1-870c-a8716d0a2440.pdf	users/1/238b8d1a-2a39-4ed1-870c-a8716d0a2440.pdf	signed	\N	2026-01-15 21:00:25.645086	2026-01-15 18:43:30.884221	\N	\N	\N	f	2026-01-11	1	2026-01-15 18:43:30.883+02	t	2026-01-15 18:43:30.883+02	1	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	melamedlaw-files	users/1/238b8d1a-2a39-4ed1-870c-a8716d0a2440.pdf	fdb323dfa3310a8d1d10c7b1ba238d5c	\N	\N	\N	\N	\N	\N	1	2026-01-15 18:43:30.883+02	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
14	\N	1	\N	signed_1017_12_860ca0fb-d214-435e-a1e7-7e5024191eca.pdf	users/1/c5ba2bef-d334-48da-8d40-8bd0ffd6851d.pdf	users/1/c5ba2bef-d334-48da-8d40-8bd0ffd6851d.pdf	signed	\N	2026-01-15 16:51:35.026057	2026-01-15 15:57:21.448099	\N	\N	\N	t	2026-01-11	1	2026-01-15 15:57:21.448099+02	f	\N	\N	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	melamedlaw-files	users/1/c5ba2bef-d334-48da-8d40-8bd0ffd6851d.pdf	ca6fef09a2d079f128280acd9306a143	\N	\N	\N	\N	\N	\N	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
1	\N	1	\N	חוזה עבודה  לירוי מלמד.pdf	users/1/4f47ab6a-967a-4087-97fc-3e841d31f17b.pdf	users/1/4f47ab6a-967a-4087-97fc-3e841d31f17b.pdf	signed	signed/1/1/bf13866a-4955-4c16-b5cc-4164ac60750f.pdf	2026-01-13 13:41:15.460727	2026-01-13 13:38:08.901933	\N	\N	\N	t	2026-01-11	1	2026-01-13 13:38:08.901933+02	f	\N	\N	a21cc985bb0d49806768f6a4f1526c037f38a4de7ba4c188b99b74c236dcfe19	a21cc985bb0d49806768f6a4f1526c037f38a4de7ba4c188b99b74c236dcfe19	27a69e4e2857a9b2ff5476784bce0fdeef78ee8966f5c7c18e443057595cb207	melamedlaw-files	users/1/4f47ab6a-967a-4087-97fc-3e841d31f17b.pdf	5bbc8e92ea755968fce73aeb6b0bfbf7	\N	melamedlaw-files	signed/1/1/bf13866a-4955-4c16-b5cc-4164ac60750f.pdf	3d8e636b57d531892ce6b4c640ec9838	7e6448d6fa2a2cf3e2899521aa36c5b5	2026-01-13 13:41:17.074955+02	\N	\N	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
15	\N	1	\N	תגובה ראשונית לשימוע – לירוי מלמד.pdf	users/1/c961ba9d-b323-4d22-8e9a-58c0f47618b0.pdf	users/1/c961ba9d-b323-4d22-8e9a-58c0f47618b0.pdf	signed	\N	2026-01-15 17:29:25.213876	2026-01-15 17:28:28.481977	\N	\N	\N	f	2026-01-11	1	2026-01-15 17:28:28.48+02	t	2026-01-15 17:28:28.48+02	1	6825425d09c5e381ee513e64aed18aaf6efbf36f9e893864731afa99ea79ff54	6825425d09c5e381ee513e64aed18aaf6efbf36f9e893864731afa99ea79ff54	\N	melamedlaw-files	users/1/c961ba9d-b323-4d22-8e9a-58c0f47618b0.pdf	700d1d2a3d51128197b4497c77977bbf	\N	\N	\N	\N	\N	\N	1	2026-01-15 17:28:28.48+02	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
16	\N	1	\N	חוזה עבודה  לירוי מלמד.pdf	users/1/5a616e8e-8877-4e00-af56-6fa4f677411a.pdf	users/1/5a616e8e-8877-4e00-af56-6fa4f677411a.pdf	pending	\N	\N	2026-01-15 17:59:08.429026	\N	\N	\N	f	2026-01-11	1	2026-01-15 17:59:08.427+02	t	2026-01-15 17:59:08.427+02	1	a21cc985bb0d49806768f6a4f1526c037f38a4de7ba4c188b99b74c236dcfe19	a21cc985bb0d49806768f6a4f1526c037f38a4de7ba4c188b99b74c236dcfe19	\N	melamedlaw-files	users/1/5a616e8e-8877-4e00-af56-6fa4f677411a.pdf	5bbc8e92ea755968fce73aeb6b0bfbf7	\N	\N	\N	\N	\N	\N	1	2026-01-15 17:59:08.427+02	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
17	\N	1	\N	signed_1017_12_860ca0fb-d214-435e-a1e7-7e5024191eca.pdf	users/1/c92cbf04-0ecb-4dfd-81e1-d45a4593a571.pdf	users/1/c92cbf04-0ecb-4dfd-81e1-d45a4593a571.pdf	signed	\N	2026-01-15 18:41:37.359168	2026-01-15 18:20:18.076899	\N	\N	\N	f	2026-01-11	1	2026-01-15 18:20:18.076+02	t	2026-01-15 18:20:18.076+02	1	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	d55c4f1fa69deda5e57d95acc2d01cb270009b7f0276315701bcea53cec5b79a	\N	melamedlaw-files	users/1/c92cbf04-0ecb-4dfd-81e1-d45a4593a571.pdf	ca6fef09a2d079f128280acd9306a143	\N	\N	\N	\N	\N	\N	1	2026-01-15 18:20:18.076+02	f	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N	\N
19	15	1	25	הסכם קניית סקודה.pdf	users/1/5e5aacc3-636f-4837-86fd-b44f6b959ced.pdf	users/1/5e5aacc3-636f-4837-86fd-b44f6b959ced.pdf	pending	\N	\N	2026-02-11 22:05:10.785611	\N	\N	\N	f	2026-01-11	1	2026-02-11 22:05:10.746+02	t	2026-02-11 22:05:10.746+02	1	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	42af162e10049d7f8ec88cf4fdac746a46d030e54ccb5059d16f9a6ac84ee327	\N	melamedlaw-files	users/1/5e5aacc3-636f-4837-86fd-b44f6b959ced.pdf	fdb323dfa3310a8d1d10c7b1ba238d5c	\N	\N	\N	\N	\N	\N	1	2026-02-11 22:05:10.746+02	f	\N	\N	\N	\N	\N	\N	\N	\N	1	81642	\N
\.


--
-- TOC entry 5224 (class 0 OID 98524)
-- Dependencies: 243
-- Data for Name: subscription_plans; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.subscription_plans (plan_key, name, documents_retention_days, cases_quota, clients_quota, storage_gb_quota, documents_monthly_quota, feature_flags, created_at, updated_at, price_monthly_cents, price_currency, documents_retention_days_core, documents_retention_days_pii, users_quota, otp_sms_monthly_quota, evidence_generations_monthly_quota, evidence_cpu_seconds_monthly_quota) FROM stdin;
BASIC	Basic	60	\N	\N	10	100	{}	2026-01-16 06:12:42.434521+02	2026-01-17 17:22:26.880957+02	\N	\N	60	60	3	200	200	600
PRO	Pro	180	\N	\N	100	500	{}	2026-01-16 06:12:42.434521+02	2026-01-17 17:22:26.880957+02	\N	\N	180	180	10	2000	2000	6000
ENTERPRISE	Enterprise	365	\N	\N	\N	\N	{}	2026-01-16 06:12:42.434521+02	2026-01-17 17:22:26.880957+02	\N	\N	365	365	\N	\N	\N	\N
\.


--
-- TOC entry 5225 (class 0 OID 98535)
-- Dependencies: 244
-- Data for Name: tenant_subscriptions; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.tenant_subscriptions (tenant_id, plan_key, status, starts_at, ends_at, updated_at, created_at) FROM stdin;
\.


--
-- TOC entry 5210 (class 0 OID 16468)
-- Dependencies: 229
-- Data for Name: uploadedfiles; Type: TABLE DATA; Schema: public; Owner: liroym
--

COPY public.uploadedfiles (uploadedfileid, caseid, filepath, uploaddate) FROM stdin;
\.


--
-- TOC entry 5212 (class 0 OID 16483)
-- Dependencies: 231
-- Data for Name: userdevices; Type: TABLE DATA; Schema: public; Owner: liroym
--

COPY public.userdevices (deviceid, userid, fcmtoken, devicetype, createdat) FROM stdin;
\.


--
-- TOC entry 5214 (class 0 OID 16496)
-- Dependencies: 233
-- Data for Name: usernotifications; Type: TABLE DATA; Schema: public; Owner: liroym
--

COPY public.usernotifications (notificationid, userid, title, message, isread, createdat) FROM stdin;
3	1	✓ קובץ חתום	הקובץ חוזה עבודה  לירוי מלמד.pdf חתום בהצלחה על ידי כל החתומים	f	2026-01-13 13:41:17.078742+02
8	1	✓ קובץ חתום	הקובץ signed_1017_12_860ca0fb-d214-435e-a1e7-7e5024191eca.pdf חתום בהצלחה על ידי כל החתומים	f	2026-01-15 16:51:35.05834+02
11	1	✓ קובץ חתום	הקובץ תגובה ראשונית לשימוע – לירוי מלמד.pdf חתום בהצלחה על ידי כל החתומים	f	2026-01-15 17:29:25.24278+02
16	1	✓ קובץ חתום	הקובץ signed_1017_12_860ca0fb-d214-435e-a1e7-7e5024191eca.pdf חתום בהצלחה על ידי כל החתומים	f	2026-01-15 18:24:19.62304+02
17	1	✓ קובץ חתום	הקובץ signed_1017_12_860ca0fb-d214-435e-a1e7-7e5024191eca.pdf חתום בהצלחה על ידי כל החתומים	f	2026-01-15 18:41:37.387431+02
20	1	✓ קובץ חתום	הקובץ הסכם קניית סקודה.pdf חתום בהצלחה על ידי כל החתומים	f	2026-01-15 21:00:25.831487+02
22	25	עדכון שלב בתיק	היי שלינקה, \n\nבתיק "123/23" התעדכן שלב, תיקך נמצא בשלב - תיאור בינוני מספר 2 בדיקה , היכנס לאתר או לאפליקציה למעקב.	f	2026-02-11 22:22:20.009909+02
21	25	תיק חדש נוצר	תיק "123/23" נוצר בהצלחה. היכנס לאתר או לאפליקציה למעקב.	f	2026-02-11 22:22:14.972638+02
23	25	קבוצת וואטסאפ מקושרת	קבוצת וואטסאפ קושרה לתיק "123/23".	f	2026-02-11 22:22:38.469116+02
24	25	עדכון שלב בתיק	היי שלינקה, \n\nבתיק "123/23" התעדכן שלב, תיקך נמצא בשלב - תיאור ארוך בדיקה ארוכה תיאור ארוך אפשרות תיאור ארוך, היכנס לאתר או לאפליקציה למעקב.	f	2026-02-11 22:22:42.446215+02
25	25	תיק הסתיים	היי שלינקה, \n\nתיק "123/23" הסתיים בהצלחה, היכנס לאתר או לאפליקציה למעקב.	f	2026-02-11 22:22:44.238632+02
26	25	תיק חדש נוצר	תיק "123/24" נוצר בהצלחה. היכנס לאתר או לאפליקציה למעקב.	f	2026-02-11 22:26:05.169754+02
\.


--
-- TOC entry 5199 (class 0 OID 16391)
-- Dependencies: 218
-- Data for Name: users; Type: TABLE DATA; Schema: public; Owner: liroym
--

COPY public.users (userid, name, email, phonenumber, passwordhash, role, companyname, createdat, dateofbirth, profilepicurl) FROM stdin;
1	לירוי	liroymelamed@icloud.com	0507299064	$2b$10$ntJQJpqs5cWnVneFYyc8Ue/ZAmPrFrKw3dnv0hqMl3eMm9IhQTR7i	Admin	\N	2026-01-13 13:10:21.064656+02	\N	\N
24	בדיקה מנהל	zaqwedsxc2@gmail.com	0507757375	$2b$10$bUXBNEotqNr8PPyxYqmGme00QYXory3GQU6X8CvvRFF6PRMKVz07a	Admin	\N	2026-01-29 08:04:46.30409+02	\N	\N
2	משתמש מחוק (2)	\N	\N	\N	Deleted	\N	2026-01-13 13:13:11.264+02	\N	\N
23	לקוח מחוק (23)	\N	\N	\N	Deleted	\N	2026-01-15 13:13:09.452+02	\N	\N
25	שלינקה	liroymelamed@icloud.com	0546661306	\N	User	שליאדה	2026-02-11 20:24:31.077+02	\N	\N
26	ליאב מלמד	liav@melamedlaw.co.il	0506789898	$2b$10$sAlK8xIMnHCxc0OAAgL5ae7nDFsfdGCGqm0P9tyrSL/czT6HrzDXi	Admin	\N	2026-02-13 13:46:42.945526+02	\N	\N
\.


--
-- TOC entry 5272 (class 0 OID 0)
-- Dependencies: 223
-- Name: casedescriptions_descriptionid_seq; Type: SEQUENCE SET; Schema: public; Owner: liroym
--

SELECT pg_catalog.setval('public.casedescriptions_descriptionid_seq', 17, true);


--
-- TOC entry 5273 (class 0 OID 0)
-- Dependencies: 221
-- Name: cases_caseid_seq; Type: SEQUENCE SET; Schema: public; Owner: liroym
--

SELECT pg_catalog.setval('public.cases_caseid_seq', 17, true);


--
-- TOC entry 5274 (class 0 OID 0)
-- Dependencies: 225
-- Name: casetypedescriptions_casetypedescriptionid_seq; Type: SEQUENCE SET; Schema: public; Owner: liroym
--

SELECT pg_catalog.setval('public.casetypedescriptions_casetypedescriptionid_seq', 81, true);


--
-- TOC entry 5275 (class 0 OID 0)
-- Dependencies: 219
-- Name: casetypes_casetypeid_seq; Type: SEQUENCE SET; Schema: public; Owner: liroym
--

SELECT pg_catalog.setval('public.casetypes_casetypeid_seq', 181, true);


--
-- TOC entry 5276 (class 0 OID 0)
-- Dependencies: 247
-- Name: firms_firmid_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.firms_firmid_seq', 1, true);


--
-- TOC entry 5277 (class 0 OID 0)
-- Dependencies: 238
-- Name: refresh_tokens_refresh_token_id_seq; Type: SEQUENCE SET; Schema: public; Owner: postgres
--

SELECT pg_catalog.setval('public.refresh_tokens_refresh_token_id_seq', 13, true);


--
-- TOC entry 5278 (class 0 OID 0)
-- Dependencies: 236
-- Name: signaturespots_signaturespotid_seq; Type: SEQUENCE SET; Schema: public; Owner: liroym
--

SELECT pg_catalog.setval('public.signaturespots_signaturespotid_seq', 81, true);


--
-- TOC entry 5279 (class 0 OID 0)
-- Dependencies: 234
-- Name: signingfiles_signingfileid_seq; Type: SEQUENCE SET; Schema: public; Owner: liroym
--

SELECT pg_catalog.setval('public.signingfiles_signingfileid_seq', 19, true);


--
-- TOC entry 5280 (class 0 OID 0)
-- Dependencies: 228
-- Name: uploadedfiles_uploadedfileid_seq; Type: SEQUENCE SET; Schema: public; Owner: liroym
--

SELECT pg_catalog.setval('public.uploadedfiles_uploadedfileid_seq', 1, false);


--
-- TOC entry 5281 (class 0 OID 0)
-- Dependencies: 230
-- Name: userdevices_deviceid_seq; Type: SEQUENCE SET; Schema: public; Owner: liroym
--

SELECT pg_catalog.setval('public.userdevices_deviceid_seq', 1, false);


--
-- TOC entry 5282 (class 0 OID 0)
-- Dependencies: 232
-- Name: usernotifications_notificationid_seq; Type: SEQUENCE SET; Schema: public; Owner: liroym
--

SELECT pg_catalog.setval('public.usernotifications_notificationid_seq', 26, true);


--
-- TOC entry 5283 (class 0 OID 0)
-- Dependencies: 217
-- Name: users_userid_seq; Type: SEQUENCE SET; Schema: public; Owner: liroym
--

SELECT pg_catalog.setval('public.users_userid_seq', 26, true);


--
-- TOC entry 4977 (class 2606 OID 98373)
-- Name: audit_events audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_pkey PRIMARY KEY (eventid);


--
-- TOC entry 4941 (class 2606 OID 16436)
-- Name: casedescriptions casedescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.casedescriptions
    ADD CONSTRAINT casedescriptions_pkey PRIMARY KEY (descriptionid);


--
-- TOC entry 4939 (class 2606 OID 16416)
-- Name: cases cases_pkey; Type: CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_pkey PRIMARY KEY (caseid);


--
-- TOC entry 4943 (class 2606 OID 16450)
-- Name: casetypedescriptions casetypedescriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.casetypedescriptions
    ADD CONSTRAINT casetypedescriptions_pkey PRIMARY KEY (casetypedescriptionid);


--
-- TOC entry 4937 (class 2606 OID 16406)
-- Name: casetypes casetypes_pkey; Type: CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.casetypes
    ADD CONSTRAINT casetypes_pkey PRIMARY KEY (casetypeid);


--
-- TOC entry 4986 (class 2606 OID 98564)
-- Name: data_retention_runs data_retention_runs_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.data_retention_runs
    ADD CONSTRAINT data_retention_runs_pkey PRIMARY KEY (run_id);


--
-- TOC entry 5003 (class 2606 OID 98656)
-- Name: firm_plan_overrides firm_plan_overrides_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firm_plan_overrides
    ADD CONSTRAINT firm_plan_overrides_pkey PRIMARY KEY (firmid);


--
-- TOC entry 5009 (class 2606 OID 98692)
-- Name: firm_signing_policy firm_signing_policy_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firm_signing_policy
    ADD CONSTRAINT firm_signing_policy_pkey PRIMARY KEY (firmid);


--
-- TOC entry 5000 (class 2606 OID 98636)
-- Name: firm_subscriptions firm_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firm_subscriptions
    ADD CONSTRAINT firm_subscriptions_pkey PRIMARY KEY (firmid);


--
-- TOC entry 5005 (class 2606 OID 98676)
-- Name: firm_usage_events firm_usage_events_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firm_usage_events
    ADD CONSTRAINT firm_usage_events_pkey PRIMARY KEY (event_id);


--
-- TOC entry 4997 (class 2606 OID 98614)
-- Name: firm_users firm_users_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firm_users
    ADD CONSTRAINT firm_users_pkey PRIMARY KEY (firmid, userid);


--
-- TOC entry 4993 (class 2606 OID 98605)
-- Name: firms firms_firm_key_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firms
    ADD CONSTRAINT firms_firm_key_key UNIQUE (firm_key);


--
-- TOC entry 4995 (class 2606 OID 98603)
-- Name: firms firms_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firms
    ADD CONSTRAINT firms_pkey PRIMARY KEY (firmid);


--
-- TOC entry 5013 (class 2606 OID 114927)
-- Name: message_delivery_events message_delivery_events_idempotency_key_key; Type: CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.message_delivery_events
    ADD CONSTRAINT message_delivery_events_idempotency_key_key UNIQUE (idempotency_key);


--
-- TOC entry 5015 (class 2606 OID 114925)
-- Name: message_delivery_events message_delivery_events_pkey; Type: CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.message_delivery_events
    ADD CONSTRAINT message_delivery_events_pkey PRIMARY KEY (id);


--
-- TOC entry 4945 (class 2606 OID 16461)
-- Name: otps otps_pkey; Type: CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.otps
    ADD CONSTRAINT otps_pkey PRIMARY KEY (phonenumber);


--
-- TOC entry 4967 (class 2606 OID 81932)
-- Name: refresh_tokens refresh_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_pkey PRIMARY KEY (refresh_token_id);


--
-- TOC entry 4969 (class 2606 OID 81934)
-- Name: refresh_tokens refresh_tokens_token_hash_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_token_hash_key UNIQUE (token_hash);


--
-- TOC entry 4963 (class 2606 OID 65578)
-- Name: signaturespots signaturespots_pkey; Type: CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.signaturespots
    ADD CONSTRAINT signaturespots_pkey PRIMARY KEY (signaturespotid);


--
-- TOC entry 4971 (class 2606 OID 98331)
-- Name: signing_consents signing_consents_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signing_consents
    ADD CONSTRAINT signing_consents_pkey PRIMARY KEY (consentid);


--
-- TOC entry 4975 (class 2606 OID 98351)
-- Name: signing_otp_challenges signing_otp_challenges_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signing_otp_challenges
    ADD CONSTRAINT signing_otp_challenges_pkey PRIMARY KEY (challengeid);


--
-- TOC entry 4990 (class 2606 OID 98580)
-- Name: signing_retention_warnings signing_retention_warnings_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signing_retention_warnings
    ADD CONSTRAINT signing_retention_warnings_pkey PRIMARY KEY (warning_id);


--
-- TOC entry 4958 (class 2606 OID 65549)
-- Name: signingfiles signingfiles_pkey; Type: CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.signingfiles
    ADD CONSTRAINT signingfiles_pkey PRIMARY KEY (signingfileid);


--
-- TOC entry 4981 (class 2606 OID 98534)
-- Name: subscription_plans subscription_plans_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.subscription_plans
    ADD CONSTRAINT subscription_plans_pkey PRIMARY KEY (plan_key);


--
-- TOC entry 4984 (class 2606 OID 98543)
-- Name: tenant_subscriptions tenant_subscriptions_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_pkey PRIMARY KEY (tenant_id);


--
-- TOC entry 4947 (class 2606 OID 16476)
-- Name: uploadedfiles uploadedfiles_pkey; Type: CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.uploadedfiles
    ADD CONSTRAINT uploadedfiles_pkey PRIMARY KEY (uploadedfileid);


--
-- TOC entry 4949 (class 2606 OID 16489)
-- Name: userdevices userdevices_pkey; Type: CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.userdevices
    ADD CONSTRAINT userdevices_pkey PRIMARY KEY (deviceid);


--
-- TOC entry 4951 (class 2606 OID 16505)
-- Name: usernotifications usernotifications_pkey; Type: CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.usernotifications
    ADD CONSTRAINT usernotifications_pkey PRIMARY KEY (notificationid);


--
-- TOC entry 4935 (class 2606 OID 16399)
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (userid);


--
-- TOC entry 4978 (class 1259 OID 98389)
-- Name: audit_events_signingfile_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_events_signingfile_time ON public.audit_events USING btree (signingfileid, occurred_at_utc);


--
-- TOC entry 4979 (class 1259 OID 98390)
-- Name: audit_events_type_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX audit_events_type_time ON public.audit_events USING btree (event_type, occurred_at_utc);


--
-- TOC entry 4987 (class 1259 OID 98565)
-- Name: idx_data_retention_runs_started_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_data_retention_runs_started_at ON public.data_retention_runs USING btree (started_at DESC);


--
-- TOC entry 5010 (class 1259 OID 98698)
-- Name: idx_firm_signing_policy_enabled; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_firm_signing_policy_enabled ON public.firm_signing_policy USING btree (signing_enabled);


--
-- TOC entry 5001 (class 1259 OID 98647)
-- Name: idx_firm_subscriptions_status; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_firm_subscriptions_status ON public.firm_subscriptions USING btree (status);


--
-- TOC entry 5006 (class 1259 OID 98682)
-- Name: idx_firm_usage_events_firm_time; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_firm_usage_events_firm_time ON public.firm_usage_events USING btree (firmid, occurred_at DESC);


--
-- TOC entry 5007 (class 1259 OID 98683)
-- Name: idx_firm_usage_events_meter; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_firm_usage_events_meter ON public.firm_usage_events USING btree (meter_key);


--
-- TOC entry 4998 (class 1259 OID 98625)
-- Name: idx_firm_users_userid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_firm_users_userid ON public.firm_users USING btree (userid);


--
-- TOC entry 5011 (class 1259 OID 114928)
-- Name: idx_mde_channel_created; Type: INDEX; Schema: public; Owner: liroym
--

CREATE INDEX idx_mde_channel_created ON public.message_delivery_events USING btree (channel, created_at);


--
-- TOC entry 4964 (class 1259 OID 81941)
-- Name: idx_refresh_tokens_expires_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refresh_tokens_expires_at ON public.refresh_tokens USING btree (expires_at);


--
-- TOC entry 4965 (class 1259 OID 81940)
-- Name: idx_refresh_tokens_userid; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_refresh_tokens_userid ON public.refresh_tokens USING btree (userid);


--
-- TOC entry 4959 (class 1259 OID 73736)
-- Name: idx_signaturespots_signeruserid; Type: INDEX; Schema: public; Owner: liroym
--

CREATE INDEX idx_signaturespots_signeruserid ON public.signaturespots USING btree (signeruserid);


--
-- TOC entry 4960 (class 1259 OID 65587)
-- Name: idx_signaturespots_signingfile; Type: INDEX; Schema: public; Owner: liroym
--

CREATE INDEX idx_signaturespots_signingfile ON public.signaturespots USING btree (signingfileid);


--
-- TOC entry 4961 (class 1259 OID 98519)
-- Name: idx_signaturespots_signingfile_page; Type: INDEX; Schema: public; Owner: liroym
--

CREATE INDEX idx_signaturespots_signingfile_page ON public.signaturespots USING btree (signingfileid, pagenumber);


--
-- TOC entry 4988 (class 1259 OID 98592)
-- Name: idx_signing_retention_warnings_warn_at; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_signing_retention_warnings_warn_at ON public.signing_retention_warnings USING btree (warn_at_utc);


--
-- TOC entry 4952 (class 1259 OID 65586)
-- Name: idx_signingfiles_case; Type: INDEX; Schema: public; Owner: liroym
--

CREATE INDEX idx_signingfiles_case ON public.signingfiles USING btree (caseid);


--
-- TOC entry 4953 (class 1259 OID 65584)
-- Name: idx_signingfiles_client_status; Type: INDEX; Schema: public; Owner: liroym
--

CREATE INDEX idx_signingfiles_client_status ON public.signingfiles USING btree (clientid, status);


--
-- TOC entry 4954 (class 1259 OID 98667)
-- Name: idx_signingfiles_firmid; Type: INDEX; Schema: public; Owner: liroym
--

CREATE INDEX idx_signingfiles_firmid ON public.signingfiles USING btree (firmid);


--
-- TOC entry 4955 (class 1259 OID 65585)
-- Name: idx_signingfiles_lawyer; Type: INDEX; Schema: public; Owner: liroym
--

CREATE INDEX idx_signingfiles_lawyer ON public.signingfiles USING btree (lawyerid);


--
-- TOC entry 4956 (class 1259 OID 98570)
-- Name: idx_signingfiles_pendingdeleteatutc; Type: INDEX; Schema: public; Owner: liroym
--

CREATE INDEX idx_signingfiles_pendingdeleteatutc ON public.signingfiles USING btree (pendingdeleteatutc);


--
-- TOC entry 4982 (class 1259 OID 98554)
-- Name: idx_tenant_subscriptions_plan_key; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_tenant_subscriptions_plan_key ON public.tenant_subscriptions USING btree (plan_key);


--
-- TOC entry 4972 (class 1259 OID 98342)
-- Name: signing_consents_unique; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX signing_consents_unique ON public.signing_consents USING btree (signingfileid, signeruserid, signingsessionid);


--
-- TOC entry 4973 (class 1259 OID 98362)
-- Name: signing_otp_challenges_lookup; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX signing_otp_challenges_lookup ON public.signing_otp_challenges USING btree (signingfileid, signingsessionid, expires_at_utc);


--
-- TOC entry 4991 (class 1259 OID 98591)
-- Name: uniq_signing_retention_warnings_signingfile; Type: INDEX; Schema: public; Owner: postgres
--

CREATE UNIQUE INDEX uniq_signing_retention_warnings_signingfile ON public.signing_retention_warnings USING btree (signingfileid);


--
-- TOC entry 5051 (class 2620 OID 98393)
-- Name: audit_events audit_events_no_delete; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER audit_events_no_delete BEFORE DELETE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.block_audit_events_modification();


--
-- TOC entry 5052 (class 2620 OID 98392)
-- Name: audit_events audit_events_no_update; Type: TRIGGER; Schema: public; Owner: postgres
--

CREATE TRIGGER audit_events_no_update BEFORE UPDATE ON public.audit_events FOR EACH ROW EXECUTE FUNCTION public.block_audit_events_modification();


--
-- TOC entry 5037 (class 2606 OID 98384)
-- Name: audit_events audit_events_actor_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_actor_userid_fkey FOREIGN KEY (actor_userid) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- TOC entry 5038 (class 2606 OID 98379)
-- Name: audit_events audit_events_signaturespotid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_signaturespotid_fkey FOREIGN KEY (signaturespotid) REFERENCES public.signaturespots(signaturespotid) ON DELETE SET NULL;


--
-- TOC entry 5039 (class 2606 OID 98374)
-- Name: audit_events audit_events_signingfileid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.audit_events
    ADD CONSTRAINT audit_events_signingfileid_fkey FOREIGN KEY (signingfileid) REFERENCES public.signingfiles(signingfileid) ON DELETE SET NULL;


--
-- TOC entry 5018 (class 2606 OID 16437)
-- Name: casedescriptions casedescriptions_caseid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.casedescriptions
    ADD CONSTRAINT casedescriptions_caseid_fkey FOREIGN KEY (caseid) REFERENCES public.cases(caseid);


--
-- TOC entry 5016 (class 2606 OID 16417)
-- Name: cases cases_casetypeid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_casetypeid_fkey FOREIGN KEY (casetypeid) REFERENCES public.casetypes(casetypeid);


--
-- TOC entry 5017 (class 2606 OID 16422)
-- Name: cases cases_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.cases
    ADD CONSTRAINT cases_userid_fkey FOREIGN KEY (userid) REFERENCES public.users(userid);


--
-- TOC entry 5019 (class 2606 OID 16451)
-- Name: casetypedescriptions casetypedescriptions_casetypeid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.casetypedescriptions
    ADD CONSTRAINT casetypedescriptions_casetypeid_fkey FOREIGN KEY (casetypeid) REFERENCES public.casetypes(casetypeid);


--
-- TOC entry 5048 (class 2606 OID 98657)
-- Name: firm_plan_overrides firm_plan_overrides_firmid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firm_plan_overrides
    ADD CONSTRAINT firm_plan_overrides_firmid_fkey FOREIGN KEY (firmid) REFERENCES public.firms(firmid) ON DELETE CASCADE;


--
-- TOC entry 5050 (class 2606 OID 98693)
-- Name: firm_signing_policy firm_signing_policy_firmid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firm_signing_policy
    ADD CONSTRAINT firm_signing_policy_firmid_fkey FOREIGN KEY (firmid) REFERENCES public.firms(firmid) ON DELETE CASCADE;


--
-- TOC entry 5046 (class 2606 OID 98637)
-- Name: firm_subscriptions firm_subscriptions_firmid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firm_subscriptions
    ADD CONSTRAINT firm_subscriptions_firmid_fkey FOREIGN KEY (firmid) REFERENCES public.firms(firmid) ON DELETE CASCADE;


--
-- TOC entry 5047 (class 2606 OID 98642)
-- Name: firm_subscriptions firm_subscriptions_plan_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firm_subscriptions
    ADD CONSTRAINT firm_subscriptions_plan_key_fkey FOREIGN KEY (plan_key) REFERENCES public.subscription_plans(plan_key);


--
-- TOC entry 5049 (class 2606 OID 98677)
-- Name: firm_usage_events firm_usage_events_firmid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firm_usage_events
    ADD CONSTRAINT firm_usage_events_firmid_fkey FOREIGN KEY (firmid) REFERENCES public.firms(firmid) ON DELETE CASCADE;


--
-- TOC entry 5044 (class 2606 OID 98615)
-- Name: firm_users firm_users_firmid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firm_users
    ADD CONSTRAINT firm_users_firmid_fkey FOREIGN KEY (firmid) REFERENCES public.firms(firmid) ON DELETE CASCADE;


--
-- TOC entry 5045 (class 2606 OID 98620)
-- Name: firm_users firm_users_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.firm_users
    ADD CONSTRAINT firm_users_userid_fkey FOREIGN KEY (userid) REFERENCES public.users(userid) ON DELETE CASCADE;


--
-- TOC entry 5020 (class 2606 OID 16462)
-- Name: otps otps_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.otps
    ADD CONSTRAINT otps_userid_fkey FOREIGN KEY (userid) REFERENCES public.users(userid);


--
-- TOC entry 5032 (class 2606 OID 81935)
-- Name: refresh_tokens refresh_tokens_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.refresh_tokens
    ADD CONSTRAINT refresh_tokens_userid_fkey FOREIGN KEY (userid) REFERENCES public.users(userid) ON DELETE CASCADE;


--
-- TOC entry 5030 (class 2606 OID 73737)
-- Name: signaturespots signaturespots_signeruserid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.signaturespots
    ADD CONSTRAINT signaturespots_signeruserid_fkey FOREIGN KEY (signeruserid) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- TOC entry 5031 (class 2606 OID 65579)
-- Name: signaturespots signaturespots_signingfileid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.signaturespots
    ADD CONSTRAINT signaturespots_signingfileid_fkey FOREIGN KEY (signingfileid) REFERENCES public.signingfiles(signingfileid) ON DELETE CASCADE;


--
-- TOC entry 5033 (class 2606 OID 98337)
-- Name: signing_consents signing_consents_signeruserid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signing_consents
    ADD CONSTRAINT signing_consents_signeruserid_fkey FOREIGN KEY (signeruserid) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- TOC entry 5034 (class 2606 OID 98332)
-- Name: signing_consents signing_consents_signingfileid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signing_consents
    ADD CONSTRAINT signing_consents_signingfileid_fkey FOREIGN KEY (signingfileid) REFERENCES public.signingfiles(signingfileid) ON DELETE CASCADE;


--
-- TOC entry 5035 (class 2606 OID 98357)
-- Name: signing_otp_challenges signing_otp_challenges_signeruserid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signing_otp_challenges
    ADD CONSTRAINT signing_otp_challenges_signeruserid_fkey FOREIGN KEY (signeruserid) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- TOC entry 5036 (class 2606 OID 98352)
-- Name: signing_otp_challenges signing_otp_challenges_signingfileid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signing_otp_challenges
    ADD CONSTRAINT signing_otp_challenges_signingfileid_fkey FOREIGN KEY (signingfileid) REFERENCES public.signingfiles(signingfileid) ON DELETE CASCADE;


--
-- TOC entry 5042 (class 2606 OID 98586)
-- Name: signing_retention_warnings signing_retention_warnings_signingfile_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signing_retention_warnings
    ADD CONSTRAINT signing_retention_warnings_signingfile_fkey FOREIGN KEY (signingfileid) REFERENCES public.signingfiles(signingfileid) ON DELETE CASCADE;


--
-- TOC entry 5043 (class 2606 OID 98581)
-- Name: signing_retention_warnings signing_retention_warnings_tenant_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.signing_retention_warnings
    ADD CONSTRAINT signing_retention_warnings_tenant_fkey FOREIGN KEY (tenant_id) REFERENCES public.users(userid) ON DELETE CASCADE;


--
-- TOC entry 5024 (class 2606 OID 73731)
-- Name: signingfiles signingfiles_caseid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.signingfiles
    ADD CONSTRAINT signingfiles_caseid_fkey FOREIGN KEY (caseid) REFERENCES public.cases(caseid) ON DELETE SET NULL;


--
-- TOC entry 5025 (class 2606 OID 90115)
-- Name: signingfiles signingfiles_clientid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.signingfiles
    ADD CONSTRAINT signingfiles_clientid_fkey FOREIGN KEY (clientid) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- TOC entry 5026 (class 2606 OID 98662)
-- Name: signingfiles signingfiles_firmid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.signingfiles
    ADD CONSTRAINT signingfiles_firmid_fkey FOREIGN KEY (firmid) REFERENCES public.firms(firmid) ON DELETE SET NULL;


--
-- TOC entry 5027 (class 2606 OID 65555)
-- Name: signingfiles signingfiles_lawyerid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.signingfiles
    ADD CONSTRAINT signingfiles_lawyerid_fkey FOREIGN KEY (lawyerid) REFERENCES public.users(userid) ON DELETE CASCADE;


--
-- TOC entry 5028 (class 2606 OID 98315)
-- Name: signingfiles signingfiles_otpwaiveracknowledgedbyuserid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.signingfiles
    ADD CONSTRAINT signingfiles_otpwaiveracknowledgedbyuserid_fkey FOREIGN KEY (otpwaiveracknowledgedbyuserid) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- TOC entry 5029 (class 2606 OID 98310)
-- Name: signingfiles signingfiles_policyselectedbyuserid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.signingfiles
    ADD CONSTRAINT signingfiles_policyselectedbyuserid_fkey FOREIGN KEY (policyselectedbyuserid) REFERENCES public.users(userid) ON DELETE SET NULL;


--
-- TOC entry 5040 (class 2606 OID 98544)
-- Name: tenant_subscriptions tenant_subscriptions_plan_key_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_plan_key_fkey FOREIGN KEY (plan_key) REFERENCES public.subscription_plans(plan_key);


--
-- TOC entry 5041 (class 2606 OID 98549)
-- Name: tenant_subscriptions tenant_subscriptions_tenant_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.tenant_subscriptions
    ADD CONSTRAINT tenant_subscriptions_tenant_id_fkey FOREIGN KEY (tenant_id) REFERENCES public.users(userid) ON DELETE CASCADE;


--
-- TOC entry 5021 (class 2606 OID 16477)
-- Name: uploadedfiles uploadedfiles_caseid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.uploadedfiles
    ADD CONSTRAINT uploadedfiles_caseid_fkey FOREIGN KEY (caseid) REFERENCES public.cases(caseid);


--
-- TOC entry 5022 (class 2606 OID 16490)
-- Name: userdevices userdevices_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.userdevices
    ADD CONSTRAINT userdevices_userid_fkey FOREIGN KEY (userid) REFERENCES public.users(userid);


--
-- TOC entry 5023 (class 2606 OID 16506)
-- Name: usernotifications usernotifications_userid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: liroym
--

ALTER TABLE ONLY public.usernotifications
    ADD CONSTRAINT usernotifications_userid_fkey FOREIGN KEY (userid) REFERENCES public.users(userid);


--
-- TOC entry 5241 (class 0 OID 0)
-- Dependencies: 5
-- Name: SCHEMA public; Type: ACL; Schema: -; Owner: pg_database_owner
--

GRANT ALL ON SCHEMA public TO liroym;


--
-- TOC entry 5242 (class 0 OID 0)
-- Dependencies: 255
-- Name: FUNCTION block_audit_events_modification(); Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON FUNCTION public.block_audit_events_modification() TO liroym;


--
-- TOC entry 5243 (class 0 OID 0)
-- Dependencies: 242
-- Name: TABLE audit_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.audit_events TO liroym;


--
-- TOC entry 5248 (class 0 OID 0)
-- Dependencies: 245
-- Name: TABLE data_retention_runs; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLE public.data_retention_runs TO liroym;


--
-- TOC entry 5249 (class 0 OID 0)
-- Dependencies: 251
-- Name: TABLE firm_plan_overrides; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLE public.firm_plan_overrides TO liroym;


--
-- TOC entry 5250 (class 0 OID 0)
-- Dependencies: 253
-- Name: TABLE firm_signing_policy; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLE public.firm_signing_policy TO liroym;


--
-- TOC entry 5251 (class 0 OID 0)
-- Dependencies: 250
-- Name: TABLE firm_subscriptions; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLE public.firm_subscriptions TO liroym;


--
-- TOC entry 5252 (class 0 OID 0)
-- Dependencies: 252
-- Name: TABLE firm_usage_events; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLE public.firm_usage_events TO liroym;


--
-- TOC entry 5253 (class 0 OID 0)
-- Dependencies: 249
-- Name: TABLE firm_users; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLE public.firm_users TO liroym;


--
-- TOC entry 5254 (class 0 OID 0)
-- Dependencies: 248
-- Name: TABLE firms; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLE public.firms TO liroym;


--
-- TOC entry 5256 (class 0 OID 0)
-- Dependencies: 247
-- Name: SEQUENCE firms_firmid_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.firms_firmid_seq TO liroym;


--
-- TOC entry 5257 (class 0 OID 0)
-- Dependencies: 254
-- Name: TABLE message_delivery_events; Type: ACL; Schema: public; Owner: liroym
--

GRANT SELECT,INSERT ON TABLE public.message_delivery_events TO PUBLIC;


--
-- TOC entry 5258 (class 0 OID 0)
-- Dependencies: 239
-- Name: TABLE refresh_tokens; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.refresh_tokens TO liroym;


--
-- TOC entry 5260 (class 0 OID 0)
-- Dependencies: 238
-- Name: SEQUENCE refresh_tokens_refresh_token_id_seq; Type: ACL; Schema: public; Owner: postgres
--

GRANT ALL ON SEQUENCE public.refresh_tokens_refresh_token_id_seq TO liroym;


--
-- TOC entry 5262 (class 0 OID 0)
-- Dependencies: 240
-- Name: TABLE signing_consents; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.signing_consents TO liroym;


--
-- TOC entry 5263 (class 0 OID 0)
-- Dependencies: 241
-- Name: TABLE signing_otp_challenges; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,TRIGGER,TRUNCATE,UPDATE ON TABLE public.signing_otp_challenges TO liroym;


--
-- TOC entry 5264 (class 0 OID 0)
-- Dependencies: 246
-- Name: TABLE signing_retention_warnings; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLE public.signing_retention_warnings TO liroym;


--
-- TOC entry 5266 (class 0 OID 0)
-- Dependencies: 243
-- Name: TABLE subscription_plans; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLE public.subscription_plans TO liroym;


--
-- TOC entry 5267 (class 0 OID 0)
-- Dependencies: 244
-- Name: TABLE tenant_subscriptions; Type: ACL; Schema: public; Owner: postgres
--

GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLE public.tenant_subscriptions TO liroym;


--
-- TOC entry 2157 (class 826 OID 98504)
-- Name: DEFAULT PRIVILEGES FOR SEQUENCES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO liroym;


--
-- TOC entry 2158 (class 826 OID 98505)
-- Name: DEFAULT PRIVILEGES FOR FUNCTIONS; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO liroym;


--
-- TOC entry 2156 (class 826 OID 98503)
-- Name: DEFAULT PRIVILEGES FOR TABLES; Type: DEFAULT ACL; Schema: public; Owner: postgres
--

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT,INSERT,DELETE,TRUNCATE,UPDATE ON TABLES TO liroym;


-- Completed on 2026-02-16 00:09:27

--
-- PostgreSQL database dump complete
--

