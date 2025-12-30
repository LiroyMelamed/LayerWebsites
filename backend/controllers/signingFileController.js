// controllers/signingFileController.js
const pool = require("../config/db");
const { PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { r2, BUCKET } = require("../utils/r2");
const sendAndStoreNotification = require("../utils/sendAndStoreNotification");
const { detectHebrewSignatureSpotsFromPdfBuffer, streamToBuffer } = require("../utils/signatureDetection");
const { PDFDocument } = require("pdf-lib");
const { v4: uuid } = require("uuid");
const { requireInt, parsePositiveIntStrict } = require("../utils/paramValidation");
const { getPagination } = require("../utils/pagination");

const BASE_RENDER_WIDTH = 800;

async function getR2ObjectBuffer(key) {
    const obj = await r2.send(
        new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
        })
    );
    if (!obj.Body) throw new Error("R2 object has no body");
    const buffer = await streamToBuffer(obj.Body);
    return { buffer, contentType: obj.ContentType };
}

async function generateSignedPdfBuffer({ pdfKey, spots }) {
    const { buffer: pdfBuffer } = await getR2ObjectBuffer(pdfKey);

    const pdfDoc = await PDFDocument.load(pdfBuffer);
    const pages = pdfDoc.getPages();

    // Place each signature image on its page
    for (const spot of spots) {
        const pageNumber = Number(spot.PageNumber ?? spot.pagenumber ?? spot.pageNum ?? 1);
        const pageIndex = pageNumber - 1;
        const page = pages[pageIndex];
        if (!page) continue;

        const signatureKey = spot.SignatureData;
        if (!signatureKey) continue;

        const { buffer: imgBuffer, contentType } = await getR2ObjectBuffer(signatureKey);
        const isPng =
            (contentType || "").toLowerCase().includes("png") ||
            String(signatureKey).toLowerCase().endsWith(".png");

        const embedded = isPng
            ? await pdfDoc.embedPng(imgBuffer)
            : await pdfDoc.embedJpg(imgBuffer);

        const pageWidth = page.getWidth();
        const pageHeight = page.getHeight();

        // Spots are stored in BASE_RENDER_WIDTH pixel space (top-left origin)
        // Convert to PDF points (bottom-left origin)
        const scale = BASE_RENDER_WIDTH / pageWidth;
        const xPx = Number(spot.X ?? spot.x ?? 0);
        const yTopPx = Number(spot.Y ?? spot.y ?? 0);
        const wPx = Number(spot.Width ?? spot.width ?? 130);
        const hPx = Number(spot.Height ?? spot.height ?? 48);

        const x = xPx / scale;
        const w = wPx / scale;
        const h = hPx / scale;
        const yTop = yTopPx / scale;
        const y = pageHeight - yTop - h;

        page.drawImage(embedded, {
            x,
            y,
            width: w,
            height: h,
        });
    }

    const bytes = await pdfDoc.save();
    return Buffer.from(bytes);
}

async function ensureSignedPdfKey({ signingFileId, lawyerId, pdfKey }) {
    // Pull signed spots with signature images
    const spotsRes = await pool.query(
        `select
            pagenumber    as "PageNumber",
            x             as "X",
            y             as "Y",
            width         as "Width",
            height        as "Height",
            signaturedata as "SignatureData"
         from signaturespots
         where signingfileid = $1
           and issigned = true
           and signaturedata is not null`,
        [signingFileId]
    );

    const spots = spotsRes.rows || [];
    if (spots.length === 0) {
        return null;
    }

    const signedPdf = await generateSignedPdfBuffer({ pdfKey, spots });
    const signedKey = `signed/${lawyerId}/${signingFileId}/${uuid()}.pdf`;

    await r2.send(
        new PutObjectCommand({
            Bucket: BUCKET,
            Key: signedKey,
            Body: signedPdf,
            ContentType: "application/pdf",
        })
    );

    await pool.query(
        `update signingfiles
         set signedfilekey = $2
         where signingfileid = $1`,
        [signingFileId, signedKey]
    );

    return signedKey;
}

let _schemaSupportCache = {
    value: null,
    expiresAt: 0,
};

async function getSchemaSupport() {
    const now = Date.now();
    if (_schemaSupportCache.value && now < _schemaSupportCache.expiresAt) {
        return _schemaSupportCache.value;
    }

    const signerUserIdCol = await pool.query(
        `select 1
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'signaturespots'
           and column_name = 'signeruserid'
         limit 1`
    );

    const caseIdNullableRes = await pool.query(
        `select is_nullable
         from information_schema.columns
         where table_schema = 'public'
           and table_name = 'signingfiles'
           and column_name = 'caseid'
         limit 1`
    );

    const value = {
        signaturespotsSignerUserId: signerUserIdCol.rows.length > 0,
        signingfilesCaseIdNullable: (caseIdNullableRes.rows[0]?.is_nullable || 'NO') === 'YES',
    };

    // Cache briefly to avoid repeated information_schema hits, but still adapt to schema changes.
    _schemaSupportCache = { value, expiresAt: now + 30_000 };
    return value;
}

