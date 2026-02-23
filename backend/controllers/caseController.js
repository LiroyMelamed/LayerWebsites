const pool = require("../config/db"); // Direct import of the pg pool
const { formatPhoneNumber } = require("../utils/phoneUtils");
const { sendMessage, getWebsiteDomain } = require("../utils/sendMessage");
const sendAndStoreNotification = require("../utils/sendAndStoreNotification"); // Import the new consolidated utility
const { notifyRecipient } = require("../services/notifications/notificationOrchestrator");
const { requireInt } = require("../utils/paramValidation");
const { getPagination } = require("../utils/pagination");
const { getSetting, getChannelConfig } = require("../services/settingsService");
const { renderTemplate } = require("../utils/templateRenderer");

/**
 * Notify the case manager (casemanagerid) about a case change,
 * but only if the manager is not already in the notified users set.
 * @param {string[]} changedTypes - Array of granular notification types that changed
 */
async function notifyCaseManager({ caseId, caseName, title, message, smsBody, alreadyNotifiedUserIds, changedTypes }) {
    try {
        // Check manager_cc across all changed types; skip if none enabled
        if (changedTypes && changedTypes.length > 0) {
            const configs = await Promise.all(changedTypes.map(t => getChannelConfig(t)));
            if (!configs.some(c => c.manager_cc === true)) return;
        } else {
            // Fallback: check CASE_STAGE_CHANGE
            const channelCfg = await getChannelConfig('CASE_STAGE_CHANGE');
            if (channelCfg.manager_cc === false) return;
        }

        const caseRes = await pool.query(
            'SELECT casemanagerid FROM cases WHERE caseid = $1',
            [caseId]
        );
        const managerId = Number(caseRes.rows?.[0]?.casemanagerid);
        if (!Number.isFinite(managerId) || managerId <= 0) return;

        // Skip if already notified as a linked user
        if (alreadyNotifiedUserIds && alreadyNotifiedUserIds.has(managerId)) return;

        const managerRes = await pool.query(
            'SELECT userid AS "UserId", name AS "Name", phonenumber AS "PhoneNumber" FROM users WHERE userid = $1',
            [managerId]
        );
        if (!managerRes.rows?.length) return;
        const mgr = managerRes.rows[0];

        const recipientName = String(mgr.Name || '').trim();
        const domain = await getWebsiteDomain();
        const finalMessage = message || `תיק "${caseName}" עודכן. היכנס לאתר או לאפליקציה למעקב.`;
        const finalSms = smsBody || finalMessage;

        await notifyRecipient({
            recipientUserId: mgr.UserId,
            recipientPhone: mgr.PhoneNumber,
            notificationType: 'CASE_UPDATE',
            push: {
                title: title || 'עדכון תיק',
                body: finalMessage,
                data: { caseId: String(caseId) },
            },
            email: {
                campaignKey: 'CASE_UPDATE',
                contactFields: {
                    recipient_name: recipientName || 'מנהל תיק',
                    case_title: String(caseName || '').trim(),
                    action_url: `https://${domain}`,
                },
            },
            sms: {
                messageBody: finalSms,
            },
        });
    } catch (e) {
        console.error('notifyCaseManager error (non-fatal):', e?.message || e);
    }
}

const _buildBaseCaseQuery = () => `
    SELECT
        C.caseid,
        C.casename,
        C.casetypeid,
        CT.casetypename,
        C.userid,
        U.name AS customername,
        U.email AS customermail,
        U.phonenumber,
        C.companyname,
        C.currentstage,
        C.isclosed,
        C.istagged,
        C.createdat,
        C.updatedat,
        C.whatsappgrouplink,
        C.casemanager,     
        C.casemanagerid,
        MGR.phonenumber AS casemanagerphone,
        C.estimatedcompletiondate,
        C.licenseexpirydate,
        CD.descriptionid,
        CD.stage,
        CD.text,
        CD.timestamp,
        CD.isnew
    FROM cases C
    LEFT JOIN users U ON C.userid = U.userid
    LEFT JOIN users MGR ON C.casemanagerid = MGR.userid
    LEFT JOIN casetypes CT ON C.casetypeid = CT.casetypeid
    LEFT JOIN casedescriptions CD ON C.caseid = CD.caseid
`;

const _mapCaseResults = (rows, caseUsersMap) => {
    const casesMap = new Map();

    rows.forEach(row => {
        const caseId = row.caseid;
        if (!casesMap.has(caseId)) {
            casesMap.set(caseId, {
                CaseId: caseId,
                CaseName: row.casename,
                CaseTypeId: row.casetypeid,
                CaseTypeName: row.casetypename,
                UserId: row.userid,
                CustomerName: row.customername,
                CustomerMail: row.customermail,
                PhoneNumber: row.phonenumber,
                CompanyName: row.companyname,
                WhatsappGroupLink: row.whatsappgrouplink,
                CurrentStage: row.currentstage,
                IsClosed: row.isclosed,
                IsTagged: row.istagged,
                CreatedAt: row.createdat,
                UpdatedAt: row.updatedat,
                CaseManager: row.casemanager,
                CaseManagerId: row.casemanagerid,
                CaseManagerPhone: row.casemanagerphone || null,
                EstimatedCompletionDate: row.estimatedcompletiondate,
                LicenseExpiryDate: row.licenseexpirydate,
                Descriptions: [],
                Users: [],
            });
        }

        if (row.descriptionid) {
            const c = casesMap.get(caseId);
            // Avoid duplicate descriptions from joined rows
            if (!c.Descriptions.some(d => d.DescriptionId === row.descriptionid)) {
                c.Descriptions.push({
                    DescriptionId: row.descriptionid,
                    Stage: row.stage,
                    Text: row.text,
                    Timestamp: row.timestamp,
                    IsNew: row.isnew
                });
            }
        }
    });

    // Enrich with linked users from case_users
    if (caseUsersMap) {
        for (const [caseId, c] of casesMap) {
            c.Users = caseUsersMap.get(caseId) || [];
            // Backward compatibility: keep primary UserId/CustomerName from the first linked user
            if (c.Users.length > 0 && !c.UserId) {
                c.UserId = c.Users[0].UserId;
                c.CustomerName = c.Users[0].Name;
                c.CustomerMail = c.Users[0].Email;
                c.PhoneNumber = c.Users[0].PhoneNumber;
            }
        }
    }

    return Array.from(casesMap.values());
};

/**
 * Fetch all users linked to the given case IDs via the case_users junction table.
 * Returns a Map<caseId, [{UserId, Name, Email, PhoneNumber}]>
 */
