const { sql, connectDb } = require("../config/db");
const { formatPhoneNumber } = require("../utils/phoneUtils");
const { sendMessage, WEBSITE_DOMAIN } = require("../utils/sendMessage");

const getCases = async (req, res) => {
    const userId = req.user?.UserId;
    const userRole = req.user?.Role;

    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: User ID missing" });
    }

    try {
        const pool = await connectDb();

        let query = `
            SELECT
                C.CaseId,
                C.CaseName,
                C.CaseTypeId,
                CT.CaseTypeName,
                C.UserId,
                U.Name AS CustomerName,
                U.Email AS CustomerMail,
                U.PhoneNumber,
                C.CompanyName,
                C.CurrentStage,
                C.IsClosed,
                C.IsTagged,
                C.CreatedAt,
                C.UpdatedAt,
                C.WhatsappGroupLink,
                CD.DescriptionId,
                CD.Stage,
                CD.Text,
                CD.Timestamp,
                CD.IsNew
            FROM Cases C
            LEFT JOIN Users U ON C.UserId = U.UserId
            LEFT JOIN CaseTypes CT ON C.CaseTypeId = CT.CaseTypeId
            LEFT JOIN CaseDescriptions CD ON C.CaseId = CD.CaseId
        `;

        if (userRole !== "Admin") {
            query += " WHERE C.UserId = @userId";
        }

        query += " ORDER BY C.CaseId, CD.Stage";

        const result = await pool.request().input("userId", sql.Int, userId).query(query);

        const casesMap = new Map();

        result.recordset.forEach(row => {
            if (!casesMap.has(row.CaseId)) {
                casesMap.set(row.CaseId, {
                    CaseId: row.CaseId,
                    CaseName: row.CaseName,
                    CaseTypeId: row.CaseTypeId,
                    CaseTypeName: row.CaseTypeName,
                    UserId: row.UserId,
                    CustomerName: row.CustomerName,
                    CustomerMail: row.CustomerMail,
                    PhoneNumber: row.PhoneNumber,
                    CompanyName: row.CompanyName,
                    WhatsappGroupLink: row.WhatsappGroupLink,
                    CurrentStage: row.CurrentStage,
                    IsClosed: row.IsClosed,
                    IsTagged: row.IsTagged,
                    CreatedAt: row.CreatedAt,
                    UpdatedAt: row.UpdatedAt,
                    Descriptions: []
                });
            }

            if (row.DescriptionId) {
                casesMap.get(row.CaseId).Descriptions.push({
                    DescriptionId: row.DescriptionId,
                    Stage: row.Stage,
                    Text: row.Text,
                    Timestamp: row.Timestamp,
                    IsNew: row.IsNew
                });
            }
        });

        res.json(Array.from(casesMap.values()));

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

        const pool = await connectDb();
        const request = pool.request();
        request.input('caseId', sql.Int, caseId);
        const result = await request.query(`SELECT * FROM Cases WHERE CaseId = @caseId`);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Case not found" });
        }

        res.json(result.recordset[0]);
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
        const pool = await connectDb();
        let query = `
            SELECT
                C.CaseId,
                C.CaseName,
                C.CaseTypeId,
                CT.CaseTypeName,
                C.UserId,
                U.Name AS CustomerName,
                U.Email AS CustomerMail,
                U.PhoneNumber,
                C.CompanyName,
                C.CurrentStage,
                C.IsClosed,
                C.IsTagged,
                C.CreatedAt,
                C.UpdatedAt,
                C.WhatsappGroupLink,
                CD.DescriptionId,
                CD.Stage,
                CD.Text,
                CD.Timestamp,
                CD.IsNew
            FROM Cases C
            LEFT JOIN Users U ON C.UserId = U.UserId
            LEFT JOIN CaseTypes CT ON C.CaseTypeId = CT.CaseTypeId
            LEFT JOIN CaseDescriptions CD ON C.CaseId = CD.CaseId
            WHERE C.CaseName LIKE @caseName
        `;

        if (userRole !== "Admin") {
            query += " AND C.UserId = @userId";
        }

        query += " ORDER BY C.CaseId, CD.Stage";

        const result = await pool.request()
            .input("caseName", sql.NVarChar, `%${caseName}%`)
            .input("userId", sql.Int, userId)
            .query(query);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No cases found with this name" });
        }

        const casesMap = new Map();

        result.recordset.forEach(row => {
            if (!casesMap.has(row.CaseId)) {
                casesMap.set(row.CaseId, {
                    CaseId: row.CaseId,
                    CaseName: row.CaseName,
                    CaseTypeId: row.CaseTypeId,
                    CaseTypeName: row.CaseTypeName,
                    UserId: row.UserId,
                    CustomerName: row.CustomerName,
                    CustomerMail: row.CustomerMail,
                    PhoneNumber: row.PhoneNumber,
                    CompanyName: row.CompanyName,
                    WhatsappGroupLink: row.WhatsappGroupLink,
                    CurrentStage: row.CurrentStage,
                    IsClosed: row.IsClosed,
                    IsTagged: row.IsTagged,
                    CreatedAt: row.CreatedAt,
                    UpdatedAt: row.UpdatedAt,
                    Descriptions: []
                });
            }

            if (row.DescriptionId) {
                casesMap.get(row.CaseId).Descriptions.push({
                    DescriptionId: row.DescriptionId,
                    Stage: row.Stage,
                    Text: row.Text,
                    Timestamp: row.Timestamp,
                    IsNew: row.IsNew
                });
            }
        });

        res.json(Array.from(casesMap.values()));

    } catch (error) {
        console.error("Error retrieving case by name:", error);
        res.status(500).json({ message: "Error retrieving case by name" });
    }
};

