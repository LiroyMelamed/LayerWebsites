BEGIN;
ALTER TABLE casetypedescriptions ADD COLUMN IF NOT EXISTS document_request_defaults jsonb NOT NULL DEFAULT '{"items":[],"sendOnEntry":false}'::jsonb;
CREATE TABLE IF NOT EXISTS case_document_requests (
 id uuid PRIMARY KEY, law_firm_tenant_id uuid, case_id integer NOT NULL REFERENCES cases(caseid) ON DELETE CASCADE,
 description_id integer UNIQUE REFERENCES casedescriptions(descriptionid) ON DELETE SET NULL,
 stage_title text NOT NULL, items jsonb NOT NULL DEFAULT '[]',
 state text NOT NULL DEFAULT 'draft' CHECK(state IN ('draft','active','paused','completed','cancelled')),
 channels jsonb NOT NULL DEFAULT '["email","sms"]', created_by integer REFERENCES users(userid),
 version integer NOT NULL DEFAULT 1, cycle integer NOT NULL DEFAULT 0, automatic boolean NOT NULL DEFAULT false,
 send_on_entry boolean NOT NULL DEFAULT false, manual_pending boolean NOT NULL DEFAULT false, next_due timestamptz, first_sent_at timestamptz, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS case_document_request_events (
 id bigserial PRIMARY KEY, law_firm_tenant_id uuid, request_id uuid NOT NULL REFERENCES case_document_requests(id) ON DELETE CASCADE,
 actor_id integer REFERENCES users(userid), action text NOT NULL, detail jsonb NOT NULL DEFAULT '{}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS case_document_deliveries (
 id uuid PRIMARY KEY, law_firm_tenant_id uuid, request_id uuid NOT NULL REFERENCES case_document_requests(id) ON DELETE CASCADE,
 manual boolean NOT NULL DEFAULT false, cycle integer NOT NULL, user_id integer NOT NULL REFERENCES users(userid), channel text NOT NULL CHECK(channel IN ('email','sms','push')),
 status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','SENDING','SENT','SIMULATED','FAILED','UNKNOWN','CANCELLED')),
 scheduled_for timestamptz NOT NULL DEFAULT now(), claimed_at timestamptz, sent_at timestamptz, cancelled_at timestamptz,
 error text, content_items jsonb, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(request_id,cycle,user_id,channel)
);
CREATE INDEX IF NOT EXISTS case_document_due ON case_document_requests(next_due) WHERE state='active';
CREATE INDEX IF NOT EXISTS case_document_delivery_due ON case_document_deliveries(scheduled_for) WHERE status='PENDING';
INSERT INTO platform_settings(category,setting_key,setting_value,value_type,label,description) VALUES
 ('reminders','DOCUMENT_REQUEST_AUTO_ENABLED','false','boolean','תזכורת מסמכים אוטומטית','ממשיכים להזכיר כל עוד חסרים מסמכים בשלב הפעיל'),
 ('reminders','DOCUMENT_REQUEST_FIRST_HOURS','72','number','שעות עד לתזכורת הראשונה','לאחר שליחת בקשת המסמכים'),
 ('reminders','DOCUMENT_REQUEST_REPEAT_HOURS','72','number','שעות בין תזכורות','התזכורות נעצרות בהשלמה, ביטול, סגירת תיק או מעבר שלב'),
 ('reminders','DOCUMENT_REQUEST_CHANNELS','email,sms','string','ערוצי שליחה זמינים לבקשות מסמכים','הערוצים שניתן לבחור בעת שליחה'),
 ('reminders','DOCUMENT_REQUEST_DEFAULT_CHANNELS','email,sms','string','ברירת מחדל לערוצי בקשות מסמכים','הערוצים שנבחרים מראש בבקשה חדשה')
 ON CONFLICT DO NOTHING;
INSERT INTO notification_channel_config(notification_type,label,push_enabled,email_enabled,sms_enabled,admin_cc,manager_cc)
 VALUES('DOCUMENT_REQUEST','בקשת מסמכים',true,true,true,false,false) ON CONFLICT DO NOTHING;
INSERT INTO email_templates(template_key,label,subject_template,available_vars,html_body)
 VALUES('DOCUMENT_REQUEST','בקשת מסמכים','מסמכים חסרים — [[case_title]]','["recipient_name","case_title","case_stage","document_name","firm_name"]'::jsonb,
 '<div dir="rtl"><p>שלום [[recipient_name]],</p><p>לצורך [[case_stage]] בתיק [[case_title]] נבקש להעביר למשרד: [[document_name]].</p><p>[[firm_name]]</p></div>') ON CONFLICT DO NOTHING;
DO $$ DECLARE role_name text; BEGIN
 FOR role_name IN SELECT DISTINCT grantee FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='cases' AND privilege_type='INSERT' LOOP
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON case_document_requests,case_document_request_events,case_document_deliveries TO %I',role_name);
  EXECUTE format('GRANT USAGE,SELECT ON SEQUENCE case_document_request_events_id_seq TO %I',role_name);
 END LOOP;
END $$;
DO $isolation$
DECLARE tbl text; ref record;
BEGIN
 IF to_regprocedure('public.office_row_allowed(uuid)') IS NOT NULL THEN
  FOREACH tbl IN ARRAY ARRAY['case_document_requests','case_document_request_events','case_document_deliveries'] LOOP
   EXECUTE format('ALTER TABLE public.%I ALTER COLUMN law_firm_tenant_id SET DEFAULT public.office_scope_id()',tbl);
   EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',tbl);
   EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',tbl);
   EXECUTE format('DROP POLICY IF EXISTS office_access ON public.%I',tbl);
   EXECUTE format('DROP POLICY IF EXISTS office_boundary ON public.%I',tbl);
   EXECUTE format('CREATE POLICY office_access ON public.%I AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true)',tbl);
   EXECUTE format('CREATE POLICY office_boundary ON public.%I AS RESTRICTIVE FOR ALL USING (public.office_row_allowed(law_firm_tenant_id)) WITH CHECK (public.office_row_allowed(law_firm_tenant_id))',tbl);
   EXECUTE format('DROP TRIGGER IF EXISTS office_owner_guard ON public.%I',tbl);
   EXECUTE format('CREATE TRIGGER office_owner_guard BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_office_owner()',tbl);
  END LOOP;
  FOR ref IN SELECT * FROM (VALUES
   ('case_document_requests','case_id','cases','caseid'),
   ('case_document_requests','description_id','casedescriptions','descriptionid'),
   ('case_document_requests','created_by','users','userid'),
   ('case_document_request_events','request_id','case_document_requests','id'),
   ('case_document_request_events','actor_id','users','userid'),
   ('case_document_deliveries','request_id','case_document_requests','id'),
   ('case_document_deliveries','user_id','users','userid')
  ) AS refs(child,col,parent,parent_col) LOOP
   EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I','document_scope_'||ref.col,ref.child);
   EXECUTE format('CREATE TRIGGER %I BEFORE INSERT OR UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference(%L,%L,%L)','document_scope_'||ref.col,ref.child,ref.parent,ref.col,ref.parent_col);
  END LOOP;
 END IF;
END $isolation$;
COMMIT;