const _fetchCaseUsers = async (caseIds, client) => {
    const caseUsersMap = new Map();
    if (!caseIds || caseIds.length === 0) return caseUsersMap;

    const queryFn = client || pool;
    const result = await queryFn.query(
        `SELECT cu.caseid, u.userid, u.name, u.email, u.phonenumber
         FROM case_users cu
         JOIN users u ON cu.userid = u.userid
         WHERE cu.caseid = ANY($1::int[])
         ORDER BY cu.created_at`,
        [caseIds]
    );

    for (const row of result.rows) {
        if (!caseUsersMap.has(row.caseid)) {
            caseUsersMap.set(row.caseid, []);
        }
        caseUsersMap.get(row.caseid).push({
            UserId: row.userid,
            Name: row.name,
            Email: row.email,
            PhoneNumber: row.phonenumber,
        });
    }
    return caseUsersMap;
};

const getCases = async (req, res) => {
    const userId = req.user?.UserId;
    const userRole = req.user?.Role;

    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: User ID missing" });
    }

    try {
        const pagination = getPagination(req, res, { defaultLimit: 50, maxLimit: 200 });
        if (pagination === null) return;

        if (!pagination.enabled) {
            let query = _buildBaseCaseQuery();
            const params = [];

            if (userRole !== "Admin") {
                query += " WHERE C.caseid IN (SELECT caseid FROM case_users WHERE userid = $1)";
                params.push(userId);
            }
            query += " ORDER BY C.createdat DESC, C.caseid DESC, CD.stage";

            const result = await pool.query(query, params);
            const cases = _mapCaseResults(result.rows);
            const caseIds = cases.map(c => c.CaseId);
            const caseUsersMap = await _fetchCaseUsers(caseIds);
            return res.json(_mapCaseResults(result.rows, caseUsersMap));
        }

        const { limit, offset } = pagination;

        // Paginate by caseId (not joined rows) so descriptions aren't truncated.
        const idsQuery =
            userRole === 'Admin'
                ? `SELECT DISTINCT C.caseid
                   FROM cases C
                   ORDER BY C.createdat DESC, C.caseid DESC
                   LIMIT $1 OFFSET $2`
                : `SELECT DISTINCT C.caseid
                   FROM cases C
                   JOIN case_users CU ON C.caseid = CU.caseid
                   WHERE CU.userid = $1
                   ORDER BY C.createdat DESC, C.caseid DESC
                   LIMIT $2 OFFSET $3`;

        const idsParams = userRole === 'Admin' ? [limit, offset] : [userId, limit, offset];
        const idsResult = await pool.query(idsQuery, idsParams);
        const ids = idsResult.rows.map((r) => r.caseid);

        if (ids.length === 0) return res.json([]);

        const detailsQuery = `${_buildBaseCaseQuery()} WHERE C.caseid = ANY($1::int[]) ORDER BY C.createdat DESC, C.caseid DESC, CD.stage`;

        const result = await pool.query(detailsQuery, [ids]);
        const caseUsersMap = await _fetchCaseUsers(ids);
        return res.json(_mapCaseResults(result.rows, caseUsersMap));

    } catch (error) {
        console.error("Error retrieving cases:", error);
        res.status(500).json({ message: "Error retrieving cases" });
    }
};

const getCaseById = async (req, res) => {
    try {
        const caseId = requireInt(req, res, { source: 'params', name: 'caseId' });
        if (caseId === null) return;
        const userId = req.user?.UserId;
        const userRole = req.user?.Role;

        if (userRole !== "Admin") {
            const ownership = await pool.query(
                "SELECT 1 FROM case_users WHERE caseid = $1 AND userid = $2",
                [caseId, userId]
            );

            if (ownership.rows.length === 0) {
                return res.status(403).json({ message: "Forbidden", code: 'FORBIDDEN' });
            }
        }

        const query = `${_buildBaseCaseQuery()} WHERE C.caseid = $1 ORDER BY CD.stage`;
        const result = await pool.query(query, [caseId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Case not found" });
        }
        const caseUsersMap = await _fetchCaseUsers([caseId]);
        res.json(_mapCaseResults(result.rows, caseUsersMap)[0]);
    } catch (error) {
        console.error("Error retrieving case by ID:", error);
        res.status(500).json({ message: "Error retrieving case by ID" });
    }
};

const getCaseByName = async (req, res) => {
    let { caseName } = req.query;

    const normalizedCaseName = typeof caseName === 'string' ? caseName.trim() : '';

    const userId = req.user?.UserId;
    const userRole = req.user?.Role;

    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: User ID missing" });
    }

    try {
        // If empty query: return a default list so dropdowns can preload.
        if (!normalizedCaseName) {
            const pagination = getPagination(req, res, { defaultLimit: 200, maxLimit: 500 });
            if (pagination === null) return;

            const limit = pagination.enabled ? pagination.limit : 200;
            const offset = pagination.enabled ? pagination.offset : 0;

            // Paginate by caseId (not joined rows) so descriptions aren't truncated.
            const idsQuery =
                userRole === 'Admin'
                    ? `SELECT DISTINCT C.caseid, C.createdat
                       FROM cases C
                       ORDER BY C.createdat DESC, C.caseid DESC
                       LIMIT $1 OFFSET $2`
                    : `SELECT DISTINCT C.caseid, C.createdat
                       FROM cases C
                       JOIN case_users CU ON C.caseid = CU.caseid
                       WHERE CU.userid = $1
                       ORDER BY C.createdat DESC, C.caseid DESC
                       LIMIT $2 OFFSET $3`;

            const idsParams = userRole === 'Admin' ? [limit, offset] : [userId, limit, offset];
            const idsResult = await pool.query(idsQuery, idsParams);
            const ids = idsResult.rows.map((r) => r.caseid);
            if (ids.length === 0) return res.json([]);

            const detailsQuery = `${_buildBaseCaseQuery()} WHERE C.caseid = ANY($1::int[]) ORDER BY C.createdat DESC, C.caseid DESC, CD.stage`;

            const result = await pool.query(detailsQuery, [ids]);
            const caseUsersMap = await _fetchCaseUsers(ids);
            return res.json(_mapCaseResults(result.rows, caseUsersMap));
        }

        let query = _buildBaseCaseQuery();
        const params = [];
        let paramIndex = 1;

        let whereClauses = [];

        whereClauses.push(`C.casename ILIKE $${paramIndex}`);
        params.push(`%${normalizedCaseName}%`);
        paramIndex++;

        whereClauses.push(`U.name ILIKE $${paramIndex}`);
        params.push(`%${normalizedCaseName}%`);
        paramIndex++;

        whereClauses.push(`U.companyname ILIKE $${paramIndex}`);
        params.push(`%${normalizedCaseName}%`);
        paramIndex++;

        whereClauses.push(`U.phonenumber ILIKE $${paramIndex}`);
        params.push(`%${normalizedCaseName}%`);
        paramIndex++;

        whereClauses.push(`U.email ILIKE $${paramIndex}`);
        params.push(`%${normalizedCaseName}%`);
        paramIndex++;

        whereClauses.push(`CT.casetypename ILIKE $${paramIndex}`);
        params.push(`%${normalizedCaseName}%`);
        paramIndex++;

        query += ` WHERE (${whereClauses.join(" OR ")})`;

        if (userRole !== "Admin") {
            query += ` AND C.caseid IN (SELECT caseid FROM case_users WHERE userid = $${paramIndex})`;
            params.push(userId);
            paramIndex++;
        }

        query += " ORDER BY C.createdat DESC, C.caseid DESC, CD.stage";

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No cases found with this name" });
        }
        const mappedIds = [...new Set(result.rows.map(r => r.caseid))];
        const caseUsersMap = await _fetchCaseUsers(mappedIds);
        res.json(_mapCaseResults(result.rows, caseUsersMap));

    } catch (error) {
        console.error("Error retrieving case by name:", error);
        res.status(500).json({ message: "Error retrieving case by name" });
    }
};

