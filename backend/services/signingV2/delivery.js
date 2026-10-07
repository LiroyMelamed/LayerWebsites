const { expect, fail } = require('../../lib/signingV2/errors');
const { complete } = require('./jobs');
const { transaction } = require('./transaction');

const SENDABLE_PURPOSES = new Set(['invitation', 'reminder', 'resend']);

// Provider contract: send({ deliveryId, channel, endpoint, locale, purpose, url })
// resolves { providerId } once the provider acknowledged the request. A known
// rejection throws an error with `definitive: true` and a code. Anything else,
// including a timeout after the request left, is an uncertain outcome.
function createDeliveryService({ pool, grantService, provider, linkFor }) {
    expect(typeof provider?.send === 'function' && typeof linkFor === 'function'
        && typeof grantService?.tokenForDelivery === 'function', 'DELIVERY_ADAPTER_REQUIRED');

    async function settle(lease, deliveryId, state, values = {}) {
        return complete(pool, lease, async db => {
            await db.query(`UPDATE signing_deliveries SET state=$3,error_code=$4,provider_id=COALESCE($5,provider_id),
                provider_accepted_at=CASE WHEN $3='provider_accepted' THEN clock_timestamp() ELSE provider_accepted_at END
                WHERE owner_context_id=$1 AND id=$2`,
            [lease.owner_context_id, deliveryId, state, values.code || null, values.providerId || null]);
            await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details)
                VALUES($1,$2,'system:delivery',$3,$4)`, [lease.owner_context_id, values.packageId || null,
                state === 'provider_accepted' ? 'delivery_result' : `delivery_${state}`,
                { deliveryId, state, code: values.code || null, purpose: values.purpose || null }]);
            return { deliveryId, state, code: values.code || null };
        });
    }

    // Phase one runs under the job fence and moves the row to `dispatching` before
    // any network I/O. A crash after this point can never cause a blind resend.
    async function plan(lease) {
        return transaction(pool, async db => {
            const fenced = await db.query(`SELECT id FROM signing_jobs WHERE owner_context_id=$1 AND id=$2 AND state='running'
                AND fencing_token=$3 AND leased_by=$4 AND lease_until > clock_timestamp() FOR UPDATE`,
            [lease.owner_context_id, lease.id, lease.fencing_token, lease.leased_by]);
            if (!fenced.rowCount) fail('WORKER_LEASE_LOST', 409);
            // Right after a bulk insert the statistics still describe the office as empty, and a plain join then
            // walks every revision and profile of the run per delivery. The materialized row pins the plan to this delivery.
            const found = await db.query(`WITH d AS MATERIALIZED (
                    SELECT * FROM signing_deliveries WHERE owner_context_id=$1 AND id=$2 FOR UPDATE
                )
                SELECT d.*,dp.person_id,dp.revision_id,dp.version AS current_profile_version,
                    dp.endpoints_snapshot,r.workflow_state,r.package_id,pk.active_revision_id,
                    g.id AS live_grant_id,g.encrypted_token,g.token_hash,g.purpose AS grant_purpose,g.person_id AS grant_person_id,
                    g.owner_context_id AS grant_context_id,
                    COALESCE(tc.ready,0) AS ready_tasks,COALESCE(tc.open_required,0) AS open_required
                FROM d
                JOIN signing_delivery_profiles dp ON dp.owner_context_id=d.owner_context_id AND dp.id=d.profile_id
                JOIN signing_package_revisions r ON r.owner_context_id=dp.owner_context_id AND r.id=dp.revision_id
                JOIN signing_packages pk ON pk.owner_context_id=r.owner_context_id AND pk.id=r.package_id
                LEFT JOIN signing_public_grants g ON g.owner_context_id=d.owner_context_id AND g.id=d.grant_id
                    AND g.revoked_at IS NULL AND g.expires_at > clock_timestamp()
                LEFT JOIN LATERAL (
                    SELECT count(*) FILTER (WHERE t.state='ready') AS ready,
                        count(*) FILTER (WHERE t.required AND t.state NOT IN ('accepted','cancelled')) AS open_required
                    FROM signing_tasks t JOIN signing_participations p ON p.owner_context_id=t.owner_context_id AND p.id=t.participation_id
                    WHERE t.owner_context_id=dp.owner_context_id AND t.revision_id=dp.revision_id AND p.person_id=dp.person_id
                ) tc ON TRUE`, [lease.owner_context_id, lease.subject_id]);
            if (!found.rowCount) fail('NOT_FOUND', 404);
            const delivery = found.rows[0];
            const skip = (state, code) => ({ skip: { state, code }, delivery });
            if (delivery.state !== 'pending') return { done: true, delivery };
            if (!SENDABLE_PURPOSES.has(delivery.purpose)) return skip('cancelled', 'PURPOSE_NOT_SUPPORTED');
            if (delivery.active_revision_id !== delivery.revision_id || !['active', 'attention'].includes(delivery.workflow_state)) {
                return skip('cancelled', 'REVISION_INACTIVE');
            }
            if (delivery.profile_version !== delivery.current_profile_version) return skip('cancelled', 'CONTACT_CHANGED');
            if (Number(delivery.ready_tasks) === 0) {
                // Someone who completed while the job waited gets no signing request.
                if (Number(delivery.open_required) === 0) return skip('skipped_completed', 'ALREADY_COMPLETED');
                return { deferred: 'BLOCKED_ON_STAGE', delivery };
            }
            if (!delivery.live_grant_id) return skip('failed', 'LINK_UNAVAILABLE');
            const endpoint = delivery.channel === 'email' ? delivery.endpoints_snapshot.email
                : delivery.channel === 'sms' ? delivery.endpoints_snapshot.phone : null;
            if (!endpoint || endpoint !== delivery.target_snapshot.endpoint) return skip('cancelled', 'CONTACT_CHANGED');
            if (delivery.purpose === 'invitation') {
                // Packages of one run share the grant of a shared signer. The grant row serializes
                // their dispatches so exactly one invitation per channel leaves for that link.
                const shared = await db.query(`SELECT submission_id FROM signing_public_grants WHERE owner_context_id=$1 AND id=$2 FOR UPDATE`,
                    [lease.owner_context_id, delivery.live_grant_id]);
                if (shared.rows[0]?.submission_id) {
                    const sent = await db.query(`SELECT 1 FROM signing_deliveries WHERE owner_context_id=$1 AND grant_id=$2 AND channel=$3
                        AND purpose='invitation' AND id<>$4 AND state IN ('dispatching','provider_accepted','delivered','uncertain') LIMIT 1`,
                    [lease.owner_context_id, delivery.live_grant_id, delivery.channel, delivery.id]);
                    if (sent.rowCount) return skip('bundled', 'BUNDLED_INVITATION');
                }
            }
            await db.query(`UPDATE signing_deliveries SET state='dispatching',attempted_at=clock_timestamp()
                WHERE owner_context_id=$1 AND id=$2`, [lease.owner_context_id, delivery.id]);
            return { send: true, delivery, endpoint };
        });
    }

    return async function dispatchDelivery(lease) {
        expect(lease.kind === 'dispatch_delivery', 'INVALID_JOB');
        const planned = await plan(lease);
        const { delivery } = planned;
        const meta = { packageId: delivery.package_id, purpose: delivery.purpose };
        if (planned.done) return complete(pool, lease, async () => ({ deliveryId: delivery.id, state: delivery.state, reused: true }));
        if (planned.skip) return settle(lease, delivery.id, planned.skip.state, { ...meta, code: planned.skip.code });
        if (planned.deferred) {
            // A later stage activation enqueues its own dispatch for this intent.
            return complete(pool, lease, async db => {
                await db.query(`UPDATE signing_deliveries SET error_code='BLOCKED_ON_STAGE' WHERE owner_context_id=$1 AND id=$2 AND state='pending'`,
                    [lease.owner_context_id, delivery.id]);
                return { deliveryId: delivery.id, state: 'pending', code: 'BLOCKED_ON_STAGE' };
            });
        }
        const token = grantService.tokenForDelivery({ id: delivery.live_grant_id, owner_context_id: delivery.grant_context_id,
            person_id: delivery.grant_person_id, purpose: delivery.grant_purpose, encrypted_token: delivery.encrypted_token, token_hash: delivery.token_hash });
        let outcome;
        try {
            const ack = await provider.send({ deliveryId: delivery.id, channel: delivery.channel, endpoint: planned.endpoint,
                locale: delivery.target_snapshot.locale, purpose: delivery.purpose, url: linkFor(token) });
            outcome = { state: 'provider_accepted', providerId: ack?.providerId ? String(ack.providerId).slice(0, 200) : null };
        } catch (error) {
            outcome = error?.definitive
                ? { state: 'failed', code: /^[A-Z][A-Z0-9_]{1,79}$/.test(error.code || '') ? error.code : 'PROVIDER_REJECTED' }
                : { state: 'uncertain', code: 'PROVIDER_OUTCOME_UNKNOWN' };
        }
        return settle(lease, delivery.id, outcome.state, { ...meta, ...outcome });
    };
}

// A dispatch whose worker lost its lease may have reached the provider. The job is
// quarantined by recoverExpired(); this keeps the delivery row consistent with it.
async function markAbandonedDispatches(db) {
    return db.query(`UPDATE signing_deliveries d SET state='uncertain',error_code='PROVIDER_OUTCOME_UNKNOWN'
        FROM signing_jobs j WHERE j.owner_context_id=d.owner_context_id AND j.subject_id=d.id
        AND j.kind='dispatch_delivery' AND j.state='uncertain' AND d.state='dispatching' RETURNING d.id`);
}

module.exports = { createDeliveryService, markAbandonedDispatches };