exports.uploadFileForSigning = async (req, res) => {
    try {
        const schemaSupport = await getSchemaSupport();
        const {
            caseId,
            clientId,
            fileName,
            fileKey,
            signatureLocations,
            notes,
            expiresAt,
            signers, // NEW: array of signer objects [{userId, name}, ...]
        } = req.body;

        const lawyerId = req.user.UserId;

        console.log('[controller] ========== UPLOAD FILE FOR SIGNING ==========');
        console.log('[controller] Request from lawyer:', lawyerId);
        console.log('[controller] Case ID:', caseId);
        console.log('[controller] File name:', fileName);
        console.log('[controller] File key:', fileKey);
        console.log('[controller] Signers received:', signers);
        console.log('[controller] Signature locations:', signatureLocations?.length || 0, 'spots');

        // Support both single client (legacy) and multiple signers (new)
        const signersList = signers && Array.isArray(signers) ? signers :
            (clientId ? [{ userId: clientId, name: "חתימה ✍️" }] : []);

        console.log('[controller] Final signers list to use:', signersList.map(s => ({ userId: s.userId, name: s.name })));

        // caseId is optional: can upload by client only, case only, or both
        if (!fileName || !fileKey || signersList.length === 0) {
            return res
                .status(400)
                .json({ message: "חסרים שדות חובה (שם קובץ, fileKey, או חתומים)" });
        }

        // Normalize caseId: allow null / empty / 0
        const normalizedCaseId =
            caseId === undefined || caseId === null || caseId === "" || Number(caseId) === 0
                ? null
                : parsePositiveIntStrict(caseId, { min: 1 });

        if (caseId !== undefined && caseId !== null && caseId !== '' && Number(caseId) !== 0 && normalizedCaseId === null) {
            return res.status(400).json({ message: "Invalid parameter: caseId" });
        }

        // If DB doesn't allow NULL caseId, enforce it here with a clear message
        if (normalizedCaseId === null && !schemaSupport.signingfilesCaseIdNullable) {
            return res.status(400).json({
                message: "חובה לבחור תיק (המסד נתונים מוגדר ש-caseId אינו יכול להיות ריק).",
            });
        }

        // For backward compatibility, use first signer as primary clientId
        const primaryClientId = signersList[0].userId || clientId;

        const insertFile = await pool.query(
            `insert into signingfiles
             (caseid, lawyerid, clientid, filename, filekey, originalfilekey, status, notes, expiresat)
             values ($1,$2,$3,$4,$5,$5,'pending',$6,$7)
             returning signingfileid as "SigningFileId"`,
            [normalizedCaseId, lawyerId, primaryClientId, fileName, fileKey, notes || null, expiresAt || null]
        );

        const signingFileId = insertFile.rows[0].SigningFileId;
        console.log('[controller] Created signing file with ID:', signingFileId);

        if (Array.isArray(signatureLocations)) {
            console.log('[controller] Processing', signatureLocations.length, 'signature locations...');
            for (const spot of signatureLocations) {
                // Try to match spot to a specific signer based on signerName or index
                let signerName = spot.signerName || "חתימה ✍️";
                let signerUserId = null;

                // Prefer explicit userId from the client (most reliable)
                if (spot.signerUserId !== undefined && spot.signerUserId !== null && spot.signerUserId !== '') {
                    signerUserId = Number(spot.signerUserId);
                } else if (spot.signeruserid !== undefined && spot.signeruserid !== null && spot.signeruserid !== '') {
                    // Support alternate casing from older clients
                    signerUserId = Number(spot.signeruserid);
                }

                // If spot has a signerIndex, use that signer
                if ((signerUserId === null || Number.isNaN(signerUserId)) && spot.signerIndex !== undefined && spot.signerIndex !== null) {
                    const idx = Number(spot.signerIndex);
                    if (!Number.isNaN(idx) && idx >= 0 && idx < signersList.length) {
                        signerUserId = signersList[idx].userId;
                        signerName = signersList[idx].name;
                    }
                }

                // If we still don't have a userId, try to match by signerName
                if ((signerUserId === null || Number.isNaN(signerUserId)) && signerName && signersList.length > 0) {
                    const match = signersList.find((s) => (s?.name || '').trim() === String(signerName).trim());
                    if (match?.userId) signerUserId = match.userId;
                }

                if (Number.isNaN(signerUserId)) signerUserId = null;

                console.log(`[controller]   Spot page ${spot.pageNum}: signerIndex=${spot.signerIndex}, signerName="${signerName}", signerUserId=${signerUserId}`);

                if (schemaSupport.signaturespotsSignerUserId) {
                    await pool.query(
                        `insert into signaturespots
                         (signingfileid, pagenumber, x, y, width, height, signername, isrequired, signeruserid)
                         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                        [
                            signingFileId,
                            spot.pageNum || 1,
                            spot.x ?? 50,
                            spot.y ?? 50,
                            spot.width ?? 150,
                            spot.height ?? 75,
                            signerName,
                            spot.isRequired !== false,
                            signerUserId || null,
                        ]
                    );
                } else {
                    // Legacy DB: no signeruserid column
                    await pool.query(
                        `insert into signaturespots
                         (signingfileid, pagenumber, x, y, width, height, signername, isrequired)
                         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
                        [
                            signingFileId,
                            spot.pageNum || 1,
                            spot.x ?? 50,
                            spot.y ?? 50,
                            spot.width ?? 150,
                            spot.height ?? 75,
                            signerName,
                            spot.isRequired !== false,
                        ]
                    );
                }
            }
        }

        // Send notification to each signer
        for (const signer of signersList) {
            await sendAndStoreNotification(
                signer.userId,
                "קובץ חדש לחתימה",
                `יש לך קובץ חדש לחתימה: ${fileName}`,
                { signingFileId, type: "signing_pending" }
            );
        }

        return res.json({
            success: true,
            signingFileId,
            message: "קובץ נשלח לחתומים לחתימה",
            signerCount: signersList.length,
        });
    } catch (err) {
        console.error("uploadFileForSigning error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בהעלאת הקובץ לחתימה" });
    }
};