const addCase = async (req, res) => {
    const {
        CaseName,
        CaseTypeId,
        UserId,
        UserIds,
        CompanyName,
        CurrentStage,
        Descriptions,
        PhoneNumber,
        CustomerName,
        IsTagged,
        WhatsappGroupLink,
        CaseManager,
        CaseManagerId,
        EstimatedCompletionDate,
        LicenseExpiryDate
    } = req.body;

    // ── Validate required CaseManager ──────────────────────────────
    if (!CaseManagerId) {
        return res.status(400).json({ code: 'CASE_MANAGER_REQUIRED', message: 'יש לבחור מנהל תיק' });
    }

    // Build resolved user list: prefer UserIds array, fall back to single UserId
    const resolvedUserIds = Array.isArray(UserIds) && UserIds.length > 0
        ? [...new Set(UserIds.map(Number).filter(Boolean))]
        : (UserId ? [Number(UserId)] : []);

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const caseResult = await client.query(
            `
            INSERT INTO cases (
                casename, casetypeid, userid, companyname, currentstage,
                isclosed, istagged, whatsappgrouplink, createdat, updatedat,
                casemanager, casemanagerid, estimatedcompletiondate, licenseexpirydate
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), NOW(), $9, $10, $11, $12)
            RETURNING caseid
            `,
            [
                CaseName,
                CaseTypeId || null,
                resolvedUserIds[0] || UserId || null,
                CompanyName,
                CurrentStage || 1,
                false,
                IsTagged ? true : false,
                WhatsappGroupLink || null,
                CaseManager || null,
                CaseManagerId ? Number(CaseManagerId) || null : null,
                EstimatedCompletionDate || null,
                LicenseExpiryDate || null
            ]
        );

        const caseId = caseResult.rows[0].caseid;

        // Insert into case_users junction table for all linked clients
        for (const uid of resolvedUserIds) {
            await client.query(
                `INSERT INTO case_users (caseid, userid) VALUES ($1, $2) ON CONFLICT (caseid, userid) DO NOTHING`,
                [caseId, uid]
            );
        }

        if (Descriptions && Descriptions.length > 0) {
            const initStage = Number(CurrentStage) || 1;
            for (const [index, desc] of Descriptions.entries()) {
                // Stages before the current stage are "past" and get today's date.
                // The current stage (index === initStage - 1) also gets today's date.
                // Future stages get null.
                const isPastOrCurrent = index < initStage;
                await client.query(
                    `
                    INSERT INTO casedescriptions (caseid, stage, text, timestamp, isnew)
                    VALUES ($1, $2, $3, $4, $5)
                    `,
                    [
                        caseId,
                        desc.Stage,
                        desc.Text,
                        isPastOrCurrent ? new Date() : null,
                        index === initStage - 1 ? true : false
                    ]
                );
            }
        }

        await client.query('COMMIT');

        // ── Notify linked users (ONE message per user, regardless of stage) ──
        const createdCfg = await getChannelConfig('CASE_CREATED');
        const shouldNotifyCreated = createdCfg.push_enabled || createdCfg.email_enabled || createdCfg.sms_enabled;

        const linkedUsers = resolvedUserIds.length > 0
            ? (await pool.query(
                `SELECT userid AS "UserId", name AS "Name", phonenumber AS "PhoneNumber" FROM users WHERE userid = ANY($1::int[])`,
                [resolvedUserIds]
            )).rows
            : [];

        const domain = await getWebsiteDomain();
        const websiteUrl = `https://${domain}`;
        const initStageNum = Number(CurrentStage) || 1;
        const initStageName = (Descriptions && initStageNum > 0 && Descriptions[initStageNum - 1]?.Text) || '';
        const createdSmsTemplate = await getSetting('templates', 'CASE_CREATED_SMS',
            'היי {{recipientName}}, תיק {{caseName}} נוצר, היכנס לאתר למעקב. {{websiteUrl}}');

        if (shouldNotifyCreated) {
            for (const u of linkedUsers) {
                const recipientName = u.Name || CustomerName || '';
                const notificationTitle = "תיק חדש נוצר";
                const notificationMessage = initStageNum > 1 && initStageName
                    ? `תיק "${CaseName}" נוצר בהצלחה ונמצא בשלב - ${initStageName}. היכנס לאתר או לאפליקציה למעקב.`
                    : `תיק "${CaseName}" נוצר בהצלחה. היכנס לאתר או לאפליקציה למעקב.`;
                const smsBody = renderTemplate(createdSmsTemplate, { recipientName, caseName: CaseName, stageName: initStageName, websiteUrl });

                await notifyRecipient({
                    recipientUserId: u.UserId,
                    recipientPhone: u.PhoneNumber || PhoneNumber,
                    notificationType: 'CASE_UPDATE',
                    push: {
                        title: notificationTitle,
                        body: notificationMessage,
                        data: { caseId: String(caseId) },
                    },
                    email: {
                        campaignKey: 'CASE_UPDATE',
                        contactFields: {
                            recipient_name: String(recipientName).trim(),
                            case_title: String(CaseName || '').trim(),
                            action_url: websiteUrl,
                        },
                    },
                    sms: {
                        messageBody: smsBody,
                    },
                });
            }
        }

        // Notify case manager if not already notified as a linked user
        const notifiedCreateIds = new Set(linkedUsers.map(u => u.UserId));
        const mgrCreatedSms = renderTemplate(createdSmsTemplate, { recipientName: 'מנהל תיק', caseName: CaseName, stageName: initStageName, websiteUrl });
        const mgrCreatedMsg = initStageNum > 1 && initStageName
            ? `תיק "${CaseName}" נוצר בהצלחה ונמצא בשלב - ${initStageName}. היכנס לאתר או לאפליקציה למעקב.`
            : `תיק "${CaseName}" נוצר בהצלחה. היכנס לאתר או לאפליקציה למעקב.`;
        await notifyCaseManager({
            caseId,
            caseName: CaseName,
            title: 'תיק חדש נוצר',
            message: mgrCreatedMsg,
            smsBody: mgrCreatedSms,
            alreadyNotifiedUserIds: notifiedCreateIds,
            changedTypes: ['CASE_CREATED'],
        });

        res.status(201).json({ message: "Case created successfully", caseId });

    } catch (error) {
        console.error("Error creating case:", error);
        if (client) {
            await client.query('ROLLBACK');
        }
        const isProd = String(process.env.NODE_ENV || "").toLowerCase() === "production";
        res.status(500).json({
            message: "Error creating case",
            ...(isProd
                ? null
                : {
                    details: error?.message,
                    code: error?.code,
                })
        });
    } finally {
        if (client) {
            client.release();
        }
    }
};