const addCase = async (req, res) => {
    const { CaseName, CaseTypeId, CaseTypeName, UserId, CompanyName, CurrentStage, Descriptions, IsTagged, PhoneNumber, CustomerName } = req.body;

    try {
        const pool = await connectDb();
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        const caseResult = await pool.request()
            .input("CaseName", sql.NVarChar, CaseName)
            .input("CaseTypeId", sql.Int, CaseTypeId)
            .input("CaseTypeName", sql.NVarChar, CaseTypeName)
            .input("UserId", sql.Int, UserId)
            .input("CompanyName", sql.NVarChar, CompanyName)
            .input("CurrentStage", sql.Int, CurrentStage || 1)
            .input("IsClosed", sql.Bit, 0)
            .input("IsTagged", sql.Bit, IsTagged ? 1 : 0)
            .output("InsertedCaseId", sql.Int)
            .query(`
                INSERT INTO Cases (CaseName, CaseTypeId, CaseTypeName, UserId, CompanyName, CurrentStage, IsClosed, IsTagged)
                OUTPUT INSERTED.CaseId
                VALUES (@CaseName, @CaseTypeId, @CaseTypeName, @UserId, @CompanyName, @CurrentStage, @IsClosed, @IsTagged)
            `);

        const caseId = caseResult.recordset[0].CaseId;

        if (Descriptions && Descriptions.length > 0) {
            for (const [index, desc] of Descriptions.entries()) {
                await pool.request()
                    .input("CaseId", sql.Int, caseId)
                    .input("Stage", sql.Int, desc.Stage)
                    .input("Text", sql.NVarChar, desc.Text)
                    .input("Timestamp", sql.DateTime, index === 0 ? new Date() : null)
                    .input("IsNew", sql.Bit, index === 0 ? 1 : 0)
                    .query(`
                        INSERT INTO CaseDescriptions (CaseId, Stage, Text, Timestamp, IsNew)
                        VALUES (@CaseId, @Stage, @Text, @Timestamp, @IsNew)
                    `);
            }
        }

        const formattedPhone = formatPhoneNumber(PhoneNumber);

        sendMessage(`היי ${CustomerName}, \n\n תיק ${CaseName} נוצר, היכנס לאתר למעקב. \n\n ${WEBSITE_DOMAIN}`, formattedPhone);

        await transaction.commit();
        res.status(201).json({ message: "Case created successfully", caseId });

    } catch (error) {
        console.error("Error creating case:", error);
        res.status(500).json({ message: "Error creating case" });
    }
};