exports.getClientSigningFiles = async (req, res) => {
    try {
        const clientId = req.user.UserId;
        const pagination = getPagination(req, res, { defaultLimit: 50, maxLimit: 200 });
        if (pagination === null) return;

        const schemaSupport = await getSchemaSupport();

        if (!schemaSupport.signaturespotsSignerUserId) {
            // Legacy DB behavior: only primary client sees their files
            const query =
                `select
                    sf.signingfileid      as "SigningFileId",
                    sf.caseid             as "CaseId",
                    sf.filename           as "FileName",
                    sf.filekey            as "FileKey",
                    sf.status             as "Status",
                    sf.createdat          as "CreatedAt",
                    sf.expiresat          as "ExpiresAt",
                    sf.notes              as "Notes",
                    sf.signedat           as "SignedAt",
                    c.casename            as "CaseName",
                    u.name                as "LawyerName",
                    count(ss.signaturespotid)                                       as "TotalSpots",
                    coalesce(sum(case when ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
                 from signingfiles sf
                 join cases c  on c.caseid  = sf.caseid
                 join users u  on u.userid  = sf.lawyerid
                 left join signaturespots ss on ss.signingfileid = sf.signingfileid
                 where sf.clientid = $1
                 group by sf.signingfileid, sf.caseid, sf.filename, sf.filekey,
                          sf.status, sf.createdat, sf.expiresat, sf.notes, sf.signedat,
                          c.casename, u.name
                 order by sf.createdat desc` +
                (pagination.enabled ? ` limit $2 offset $3` : ``);

            const params = pagination.enabled
                ? [clientId, pagination.limit, pagination.offset]
                : [clientId];

            const legacy = await pool.query(query, params);

            return res.json({ files: legacy.rows });
        }

        const query =
            `select 
                sf.signingfileid      as "SigningFileId",
                sf.caseid             as "CaseId",
                sf.filename           as "FileName",
                sf.filekey            as "FileKey",
                sf.status             as "Status",
                sf.createdat          as "CreatedAt",
                sf.expiresat          as "ExpiresAt",
                sf.notes              as "Notes",
                sf.signedat           as "SignedAt",
                c.casename            as "CaseName",
                u.name                as "LawyerName",
                count(ss.signaturespotid)                                       as "TotalSpots",
                coalesce(sum(case when ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
             from signingfiles sf
             left join cases c  on c.caseid  = sf.caseid
             join users u  on u.userid  = sf.lawyerid
             left join signaturespots ss
                on ss.signingfileid = sf.signingfileid
               and (ss.signeruserid = $1 or ss.signeruserid is null)
             where sf.clientid = $1
                or exists (
                    select 1
                    from signaturespots ss2
                    where ss2.signingfileid = sf.signingfileid
                      and ss2.signeruserid = $1
                )
             group by sf.signingfileid, sf.caseid, sf.filename, sf.filekey,
                      sf.status, sf.createdat, sf.expiresat, sf.notes, sf.signedat,
                      c.casename, u.name
             order by sf.createdat desc` +
            (pagination.enabled ? ` limit $2 offset $3` : ``);

        const params = pagination.enabled
            ? [clientId, pagination.limit, pagination.offset]
            : [clientId];

        const result = await pool.query(query, params);

        return res.json({ files: result.rows });
    } catch (err) {
        console.error("getClientSigningFiles error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בשליפת המסמכים של הלקוח" });
    }
};

