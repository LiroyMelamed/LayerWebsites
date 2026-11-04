-- Match each dedicated database's existing application role; never grant PUBLIC.
BEGIN;
DO $migration$
DECLARE target text; parent_table text; data_owner text; permission record;
BEGIN
    FOR target,parent_table IN SELECT * FROM (VALUES
        ('calendar_external_invitations','calendar_events'),
        ('signing_billing_usage','firm_billing')) AS mapping(target,parent_table)
    LOOP
        SELECT pg_get_userbyid(relowner) INTO data_owner FROM pg_class WHERE oid=to_regclass('public.'||parent_table);
        EXECUTE format('ALTER TABLE public.%I OWNER TO %I',target,data_owner);
        FOR permission IN SELECT pg_get_userbyid(a.grantee) AS role_name,a.privilege_type
            FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
            WHERE c.oid=to_regclass('public.'||parent_table) AND a.grantee<>0 AND a.grantee<>c.relowner
            AND a.privilege_type IN ('SELECT','INSERT','UPDATE','DELETE')
        LOOP
            EXECUTE format('GRANT %s ON public.%I TO %I',permission.privilege_type,target,permission.role_name);
        END LOOP;
    END LOOP;
END $migration$;
COMMIT;