const updateCase = async (req, res) => {
    const { caseId } = req.params;
    const { CaseName, CurrentStage, IsClosed, IsTagged, Descriptions, PhoneNumber, CustomerName, CompanyName, CaseTypeId, UserId } = req.body;

    try {
        const pool = await connectDb();
        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        const caseRequest = new sql.Request(transaction);
        caseRequest.input("CaseId", sql.Int, caseId);
        caseRequest.input("CaseName", sql.NVarChar, CaseName);
        caseRequest.input("CurrentStage", sql.Int, CurrentStage);
        caseRequest.input("IsClosed", sql.Bit, IsClosed);
        caseRequest.input("IsTagged", sql.Bit, IsTagged);
        caseRequest.input("CompanyName", sql.NVarChar, CompanyName);
        caseRequest.input("CaseTypeId", sql.Int, CaseTypeId);
        caseRequest.input("UserId", sql.Int, UserId);


        await caseRequest.query(`
            UPDATE Cases
            SET CaseName = @CaseName,
                CurrentStage = @CurrentStage,
                IsClosed = @IsClosed,
                IsTagged = @IsTagged,
                CompanyName = @CompanyName,
                CaseTypeId = ISNULL(@CaseTypeId, CaseTypeId),
                UserId = @UserId
            WHERE CaseId = @CaseId
        `);

        if (Descriptions && Descriptions.length > 0) {
            for (const desc of Descriptions) {
                const descRequest = new sql.Request(transaction);
                descRequest.input("DescriptionId", sql.Int, desc.DescriptionId);
                descRequest.input("CaseId", sql.Int, caseId);
                descRequest.input("Stage", sql.Int, desc.Stage);
                descRequest.input("Text", sql.NVarChar, desc.Text);
                descRequest.input("Timestamp", sql.DateTime, desc.Timestamp ? new Date(desc.Timestamp) : null);
                descRequest.input("IsNew", sql.Bit, desc.IsNew ? 1 : 0);

                await descRequest.query(`
                        UPDATE CaseDescriptions
                        SET Stage = @Stage,
                            Text = @Text,
                            Timestamp = @Timestamp,
                            IsNew = @IsNew
                        WHERE DescriptionId = @DescriptionId AND CaseId = @CaseId
                    `);
            }
        }

        const formattedPhone = formatPhoneNumber(PhoneNumber);

        sendMessage(`היי ${CustomerName}, \n\n תיק ${CaseName} התעדכן, היכנס לאתר למעקב. \n\n ${WEBSITE_DOMAIN}`, formattedPhone);

        await transaction.commit();
        res.status(200).json({ message: "Case updated successfully" });
    } catch (error) {
        console.error("Error updating case:", error);
        res.status(500).json({ message: "שגיאה בעדכון תיק" });
    }
};