exports.getLawyerSigningFiles = async (req, res) => {
    try {
        const lawyerId = req.user.UserId;
        const pagination = getPagination(req, res, { defaultLimit: 50, maxLimit: 200 });
        if (pagination === null) return;

        const query =
            `select 
                sf.signingfileid      as "SigningFileId",
                sf.caseid             as "CaseId",
                sf.filename           as "FileName",
                sf.status             as "Status",
                sf.createdat          as "CreatedAt",
                sf.signedat           as "SignedAt",
                c.casename            as "CaseName",
                u.name                as "ClientName",
                count(ss.signaturespotid)                                       as "TotalSpots",
                coalesce(sum(case when ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
             from signingfiles sf
             left join cases c  on c.caseid  = sf.caseid
             join users u  on u.userid  = sf.clientid
             left join signaturespots ss on ss.signingfileid = sf.signingfileid
             where sf.lawyerid = $1
             group by sf.signingfileid, sf.caseid, sf.filename,
                      sf.status, sf.createdat, sf.signedat,
                      c.casename, u.name
             order by sf.createdat desc` +
            (pagination.enabled ? ` limit $2 offset $3` : ``);

        const params = pagination.enabled
            ? [lawyerId, pagination.limit, pagination.offset]
            : [lawyerId];

        const result = await pool.query(query, params);

        return res.json({ files: result.rows });
    } catch (err) {
        console.error("getLawyerSigningFiles error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בשליפת המסמכים של העו\"ד" });
    }
};

exports.getPendingSigningFiles = async (req, res) => {
    try {
        const clientId = req.user.UserId;
        const pagination = getPagination(req, res, { defaultLimit: 50, maxLimit: 200 });
        if (pagination === null) return;

        const schemaSupport = await getSchemaSupport();

        if (!schemaSupport.signaturespotsSignerUserId) {
            const query =
                `select
                    sf.signingfileid      as "SigningFileId",
                    sf.caseid             as "CaseId",
                    sf.filename           as "FileName",
                    sf.filekey            as "FileKey",
                    sf.status             as "Status",
                    sf.createdat          as "CreatedAt",
                    sf.expiresat          as "ExpiresAt",
                    sf.notes              as "Notes",
                    c.casename            as "CaseName",
                    u.name                as "LawyerName",
                    count(ss.signaturespotid)                                       as "TotalSpots",
                    coalesce(sum(case when ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
                 from signingfiles sf
                 join cases c  on c.caseid  = sf.caseid
                 join users u  on u.userid  = sf.lawyerid
                 left join signaturespots ss on ss.signingfileid = sf.signingfileid
                 where sf.clientid = $1
                   and sf.status in ('pending','rejected')
                 group by sf.signingfileid, sf.caseid, sf.filename, sf.filekey,
                          sf.status, sf.createdat, sf.expiresat, sf.notes,
                          c.casename, u.name
                 order by sf.createdat desc` +
                (pagination.enabled ? ` limit $2 offset $3` : ``);

            const params = pagination.enabled
                ? [clientId, pagination.limit, pagination.offset]
                : [clientId];

            const legacy = await pool.query(query, params);

            return res.json({ files: legacy.rows });
        }

        const query =
            `select 
                sf.signingfileid      as "SigningFileId",
                sf.caseid             as "CaseId",
                sf.filename           as "FileName",
                sf.filekey            as "FileKey",
                sf.status             as "Status",
                sf.createdat          as "CreatedAt",
                sf.expiresat          as "ExpiresAt",
                sf.notes              as "Notes",
                c.casename            as "CaseName",
                u.name                as "LawyerName",
                count(ss.signaturespotid)                                       as "TotalSpots",
                coalesce(sum(case when ss.issigned = true then 1 else 0 end),0) as "SignedSpots"
             from signingfiles sf
             left join cases c  on c.caseid  = sf.caseid
             join users u  on u.userid  = sf.lawyerid
                         left join signaturespots ss
                                on ss.signingfileid = sf.signingfileid
                             and (ss.signeruserid = $1 or ss.signeruserid is null)
                         where (sf.clientid = $1
                                or exists (
                                        select 1
                                        from signaturespots ss2
                                        where ss2.signingfileid = sf.signingfileid
                                            and ss2.signeruserid = $1
                                ))
               and sf.status in ('pending','rejected')
             group by sf.signingfileid, sf.caseid, sf.filename, sf.filekey,
                      sf.status, sf.createdat, sf.expiresat, sf.notes,
                      c.casename, u.name
             order by sf.createdat desc` +
            (pagination.enabled ? ` limit $2 offset $3` : ``);

        const params = pagination.enabled
            ? [clientId, pagination.limit, pagination.offset]
            : [clientId];

        const result = await pool.query(query, params);

        return res.json({ files: result.rows });
    } catch (err) {
        console.error("getPendingSigningFiles error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בשליפת מסמכים ממתינים" });
    }
};

