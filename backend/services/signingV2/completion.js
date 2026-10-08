const { randomUUID } = require('node:crypto');
const { digest, bytesHash } = require('../../lib/signingV2/canonical');
const { expect, fail } = require('../../lib/signingV2/errors');
const { rendererAssets, FONT_STACK } = require('../../lib/signingV2/dataRenderer');
const { stampDocument } = require('../../lib/signingV2/stamp');
const { complete, enqueue, job, heartbeat } = require('./jobs');
const { lockRevision } = require('./workflow');
const { personalEvidence, personalEvidenceInput, evidenceJobInput } = require('../../lib/signingV2/personalEvidence');

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const TEXT = {
    he: { title: 'אישור ראיות חתימה', run: 'ריצה', reference: 'מזהה חבילה', office: 'נשלח על ידי', completed: 'הושלם',
        revision: 'גרסת חבילה (SHA-256)', documents: 'מסמכים', document: 'מסמך', pages: 'עמודים', prepared: 'לפני חתימה (SHA-256)',
        final: 'סופי (SHA-256)', signers: 'חתימות', signer: 'חותם', role: 'תפקיד', capacity: 'כשירות', acceptedAt: 'נחתם',
        verification: 'אימות', session: 'סבב חתימה', manifest: 'רשימת החתימה (SHA-256)', payload: 'תוכן הפעולה (SHA-256)',
        device: 'כתובת IP ודפדפן', consent: 'נוסח הסכמה', otp: { sms: 'קוד חד־פעמי ב־SMS', email: 'קוד חד־פעמי באימייל' },
        capacities: { personal: 'אישית', representative: 'בשם גוף', professional: 'מקצועית' }, represents: 'בשם',
        note: 'האישור הופק אוטומטית ממערכת החתימה. כל חותם אימת את עצמו בקוד חד־פעמי שנשלח אליו, לאחר שעיין ברשימת המסמכים המדויקת שאישר.' },
    ar: { title: 'شهادة إثبات التوقيع', run: 'الدفعة', reference: 'معرّف الحزمة', office: 'أُرسلت من', completed: 'اكتملت',
        revision: 'إصدار الحزمة (SHA-256)', documents: 'المستندات', document: 'المستند', pages: 'الصفحات', prepared: 'قبل التوقيع (SHA-256)',
        final: 'النهائي (SHA-256)', signers: 'التوقيعات', signer: 'الموقّع', role: 'الدور', capacity: 'الصفة', acceptedAt: 'وُقّع',
        verification: 'التحقق', session: 'جلسة التوقيع', manifest: 'قائمة التوقيع (SHA-256)', payload: 'محتوى الإجراء (SHA-256)',
        device: 'عنوان IP والمتصفح', consent: 'نص الموافقة', otp: { sms: 'رمز لمرة واحدة عبر SMS', email: 'رمز لمرة واحدة عبر البريد الإلكتروني' },
        capacities: { personal: 'شخصية', representative: 'نيابة عن جهة', professional: 'مهنية' }, represents: 'نيابة عن',
        note: 'أُصدرت هذه الشهادة تلقائيًا من نظام التوقيع. تحقّق كل موقّع من هويته برمز لمرة واحدة أُرسل إليه، بعد أن اطّلع على قائمة المستندات الدقيقة التي وافق عليها.' },
    en: { title: 'Signature evidence certificate', run: 'Run', reference: 'Package reference', office: 'Sent by', completed: 'Completed',
        revision: 'Package revision (SHA-256)', documents: 'Documents', document: 'Document', pages: 'Pages', prepared: 'Before signing (SHA-256)',
        final: 'Final (SHA-256)', signers: 'Signatures', signer: 'Signer', role: 'Role', capacity: 'Capacity', acceptedAt: 'Signed',
        verification: 'Verification', session: 'Signing session', manifest: 'Signing list (SHA-256)', payload: 'Action content (SHA-256)',
        device: 'IP address and browser', consent: 'Consent wording', otp: { sms: 'One-time code by SMS', email: 'One-time code by email' },
        capacities: { personal: 'Personal', representative: 'On behalf of an entity', professional: 'Professional' }, represents: 'on behalf of',
        note: 'This certificate was produced automatically by the signing system. Each signer verified with a one-time code sent to them, after reviewing the exact list of documents they approved.' },
};