const updateStage = async (req, res) => {
    const { caseId } = req.params;
    const { CurrentStage, IsClosed, PhoneNumber, CustomerName, Descriptions, CaseName } = req.body;
    let notificationMessage = "";

    try {
        const pool = await connectDb();

        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        const currentData = await pool.request()
            .input("CaseId", sql.Int, caseId)
            .query("SELECT CurrentStage, IsClosed FROM Cases WHERE CaseId = @CaseId");

        const currentStage = currentData.recordset[0]?.CurrentStage;
        const currentlyClosed = currentData.recordset[0]?.IsClosed;

        await pool.request()
            .input("CaseId", sql.Int, caseId)
            .input("CurrentStage", sql.Int, CurrentStage)
            .input("IsClosed", sql.Bit, IsClosed)
            .query(`
                UPDATE Cases
                SET CurrentStage = @CurrentStage,
                    IsClosed = @IsClosed
                WHERE CaseId = @CaseId
            `);

        if (Descriptions && Descriptions.length > 0) {
            for (const desc of Descriptions) {
                const descRequest = new sql.Request(transaction);
                descRequest.input("DescriptionId", sql.Int, desc.DescriptionId);
                descRequest.input("CaseId", sql.Int, caseId);
                descRequest.input("Stage", sql.Int, desc.Stage);
                descRequest.input("Text", sql.NVarChar, desc.Text);
                descRequest.input("Timestamp", sql.DateTime, desc.Timestamp ? new Date(desc.Timestamp) : null);
                descRequest.input("IsNew", sql.Bit, desc.IsNew ? 1 : 0);

                await descRequest.query(`
                        UPDATE CaseDescriptions
                        SET Stage = @Stage,
                            Text = @Text,
                            Timestamp = @Timestamp,
                            IsNew = @IsNew
                        WHERE DescriptionId = @DescriptionId AND CaseId = @CaseId
                    `);
            }
        }

        if (CurrentStage !== currentStage) {
            notificationMessage = `היי ${CustomerName}, \n\n בתיק ${CaseName} התעדכן שלב, תיקך נמצא בשלב - ${Descriptions[currentStage - 1]}, היכנס לאתר למעקב. \n\n ${WEBSITE_DOMAIN}`;
        }
        if (IsClosed && !currentlyClosed) {
            notificationMessage = `היי ${CustomerName}, \n\n תיק ${CaseName} הסתיים בהצלחה, היכנס לאתר למעקב. \n\n ${WEBSITE_DOMAIN}`;
        }

        if (notificationMessage) {
            const formattedPhone = formatPhoneNumber(PhoneNumber);
            sendMessage(notificationMessage, formattedPhone);
        }

        await transaction.commit();

        res.status(200).json({ message: "Stage updated successfully" });

    } catch (error) {
        console.error("Error updating stage:", error);
        res.status(500).json({ message: "Error updating stage" });
    }
};

const deleteCase = async (req, res) => {
    const { caseId } = req.params;

    try {
        const pool = await connectDb();
        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        await transaction.request()
            .input("caseId", sql.Int, caseId)
            .query("DELETE FROM CaseDescriptions WHERE CaseId = @caseId");

        const result = await transaction.request()
            .input("caseId", sql.Int, caseId)
            .query("DELETE FROM Cases WHERE CaseId = @caseId");

        await transaction.commit();

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "No case found with this ID" });
        }

        res.status(200).json({ message: "Case deleted successfully" });

    } catch (error) {
        console.error("Error deleting case:", error);
        res.status(500).json({ message: "Error deleting case" });
    }
};

const tagCase = async (req, res) => {
    const { CaseId } = req.params;
    const { IsTagged } = req.body;

    try {
        const pool = await connectDb();
        const request = pool.request();
        request.input("CaseId", sql.Int, CaseId);
        request.input("IsTagged", sql.Bit, IsTagged);

        await request.query(`
            UPDATE Cases
            SET IsTagged = @IsTagged
            WHERE CaseId = @CaseId
        `);

        res.status(200).json({ message: "Case Tagged successfully" });
    } catch (error) {
        console.error("Error updating case tag:", error);
        res.status(500).json({ message: "Error updating case tag" });
    }
};