exports.getSigningFileDetails = async (req, res) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const userId = req.user.UserId;

        const schemaSupport = await getSchemaSupport();

        const fileResult = await pool.query(
            `select 
                signingfileid   as "SigningFileId",
                caseid          as "CaseId",
                lawyerid        as "LawyerId",
                clientid        as "ClientId",
                filename        as "FileName",
                filekey         as "FileKey",
                originalfilekey as "OriginalFileKey",
                status          as "Status",
                signedfilekey   as "SignedFileKey",
                signedat        as "SignedAt",
                createdat       as "CreatedAt",
                expiresat       as "ExpiresAt",
                rejectionreason as "RejectionReason",
                notes           as "Notes"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        const isLawyer = file.LawyerId === userId;
        const isPrimaryClient = file.ClientId === userId;

        // Multi-signer support: allow access if user is assigned to at least one spot
        let isAssignedSigner = false;
        if (schemaSupport.signaturespotsSignerUserId && !isLawyer && !isPrimaryClient) {
            const signerRes = await pool.query(
                `select 1
                 from signaturespots
                 where signingfileid = $1 and signeruserid = $2
                 limit 1`,
                [signingFileId, userId]
            );
            isAssignedSigner = signerRes.rows.length > 0;
        }

        if (!isLawyer && !isPrimaryClient && !isAssignedSigner) {
            return res.status(403).json({ message: "אין הרשאה למסמך זה" });
        }

        // If user is NOT the lawyer (i.e., user is a client), filter spots to only show their assigned spots
        let spotsQuery = `select
                signaturespotid as "SignatureSpotId",
                signingfileid   as "SigningFileId",
                pagenumber      as "PageNumber",
                x               as "X",
                y               as "Y",
                width           as "Width",
                height          as "Height",
                signername      as "SignerName",
                isrequired      as "IsRequired",
                issigned        as "IsSigned",
                signaturedata   as "SignatureData",
                signedat        as "SignedAt",
            createdat       as "CreatedAt"${schemaSupport.signaturespotsSignerUserId ? ',\n                signeruserid    as "SignerUserId"' : ''}
             from signaturespots
             where signingfileid = $1`;

        const spotsParams = [signingFileId];

        // If client (not lawyer), only show their own signature spots
        if (schemaSupport.signaturespotsSignerUserId && !isLawyer) {
            spotsQuery += ` and (signeruserid = $2 or signeruserid is null)`;
            spotsParams.push(userId);
        }

        spotsQuery += ` order by pagenumber, y, x`;

        const spotsResult = await pool.query(spotsQuery, spotsParams);

        // Attach short-lived read URLs for signature images (if present) so UI can display them.
        // NOTE: Access control is already enforced above and (for clients) the spots are filtered.
        const signatureSpots = await Promise.all(
            (spotsResult.rows || []).map(async (spot) => {
                const signatureData = spot?.SignatureData;
                if (!signatureData) return spot;

                // Some legacy rows may already store a full URL.
                if (typeof signatureData === "string" && /^https?:\/\//i.test(signatureData)) {
                    return { ...spot, SignatureUrl: signatureData };
                }

                try {
                    const cmd = new GetObjectCommand({
                        Bucket: BUCKET,
                        Key: signatureData,
                        ResponseContentDisposition: "inline",
                    });

                    const signatureUrl = await getSignedUrl(r2, cmd, { expiresIn: 600 });
                    return { ...spot, SignatureUrl: signatureUrl };
                } catch (e) {
                    // If presigning fails, don't break details response.
                    console.error("Failed to presign signature read URL", e);
                    return spot;
                }
            })
        );

        return res.json({
            file,
            signatureSpots,
            isLawyer,
        });
    } catch (err) {
        console.error("getSigningFileDetails error:", err);
        return res
            .status(500)
            .json({ message: "שגיאה בשליפת פרטי המסמך" });
    }
};


exports.signFile = async (req, res) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;

        const signatureSpotId = requireInt(req, res, { source: 'body', name: 'signatureSpotId' });
        if (signatureSpotId === null) return;

        const { signatureImage } = req.body;
        const userId = req.user.UserId;

        const schemaSupport = await getSchemaSupport();

        const fileResult = await pool.query(
            `select 
                signingfileid as "SigningFileId",
                caseid        as "CaseId",
                lawyerid      as "LawyerId",
                clientid      as "ClientId",
                filename      as "FileName",
                filekey       as "FileKey",
                status        as "Status",
                signedfilekey as "SignedFileKey",
                signedat      as "SignedAt"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        // Allow signing if user is the primary client OR if they're assigned as a specific signer
        const spotResult = await pool.query(
            `select
                signaturespotid as "SignatureSpotId",
                signingfileid   as "SigningFileId",
                issigned        as "IsSigned"${schemaSupport.signaturespotsSignerUserId ? ',\n                signeruserid    as "SignerUserId"' : ''}
             from signaturespots
             where signaturespotid = $1 and signingfileid = $2`,
            [signatureSpotId, signingFileId]
        );

        if (spotResult.rows.length === 0) {
            return res.status(400).json({ message: "מקום חתימה לא תקין" });
        }

        const spot = spotResult.rows[0];

        // Check authorization: user can sign if they're the primary client OR specifically assigned to this spot
        const isAuthorized = schemaSupport.signaturespotsSignerUserId
            ? (file.ClientId === userId || (spot.SignerUserId && spot.SignerUserId === userId))
            : (file.ClientId === userId);

        if (!isAuthorized) {
            return res.status(403).json({ message: "אין הרשאה לחתום על מקום חתימה זה" });
        }

        if (spot.IsSigned) {
            return res.status(400).json({ message: "מקום החתימה כבר חתום" });
        }

        if (signatureImage) {
            const isPng = signatureImage.includes("png");
            const ext = isPng ? "png" : "jpg";
            const key = `signatures/${file.LawyerId}/${userId}/${signingFileId}_${signatureSpotId}.${ext}`;

            const base64 = signatureImage.split(",")[1] || signatureImage;
            const buffer = Buffer.from(base64, "base64");

            const cmd = new PutObjectCommand({
                Bucket: BUCKET,
                Key: key,
                Body: buffer,
                ContentType: `image/${ext}`,
            });

            await r2.send(cmd);

            await pool.query(
                `update signaturespots
                 set issigned = true,
                     signedat = now(),
                     signaturedata = $1
                 where signaturespotid = $2`,
                [key, signatureSpotId]
            );
        } else {
            await pool.query(
                `update signaturespots
                 set issigned = true,
                     signedat = now()
                 where signaturespotid = $1`,
                [signatureSpotId]
            );
        }

        const remainingResult = await pool.query(
            `select count(*)::int as "count"
             from signaturespots
             where signingfileid = $1
               and isrequired = true
               and issigned = false`,
            [signingFileId]
        );

        const remaining = remainingResult.rows[0].count;

        if (remaining === 0) {
            await pool.query(
                `update signingfiles
                 set status = 'signed',
                     signedat = now()
                 where signingfileid = $1`,
                [signingFileId]
            );

            await sendAndStoreNotification(
                file.LawyerId,
                "✓ קובץ חתום",
                `הקובץ ${file.FileName} חתום בהצלחה על ידי כל החתומים`,
                { signingFileId, type: "file_signed" }
            );
        }

        return res.json({ success: true, message: "✓ החתימה נשמרה בהצלחה" });
    } catch (err) {
        console.error("signFile error:", err);
        return res.status(500).json({ message: "שגיאה בשמירת החתימה" });
    }
};

