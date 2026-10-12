'use strict';
// Deliberately outside the automatic migrations directory: dedicated databases must not run this.
const { office, control, reference, tables } = require('../lib/tenant/isolationSchema');
const quote = value => '"' + String(value).replaceAll('"', '""') + '"';

async function install(client) {
    if (!require('../lib/tenant/databaseScope').enabled()) {
        throw new Error('Shared-office isolation requires both explicit deployment flags');
    }
    const inventory = await tables(client);
    for (const { name } of inventory) {
        if (!office.has(name) && !control.has(name) && !reference.has(name)) throw new Error(`Unclassified table: ${name}`);
    }
    await client.query('BEGIN');
    try {
        await client.query(`ALTER TABLE public.law_firm_tenants ADD COLUMN IF NOT EXISTS owner_user_id integer REFERENCES public.users(userid);
            UPDATE public.law_firm_tenants t SET owner_user_id=owner.userid FROM (
                SELECT law_firm_tenant_id,min(userid) AS userid FROM public.users
                WHERE role='Admin' AND law_firm_tenant_id IS NOT NULL GROUP BY law_firm_tenant_id HAVING count(*)=1
            ) owner WHERE owner.law_firm_tenant_id=t.id AND t.owner_user_id IS NULL`);
        if ((await client.query(`SELECT 1 FROM public.law_firm_tenants t LEFT JOIN public.users u ON u.userid=t.owner_user_id
            WHERE u.userid IS NULL OR u.law_firm_tenant_id IS DISTINCT FROM t.id OR u.role<>'Admin' LIMIT 1`)).rowCount) {
            throw new Error('OFFICE_OWNER_MAPPING_REQUIRES_REVIEW');
        }
        await client.query(`CREATE OR REPLACE FUNCTION public.office_scope_id() RETURNS uuid LANGUAGE sql STABLE
            AS $$ SELECT nullif(current_setting('app.office_id',true),'')::uuid $$;
            CREATE OR REPLACE FUNCTION public.office_row_allowed(owner_id uuid) RETURNS boolean LANGUAGE sql STABLE
            AS $$ SELECT COALESCE(current_setting('app.office_mode',true)='system'
                OR (current_setting('app.office_mode',true)='office' AND owner_id=public.office_scope_id())
                OR (current_setting('app.office_mode',true)='legacy' AND owner_id IS NULL), false) $$;`);
        for (const { name } of inventory.filter(t => office.has(t.name))) {
            await client.query(`ALTER TABLE public.${quote(name)} ADD COLUMN IF NOT EXISTS law_firm_tenant_id uuid`);
            await client.query(`ALTER TABLE public.${quote(name)} ALTER COLUMN law_firm_tenant_id SET DEFAULT public.office_scope_id()`);
            await client.query(`CREATE INDEX IF NOT EXISTS ${quote('office_scope_' + name)} ON public.${quote(name)} (law_firm_tenant_id)`);
        }
        // This rollout never guesses ownership of pre-existing legal/business records.
        // A populated legacy shared store needs an explicitly reviewed ownership mapping first.
        for (const name of ['cases','signingfiles','calendar_events','uploadedfiles','stage_files']) {
            if ((await client.query(`SELECT 1 FROM public.${quote(name)} WHERE law_firm_tenant_id IS NULL LIMIT 1`)).rowCount) {
                throw new Error(`OFFICE_DATA_MAPPING_REQUIRES_REVIEW:${name}`);
            }
        }
        // Tokens/notifications belong to their identified user. No case ownership is inferred from a manager.
        for (const [table, key] of [['refresh_tokens','userid'],['otps','userid'],['userdevices','userid'],['usernotifications','userid'],['user_calendar_tokens','user_id'],['user_daily_agenda_settings','user_id']]) {
            if (inventory.some(t => t.name === table)) await client.query(`UPDATE public.${quote(table)} t SET law_firm_tenant_id=u.law_firm_tenant_id
                FROM public.users u WHERE t.${quote(key)}=u.userid AND t.law_firm_tenant_id IS NULL AND u.law_firm_tenant_id IS NOT NULL`);
        }
        // Names and OTP destinations may legitimately be identical in different offices.
        for (const [table, constraint] of [['platform_settings','platform_settings_category_setting_key_key'],['notification_channel_config','notification_channel_config_notification_type_key'],['reminder_templates','reminder_templates_template_key_key'],['email_templates','email_templates_pkey']]) {
            await client.query(`ALTER TABLE public.${quote(table)} DROP CONSTRAINT IF EXISTS ${quote(constraint)}`);
        }
        await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS office_settings_key ON public.platform_settings(law_firm_tenant_id,category,setting_key) NULLS NOT DISTINCT;
            CREATE UNIQUE INDEX IF NOT EXISTS office_channels_key ON public.notification_channel_config(law_firm_tenant_id,notification_type) NULLS NOT DISTINCT;
            CREATE UNIQUE INDEX IF NOT EXISTS office_reminder_key ON public.reminder_templates(law_firm_tenant_id,template_key) NULLS NOT DISTINCT;
            CREATE UNIQUE INDEX IF NOT EXISTS office_email_key ON public.email_templates(law_firm_tenant_id,template_key) NULLS NOT DISTINCT;
            DROP INDEX IF EXISTS public.uq_otps_email_lower; DROP INDEX IF EXISTS public.uq_otps_phonenumber;
            CREATE UNIQUE INDEX IF NOT EXISTS office_otp_email ON public.otps(law_firm_tenant_id,lower(email)) NULLS NOT DISTINCT WHERE email IS NOT NULL;
            CREATE UNIQUE INDEX IF NOT EXISTS office_otp_phone ON public.otps(law_firm_tenant_id,phonenumber) NULLS NOT DISTINCT WHERE phonenumber IS NOT NULL;`);
        // A tenant identifier cannot be reassigned by a normal request, even through an explicit NULL.
        await client.query(`CREATE OR REPLACE FUNCTION public.guard_office_owner() RETURNS trigger LANGUAGE plpgsql AS $$
            BEGIN
                IF current_setting('app.office_mode',true) <> 'system' AND TG_OP='UPDATE'
                    AND NEW.law_firm_tenant_id IS DISTINCT FROM OLD.law_firm_tenant_id THEN
                    RAISE EXCEPTION 'office owner is immutable' USING ERRCODE='42501';
                END IF;
                RETURN NEW;
            END $$;
            CREATE OR REPLACE FUNCTION public.guard_office_reference() RETURNS trigger LANGUAGE plpgsql AS $$
            DECLARE ref_value text; parent_owner uuid; found_parent boolean;
            BEGIN
                ref_value := to_jsonb(NEW)->>TG_ARGV[0];
                IF ref_value IS NULL THEN RETURN NEW; END IF;
                EXECUTE format('SELECT law_firm_tenant_id, true FROM public.%I WHERE %I::text=$1', TG_ARGV[1], TG_ARGV[2])
                    INTO parent_owner, found_parent USING ref_value;
                IF found_parent IS DISTINCT FROM true OR parent_owner IS DISTINCT FROM NEW.law_firm_tenant_id THEN
                    RAISE EXCEPTION 'office reference is outside the current office' USING ERRCODE='42501';
                END IF;
                RETURN NEW;
            END $$;`);
        for (const { name } of inventory) {
            const table = `public.${quote(name)}`;
            await client.query(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY; ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`);
            await client.query(`DROP POLICY IF EXISTS office_access ON ${table}; DROP POLICY IF EXISTS office_boundary ON ${table}`);
            const condition = office.has(name) ? 'public.office_row_allowed(law_firm_tenant_id)' : "current_setting('app.office_mode',true)='system'";
            // RESTRICTIVE prevents a later permissive policy from opening another office.
            await client.query(`CREATE POLICY office_access ON ${table} AS PERMISSIVE FOR ALL USING (true) WITH CHECK (true)`);
            if (reference.has(name) || name === 'signup_intents') {
                const readCondition = name === 'signup_intents' ? 'public.office_row_allowed(law_firm_tenant_id)' : 'true';
                await client.query(`CREATE POLICY office_boundary ON ${table} AS RESTRICTIVE FOR SELECT USING (${readCondition})`);
                await client.query(`DROP POLICY IF EXISTS office_write_boundary ON ${table}`);
                // A restrictive ALL policy would also affect SELECT. Split all mutation commands.
                for (const op of ['INSERT','UPDATE','DELETE']) {
                    const policy = quote('office_write_' + op.toLowerCase());
                    await client.query(`DROP POLICY IF EXISTS ${policy} ON ${table}`);
                    await client.query(`CREATE POLICY ${policy} ON ${table} AS RESTRICTIVE FOR ${op} ${op !== 'INSERT' ? `USING (${condition})` : ''} ${op !== 'DELETE' ? `WITH CHECK (${condition})` : ''}`);
                }
            } else {
                await client.query(`CREATE POLICY office_boundary ON ${table} AS RESTRICTIVE FOR ALL USING (${condition}) WITH CHECK (${condition})`);
            }
            if (office.has(name)) {
                await client.query(`DROP TRIGGER IF EXISTS office_owner_guard ON ${table}; CREATE TRIGGER office_owner_guard BEFORE UPDATE ON ${table} FOR EACH ROW EXECUTE FUNCTION public.guard_office_owner()`);
            }
        }
        // RLS alone does not validate foreign keys. Check every business-to-business FK as well.
        const fks = (await client.query(`SELECT child.relname AS child, parent.relname AS parent,
            ca.attname AS column, pa.attname AS parent_column
            FROM pg_constraint fk JOIN pg_class child ON child.oid=fk.conrelid JOIN pg_class parent ON parent.oid=fk.confrelid
            JOIN pg_namespace n ON n.oid=child.relnamespace
            JOIN pg_attribute ca ON ca.attrelid=child.oid AND ca.attnum=fk.conkey[1]
            JOIN pg_attribute pa ON pa.attrelid=parent.oid AND pa.attnum=fk.confkey[1]
            WHERE fk.contype='f' AND n.nspname='public' AND cardinality(fk.conkey)=1`)).rows;
        // Existing legacy schema lacks these FKs, but the identifiers still carry authority.
        const extra = [['cases','casemanagerid','users','userid'], ['scheduled_email_reminders','created_by','users','userid'], ['signingfiles','otpwaivedbyuserid','users','userid']];
        for (const [child, column, parent, parent_column] of extra) {
            if (inventory.some(t => t.name === child) && (await client.query(`SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,[child,column])).rowCount) fks.push({child,column,parent,parent_column});
        }
        for (const fk of fks.filter(fk => office.has(fk.child) && office.has(fk.parent))) {
            // Do not hide a previously associated row or preserve an inconsistent cross-office relationship.
            // Such a database needs a reviewed, explicit data mapping before this rollout.
            if ((await client.query(`SELECT 1 FROM public.${quote(fk.child)} child JOIN public.${quote(fk.parent)} parent
                ON child.${quote(fk.column)}=parent.${quote(fk.parent_column)}
                WHERE child.law_firm_tenant_id IS DISTINCT FROM parent.law_firm_tenant_id LIMIT 1`)).rowCount) {
                throw new Error(`OFFICE_REFERENCE_MAPPING_REQUIRES_REVIEW:${fk.child}:${fk.column}`);
            }
            const trigger = quote(`office_ref_${fk.column}`), table = `public.${quote(fk.child)}`;
            await client.query(`DROP TRIGGER IF EXISTS ${trigger} ON ${table}`);
            await client.query(`CREATE TRIGGER ${trigger} BEFORE INSERT OR UPDATE OF ${quote(fk.column)}, law_firm_tenant_id ON ${table}
                FOR EACH ROW EXECUTE FUNCTION public.guard_office_reference('${fk.column}','${fk.parent}','${fk.parent_column}')`);
        }
        for (const tenant of (await client.query('SELECT id,name FROM public.law_firm_tenants')).rows) {
            await require('../lib/tenant/seedOfficeDefaults').seedOfficeDefaults(client,tenant);
        }
        await client.query('COMMIT');
    } catch (error) { await client.query('ROLLBACK'); throw error; }
}
module.exports = { install };