const updateCase = async (req, res) => {
    const caseId = requireInt(req, res, { source: 'params', name: 'caseId' });
    if (caseId === null) return;
    const { CaseName, CurrentStage, IsClosed, IsTagged, Descriptions, PhoneNumber, CustomerName, CompanyName, CaseTypeId, UserId, UserIds, CaseManager, CaseManagerId, CaseTypeName, EstimatedCompletionDate, LicenseExpiryDate } = req.body;

    // Build resolved user list: prefer UserIds array, fall back to single UserId
    const resolvedUserIds = Array.isArray(UserIds) && UserIds.length > 0
        ? [...new Set(UserIds.map(Number).filter(Boolean))]
        : (UserId ? [Number(UserId)] : []);

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        // ── Fetch old case data for change detection ──
        const oldCaseResult = await client.query(
            `SELECT casename, currentstage, isclosed, istagged, companyname, casetypeid,
                    casemanagerid, casetypename, estimatedcompletiondate, licenseexpirydate
             FROM cases WHERE caseid = $1`,
            [caseId]
        );
        const oldCase = oldCaseResult.rows[0];

        const toDateStr = (v) => v ? new Date(v).toISOString().slice(0, 10) : null;
        const oldManagerId = oldCase?.casemanagerid ? Number(oldCase.casemanagerid) : null;
        const newManagerId = CaseManagerId ? Number(CaseManagerId) || null : null;
        const managerChanged = oldManagerId !== newManagerId;

        const oldEstDate = toDateStr(oldCase?.estimatedcompletiondate);
        const newEstDate = toDateStr(EstimatedCompletionDate);
        const estDateChanged = oldEstDate !== newEstDate;

        const oldLicDate = toDateStr(oldCase?.licenseexpirydate);
        const newLicDate = toDateStr(LicenseExpiryDate);
        const licDateChanged = oldLicDate !== newLicDate;

        // Check if substantive (client-facing) fields changed
        const stageChanged = oldCase && String(oldCase.currentstage ?? '') !== String(CurrentStage ?? '');
        const closedChanged = oldCase && Boolean(oldCase.isclosed) !== Boolean(IsClosed);
        const nameChanged = oldCase && (oldCase.casename ?? '') !== (CaseName ?? '');
        const typeChanged = oldCase && oldCase.casetypeid != null && CaseTypeId != null && Number(oldCase.casetypeid) !== Number(CaseTypeId);
        const companyChanged = oldCase && (oldCase.companyname ?? '') !== (CompanyName ?? '');

        await client.query(
            `
            UPDATE cases
            SET casename = $1,
                currentstage = $2,
                isclosed = $3,
                istagged = $4,
                companyname = $5,
                casetypeid = COALESCE($6, casetypeid),
                userid = $7,
                casemanager = $8,
                casemanagerid = $9,
                casetypename = $10,
                estimatedcompletiondate = $11,
                licenseexpirydate = $12,
                updatedat = NOW()
            WHERE caseid = $13
            `,
            [CaseName, CurrentStage, IsClosed, IsTagged, CompanyName, CaseTypeId, resolvedUserIds[0] || UserId, CaseManager || null, CaseManagerId ? Number(CaseManagerId) || null : null, CaseTypeName, EstimatedCompletionDate || null, LicenseExpiryDate || null, caseId]
        );

        // Sync case_users junction table
        if (resolvedUserIds.length > 0) {
            // Remove users no longer linked
            await client.query(
                `DELETE FROM case_users WHERE caseid = $1 AND userid != ALL($2::int[])`,
                [caseId, resolvedUserIds]
            );
            // Insert new links (ON CONFLICT ignores existing)
            for (const uid of resolvedUserIds) {
                await client.query(
                    `INSERT INTO case_users (caseid, userid) VALUES ($1, $2) ON CONFLICT (caseid, userid) DO NOTHING`,
                    [caseId, uid]
                );
            }
        }

        if (Descriptions && Descriptions.length > 0) {
            // Collect IDs of descriptions the client still has
            const keptIds = Descriptions
                .filter((d) => d.DescriptionId)
                .map((d) => d.DescriptionId);

            // Delete descriptions that were removed on the client
            if (keptIds.length > 0) {
                await client.query(
                    `DELETE FROM casedescriptions WHERE caseid = $1 AND descriptionid != ALL($2::int[])`,
                    [caseId, keptIds]
                );
            } else {
                // All existing descriptions were removed (shouldn't normally happen)
                await client.query(
                    `DELETE FROM casedescriptions WHERE caseid = $1`,
                    [caseId]
                );
            }

            for (const desc of Descriptions) {
                if (desc.DescriptionId) {
                    // Update existing description
                    await client.query(
                        `
                        UPDATE casedescriptions
                        SET stage = $1,
                            text = $2,
                            timestamp = $3,
                            isnew = $4
                        WHERE descriptionid = $5 AND caseid = $6
                        `,
                        [desc.Stage, desc.Text, desc.Timestamp ? new Date(desc.Timestamp) : null, desc.IsNew ? true : false, desc.DescriptionId, caseId]
                    );
                } else {
                    // Insert new description (added via "הוסף שלב")
                    await client.query(
                        `
                        INSERT INTO casedescriptions (caseid, stage, text, timestamp, isnew)
                        VALUES ($1, $2, $3, $4, $5)
                        `,
                        [caseId, desc.Stage, desc.Text, desc.Timestamp ? new Date(desc.Timestamp) : null, desc.IsNew ? true : false]
                    );
                }
            }
        }

        await client.query('COMMIT');

        // ── Notify linked users (ONE message per user with current stage) ──
        const stageName = (Descriptions && CurrentStage && Descriptions[CurrentStage - 1]?.Text) || '';
        const notificationTitle = "עדכון תיק";
        const domain = await getWebsiteDomain();
        const websiteUrl = `https://${domain}`;

        // ── Per-field notification gating via channel config ──
        const changedTypes = [];
        if (nameChanged) changedTypes.push('CASE_NAME_CHANGE');
        if (typeChanged) changedTypes.push('CASE_TYPE_CHANGE');
        if (stageChanged) changedTypes.push('CASE_STAGE_CHANGE');
        if (closedChanged) changedTypes.push(IsClosed ? 'CASE_CLOSED' : 'CASE_REOPENED');
        if (managerChanged) changedTypes.push('CASE_MANAGER_CHANGE');
        if (estDateChanged) changedTypes.push('CASE_EST_DATE_CHANGE');
        if (licDateChanged) changedTypes.push('CASE_LICENSE_CHANGE');
        if (companyChanged) changedTypes.push('CASE_COMPANY_CHANGE');

        let skipClientNotifications = true;
        if (changedTypes.length > 0) {
            const configs = await Promise.all(changedTypes.map(t => getChannelConfig(t)));
            skipClientNotifications = !configs.some(c => c.push_enabled || c.email_enabled || c.sms_enabled);
        }

        // Load SMS template
        const updatedSmsTemplate = await getSetting('templates', 'CASE_UPDATED_SMS',
            'היי {{recipientName}}, תיק {{caseName}} התעדכן, היכנס לאתר למעקב. {{websiteUrl}}');

        // Fetch all linked users to notify
        const linkedUsers = resolvedUserIds.length > 0
            ? (await pool.query(
                `SELECT userid AS "UserId", name AS "Name", phonenumber AS "PhoneNumber" FROM users WHERE userid = ANY($1::int[])`,
                [resolvedUserIds]
            )).rows
            : [];

        if (!skipClientNotifications) {
            for (const u of linkedUsers) {
                const recipientName = u.Name || CustomerName || '';
                const notificationMessage = stageName
                    ? `היי ${recipientName}, \n\nתיק "${CaseName}" עודכן לשלב - ${stageName}. היכנס לאתר או לאפליקציה למעקב.`
                    : `תיק "${CaseName}" עודכן. היכנס לאתר או לאפליקציה למעקב.`;
                const smsBody = renderTemplate(updatedSmsTemplate, { recipientName, caseName: CaseName, stageName, websiteUrl });

                await notifyRecipient({
                    recipientUserId: u.UserId,
                    recipientPhone: u.PhoneNumber || PhoneNumber,
                    notificationType: 'CASE_UPDATE',
                    push: {
                        title: notificationTitle,
                        body: notificationMessage,
                        data: { caseId: String(caseId) },
                    },
                    email: {
                        campaignKey: 'CASE_UPDATE',
                        contactFields: {
                            recipient_name: String(recipientName).trim(),
                            case_title: String(CaseName || '').trim(),
                            action_url: websiteUrl,
                        },
                    },
                    sms: {
                        messageBody: smsBody,
                    },
                });
            }

            // Notify case manager if not already notified as a linked user
            const notifiedUpdateIds = new Set(linkedUsers.map(u => u.UserId));
            const mgrSms = renderTemplate(updatedSmsTemplate, { recipientName: 'מנהל תיק', caseName: CaseName, stageName, websiteUrl });
            await notifyCaseManager({
                caseId,
                caseName: CaseName,
                title: notificationTitle,
                message: stageName
                    ? `תיק "${CaseName}" עודכן לשלב - ${stageName}. היכנס לאתר או לאפליקציה למעקב.`
                    : `תיק "${CaseName}" עודכן. היכנס לאתר או לאפליקציה למעקב.`,
                smsBody: mgrSms,
                alreadyNotifiedUserIds: notifiedUpdateIds,
                changedTypes,
            });
        } else {
            console.log(`[updateCase] Skipping client notifications for case ${caseId} — only admin fields changed (manager/dates)`);
        }

        res.status(200).json({ message: "Case updated successfully" });
    } catch (error) {
        console.error("Error updating case:", error);
        if (client) {
            await client.query('ROLLBACK');
        }
        res.status(500).json({ message: "שגיאה בעדכון תיק" });
    } finally {
        if (client) {
            client.release();
        }
    }
};