exports.rejectSigning = async (req, res) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const { rejectionReason } = req.body;
        const userId = req.user.UserId;

        const schemaSupport = await getSchemaSupport();

        const fileResult = await pool.query(
            `select 
                signingfileid as "SigningFileId",
                clientid      as "ClientId",
                lawyerid      as "LawyerId",
                filename      as "FileName"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        // Check if user can reject: either primary client or assigned signer
        let isAuthorized = file.ClientId === userId;
        if (schemaSupport.signaturespotsSignerUserId && !isAuthorized) {
            const spotResult = await pool.query(
                `select count(*)::int as "count"
                 from signaturespots
                 where signingfileid = $1
                   and (signeruserid = $2 or signeruserid is null)`,
                [signingFileId, userId]
            );
            const isAssignedSigner = spotResult.rows[0].count > 0;
            isAuthorized = isAuthorized || isAssignedSigner;
        }

        if (!isAuthorized) {
            return res.status(403).json({ message: "אין הרשאה למסמך זה" });
        }

        // Reset all signatures for this file
        await pool.query(
            `update signaturespots
             set issigned = false,
                 signedat = null,
                 signaturedata = null
             where signingfileid = $1`,
            [signingFileId]
        );

        await pool.query(
            `update signingfiles
             set status = 'rejected',
                 rejectionreason = $1
             where signingfileid = $2`,
            [rejectionReason || null, signingFileId]
        );

        await sendAndStoreNotification(
            file.LawyerId,
            "❌ קובץ נדחה",
            `${file.FileName} נדחה על ידי חותם. סיבה: ${rejectionReason || "לא צוינה"}`,
            { signingFileId, type: "file_rejected" }
        );

        return res.json({ success: true, message: "✓ המסמך נדחה בהצלחה" });
    } catch (err) {
        console.error("rejectSigning error:", err);
        return res.status(500).json({ message: "שגיאה בדחיית המסמך" });
    }
};

exports.reuploadFile = async (req, res) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const { fileKey, signatureLocations, signers } = req.body;
        const lawyerId = req.user.UserId;

        const schemaSupport = await getSchemaSupport();

        const fileResult = await pool.query(
            `select 
                signingfileid as "SigningFileId",
                lawyerid      as "LawyerId",
                clientid      as "ClientId",
                filename      as "FileName"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        if (file.LawyerId !== lawyerId) {
            return res.status(403).json({ message: "אין הרשאה למסמך זה" });
        }

        await pool.query(
            `update signingfiles
             set filekey = $1,
                 originalfilekey = $1,
                 status = 'pending',
                 rejectionreason = null,
                 signedfilekey = null,
                 signedat = null
             where signingfileid = $2`,
            [fileKey, signingFileId]
        );

        await pool.query(
            `delete from signaturespots
             where signingfileid = $1`,
            [signingFileId]
        );

        if (Array.isArray(signatureLocations)) {
            // Support both legacy and multi-signer reupload
            const signersList = signers && Array.isArray(signers) ? signers : [];
            for (const spot of signatureLocations) {
                let signerUserId = null;
                let signerName = spot.signerName || "חתימה";

                // Prefer explicit userId from the client
                if (spot.signerUserId !== undefined && spot.signerUserId !== null && spot.signerUserId !== '') {
                    signerUserId = Number(spot.signerUserId);
                } else if (spot.SignerUserId !== undefined && spot.SignerUserId !== null && spot.SignerUserId !== '') {
                    signerUserId = Number(spot.SignerUserId);
                } else if (spot.signeruserid !== undefined && spot.signeruserid !== null && spot.signeruserid !== '') {
                    signerUserId = Number(spot.signeruserid);
                }

                // Fallback to signerIndex
                if ((signerUserId === null || Number.isNaN(signerUserId)) && spot.signerIndex !== undefined && spot.signerIndex !== null) {
                    const idx = Number(spot.signerIndex);
                    if (!Number.isNaN(idx) && idx >= 0 && idx < signersList.length) {
                        signerUserId = signersList[idx].userId;
                        signerName = signersList[idx].name || signerName;
                    }
                }

                // Fallback to signerName match
                if ((signerUserId === null || Number.isNaN(signerUserId)) && signerName && signersList.length > 0) {
                    const match = signersList.find((s) => (s?.name || '').trim() === String(signerName).trim());
                    if (match?.userId) signerUserId = match.userId;
                }

                if (Number.isNaN(signerUserId)) signerUserId = null;

                if (schemaSupport.signaturespotsSignerUserId) {
                    await pool.query(
                        `insert into signaturespots
                         (signingfileid, pagenumber, x, y, width, height, signername, isrequired, signeruserid)
                         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
                        [
                            signingFileId,
                            spot.pageNum || 1,
                            spot.x ?? 50,
                            spot.y ?? 50,
                            spot.width ?? 150,
                            spot.height ?? 75,
                            signerName,
                            spot.isRequired !== false,
                            signerUserId || null,
                        ]
                    );
                } else {
                    await pool.query(
                        `insert into signaturespots
                         (signingfileid, pagenumber, x, y, width, height, signername, isrequired)
                         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
                        [
                            signingFileId,
                            spot.pageNum || 1,
                            spot.x ?? 50,
                            spot.y ?? 50,
                            spot.width ?? 150,
                            spot.height ?? 75,
                            signerName,
                            spot.isRequired !== false,
                        ]
                    );
                }
            }
        }

        if (schemaSupport.signaturespotsSignerUserId) {
            // Notify all signers (fallback to primary client)
            const signerUserIdsRes = await pool.query(
                `select distinct signeruserid as "SignerUserId"
                 from signaturespots
                 where signingfileid = $1
                   and signeruserid is not null`,
                [signingFileId]
            );

            const signerUserIds = signerUserIdsRes.rows
                .map((r) => r.SignerUserId)
                .filter((v) => v !== null && v !== undefined);

            const notifyTargets = signerUserIds.length > 0 ? signerUserIds : [file.ClientId];
            for (const targetUserId of notifyTargets) {
                await sendAndStoreNotification(
                    targetUserId,
                    "קובץ חדש לחתימה",
                    `הקובץ ${file.FileName} הועלה מחדש לחתימה`,
                    { signingFileId, type: "file_reuploaded" }
                );
            }
        } else {
            // Legacy DB: notify only primary client
            await sendAndStoreNotification(
                file.ClientId,
                "קובץ חדש לחתימה",
                `הקובץ ${file.FileName} הועלה מחדש לחתימה`,
                { signingFileId, type: "file_reuploaded" }
            );
        }

        return res.json({ success: true, message: "הקובץ הועלה מחדש לחתימה" });
    } catch (err) {
        console.error("reuploadFile error:", err);
        return res.status(500).json({ message: "שגיאה בהעלאת קובץ מחדש" });
    }
};