const getTaggedCases = async (req, res) => {
    try {
        const pool = await connectDb();
        const result = await pool.request().query(`
                SELECT
                    C.CaseId,
                    C.CaseName,
                    C.CaseTypeId,
                    CT.CaseTypeName,
                    C.UserId,
                    U.Name AS CustomerName,
                    U.Email AS CustomerMail,
                    U.PhoneNumber,
                    C.CompanyName,
                    C.CurrentStage,
                    C.IsClosed,
                    C.IsTagged,
                    C.CreatedAt,
                    C.UpdatedAt,
                    C.WhatsappGroupLink,
                    CD.DescriptionId,
                    CD.Stage,
                    CD.Text,
                    CD.Timestamp,
                    CD.IsNew
                FROM Cases C
                LEFT JOIN Users U ON C.UserId = U.UserId
                LEFT JOIN CaseTypes CT ON C.CaseTypeId = CT.CaseTypeId
                LEFT JOIN CaseDescriptions CD ON C.CaseId = CD.CaseId
                WHERE C.IsTagged = 1
                ORDER BY C.CaseId, CD.Stage;
        `);

        const casesMap = new Map();

        result.recordset.forEach(row => {
            if (!casesMap.has(row.CaseId)) {
                casesMap.set(row.CaseId, {
                    CaseId: row.CaseId,
                    CaseName: row.CaseName,
                    CaseTypeId: row.CaseTypeId,
                    CaseTypeName: row.CaseTypeName,
                    UserId: row.UserId,
                    CustomerName: row.CustomerName,
                    CustomerMail: row.CustomerMail,
                    PhoneNumber: row.PhoneNumber,
                    CompanyName: row.CompanyName,
                    WhatsappGroupLink: row.WhatsappGroupLink,
                    CurrentStage: row.CurrentStage,
                    IsClosed: row.IsClosed,
                    IsTagged: row.IsTagged,
                    CreatedAt: row.CreatedAt,
                    UpdatedAt: row.UpdatedAt,
                    Descriptions: []
                });
            }

            if (row.DescriptionId) {
                casesMap.get(row.CaseId).Descriptions.push({
                    DescriptionId: row.DescriptionId,
                    Stage: row.Stage,
                    Text: row.Text,
                    Timestamp: row.Timestamp,
                    IsNew: row.IsNew
                });
            }
        });

        res.json(Array.from(casesMap.values()));

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
        const pool = await connectDb();
        const result = await pool
            .request()
            .input("caseName", sql.NVarChar, `%${caseName}%`)
            .query(`
                SELECT
                    C.CaseId,
                    C.CaseName,
                    C.CaseTypeId,
                    CT.CaseTypeName,
                    C.UserId,
                    U.Name AS CustomerName,
                    U.Email AS CustomerMail,
                    U.PhoneNumber,
                    C.CompanyName,
                    C.CurrentStage,
                    C.IsClosed,
                    C.IsTagged,
                    C.CreatedAt,
                    C.UpdatedAt,
                    C.WhatsappGroupLink,
                    CD.DescriptionId,
                    CD.Stage,
                    CD.Text,
                    CD.Timestamp,
                    CD.IsNew
                FROM Cases C
                LEFT JOIN Users U ON C.UserId = U.UserId
                LEFT JOIN CaseTypes CT ON C.CaseTypeId = CT.CaseTypeId
                LEFT JOIN CaseDescriptions CD ON C.CaseId = CD.CaseId
                WHERE C.CaseName LIKE @caseName
                AND C.IsTagged = 1
                ORDER BY C.CaseId, CD.Stage
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No tagged cases found with this name" });
        }

        const casesMap = new Map();

        result.recordset.forEach(row => {
            if (!casesMap.has(row.CaseId)) {
                casesMap.set(row.CaseId, {
                    CaseId: row.CaseId,
                    CaseName: row.CaseName,
                    CaseTypeId: row.CaseTypeId,
                    CaseTypeName: row.CaseTypeName,
                    UserId: row.UserId,
                    CustomerName: row.CustomerName,
                    CustomerMail: row.CustomerMail,
                    PhoneNumber: row.PhoneNumber,
                    CompanyName: row.CompanyName,
                    CurrentStage: row.CurrentStage,
                    WhatsappGroupLink: row.WhatsappGroupLink,
                    IsClosed: row.IsClosed,
                    IsTagged: row.IsTagged,
                    CreatedAt: row.CreatedAt,
                    UpdatedAt: row.UpdatedAt,
                    Descriptions: []
                });
            }

            if (row.DescriptionId) {
                casesMap.get(row.CaseId).Descriptions.push({
                    DescriptionId: row.DescriptionId,
                    Stage: row.Stage,
                    Text: row.Text,
                    Timestamp: row.Timestamp,
                    IsNew: row.IsNew
                });
            }
        });

        res.json(Array.from(casesMap.values()));

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
        const pool = await connectDb();
        const request = pool.request();
        request.input("CaseId", sql.Int, CaseId);
        request.input("WhatsappGroupLink", sql.NVarChar, WhatsappGroupLink);

        await request.query(`
            UPDATE Cases
            SET WhatsappGroupLink = @WhatsappGroupLink
            WHERE CaseId = @CaseId
        `);

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