const updateStage = async (req, res) => {
    const caseId = requireInt(req, res, { source: 'params', name: 'caseId' });
    if (caseId === null) return;
    const { CurrentStage, IsClosed, PhoneNumber, CustomerName, Descriptions, CaseName } = req.body;

    // --- Stage validation ---
    if (CurrentStage != null) {
        const stageNum = Number(CurrentStage);
        if (!Number.isInteger(stageNum) || stageNum < 1) {
            return res.status(400).json({ message: "שלב חייב להיות מספר חיובי" });
        }
        if (Descriptions && Descriptions.length > 0 && stageNum > Descriptions.length) {
            return res.status(400).json({ message: `שלב לא יכול לחרוג ממספר השלבים (${Descriptions.length})` });
        }
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const currentData = await client.query(
            "SELECT currentstage, isclosed, userid FROM cases WHERE caseid = $1",
            [caseId]
        );

        if (currentData.rows.length === 0) {
            await client.query('ROLLBACK');
            return res.status(404).json({ message: "Case not found" });
        }

        const currentStageValue = currentData.rows[0]?.currentstage;
        const currentlyClosed = currentData.rows[0]?.isclosed;
        const caseUserId = currentData.rows[0]?.userid;

        // Prevent stage changes on already-closed cases (unless reopening)
        if (currentlyClosed && !IsClosed && CurrentStage !== undefined) {
            // Reopening — allowed
        } else if (currentlyClosed && IsClosed) {
            await client.query('ROLLBACK');
            return res.status(400).json({ message: "אין אפשרות לעדכן תיק שנסגר" });
        }

        await client.query(
            `
            UPDATE cases
            SET currentstage = $1,
                isclosed = $2,
                updatedat = NOW()
            WHERE caseid = $3
            `,
            [CurrentStage, IsClosed, caseId]
        );

        if (Descriptions && Descriptions.length > 0) {
            const stageNum = Number(CurrentStage) || 0;

            for (const desc of Descriptions) {
                // When rolling back stages, clear timestamps and IsNew on
                // descriptions that are now ahead of the current stage.
                const descStage = Number(desc.Stage) || 0;
                const isFutureStage = stageNum > 0 && descStage > stageNum;
                const timestamp = isFutureStage ? null : (desc.Timestamp ? new Date(desc.Timestamp) : null);
                const isNew = isFutureStage ? false : (desc.IsNew ? true : false);

                await client.query(
                    `
                    UPDATE casedescriptions
                    SET stage = $1,
                        text = $2,
                        timestamp = $3,
                        isnew = $4
                    WHERE descriptionid = $5 AND caseid = $6
                    `,
                    [desc.Stage, desc.Text, timestamp, isNew, desc.DescriptionId, caseId]
                );
            }
        }

        // Only notify if stage actually changed
        let notificationType = null;
        let channelType = null;
        if (CurrentStage !== currentStageValue) {
            notificationType = 'stage_changed';
            channelType = 'CASE_STAGE_CHANGE';
        }
        if (IsClosed && !currentlyClosed) {
            notificationType = 'case_closed';
            channelType = 'CASE_CLOSED';
        }
        // Notify when reopening a closed case
        if (!IsClosed && currentlyClosed) {
            notificationType = 'case_reopened';
            channelType = 'CASE_REOPENED';
        }

        if (notificationType) {
            // Check channel config for this specific change type
            const channelCfg = await getChannelConfig(channelType);
            const shouldNotifyClient = channelCfg.push_enabled || channelCfg.email_enabled || channelCfg.sms_enabled;
            // ── ONE notification per user with the current (final) stage ──
            const linkedUsersResult = await client.query(
                `SELECT U.userid AS "UserId", U.name AS "Name", U.phonenumber AS "PhoneNumber"
                 FROM case_users CU JOIN users U ON CU.userid = U.userid
                 WHERE CU.caseid = $1`,
                [caseId]
            );
            const linkedUsers = linkedUsersResult.rows;
            const domain = await getWebsiteDomain();
            const websiteUrl = `https://${domain}`;
            const currentStageName = Descriptions?.[CurrentStage - 1]?.Text || String(CurrentStage);

            // Load appropriate SMS template
            let smsTemplateKey = 'CASE_UPDATED_SMS';
            let smsTemplateDefault = 'היי {{recipientName}}, תיק {{caseName}} התעדכן, היכנס לאתר למעקב. {{websiteUrl}}';
            if (notificationType === 'stage_changed') {
                smsTemplateKey = 'CASE_STAGE_CHANGED_SMS';
                smsTemplateDefault = 'היי {{recipientName}}, בתיק {{caseName}} התעדכן שלב: {{stageName}}. היכנס לאתר למעקב. {{websiteUrl}}';
            } else if (notificationType === 'case_closed') {
                smsTemplateKey = 'CASE_CLOSED_SMS';
                smsTemplateDefault = 'היי {{recipientName}}, תיק {{caseName}} הסתיים בהצלחה. היכנס לאתר למעקב. {{websiteUrl}}';
            } else if (notificationType === 'case_reopened') {
                smsTemplateKey = 'CASE_REOPENED_SMS';
                smsTemplateDefault = 'היי {{recipientName}}, תיק {{caseName}} נפתח מחדש. היכנס לאתר למעקב. {{websiteUrl}}';
            }
            const smsTemplate = await getSetting('templates', smsTemplateKey, smsTemplateDefault);

            if (shouldNotifyClient) {
                for (const u of linkedUsers) {
                    const recipientName = u.Name || CustomerName || '';
                    let title = '';
                    let message = '';

                    if (notificationType === 'stage_changed') {
                        title = "עדכון שלב בתיק";
                        message = `היי ${recipientName}, \n\nבתיק "${CaseName}" התעדכן שלב, תיקך נמצא בשלב - ${currentStageName}, היכנס לאתר או לאפליקציה למעקב.`;
                    } else if (notificationType === 'case_closed') {
                        title = "תיק הסתיים";
                        message = `היי ${recipientName}, \n\nתיק "${CaseName}" הסתיים בהצלחה, היכנס לאתר או לאפליקציה למעקב.`;
                    } else if (notificationType === 'case_reopened') {
                        title = "תיק נפתח מחדש";
                        message = `היי ${recipientName}, \n\nתיק "${CaseName}" נפתח מחדש, היכנס לאתר או לאפליקציה למעקב.`;
                    }

                    const smsBody = renderTemplate(smsTemplate, { recipientName, caseName: CaseName, stageName: currentStageName, websiteUrl });

                    await notifyRecipient({
                        recipientUserId: u.UserId,
                        recipientPhone: u.PhoneNumber || PhoneNumber,
                        notificationType: 'CASE_UPDATE',
                        push: {
                            title,
                            body: message,
                            data: { caseId: String(caseId), stage: String(CurrentStage) },
                        },
                        email: {
                            campaignKey: 'CASE_UPDATE',
                            contactFields: {
                                recipient_name: String(recipientName).trim(),
                                case_title: String(CaseName || '').trim(),
                                action_url: websiteUrl,
                            },
                        },
                        sms: {
                            messageBody: smsBody,
                        },
                    });
                }
            }

            // Notify case manager if not already notified as a linked user
            const notifiedStageIds = new Set(linkedUsers.map(u => u.UserId));
            const mgrSmsBody = renderTemplate(smsTemplate, { recipientName: 'מנהל תיק', caseName: CaseName, stageName: currentStageName, websiteUrl });
            let mgrTitle = 'עדכון תיק';
            let mgrMessage = `תיק "${CaseName}" עודכן. היכנס לאתר או לאפליקציה למעקב.`;
            if (notificationType === 'stage_changed') {
                mgrTitle = 'עדכון שלב בתיק';
                mgrMessage = `בתיק "${CaseName}" התעדכן שלב, התיק נמצא בשלב - ${currentStageName}. היכנס לאתר או לאפליקציה למעקב.`;
            } else if (notificationType === 'case_closed') {
                mgrTitle = 'תיק הסתיים';
                mgrMessage = `תיק "${CaseName}" הסתיים בהצלחה. היכנס לאתר או לאפליקציה למעקב.`;
            } else if (notificationType === 'case_reopened') {
                mgrTitle = 'תיק נפתח מחדש';
                mgrMessage = `תיק "${CaseName}" נפתח מחדש. היכנס לאתר או לאפליקציה למעקב.`;
            }
            await notifyCaseManager({
                caseId,
                caseName: CaseName,
                title: mgrTitle,
                message: mgrMessage,
                smsBody: mgrSmsBody,
                alreadyNotifiedUserIds: notifiedStageIds,
                changedTypes: [channelType],
            });
        }

        await client.query('COMMIT');

        res.status(200).json({ message: "Stage updated successfully" });

    } catch (error) {
        console.error("Error updating stage:", error);
        if (client) {
            await client.query('ROLLBACK');
        }
        res.status(500).json({ message: "Error updating stage" });
    } finally {
        if (client) {
            client.release();
        }
    }
};

