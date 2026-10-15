'use strict';

// Explicit classification: a new table must be reviewed before a shared deployment starts.
const control = new Set(['law_firm_tenants', 'signup_intents', 'platform_admins', 'global_platform_masters', 'schema_migrations']);
const reference = new Set(['holidays_date', 'subscription_plans']);
const office = new Set(`users cases case_users casedescriptions casetypes casetypedescriptions
 uploadedfiles stage_files signingfiles signaturespots signing_consents signing_otp_challenges
 signing_file_reminders signing_signer_delivery signing_retention_warnings signing_short_links audit_events
 calendar_events calendar_event_clients calendar_event_managers user_calendar_tokens user_daily_agenda_settings
 otps refresh_tokens userdevices usernotifications birthday_greetings_sent chatbot_sessions chatbot_messages
 scheduled_email_reminders reminder_templates template_attachments knowledge_documents knowledge_chunks
 platform_settings notification_channel_config email_templates firm_billing firm_payment_methods
 firm_payment_intents firm_payment_events tenant_subscriptions data_retention_runs message_delivery_events
 public_short_links firm_staff_roles
 signing_templates signing_batches signing_batch_files signing_batch_recipients signing_batch_sessions
 signing_package_completions signing_batch_reminders signing_owner_contexts signing_people signing_parties
 signing_artifacts signing_authorities signing_template_versions signing_submissions signing_packages
 signing_package_assignments signing_package_revisions signing_participations signing_documents signing_tasks
 signing_delivery_profiles signing_public_grants signing_grant_items signing_sessions_v2 signing_actions
 signing_approvals signing_operations signing_jobs signing_job_dependencies signing_deliveries signing_events_v2
 signing_selections signing_selection_items signing_otp_challenges_v2 signing_preflights
 signing_task_issues signing_bulk_reviews signing_replacement_drafts signing_approval_requests signing_bulk_requests
 signing_delivery_items signing_creation_drafts signing_error_alerts signing_error_emails signing_selection_snapshots`.trim().split(/\s+/));

async function tables(client) {
    return (await client.query(`SELECT c.relname AS name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force,
        c.relowner = (SELECT oid FROM pg_roles WHERE rolname=current_user) AS owned
        FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
        WHERE n.nspname='public' AND c.relkind IN ('r','p')
        AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid=c.oid AND d.deptype='e')
        ORDER BY c.relname`)).rows;
}
async function assertIsolationReady(client) {
    const [role, inventory] = await Promise.all([
        client.query('SELECT rolsuper, rolbypassrls FROM pg_roles WHERE rolname=current_user'), tables(client),
    ]);
    if (role.rows[0]?.rolsuper || role.rows[0]?.rolbypassrls) throw new Error('OFFICE_ISOLATION_UNSAFE_DB_ROLE');
    for (const table of inventory) {
        if (!office.has(table.name) && !control.has(table.name) && !reference.has(table.name)) throw new Error(`OFFICE_ISOLATION_UNCLASSIFIED_TABLE:${table.name}`);
        if (!table.rls || !table.force || table.owned) throw new Error(`OFFICE_ISOLATION_NOT_READY:${table.name}`);
    }
    const policies = (await client.query(`SELECT tablename FROM pg_policies WHERE schemaname='public' AND policyname='office_boundary' AND permissive='RESTRICTIVE'`)).rows;
    const protectedTables = new Set(policies.map(row => row.tablename));
    if (inventory.some(table => !protectedTables.has(table.name))) throw new Error('OFFICE_ISOLATION_POLICY_MISSING');
}
module.exports = { office, control, reference, tables, assertIsolationReady };