exports.getSignedFileDownload = async (req, res) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const userId = req.user.UserId;

        const schemaSupport = await getSchemaSupport();

        const fileResult = await pool.query(
            `select 
                signingfileid  as "SigningFileId",
                lawyerid       as "LawyerId",
                clientid       as "ClientId",
                filename       as "FileName",
                status         as "Status",
                signedfilekey  as "SignedFileKey",
                filekey        as "FileKey"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        const isLawyer = file.LawyerId === userId;
        const isPrimaryClient = file.ClientId === userId;
        let isAssignedSigner = false;

        if (schemaSupport.signaturespotsSignerUserId && !isLawyer && !isPrimaryClient) {
            const signerRes = await pool.query(
                `select 1
                 from signaturespots
                 where signingfileid = $1 and signeruserid = $2
                 limit 1`,
                [signingFileId, userId]
            );
            isAssignedSigner = signerRes.rows.length > 0;
        }

        if (!isLawyer && !isPrimaryClient && !isAssignedSigner) {
            return res.status(403).json({ message: "אין הרשאה להוריד מסמך זה" });
        }

        if (file.Status !== "signed" && !file.SignedFileKey) {
            return res.status(400).json({ message: "המסמך עדיין לא חתום" });
        }

        // If the file is signed but we don't yet have a flattened PDF, generate it on-demand.
        let key = file.SignedFileKey;
        if (!key) {
            try {
                key = await ensureSignedPdfKey({
                    signingFileId,
                    lawyerId: file.LawyerId,
                    pdfKey: file.FileKey,
                });
            } catch (e) {
                console.error("Failed to generate signed PDF; falling back to original", e);
            }
        }

        // Fallback: original file (may not contain signatures) if generation failed
        key = key || file.FileKey;

        const cmd = new GetObjectCommand({
            Bucket: BUCKET,
            Key: key,
            ResponseContentDisposition: `attachment; filename="${file.FileName}"`,
        });

        const downloadUrl = await getSignedUrl(r2, cmd, { expiresIn: 600 });

        return res.json({ downloadUrl, expiresIn: 600 });
    } catch (err) {
        console.error("getSignedFileDownload error:", err);
        return res.status(500).json({ message: "שגיאה ביצירת קישור הורדה" });
    }
};

// Streams the original PDF (filekey) for in-app viewing (react-pdf/pdfjs).
// Supports Range requests so pdf.js can efficiently load pages.
exports.getSigningFilePdf = async (req, res) => {
    try {
        const signingFileId = requireInt(req, res, { source: 'params', name: 'signingFileId' });
        if (signingFileId === null) return;
        const userId = req.user.UserId;

        const schemaSupport = await getSchemaSupport();

        const fileResult = await pool.query(
            `select
                signingfileid as "SigningFileId",
                lawyerid      as "LawyerId",
                clientid      as "ClientId",
                filename      as "FileName",
                filekey       as "FileKey"
             from signingfiles
             where signingfileid = $1`,
            [signingFileId]
        );

        if (fileResult.rows.length === 0) {
            return res.status(404).json({ message: "המסמך לא נמצא" });
        }

        const file = fileResult.rows[0];

        const isLawyer = file.LawyerId === userId;
        const isPrimaryClient = file.ClientId === userId;
        let isAssignedSigner = false;

        if (schemaSupport.signaturespotsSignerUserId && !isLawyer && !isPrimaryClient) {
            const signerRes = await pool.query(
                `select 1
                 from signaturespots
                 where signingfileid = $1 and signeruserid = $2
                 limit 1`,
                [signingFileId, userId]
            );
            isAssignedSigner = signerRes.rows.length > 0;
        }

        if (!isLawyer && !isPrimaryClient && !isAssignedSigner) {
            return res.status(403).json({ message: "אין הרשאה למסמך זה" });
        }

        if (!file.FileKey) {
            return res.status(404).json({ message: "לקובץ אין FileKey" });
        }

        const range = req.headers.range;
        const cmd = new GetObjectCommand({
            Bucket: BUCKET,
            Key: file.FileKey,
            ...(range ? { Range: range } : {}),
        });

        const obj = await r2.send(cmd);

        res.setHeader("Content-Type", obj.ContentType || "application/pdf");
        res.setHeader("Accept-Ranges", "bytes");
        // pdf.js runs in the browser and needs access to these headers when CORS is in play.
        // Without Access-Control-Expose-Headers, the browser hides them from JS.
        res.setHeader(
            "Access-Control-Expose-Headers",
            "Accept-Ranges, Content-Range, Content-Length, Content-Type, Content-Disposition"
        );
        // Keep Content-Disposition ASCII-safe to avoid Node throwing on non-Latin filenames (e.g. Hebrew).
        res.setHeader("Content-Disposition", "inline");

        if (obj.ContentLength !== undefined) {
            res.setHeader("Content-Length", String(obj.ContentLength));
        }

        if (range && obj.ContentRange) {
            res.status(206);
            res.setHeader("Content-Range", String(obj.ContentRange));
        }

        if (!obj.Body) {
            return res.status(500).json({ message: "שגיאה בקריאת הקובץ" });
        }

        obj.Body.pipe(res);
    } catch (err) {
        console.error("getSigningFilePdf error:", err);
        return res.status(500).json({ message: "שגיאה בטעינת PDF" });
    }
};

exports.detectSignatureSpots = async (req, res) => {
    try {
        const { fileKey, signers } = req.body;

        console.log('[controller] ========== DETECT SIGNATURE SPOTS ==========');
        console.log('[controller] File key:', fileKey);
        console.log('[controller] Signers received:', signers);

        if (!fileKey) return res.status(400).json({ message: "missing fileKey" });

        const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: fileKey });
        const obj = await r2.send(cmd);
        const buffer = await streamToBuffer(obj.Body);

        console.log('[controller] Downloaded file buffer, size:', buffer.length, 'bytes');

        let spots = await detectHebrewSignatureSpotsFromPdfBuffer(buffer, signers && Array.isArray(signers) ? signers : null);

        console.log('[controller] Detection complete, found', spots.length, 'spots');
        console.log('[controller] Returning spots:', spots.map(s => ({
            pageNum: s.pageNum,
            signerIndex: s.signerIndex,
            signerName: s.signerName,
            x: s.x,
            y: s.y
        })));

        return res.json({ spots, signerCount: signers?.length || 1 });
    } catch (err) {
        console.error('[controller] detectSignatureSpots error:', err);
        return res.status(500).json({ message: "failed to detect signature spots" });
    }
};