const deleteCase = async (req, res) => {
    const caseId = requireInt(req, res, { source: 'params', name: 'caseId' });
    if (caseId === null) return;

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        await client.query("DELETE FROM casedescriptions WHERE caseid = $1", [caseId]);
        const result = await client.query("DELETE FROM cases WHERE caseid = $1", [caseId]);

        await client.query('COMMIT');

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "No case found with this ID" });
        }

        res.status(200).json({ message: "Case deleted successfully" });

    } catch (error) {
        console.error("Error deleting case:", error);
        if (client) {
            await client.query('ROLLBACK');
        }
        res.status(500).json({ message: "Error deleting case" });
    } finally {
        if (client) {
            client.release();
        }
    }
};

const tagCase = async (req, res) => {
    const caseId = requireInt(req, res, { source: 'params', name: 'caseId', aliases: ['CaseId'] });
    if (caseId === null) return;
    const { IsTagged } = req.body;

    try {
        await pool.query(
            `
            UPDATE cases
            SET istagged = $1, updatedat = NOW()
            WHERE caseid = $2
            `,
            [IsTagged ? true : false, caseId]
        );

        res.status(200).json({ message: "Case Tagged successfully" });
    } catch (error) {
        console.error("Error updating case tag:", error);
        res.status(500).json({ message: "Error updating case tag" });
    }
};