function timestamp(value, locale) {
    const date = new Date(value);
    const local = new Intl.DateTimeFormat(locale === 'en' ? 'en-GB' : `${locale}-IL`, { timeZone: 'Asia/Jerusalem', dateStyle: 'medium', timeStyle: 'medium' }).format(date);
    return `${local} (Asia/Jerusalem) · ${date.toISOString()}`;
}

function evidenceHtml(data) {
    const locale = TEXT[data.locale] ? data.locale : 'he';
    const t = { ...TEXT[locale] }, dir = locale === 'en' ? 'ltr' : 'rtl';
    if (data.personal) {
        t.title = { he: 'אישור החתימה שלך', ar: 'إيصال توقيعك', en: 'Your signing receipt' }[locale];
        t.note = { he: 'אישור אישי של החתימות שביצעת והמסמכים שבהם השתתפת. פרטי האימות של חותמים אחרים אינם כלולים באישור זה.',
            ar: 'إيصال شخصي للتوقيعات التي أجريتها والمستندات التي شاركت فيها. لا يتضمن بيانات التحقق الخاصة بالموقّعين الآخرين.',
            en: 'A personal receipt for your signatures and the documents you participated in. It does not include other signers’ verification details.' }[locale];
    }
    const hash = value => `<bdi class="hash" dir="ltr">${escapeHtml(value)}</bdi>`;
    const row = (label, value) => `<tr><th scope="row">${escapeHtml(label)}</th><td>${value}</td></tr>`;
    const fonts = rendererAssets().fonts.map(font => `@font-face{font-family:${font.family};src:url('${font.uri}') format('truetype')}`).join('\n');
    const documents = data.documents.map(doc => `<tr><td><bdi>${escapeHtml(doc.name)}</bdi></td><td>${doc.pages}</td><td>${hash(doc.preparedHash)}</td><td>${hash(doc.finalHash)}</td></tr>`).join('');
    const actions = data.actions.map(action => `<section class="action"><h3><bdi>${escapeHtml(action.name)}</bdi> · <bdi>${escapeHtml(action.document)}</bdi></h3><table>
        ${row(t.role, `<bdi>${escapeHtml(action.role)}</bdi>`)}
        ${row(t.capacity, escapeHtml(t.capacities[action.capacity] || action.capacity) + (action.partyName && action.capacity === 'representative' ? ` · ${escapeHtml(t.represents)} <bdi>${escapeHtml(action.partyName)}</bdi>` : ''))}
        ${row(t.acceptedAt, escapeHtml(timestamp(action.acceptedAt, locale)))}
        ${row(t.verification, `${escapeHtml(t.otp[action.channel] || action.channel)} · <bdi dir="ltr">${escapeHtml(action.hint)}</bdi> · ${escapeHtml(timestamp(action.verifiedAt, locale))}`)}
        ${row(t.session, hash(action.sessionId))}
        ${row(t.manifest, hash(action.manifestHash))}
        ${row(t.payload, hash(action.payloadHash))}
        ${row(t.device, `<bdi dir="ltr">${escapeHtml([action.ip, action.userAgent].filter(Boolean).join(' · ') || '—')}</bdi>`)}
        ${row(t.consent, `<bdi dir="ltr">${escapeHtml(action.consentVersion)}</bdi>`)}
    </table></section>`).join('');
    return `<!doctype html><html lang="${locale}" dir="${dir}"><head><meta charset="utf-8"><title>${escapeHtml(t.title)}</title><style>
        ${fonts}
        @page{size:A4;margin:16mm 14mm}
        *{box-sizing:border-box}
        body{font-family:${FONT_STACK};font-size:10pt;color:#1a202c;line-height:1.5;margin:0}
        h1{font-size:17pt;margin:0 0 4mm}h2{font-size:12pt;margin:7mm 0 2mm}h3{font-size:10.5pt;margin:0 0 1.5mm}
        table{inline-size:100%;border-collapse:collapse}th,td{text-align:start;vertical-align:top;padding:1.2mm 1.6mm;border-block-end:0.3mm solid #e2e8f0}
        th{font-weight:400;color:#4a5568;inline-size:34%}thead th{inline-size:auto;color:#2d3748;border-block-end:0.4mm solid #a0aec0}
        .hash{font-size:8pt;word-break:break-all;unicode-bidi:isolate}
        .action{break-inside:avoid;margin-block-end:4mm;padding:2.5mm 3mm;border:0.3mm solid #e2e8f0;border-radius:1.5mm}
        .note{margin-block-start:6mm;color:#4a5568;font-size:9pt}
    </style></head><body>
        <h1>${escapeHtml(t.title)}</h1>
        <table>
            ${row(t.run, `<bdi>${escapeHtml(data.runName || '—')}</bdi>`)}
            ${row(t.reference, `<bdi>${escapeHtml(data.reference)}</bdi>`)}
            ${row(t.office, `<bdi>${escapeHtml(data.ownerName)}</bdi>`)}
            ${row(t.completed, escapeHtml(timestamp(data.completedAt, locale)))}
            ${row(t.revision, hash(data.revisionHash))}
        </table>
        <h2>${escapeHtml(t.documents)}</h2>
        <table><thead><tr><th>${escapeHtml(t.document)}</th><th>${escapeHtml(t.pages)}</th><th>${escapeHtml(t.prepared)}</th><th>${escapeHtml(t.final)}</th></tr></thead><tbody>${documents}</tbody></table>
        <h2>${escapeHtml(t.signers)}</h2>
        ${actions}
        <p class="note">${escapeHtml(t.note)}</p>
    </body></html>`;
}

