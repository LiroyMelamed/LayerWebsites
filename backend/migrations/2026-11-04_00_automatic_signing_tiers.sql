-- Opt-in for dedicated deployments only. No card charge, no historical price changes.
-- The existing renewal flow consumes price_monthly_ils at its normal due date.
BEGIN;
ALTER TABLE firm_billing ADD COLUMN IF NOT EXISTS signing_auto_tier_enabled boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS signing_billing_usage (
 source_kind text NOT NULL CHECK(source_kind IN ('legacy','submission','replacement')),
 source_id text NOT NULL,
 month_start date NOT NULL,
 documents integer NOT NULL CHECK(documents>0),
 PRIMARY KEY(source_kind,source_id)
);
CREATE INDEX IF NOT EXISTS signing_billing_usage_month_idx ON signing_billing_usage(month_start);
-- Durable baseline: deleting a signing document must not erase billed usage.
INSERT INTO signing_billing_usage SELECT 'legacy',signingfileid::text,
 date_trunc('month',createdat AT TIME ZONE 'Asia/Jerusalem')::date,1 FROM signingfiles
 ON CONFLICT DO NOTHING;
INSERT INTO signing_billing_usage SELECT 'submission',s.id::text,
 date_trunc('month',s.committed_at AT TIME ZONE 'Asia/Jerusalem')::date,s.document_count
 FROM signing_submissions s JOIN signing_owner_contexts c ON c.id=s.owner_context_id
 WHERE c.law_firm_tenant_id IS NULL ON CONFLICT DO NOTHING;
INSERT INTO signing_billing_usage SELECT 'replacement',s.id::text,
 date_trunc('month',s.published_at AT TIME ZONE 'Asia/Jerusalem')::date,s.document_count
 FROM signing_replacement_drafts s JOIN signing_owner_contexts c ON c.id=s.owner_context_id
 WHERE c.law_firm_tenant_id IS NULL AND s.state='published' AND s.document_count>0 ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION signing_record_automatic_tier() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE b firm_billing%ROWTYPE; n integer; period date; source text; key text; quantity integer;
 old_amount integer; next_amount integer; next_tier text;
BEGIN
 -- Never apply a dedicated-office agreement to an office in a shared database.
 SELECT * INTO b FROM firm_billing WHERE id=1 AND law_firm_tenant_id IS NULL
   AND signing_auto_tier_enabled FOR UPDATE;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF TG_TABLE_NAME='signingfiles' THEN
   source:='legacy';key:=NEW.signingfileid::text;quantity:=1;
   period:=date_trunc('month',NEW.createdat AT TIME ZONE 'Asia/Jerusalem')::date;
 ELSE
   IF NOT EXISTS(SELECT 1 FROM signing_owner_contexts WHERE id=NEW.owner_context_id AND law_firm_tenant_id IS NULL) THEN RETURN NEW; END IF;
   IF TG_TABLE_NAME='signing_submissions' THEN
     source:='submission';period:=date_trunc('month',NEW.committed_at AT TIME ZONE 'Asia/Jerusalem')::date;
   ELSE
     IF NEW.state<>'published' OR NEW.document_count<=0 THEN RETURN NEW; END IF;
     source:='replacement';period:=date_trunc('month',NEW.published_at AT TIME ZONE 'Asia/Jerusalem')::date;
   END IF;
   key:=NEW.id::text;quantity:=NEW.document_count;
 END IF;
 INSERT INTO signing_billing_usage VALUES(source,key,period,quantity) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN RETURN NEW; END IF;
 IF period<>date_trunc('month',clock_timestamp() AT TIME ZONE 'Asia/Jerusalem')::date THEN RETURN NEW; END IF;
 SELECT sum(documents) INTO n FROM signing_billing_usage WHERE month_start=period;
 next_tier:=CASE WHEN n<=500 THEN '500' WHEN n<=1500 THEN '1500' WHEN n<=5000 THEN '5000' ELSE 'unlimited' END;
 next_amount:=CASE next_tier WHEN '500' THEN 169 WHEN '1500' THEN 338 WHEN '5000' THEN 677 ELSE 1101 END;
 old_amount:=CASE b.signing_id WHEN 'none' THEN 0 WHEN '500' THEN 169 WHEN '1500' THEN 338 WHEN '5000' THEN 677 WHEN 'unlimited' THEN 1101 ELSE NULL END;
 IF old_amount IS NULL THEN RAISE EXCEPTION 'Unknown signing price tier'; END IF;
 -- Upgrade only: preserve purchased packs, negotiated non-signing price, free
 -- period, renewal date, payment status and all payment-provider state.
 IF next_amount>old_amount THEN
   UPDATE firm_billing SET signing_id=next_tier,
     price_monthly_ils=price_monthly_ils+next_amount-old_amount,updated_at=now() WHERE id=b.id;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS signing_auto_tier_legacy ON signingfiles;
CREATE TRIGGER signing_auto_tier_legacy AFTER INSERT ON signingfiles FOR EACH ROW EXECUTE FUNCTION signing_record_automatic_tier();
DROP TRIGGER IF EXISTS signing_auto_tier_submission ON signing_submissions;
CREATE TRIGGER signing_auto_tier_submission AFTER INSERT ON signing_submissions FOR EACH ROW EXECUTE FUNCTION signing_record_automatic_tier();
DROP TRIGGER IF EXISTS signing_auto_tier_replacement ON signing_replacement_drafts;
CREATE TRIGGER signing_auto_tier_replacement AFTER INSERT OR UPDATE OF state ON signing_replacement_drafts FOR EACH ROW EXECUTE FUNCTION signing_record_automatic_tier();
COMMIT;
