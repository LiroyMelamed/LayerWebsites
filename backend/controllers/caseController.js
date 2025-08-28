const pool = require("../config/db"); // Direct import of the pg pool
const { formatPhoneNumber } = require("../utils/phoneUtils");
const { sendMessage, WEBSITE_DOMAIN } = require("../utils/sendMessage");
const sendAndStoreNotification = require("../utils/sendAndStoreNotification"); // Import the new consolidated utility

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
        C.estimatedcompletiondate,
        C.licenseexpirydate,
        CD.descriptionid,
        CD.stage,
        CD.text,
        CD.timestamp,
        CD.isnew
    FROM cases C
    LEFT JOIN users U ON C.userid = U.userid
    LEFT JOIN casetypes CT ON C.casetypeid = CT.casetypeid
    LEFT JOIN casedescriptions CD ON C.caseid = CD.caseid
`;

const _mapCaseResults = (rows) => {
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
                EstimatedCompletionDate: row.estimatedcompletiondate,
                LicenseExpiryDate: row.licenseexpirydate,
                Descriptions: []
            });
        }

        if (row.descriptionid) {
            casesMap.get(caseId).Descriptions.push({
                DescriptionId: row.descriptionid,
                Stage: row.stage,
                Text: row.text,
                Timestamp: row.timestamp,
                IsNew: row.isnew
            });
        }
    });
    return Array.from(casesMap.values());
};

const getCases = async (req, res) => {
    const userId = req.user?.UserId;
    const userRole = req.user?.Role;

    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: User ID missing" });
    }

    try {
        let query = _buildBaseCaseQuery();
        const params = [];

        if (userRole !== "Admin") {
            query += " WHERE C.userid = $1";
            params.push(userId);
        }
        query += " ORDER BY C.caseid, CD.stage";

        const result = await pool.query(query, params);
        res.json(_mapCaseResults(result.rows));

    } catch (error) {
        console.error("Error retrieving cases:", error);
        res.status(500).json({ message: "Error retrieving cases" });
    }
};

const getCaseById = async (req, res) => {
    try {
        const caseId = req.params.caseId;
        if (!caseId) {
            return res.status(400).json({ message: "Invalid case ID" });
        }

        const result = await pool.query(`${_buildBaseCaseQuery()} WHERE C.caseid = $1 ORDER BY CD.stage`, [caseId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Case not found" });
        }
        res.json(_mapCaseResults(result.rows)[0]);
    } catch (error) {
        console.error("Error retrieving case by ID:", error);
        res.status(500).json({ message: "Error retrieving case by ID" });
    }
};

const getCaseByName = async (req, res) => {
    let { caseName } = req.query;

    if (!caseName || caseName.trim() === "") {
        return res.status(400).json({ message: "Case name is required for search" });
    }

    const userId = req.user?.UserId;
    const userRole = req.user?.Role;

    try {
        let query = _buildBaseCaseQuery();
        const params = [];
        let paramIndex = 1;

        let whereClauses = [];

        whereClauses.push(`C.casename ILIKE $${paramIndex}`);
        params.push(`%${caseName}%`);
        paramIndex++;

        whereClauses.push(`U.name ILIKE $${paramIndex}`);
        params.push(`%${caseName}%`);
        paramIndex++;

        whereClauses.push(`U.companyname ILIKE $${paramIndex}`);
        params.push(`%${caseName}%`);
        paramIndex++;

        whereClauses.push(`U.phonenumber ILIKE $${paramIndex}`);
        params.push(`%${caseName}%`);
        paramIndex++;

        whereClauses.push(`U.email ILIKE $${paramIndex}`);
        params.push(`%${caseName}%`);
        paramIndex++;

        whereClauses.push(`CT.casetypename ILIKE $${paramIndex}`);
        params.push(`%${caseName}%`);
        paramIndex++;

        query += ` WHERE (${whereClauses.join(" OR ")})`;

        if (userRole !== "Admin") {
            query += ` AND C.userid = $${paramIndex}`;
            params.push(userId);
            paramIndex++;
        }

        query += " ORDER BY C.caseid, CD.stage";

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No cases found with this name" });
        }
        res.json(_mapCaseResults(result.rows));

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
        CompanyName,
        CurrentStage,
        Descriptions,
        PhoneNumber,
        CustomerName,
        IsTagged,
        CaseManager,
        CaseManagerId,
        EstimatedCompletionDate,
        LicenseExpiryDate
    } = req.body;

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const caseResult = await client.query(
            `
            INSERT INTO cases (
                casename, casetypeid, userid, companyname, currentstage,
                isclosed, istagged, createdat, updatedat,
                casemanager, casemanagerid, estimatedcompletiondate, licenseexpirydate
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW(), $8, $9, $10, $11)
            RETURNING caseid
            `,
            [
                CaseName,
                CaseTypeId,
                UserId,
                CompanyName,
                CurrentStage || 1,
                false,
                IsTagged ? true : false,
                CaseManager,
                CaseManagerId,
                EstimatedCompletionDate,
                LicenseExpiryDate
            ]
        );

        const caseId = caseResult.rows[0].caseid;

        if (Descriptions && Descriptions.length > 0) {
            for (const [index, desc] of Descriptions.entries()) {
                await client.query(
                    `
                    INSERT INTO casedescriptions (caseid, stage, text, timestamp, isnew)
                    VALUES ($1, $2, $3, $4, $5)
                    `,
                    [
                        caseId,
                        desc.Stage,
                        desc.Text,
                        index === 0 ? new Date() : null,
                        index === 0 ? true : false
                    ]
                );
            }
        }

        const formattedPhone = formatPhoneNumber(PhoneNumber);
        sendMessage(`היי ${CustomerName}, \n\n תיק ${CaseName} נוצר, היכנס לאתר למעקב. \n\n ${WEBSITE_DOMAIN}`, formattedPhone);

        await client.query('COMMIT');

        await sendAndStoreNotification(UserId, "תיק חדש נוצר", `תיק "${CaseName}" נוצר בהצלחה. היכנס לאתר או לאפליקציה למעקב.`, { caseId: String(caseId) });

        res.status(201).json({ message: "Case created successfully", caseId });

    } catch (error) {
        console.error("Error creating case:", error);
        if (client) {
            await client.query('ROLLBACK');
        }
        res.status(500).json({ message: "Error creating case" });
    } finally {
        if (client) {
            client.release();
        }
    }
};

const updateCase = async (req, res) => {
    const { caseId } = req.params;
    const { CaseName, CurrentStage, IsClosed, IsTagged, Descriptions, PhoneNumber, CustomerName, CompanyName, CaseTypeId, UserId, CaseManager, CaseManagerId, CaseTypeName, EstimatedCompletionDate, LicenseExpiryDate } = req.body;

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

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
            WHERE caseid = $11
            `,
            [CaseName, CurrentStage, IsClosed, IsTagged, CompanyName, CaseTypeId, UserId, CaseManager, CaseManagerId, CaseTypeName, EstimatedCompletionDate, LicenseExpiryDate, caseId]
        );

        if (Descriptions && Descriptions.length > 0) {
            for (const desc of Descriptions) {
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
            }
        }

        const formattedPhone = formatPhoneNumber(PhoneNumber);
        sendMessage(`היי ${CustomerName}, \n\n תיק ${CaseName} התעדכן, היכנס לאתר למעקב. \n\n ${WEBSITE_DOMAIN}`, formattedPhone);

        await client.query('COMMIT');

        await sendAndStoreNotification(UserId, "עדכון תיק", `תיק "${CaseName}" עודכן. היכנס לאתר או לאפליקציה למעקב.`, { caseId: String(caseId) });

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
    const { caseId } = req.params;
    const { CurrentStage, IsClosed, PhoneNumber, CustomerName, Descriptions, CaseName } = req.body;
    let notificationMessage = "";
    let notificationTitle = "";

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const currentData = await pool.query(
            "SELECT currentstage, isclosed, userid FROM cases WHERE caseid = $1",
            [caseId]
        );

        const currentStageValue = currentData.rows[0]?.currentstage;
        const currentlyClosed = currentData.rows[0]?.isclosed;
        const caseUserId = currentData.rows[0]?.userid;

        await pool.query(
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
            for (const desc of Descriptions) {
                await pool.query(
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
            }
        }

        if (CurrentStage !== currentStageValue) {
            notificationTitle = "עדכון שלב בתיק";
            notificationMessage = `היי ${CustomerName}, \n\nבתיק "${CaseName}" התעדכן שלב, תיקך נמצא בשלב - ${Descriptions[CurrentStage - 1]?.Text || CurrentStage}, היכנס לאתר או לאפליקציה למעקב.`;
        }
        if (IsClosed && !currentlyClosed) {
            notificationTitle = "תיק הסתיים";
            notificationMessage = `היי ${CustomerName}, \n\nתיק "${CaseName}" הסתיים בהצלחה, היכנס לאתר או לאפליקציה למעקב.`;
        }

        if (notificationMessage) {
            const formattedPhone = formatPhoneNumber(PhoneNumber);
            sendMessage(notificationMessage, formattedPhone);

            if (caseUserId) {
                await sendAndStoreNotification(caseUserId, notificationTitle, notificationMessage, { caseId: String(caseId), stage: String(CurrentStage) });
            }
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
    const { caseId } = req.params;

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
    const { CaseId } = req.params;
    const { IsTagged } = req.body;

    try {
        await pool.query(
            `
            UPDATE cases
            SET istagged = $1, updatedat = NOW()
            WHERE caseid = $2
            `,
            [IsTagged ? true : false, CaseId]
        );

        res.status(200).json({ message: "Case Tagged successfully" });
    } catch (error) {
        console.error("Error updating case tag:", error);
        res.status(500).json({ message: "Error updating case tag" });
    }
};

const getTaggedCases = async (req, res) => {
    try {
        const result = await pool.query(`
            ${_buildBaseCaseQuery()}
            WHERE C.istagged = true
            ORDER BY C.caseid, CD.stage;
        `);
        res.json(_mapCaseResults(result.rows));
    } catch (error) {
        console.error("Error retrieving tagged cases:", error);
        res.status(500).json({ message: "Error retrieving tagged cases" });
    }
};

const getTaggedCasesByName = async (req, res) => {
    let { caseName } = req.query;

    if (!caseName || caseName.trim() === "") {
        return res.status(400).json({ message: "Case name is required for search" });
    }

    try {
        const params = [];
        let paramIndex = 1;

        let whereClauses = [];

        // Search in case name
        whereClauses.push(`C.casename ILIKE $${paramIndex}`);
        params.push(`%${caseName}%`);
        paramIndex++;

        // Add more columns for tagged case search
        whereClauses.push(`U.name ILIKE $${paramIndex}`); // Assuming U is the user/customer table alias
        params.push(`%${caseName}%`);
        paramIndex++;

        whereClauses.push(`U.companyname ILIKE $${paramIndex}`); // Assuming U is the user/customer table alias
        params.push(`%${caseName}%`);
        paramIndex++;

        whereClaases.push(`U.phonenumber ILIKE $${paramIndex}`);
        params.push(`%${caseName}%`);
        paramIndex++;

        whereClauses.push(`CT.casetypename ILIKE $${paramIndex}`); // Assuming CT is the case types table alias
        params.push(`%${caseName}%`);
        paramIndex++;


        const result = await pool.query(
            `
            ${_buildBaseCaseQuery()}
            WHERE (${whereClauses.join(" OR ")})
            AND C.istagged = true
            ORDER BY C.caseid, CD.stage
            `,
            params
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No tagged cases found with this name" });
        }
        res.json(_mapCaseResults(result.rows));

    } catch (error) {
        console.error("Error retrieving tagged cases by name:", error);
        res.status(500).json({ message: "Error retrieving tagged cases by name" });
    }
};

const linkWhatsappGroup = async (req, res) => {
    const { CaseId } = req.params;
    const { WhatsappGroupLink } = req.body;

    if (!WhatsappGroupLink || !CaseId) {
        return res.status(400).json({ message: "WhatsappGroupLink and CaseId are required" });
    }

    try {
        const caseDataResult = await pool.query(
            "SELECT casename, userid FROM cases WHERE caseid = $1",
            [CaseId]
        );

        const caseName = caseDataResult.rows[0]?.casename;
        const caseUserId = caseDataResult.rows[0]?.userid;

        await pool.query(
            `
            UPDATE cases
            SET whatsappgrouplink = $1, updatedat = NOW()
            WHERE caseid = $2
            `,
            [WhatsappGroupLink, CaseId]
        );

        if (caseUserId) {
            await sendAndStoreNotification(caseUserId, "קבוצת וואטסאפ מקושרת", `קבוצת וואטסאפ קושרה לתיק "${caseName}".`, { caseId: String(CaseId) });
        }

        res.status(200).json({ message: "Whatsapp group link updated successfully" });
    } catch (error) {
        console.error("Error linking Whatsapp group:", error);
        res.status(500).json({ message: "Error linking Whatsapp group" });
    }
};

module.exports = {
    getCases,
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