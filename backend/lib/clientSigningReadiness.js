const { isMultiTenantMode } = require('./tenant/tenantContext');
const { createAppError } = require('../utils/appError');

function clientTenantId(req) {
    const tenantId = req.firmTenantId || null;
    if ((req.tenant?.id && String(req.tenant.id) !== String(tenantId || '')) ||
        (isMultiTenantMode() && !tenantId)) {
        throw createAppError('FORBIDDEN', 403);
    }
    return tenantId;
}

function personalSigningProgress(row, readinessSupported, now = Date.now()) {
    const {
        PersonalNextIndex, NextUnsignedIndex, HasUnindexedRequiredSpots, SigningOrder,
        ...file
    } = row;
    const total = Number(file.PersonalTotalSpots) || 0;
    const signed = Number(file.PersonalSignedSpots) || 0;
    const complete = total > 0 && signed >= total;
    const status = String(file.Status || '').toLowerCase();
    const expiry = file.ExpiresAt == null ? null : new Date(file.ExpiresAt).getTime();
    const invalidExpiry = expiry !== null && !Number.isFinite(expiry);
    const expired = status === 'expired' || (status === 'pending' && file.ExpiresAt &&
        expiry <= now);
    let personalStatus = 'unavailable';
    // A client's completed signature is historical even if the overall document
    // is later rejected, cancelled or expires while waiting for another signer.
    if (readinessSupported && complete) personalStatus = 'signed';
    else if (status === 'rejected') personalStatus = 'rejected';
    else if (expired) personalStatus = 'expired';
    else if (readinessSupported && !invalidExpiry && status === 'pending' && total > signed) {
        if (SigningOrder === 'parallel') personalStatus = 'pending';
        else if (SigningOrder === 'sequential' && !HasUnindexedRequiredSpots &&
            PersonalNextIndex != null && NextUnsignedIndex != null) {
            personalStatus = Number(PersonalNextIndex) === Number(NextUnsignedIndex) ? 'pending' : 'waiting';
        }
    }
    return {
        ...file,
        PersonalTotalSpots: total,
        PersonalSignedSpots: signed,
        PersonalSignedAt: complete ? file.PersonalSignedAt : null,
        PersonalStatus: personalStatus,
        CanSignNow: personalStatus === 'pending',
    };
}

async function listClientSigningFiles(pool, req, pagination) {
    const tenantId = clientTenantId(req);
    // Discover readiness columns together. Older installations still return their
    // documents, but must never advertise a signing action that cannot be checked.
    const { rows: columns } = await pool.query(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND
         ((table_name = 'signaturespots' AND column_name IN ('signeruserid', 'fieldtype', 'signerindex'))
          OR (table_name = 'signingfiles' AND column_name = 'signingorder'))`,
    );
    const has = (table, column) => columns.some(c => c.table_name === table && c.column_name === column);
    const hasOwner = has('signaturespots', 'signeruserid');
    const hasType = has('signaturespots', 'fieldtype');
    const hasIndex = has('signaturespots', 'signerindex');
    const hasOrder = has('signingfiles', 'signingorder');
    const readinessSupported = hasOwner && hasType && hasIndex && hasOrder;
    const clientId = req.user.UserId;
    const required = `ss.isrequired = true${hasType ? " AND lower(coalesce(ss.fieldtype, 'signature')) <> 'lawyerstamp'" : ''}`;
    const owner = hasOwner ? '(ss.signeruserid = $1 OR (ss.signeruserid IS NULL AND sf.clientid = $1))' : 'sf.clientid = $1';
    // Keep the historical counters intact. New personal counters use exact ownership.
    const legacyOwner = hasOwner ? '(ss.signeruserid = $1 OR ss.signeruserid IS NULL)' : 'true';
    const personal = hasType ? `(${required}) AND ${owner}` : 'false';
    const visible = hasOwner
        ? '(sf.clientid = $1 OR EXISTS (SELECT 1 FROM signaturespots visible_spot WHERE visible_spot.signingfileid = sf.signingfileid AND visible_spot.signeruserid = $1))'
        : 'sf.clientid = $1';
    const params = [clientId, tenantId];
    const query = `SELECT
        sf.signingfileid AS "SigningFileId", sf.caseid AS "CaseId",
        sf.filename AS "FileName", sf.filekey AS "FileKey", sf.status AS "Status",
        sf.createdat AS "CreatedAt", sf.expiresat AS "ExpiresAt", sf.notes AS "Notes",
        sf.signedat AS "SignedAt", c.casename AS "CaseName", u.name AS "LawyerName",
        ${hasOrder ? 'sf.signingorder' : 'NULL::text'} AS "SigningOrder",
        progress.*
        FROM signingfiles sf
        ${hasOwner ? 'LEFT JOIN' : 'JOIN'} cases c ON c.caseid = sf.caseid
        JOIN users u ON u.userid = sf.lawyerid
        CROSS JOIN LATERAL (
            SELECT count(*) FILTER (WHERE (${required}) AND ${legacyOwner}) AS "TotalSpots",
                count(*) FILTER (WHERE (${required}) AND ${legacyOwner} AND ss.issigned = true) AS "SignedSpots",
                count(*) FILTER (WHERE ${personal}) AS "PersonalTotalSpots",
                count(*) FILTER (WHERE ${personal} AND ss.issigned = true) AS "PersonalSignedSpots",
                max(ss.signedat) FILTER (WHERE ${personal} AND ss.issigned = true) AS "PersonalSignedAt",
                ${hasIndex ? `min(ss.signerindex) FILTER (WHERE ${personal} AND ss.issigned = false)` : 'NULL::integer'} AS "PersonalNextIndex",
                ${hasIndex ? `min(ss.signerindex) FILTER (WHERE (${required}) AND ss.issigned = false)` : 'NULL::integer'} AS "NextUnsignedIndex",
                ${hasIndex ? `bool_or(ss.signerindex IS NULL) FILTER (WHERE (${required}) AND ss.issigned = false)` : 'true'} AS "HasUnindexedRequiredSpots"
            FROM signaturespots ss WHERE ss.signingfileid = sf.signingfileid
        ) progress
        WHERE sf.status <> 'draft' AND ${visible}
          AND (to_jsonb(u)->>'law_firm_tenant_id') IS NOT DISTINCT FROM $2::text
          AND (sf.caseid IS NULL OR (to_jsonb(c)->>'law_firm_tenant_id') IS NOT DISTINCT FROM $2::text)
        ORDER BY sf.createdat DESC, sf.signingfileid DESC` +
        (pagination.enabled ? ' LIMIT $3 OFFSET $4' : '');
    if (pagination.enabled) params.push(pagination.limit, pagination.offset);
    const { rows } = await pool.query(query, params);
    return rows.map(row => personalSigningProgress(row, readinessSupported));
}

module.exports = { clientTenantId, listClientSigningFiles, personalSigningProgress };
