const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');

test('approval migration permits scoped CRUD with an actual non-owner non-BYPASSRLS role',
    { skip: process.env.LEGAL_DB_QA !== 'true', timeout: 15000 }, async t => {
        assert.equal(process.env.DB_HOST, '127.0.0.1');
        assert.equal(process.env.DB_PORT, '55442');
        assert.equal(process.env.DB_NAME, 'legal_e2e_qa');
        const pool = require('../config/db');
        const db = await pool.connect();
        const suffix = randomUUID().replaceAll('-', '');
        const schema = `qa_approval_nonowner_${suffix}`;
        const role = `qa_approval_crud_${suffix}`;
        const contextId = randomUUID(), revisionId = randomUUID(), otherContext = randomUUID(), otherRevision = randomUUID();
        const migration = fs.readFileSync(path.join(__dirname, '../migrations/2026-10-08_10_signing_approval_requests.sql'), 'utf8');
        let roleCreated = false, schemaCreated = false;
        try {
            assert.equal((await db.query('SELECT current_database() AS database')).rows[0].database, 'legal_e2e_qa');
            await db.query(`CREATE ROLE ${role} NOLOGIN NOSUPERUSER NOBYPASSRLS NOINHERIT`);
            roleCreated = true;
            await db.query(`CREATE SCHEMA ${schema}`);
            schemaCreated = true;
            await db.query(`SET search_path TO ${schema}`);
            // Minimal referenced tables isolate this exact migration. They and
            // the approval table are owned by the fixture administrator, never
            // by the effective application-like role used for the proof.
            await db.query('CREATE TABLE users(userid integer PRIMARY KEY)');
            await db.query('CREATE TABLE signing_package_revisions(owner_context_id uuid NOT NULL,id uuid NOT NULL,PRIMARY KEY(owner_context_id,id))');
            await db.query('INSERT INTO users(userid) VALUES(101),(102),(103)');
            await db.query('INSERT INTO signing_package_revisions(owner_context_id,id) VALUES($1,$2),($3,$4)',
                [contextId, revisionId, otherContext, otherRevision]);
            await db.query(migration);
            await db.query(`GRANT USAGE ON SCHEMA ${schema} TO ${role}`);
            await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON signing_approval_requests TO ${role}`);
            await db.query(`SET ROLE ${role}`);
            const effective = (await db.query(`SELECT current_user AS effective_role,r.rolsuper,r.rolbypassrls,
                c.relrowsecurity,pg_has_role(current_user,c.relowner,'MEMBER') AS owns_table
                FROM pg_roles r CROSS JOIN pg_class c
                WHERE r.rolname=current_user AND c.oid='signing_approval_requests'::regclass`)).rows[0];
            assert.equal(effective.effective_role, role);
            assert.equal(effective.rolsuper, false);
            assert.equal(effective.rolbypassrls, false);
            assert.equal(effective.owns_table, false);
            assert.equal(effective.relrowsecurity, false);

            const inserted = (await db.query(`INSERT INTO signing_approval_requests(owner_context_id,revision_id,preparer_userid,reviewer_userid)
                VALUES($1,$2,101,102) RETURNING state,version`, [contextId, revisionId])).rows[0];
            assert.deepEqual(inserted, { state: 'preparing', version: 1 });
            assert.equal((await db.query('SELECT count(*)::int AS n FROM signing_approval_requests WHERE owner_context_id=$1 AND revision_id=$2',
                [contextId, revisionId])).rows[0].n, 1);
            const updated = (await db.query(`UPDATE signing_approval_requests SET state='approved',version=version+1,
                reason='Synthetic non-owner approval',decided_at=clock_timestamp()
                WHERE owner_context_id=$1 AND revision_id=$2 RETURNING state,version,decided_at`, [contextId, revisionId])).rows[0];
            assert.equal(updated.state, 'approved');
            assert.equal(updated.version, 2);
            assert.ok(updated.decided_at instanceof Date);

            // Database identity/owner-context constraints still apply to this
            // non-owner role. Existing API permission/fence proof is reused.
            await assert.rejects(db.query(`UPDATE signing_approval_requests SET reviewer_userid=103
                WHERE owner_context_id=$1 AND revision_id=$2`, [contextId, revisionId]), { code: '23514' });
            await assert.rejects(db.query(`INSERT INTO signing_approval_requests(owner_context_id,revision_id,preparer_userid,reviewer_userid)
                VALUES($1,$2,101,102)`, [contextId, revisionId]), { code: '23505' });
            await assert.rejects(db.query(`INSERT INTO signing_approval_requests(owner_context_id,revision_id,preparer_userid,reviewer_userid)
                VALUES($1,$2,101,102)`, [contextId, otherRevision]), { code: '23503' });
            assert.equal((await db.query('DELETE FROM signing_approval_requests WHERE owner_context_id=$1 AND revision_id=$2 RETURNING revision_id',
                [contextId, revisionId])).rowCount, 1);
            assert.equal((await db.query('SELECT count(*)::int AS n FROM signing_approval_requests WHERE owner_context_id=$1', [contextId])).rows[0].n, 0);
            t.diagnostic(JSON.stringify({ migrationSha256: createHash('sha256').update(migration).digest('hex'),
                actualNonOwner: true, superuser: false, bypassRls: false, crud: ['insert', 'select', 'update', 'delete'],
                identityImmutable: true, compositeOwnerContextKey: true, privateSchemaOnly: true }));
        } finally {
            await db.query('ROLLBACK').catch(() => {});
            await db.query('RESET ROLE');
            await db.query('SET search_path TO public');
            if (schemaCreated) await db.query(`DROP SCHEMA ${schema} CASCADE`);
            if (roleCreated) await db.query(`DROP ROLE ${role}`);
            db.release();
            await pool.end();
        }
    });