const getTaggedCases = async (req, res) => {
    try {
        const userId = req.user?.UserId;
        const userRole = req.user?.Role;

        if (!userId) {
            return res.status(401).json({ message: "Unauthorized: User ID missing" });
        }

        const pagination = getPagination(req, res, { defaultLimit: 50, maxLimit: 200 });
        if (pagination === null) return;

        if (!pagination.enabled) {
            const query =
                userRole === "Admin"
                    ? `${_buildBaseCaseQuery()} WHERE C.istagged = true ORDER BY C.createdat DESC, C.caseid DESC, CD.stage;`
                    : `${_buildBaseCaseQuery()} WHERE C.istagged = true AND C.caseid IN (SELECT caseid FROM case_users WHERE userid = $1) ORDER BY C.createdat DESC, C.caseid DESC, CD.stage;`;

            const params = userRole === "Admin" ? [] : [userId];

            const result = await pool.query(query, params);
            const ids = [...new Set(result.rows.map(r => r.caseid))];
            const caseUsersMap = await _fetchCaseUsers(ids);
            return res.json(_mapCaseResults(result.rows, caseUsersMap));
        }

        const { limit, offset } = pagination;

        const idsQuery =
            userRole === 'Admin'
                ? `SELECT DISTINCT C.caseid
                   FROM cases C
                   WHERE C.istagged = true
                   ORDER BY C.createdat DESC, C.caseid DESC
                   LIMIT $1 OFFSET $2`
                : `SELECT DISTINCT C.caseid
                   FROM cases C
                   JOIN case_users CU ON C.caseid = CU.caseid
                   WHERE C.istagged = true AND CU.userid = $1
                   ORDER BY C.createdat DESC, C.caseid DESC
                   LIMIT $2 OFFSET $3`;

        const idsParams = userRole === 'Admin' ? [limit, offset] : [userId, limit, offset];
        const idsResult = await pool.query(idsQuery, idsParams);
        const ids = idsResult.rows.map((r) => r.caseid);

        if (ids.length === 0) return res.json([]);

        const detailsQuery = `${_buildBaseCaseQuery()} WHERE C.istagged = true AND C.caseid = ANY($1::int[]) ORDER BY C.createdat DESC, C.caseid DESC, CD.stage`;

        const result = await pool.query(detailsQuery, [ids]);
        const caseUsersMap = await _fetchCaseUsers(ids);
        return res.json(_mapCaseResults(result.rows, caseUsersMap));
    } catch (error) {
        console.error("Error retrieving tagged cases:", error);
        res.status(500).json({ message: "Error retrieving tagged cases" });
    }
};

const getTaggedCasesByName = async (req, res) => {
    let { caseName } = req.query;

    const normalizedCaseName = typeof caseName === 'string' ? caseName.trim() : '';

    const userId = req.user?.UserId;
    const userRole = req.user?.Role;

    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: User ID missing" });
    }

    try {
        // If empty query: return a default list so dropdowns can preload.
        if (!normalizedCaseName) {
            const pagination = getPagination(req, res, { defaultLimit: 200, maxLimit: 500 });
            if (pagination === null) return;

            const limit = pagination.enabled ? pagination.limit : 200;
            const offset = pagination.enabled ? pagination.offset : 0;

            const idsQuery =
                userRole === 'Admin'
                    ? `SELECT DISTINCT C.caseid
                       FROM cases C
                       WHERE C.istagged = true
                       ORDER BY C.createdat DESC, C.caseid DESC
                       LIMIT $1 OFFSET $2`
                    : `SELECT DISTINCT C.caseid
                       FROM cases C
                       JOIN case_users CU ON C.caseid = CU.caseid
                       WHERE C.istagged = true AND CU.userid = $1
                       ORDER BY C.createdat DESC, C.caseid DESC
                       LIMIT $2 OFFSET $3`;

            const idsParams = userRole === 'Admin' ? [limit, offset] : [userId, limit, offset];
            const idsResult = await pool.query(idsQuery, idsParams);
            const ids = idsResult.rows.map((r) => r.caseid);
            if (ids.length === 0) return res.json([]);

            const detailsQuery = `${_buildBaseCaseQuery()} WHERE C.istagged = true AND C.caseid = ANY($1::int[]) ORDER BY C.createdat DESC, C.caseid DESC, CD.stage`;

            const result = await pool.query(detailsQuery, [ids]);
            const caseUsersMap = await _fetchCaseUsers(ids);
            return res.json(_mapCaseResults(result.rows, caseUsersMap));
        }

        const params = [];
        let paramIndex = 1;

        let whereClauses = [];

        // Search in case name
        whereClauses.push(`C.casename ILIKE $${paramIndex}`);
        params.push(`%${normalizedCaseName}%`);
        paramIndex++;

        // Add more columns for tagged case search
        whereClauses.push(`U.name ILIKE $${paramIndex}`); // Assuming U is the user/customer table alias
        params.push(`%${normalizedCaseName}%`);
        paramIndex++;

        whereClauses.push(`U.companyname ILIKE $${paramIndex}`); // Assuming U is the user/customer table alias
        params.push(`%${normalizedCaseName}%`);
        paramIndex++;

        whereClauses.push(`U.phonenumber ILIKE $${paramIndex}`);
        params.push(`%${normalizedCaseName}%`);
        paramIndex++;

        whereClauses.push(`CT.casetypename ILIKE $${paramIndex}`); // Assuming CT is the case types table alias
        params.push(`%${normalizedCaseName}%`);
        paramIndex++;

        let query = `
            ${_buildBaseCaseQuery()}
            WHERE (${whereClauses.join(" OR ")})
            AND C.istagged = true
        `;

        if (userRole !== "Admin") {
            query += ` AND C.caseid IN (SELECT caseid FROM case_users WHERE userid = $${paramIndex})`;
            params.push(userId);
            paramIndex++;
        }

        query += " ORDER BY C.createdat DESC, C.caseid DESC, CD.stage";

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No tagged cases found with this name" });
        }
        const mappedIds = [...new Set(result.rows.map(r => r.caseid))];
        const caseUsersMap = await _fetchCaseUsers(mappedIds);
        res.json(_mapCaseResults(result.rows, caseUsersMap));

    } catch (error) {
        console.error("Error retrieving tagged cases by name:", error);
        res.status(500).json({ message: "Error retrieving tagged cases by name" });
    }
};