function createCompletionService({ pool, renderer, storage }) {
    expect(typeof renderer?.render === 'function' && typeof renderer?.renderHtml === 'function' && storage, 'WORKFLOW_ADAPTER_REQUIRED');
    const rendererHash = rendererAssets().hash;

    async function readArtifact(row) {
        const bytes = await storage.read(row.object_key, Number(row.bytes));
        expect(bytesHash(bytes) === row.content_sha256, 'ARTIFACT_HASH_MISMATCH');
        return bytes;
    }

    // The signed version of a document is always the prepared PDF plus every accepted action on it.
    // Rebuilding from the same immutable inputs keeps each stage and the final file reproducible.
    async function compose(contextId, documentId, kind) {
        const document = (await pool.query(`SELECT d.*,r.snapshot->>'locale' AS locale,pa.object_key,pa.bytes,pa.content_sha256
            FROM signing_documents d
            JOIN signing_package_revisions r ON r.owner_context_id=d.owner_context_id AND r.id=d.revision_id
            JOIN signing_artifacts pa ON pa.owner_context_id=d.owner_context_id AND pa.id=d.prepared_artifact_id AND pa.state='ready'
            WHERE d.owner_context_id=$1 AND d.id=$2`, [contextId, documentId])).rows[0];
        if (!document) fail('ARTIFACT_NOT_READY', 409);
        const actions = (await pool.query(`SELECT a.id,a.values_snapshot,a.signature_artifact_id,sa.object_key,sa.bytes,sa.content_sha256
            FROM signing_actions a JOIN signing_tasks t ON t.owner_context_id=a.owner_context_id AND t.id=a.task_id
            LEFT JOIN signing_artifacts sa ON sa.owner_context_id=a.owner_context_id AND sa.id=a.signature_artifact_id AND sa.state='ready'
            WHERE a.owner_context_id=$1 AND t.document_id=$2 ORDER BY a.accepted_at,a.id`, [contextId, documentId])).rows;
        const images = new Map();
        for (const action of actions) {
            if (action.signature_artifact_id && !images.has(action.signature_artifact_id)) {
                expect(action.object_key, 'ARTIFACT_NOT_READY');
                images.set(action.signature_artifact_id, await readArtifact(action));
            }
        }
        const marks = actions.flatMap(action => action.values_snapshot.fields
            .filter(field => field.value !== null && field.value !== undefined && field.value !== '' && field.value !== false)
            .map(field => ({ fieldId: field.id, type: field.type, value: field.value })));
        const inputsHash = digest({ documentId, preparedHash: document.content_sha256, actions: actions.map(action => action.id), rendererHash, kind });
        const existing = (await pool.query(`SELECT id FROM signing_artifacts WHERE owner_context_id=$1 AND kind=$2 AND inputs_hash=$3 AND state='ready'`,
            [contextId, kind, inputsHash])).rows[0];
        if (existing) return { document, inputsHash, artifactId: existing.id, reused: true };
        const result = await stampDocument({ renderer, baseBytes: await readArtifact(document), baseHash: document.content_sha256,
            bindings: document.field_bindings, marks, images, locale: document.locale });
        const artifactId = randomUUID();
        const key = `signing-v2/${contextId}/${kind}/${artifactId}.pdf`;
        await storage.write(key, result.bytes, { contentType: 'application/pdf', sha256: result.contentHash });
        await storage.verify(key, result.bytes.length, result.contentHash);
        return { document, inputsHash, artifactId, key, bytes: result.bytes.length, contentHash: result.contentHash };
    }

    async function persist(db, contextId, kind, composed, metadata) {
        if (!composed.reused) {
            await db.query(`INSERT INTO signing_artifacts(id,owner_context_id,kind,inputs_hash,content_sha256,object_key,bytes,state,metadata,ready_at)
                VALUES($1,$2,$3,$4,$5,$6,$7,'ready',$8,clock_timestamp()) ON CONFLICT(owner_context_id,kind,inputs_hash) DO NOTHING`,
            [composed.artifactId, contextId, kind, composed.inputsHash, composed.contentHash, composed.key, composed.bytes, metadata]);
        }
        return (await db.query(`SELECT id FROM signing_artifacts WHERE owner_context_id=$1 AND kind=$2 AND inputs_hash=$3 AND state='ready'`,
            [contextId, kind, composed.inputsHash])).rows[0].id;
    }

    async function openStage(contextId, revisionId) {
        return (await pool.query(`SELECT count(*) FILTER (WHERE required AND state='ready')::integer AS ready,
                min(stage) FILTER (WHERE state='blocked') AS next FROM signing_tasks WHERE owner_context_id=$1 AND revision_id=$2`,
        [contextId, revisionId])).rows[0];
    }

    async function renderStage(lease) {
        expect(lease.kind === 'render_stage', 'INVALID_JOB');
        const contextId = lease.owner_context_id;
        const revision = (await pool.query(`SELECT r.* FROM signing_package_revisions r WHERE r.owner_context_id=$1 AND r.id=$2`, [contextId, lease.subject_id])).rows[0];
        if (!revision) fail('NOT_FOUND', 404);
        const open = await openStage(contextId, revision.id);
        // A replayed or superseded job finds its stage already open and leaves it alone.
        if (open.ready || open.next === null || lease.input_hash !== digest({ revisionHash: revision.revision_hash, next: open.next })) {
            return complete(pool, lease, async () => ({ skipped: true }));
        }
        const documentIds = (await pool.query(`SELECT DISTINCT document_id FROM signing_tasks WHERE owner_context_id=$1 AND revision_id=$2
            AND stage=$3 AND state='blocked' ORDER BY document_id`, [contextId, revision.id, open.next])).rows.map(row => row.document_id);
        const composed = [];
        for (const documentId of documentIds) composed.push(await compose(contextId, documentId, 'stage'));
        return complete(pool, lease, async db => {
            const live = await lockRevision(db, contextId, revision.id);
            expect(['active', 'attention'].includes(live.workflow_state), 'REVISION_INACTIVE');
            const pairs = [];
            for (const item of composed) pairs.push({ document_id: item.document.id, artifact_id: await persist(db, contextId, 'stage', item, { stage: open.next }) });
            const updated = await db.query(`UPDATE signing_tasks t SET state='ready',stage_artifact_id=x.artifact_id,version=t.version+1
                FROM jsonb_to_recordset($4::jsonb) AS x(document_id uuid,artifact_id uuid)
                WHERE t.owner_context_id=$1 AND t.revision_id=$2 AND t.stage=$3 AND t.state='blocked' AND t.document_id=x.document_id
                RETURNING t.participation_id`, [contextId, revision.id, open.next, JSON.stringify(pairs)]);
            const deliveries = (await db.query(`SELECT d.id FROM signing_deliveries d
                JOIN signing_delivery_profiles dp ON dp.owner_context_id=d.owner_context_id AND dp.id=d.profile_id
                JOIN signing_participations p ON p.owner_context_id=dp.owner_context_id AND p.revision_id=dp.revision_id AND p.person_id=dp.person_id
                WHERE d.owner_context_id=$1 AND dp.revision_id=$2 AND d.state='pending' AND d.purpose='invitation' AND p.id=ANY($3::uuid[])`,
            [contextId, revision.id, updated.rows.map(row => row.participation_id)])).rows;
            await enqueue(db, contextId, deliveries.map(row => job('dispatch_delivery', row.id, digest({ revisionHash: revision.revision_hash, stage: open.next }))));
            await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details) VALUES($1,$2,'system:workflow','stage_activated',$3)`,
                [contextId, revision.package_id, { revisionId: revision.id, stage: open.next, tasks: updated.rowCount }]);
            return { stage: open.next, tasks: updated.rowCount, invitations: deliveries.length };
        });
    }

    async function finalizeDocument(lease) {
        expect(lease.kind === 'finalize_document', 'INVALID_JOB');
        const contextId = lease.owner_context_id;
        const document = (await pool.query(`SELECT d.id,d.document_key,d.final_artifact_id,d.revision_id,r.revision_hash,
                (SELECT count(*) FROM signing_tasks t WHERE t.owner_context_id=d.owner_context_id AND t.document_id=d.id
                    AND t.required AND t.state<>'accepted')::integer AS open_required
            FROM signing_documents d JOIN signing_package_revisions r ON r.owner_context_id=d.owner_context_id AND r.id=d.revision_id
            WHERE d.owner_context_id=$1 AND d.id=$2`, [contextId, lease.subject_id])).rows[0];
        if (!document) fail('NOT_FOUND', 404);
        expect(lease.input_hash === digest({ revisionHash: document.revision_hash, document: document.document_key, kind: 'final' }), 'REVISION_CHANGED');
        if (document.final_artifact_id) return complete(pool, lease, async () => ({ artifactId: document.final_artifact_id, reused: true }));
        expect(document.open_required === 0, 'SIGNATURES_INCOMPLETE');
        const composed = await compose(contextId, document.id, 'final');
        return complete(pool, lease, async db => {
            const live = await lockRevision(db, contextId, document.revision_id);
            expect(['active', 'attention'].includes(live.workflow_state), 'REVISION_INACTIVE');
            const artifactId = await persist(db, contextId, 'final', composed, { documentKey: document.document_key });
            const updated = await db.query(`UPDATE signing_documents SET final_artifact_id=$3,state='final'
                WHERE owner_context_id=$1 AND id=$2 AND (final_artifact_id IS NULL OR final_artifact_id=$3)`, [contextId, document.id, artifactId]);
            expect(updated.rowCount === 1, 'ARTIFACT_CHANGED');
            await db.query(`UPDATE signing_tasks SET state='cancelled',version=version+1 WHERE owner_context_id=$1 AND document_id=$2
                AND state IN ('ready','blocked') AND NOT required`, [contextId, document.id]);
            return { artifactId };
        });
    }

    async function evidenceData(contextId, revisionId) {
        const revision = (await pool.query(`SELECT r.*,pk.external_key,pk.submission_id,s.name AS run_name,owner.name AS owner_name,v.definition
            FROM signing_package_revisions r
            JOIN signing_packages pk ON pk.owner_context_id=r.owner_context_id AND pk.id=r.package_id
            LEFT JOIN signing_submissions s ON s.owner_context_id=pk.owner_context_id AND s.id=pk.submission_id
            LEFT JOIN signing_template_versions v ON v.owner_context_id=s.owner_context_id AND v.id=s.template_version_id
            JOIN users owner ON owner.userid=pk.owner_userid
            WHERE r.owner_context_id=$1 AND r.id=$2`, [contextId, revisionId])).rows[0];
        if (!revision) fail('NOT_FOUND', 404);
        const documents = (await pool.query(`SELECT d.id,d.name,d.document_key,d.state,pa.content_sha256 AS prepared_hash,pa.metadata->'pages' AS pages,fa.content_sha256 AS final_hash
            FROM signing_documents d
            JOIN signing_artifacts pa ON pa.owner_context_id=d.owner_context_id AND pa.id=d.prepared_artifact_id
            LEFT JOIN signing_artifacts fa ON fa.owner_context_id=d.owner_context_id AND fa.id=d.final_artifact_id
            WHERE d.owner_context_id=$1 AND d.revision_id=$2 ORDER BY d.document_key`, [contextId, revisionId])).rows;
        expect(documents.length > 0 && documents.every(doc => doc.state === 'final' && doc.final_hash), 'SIGNATURES_INCOMPLETE');
        const actions = (await pool.query(`SELECT a.accepted_at,a.manifest_hash,a.payload_hash,a.consent_snapshot,a.session_id,
                p.person_id,p.identity_snapshot,p.role_key,p.capacity,d.id AS document_id,d.name AS document_name,c.channel,c.endpoint_hint,c.verified_at
            FROM signing_actions a
            JOIN signing_tasks t ON t.owner_context_id=a.owner_context_id AND t.id=a.task_id
            JOIN signing_documents d ON d.owner_context_id=t.owner_context_id AND d.id=t.document_id
            JOIN signing_participations p ON p.owner_context_id=a.owner_context_id AND p.id=a.participation_id
            JOIN signing_sessions_v2 s ON s.owner_context_id=a.owner_context_id AND s.id=a.session_id
            JOIN signing_otp_challenges_v2 c ON c.owner_context_id=s.owner_context_id AND c.id=s.verified_challenge_id
            WHERE a.owner_context_id=$1 AND t.revision_id=$2 ORDER BY a.accepted_at,d.document_key,p.role_key,p.occurrence`, [contextId, revisionId])).rows;
        const labels = new Map((revision.definition?.roles || []).map(role => [role.key, role.label]));
        return { revision, data: { locale: revision.snapshot.locale, runName: revision.run_name, reference: revision.external_key, ownerName: revision.owner_name,
            completedAt: actions.length ? actions[actions.length - 1].accepted_at : new Date(), revisionHash: revision.revision_hash,
            documents: documents.map(doc => ({ id: doc.id, name: doc.name, pages: (doc.pages || []).length, preparedHash: doc.prepared_hash, finalHash: doc.final_hash })),
            actions: actions.map(action => ({ personId: action.person_id, documentId: action.document_id,
                name: action.identity_snapshot.name, partyName: action.identity_snapshot.partyName, document: action.document_name,
                role: labels.get(action.role_key) || action.role_key, capacity: action.capacity, acceptedAt: action.accepted_at,
                channel: action.channel, hint: action.endpoint_hint, verifiedAt: action.verified_at, sessionId: action.session_id,
                manifestHash: action.manifest_hash, payloadHash: action.payload_hash, ip: action.consent_snapshot.ip,
                userAgent: action.consent_snapshot.userAgent, consentVersion: action.consent_snapshot.version })) } };
    }

    async function renderEvidence(lease) {
        expect(lease.kind === 'render_evidence', 'INVALID_JOB');
        const contextId = lease.owner_context_id;
        const { revision, data } = await evidenceData(contextId, lease.subject_id);
        const inputsHash = digest({ revisionId: revision.id, revisionHash: revision.revision_hash, kind: 'evidence' });
        expect([evidenceJobInput(revision.revision_hash), digest({ revisionHash: revision.revision_hash, kind: 'evidence' })].includes(lease.input_hash), 'REVISION_CHANGED');
        const variants = [{ inputsHash, data, metadata: { revisionId: revision.id, actions: data.actions.length, visibility: 'office' } }];
        for (const personId of new Set(data.actions.map(action => action.personId))) {
            const receipt = personalEvidence(data, personId);
            variants.push({ inputsHash: personalEvidenceInput(revision.id, revision.revision_hash, personId), data: receipt,
                metadata: { revisionId: revision.id, visibility: 'personal', personId, documentIds: receipt.documents.map(doc => doc.id) } });
        }
        const existing = new Map((await pool.query(`SELECT id,inputs_hash FROM signing_artifacts
            WHERE owner_context_id=$1 AND kind='evidence' AND inputs_hash=ANY($2::text[]) AND state='ready'`,
        [contextId, variants.map(item => item.inputsHash)])).rows.map(row => [row.inputs_hash, row.id]));
        // At most eight people per package. Keep only one receipt in memory per
        // job; the existing renderer pool bounds parallel work across packages.
        for (const variant of variants) {
            variant.existing = existing.get(variant.inputsHash);
            if (variant.existing) continue;
            if (!await heartbeat(pool, lease)) fail('WORKER_LEASE_LOST', 409);
            const rendered = await renderer.renderHtml({ html: evidenceHtml(variant.data) });
            expect(bytesHash(rendered.bytes) === rendered.contentHash, 'ARTIFACT_HASH_MISMATCH');
            const artifactId = randomUUID();
            const key = `signing-v2/${contextId}/evidence/${artifactId}.pdf`;
            await storage.write(key, rendered.bytes, { contentType: 'application/pdf', sha256: rendered.contentHash });
            await storage.verify(key, rendered.bytes.length, rendered.contentHash);
            variant.written = { artifactId, inputsHash: variant.inputsHash, key, bytes: rendered.bytes.length, contentHash: rendered.contentHash };
        }
        return complete(pool, lease, async db => {
            const live = await lockRevision(db, contextId, revision.id);
            expect(['active', 'attention', 'complete'].includes(live.workflow_state), 'REVISION_INACTIVE');
            for (const variant of variants) variant.artifactId = variant.existing
                || await persist(db, contextId, 'evidence', variant.written, variant.metadata);
            const artifactId = variants[0].artifactId;
            const completed = await db.query(`UPDATE signing_package_revisions SET workflow_state='complete',version=version+1
                WHERE owner_context_id=$1 AND id=$2 AND workflow_state IN ('active','attention') RETURNING id`, [contextId, revision.id]);
            if (completed.rowCount) await db.query(`INSERT INTO signing_events_v2(owner_context_id,package_id,actor_key,kind,details) VALUES($1,$2,'system:workflow','package_completed',$3)`,
                [contextId, revision.package_id, { revisionId: revision.id, evidenceArtifactId: artifactId }]);
            if (revision.submission_id) {
                await db.query(`UPDATE signing_submissions s SET state='complete' WHERE s.owner_context_id=$1 AND s.id=$2 AND s.state<>'complete'
                    AND NOT EXISTS (SELECT 1 FROM signing_packages pk JOIN signing_package_revisions r ON r.owner_context_id=pk.owner_context_id AND r.id=pk.active_revision_id
                        WHERE pk.owner_context_id=s.owner_context_id AND pk.submission_id=s.id AND r.workflow_state NOT IN ('complete','cancelled'))`,
                [contextId, revision.submission_id]);
            }
            return { artifactId };
        });
    }

    return { renderStage, finalizeDocument, renderEvidence, compose };
}

module.exports = { createCompletionService, evidenceHtml };