const linkWhatsappGroup = async (req, res) => {
    const caseId = requireInt(req, res, { source: 'params', name: 'caseId', aliases: ['CaseId'] });
    if (caseId === null) return;
    const { WhatsappGroupLink } = req.body;

    const raw = WhatsappGroupLink;
    const normalized = typeof raw === "string" ? raw.trim() : raw;
    const isEmpty = normalized === null || normalized === undefined || normalized === "";

    // Allow clearing the link by sending empty/null.
    if (!isEmpty) {
        // Basic URL validation: accept https? links only.
        // (We allow WhatsApp invite links like https://chat.whatsapp.com/...)
        let parsed;
        try {
            parsed = new URL(String(normalized));
        } catch {
            return res.status(400).json({ message: "WhatsappGroupLink must be a valid URL" });
        }
        if (!/^https?:$/.test(parsed.protocol)) {
            return res.status(400).json({ message: "WhatsappGroupLink must start with http(s)" });
        }
    }

    try {
        const caseDataResult = await pool.query(
            "SELECT casename, userid FROM cases WHERE caseid = $1",
            [caseId]
        );

        const caseName = caseDataResult.rows[0]?.casename;
        const caseUserId = caseDataResult.rows[0]?.userid;

        await pool.query(
            `
            UPDATE cases
            SET whatsappgrouplink = $1, updatedat = NOW()
            WHERE caseid = $2
            `,
            [isEmpty ? null : String(normalized), caseId]
        );

        if (!isEmpty) {
            // Fetch all linked users from case_users
            const linkedUsersResult = await pool.query(
                `SELECT U.userid AS "UserId", U.name AS "Name", U.phonenumber AS "PhoneNumber"
                 FROM case_users CU JOIN users U ON CU.userid = U.userid
                 WHERE CU.caseid = $1`,
                [caseId]
            );

            for (const u of linkedUsersResult.rows) {
                const msg = `קבוצת וואטסאפ קושרה לתיק "${caseName}".`;
                await notifyRecipient({
                    recipientUserId: u.UserId,
                    notificationType: 'CASE_UPDATE',
                    push: {
                        title: 'קבוצת וואטסאפ מקושרת',
                        body: msg,
                        data: { caseId: String(caseId), type: 'whatsapp_group_linked' },
                    },
                    email: {
                        campaignKey: 'CASE_UPDATE',
                        contactFields: {
                            case_title: String(caseName || '').trim(),
                            action_url: String(normalized || '').trim(),
                            recipient_name: String(u.Name || '').trim(),
                        },
                    },
                    sms: {
                        messageBody: `${msg}\n${String(normalized || '').trim()}`,
                    },
                });
            }

            // Notify case manager if not already notified as a linked user
            const notifiedWaIds = new Set(linkedUsersResult.rows.map(u => u.UserId));
            await notifyCaseManager({
                caseId,
                caseName,
                title: 'קבוצת וואטסאפ מקושרת',
                message: `קבוצת וואטסאפ קושרה לתיק "${caseName}".`,
                smsBody: `קבוצת וואטסאפ קושרה לתיק "${caseName}".\n${String(normalized || '').trim()}`,
                alreadyNotifiedUserIds: notifiedWaIds,
            });
        }

        res.status(200).json({ message: "Whatsapp group link updated successfully" });
    } catch (error) {
        console.error("Error linking Whatsapp group:", error);
        res.status(500).json({ message: "Error linking Whatsapp group" });
    }
};

const getMyCases = async (req, res) => {
    const userId = req.user?.UserId;
    const role = req.user?.Role;

    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: User ID missing" });
    }

    if (role !== 'Admin' && role !== 'Lawyer') {
        return res.status(403).json({ message: "Forbidden", code: 'FORBIDDEN' });
    }

    try {
        const pagination = getPagination(req, res, { defaultLimit: 50, maxLimit: 200 });
        if (pagination === null) return;

        if (!pagination.enabled) {
            const query = `${_buildBaseCaseQuery()} WHERE C.casemanagerid = $1 ORDER BY C.createdat DESC, C.caseid DESC, CD.stage`;
            const result = await pool.query(query, [userId]);
            const ids = [...new Set(result.rows.map(r => r.caseid))];
            const caseUsersMap = await _fetchCaseUsers(ids);
            return res.json(_mapCaseResults(result.rows, caseUsersMap));
        }

        const { limit, offset } = pagination;

        const idsQuery = `SELECT DISTINCT C.caseid
                  FROM cases C
                  WHERE C.casemanagerid = $1
                  ORDER BY C.createdat DESC, C.caseid DESC
                  LIMIT $2 OFFSET $3`;

        const idsResult = await pool.query(idsQuery, [userId, limit, offset]);
        const ids = idsResult.rows.map((r) => r.caseid);
        if (ids.length === 0) return res.json([]);

        const detailsQuery = `${_buildBaseCaseQuery()} WHERE C.caseid = ANY($1::int[]) AND C.casemanagerid = $2 ORDER BY C.createdat DESC, C.caseid DESC, CD.stage`;
        const result = await pool.query(detailsQuery, [ids, userId]);
        const caseUsersMap = await _fetchCaseUsers(ids);
        return res.json(_mapCaseResults(result.rows, caseUsersMap));
    } catch (error) {
        console.error("Error retrieving my cases:", error);
        return res.status(500).json({ message: "Error retrieving my cases" });
    }
};

module.exports = {
    getCases,
    getMyCases,
    getCaseById,
    getCaseByName,
    addCase,
    updateCase,
    updateStage,
    deleteCase,
    tagCase,
    getTaggedCases,
    getTaggedCasesByName,
    linkWhatsappGroup,
};