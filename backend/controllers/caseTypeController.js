const { sql, connectDb } = require("../config/db");

const getCaseTypes = async (req, res) => {
    try {
        const userId = req.user?.UserId;
        const userRole = req.user?.Role;

        const pool = await connectDb();

        let query = `
            SELECT
                CT.CaseTypeId,
                CT.CaseTypeName,
                CT.NumberOfStages,
                CD.CaseTypeDescriptionId,
                CD.Stage,
                CD.Text
            FROM CaseTypes CT
            LEFT JOIN CaseTypeDescriptions CD ON CT.CaseTypeId = CD.CaseTypeId
        `;

        if (userRole !== "Admin") {
            query += `
                WHERE CT.CaseTypeId IN (
                    SELECT DISTINCT C.CaseTypeId
                    FROM Cases C
                    WHERE C.UserId = @userId
                )
            `;
        }

        query += " ORDER BY CT.CaseTypeId, CD.Stage";

        const result = await pool.request()
            .input("userId", sql.Int, userId)
            .query(query);

        const caseTypesMap = new Map();

        result.recordset.forEach(row => {
            if (!caseTypesMap.has(row.CaseTypeId)) {
                caseTypesMap.set(row.CaseTypeId, {
                    CaseTypeId: row.CaseTypeId,
                    CaseTypeName: row.CaseTypeName,
                    NumberOfStages: row.NumberOfStages,
                    Descriptions: []
                });
            }

            if (row.CaseTypeDescriptionId) {
                caseTypesMap.get(row.CaseTypeId).Descriptions.push({
                    CaseTypeDescriptionId: row.CaseTypeDescriptionId,
                    Stage: row.Stage,
                    Text: row.Text
                });
            }
        });

        res.json(Array.from(caseTypesMap.values()));

    } catch (error) {
        console.error("Error retrieving case types:", error);
        res.status(500).json({ message: "Error retrieving case types" });
    }
};

const getCaseTypesForFilter = async (req, res) => {
    try {
        const userId = req.user?.UserId;
        const userRole = req.user?.Role;

        const pool = await connectDb();

        let query = `
            SELECT DISTINCT CT.CaseTypeName
            FROM CaseTypes CT
        `;

        if (userRole !== "Admin") {
            query += `
                WHERE CT.CaseTypeId IN (
                    SELECT DISTINCT C.CaseTypeId
                    FROM Cases C
                    WHERE C.UserId = @userId
                )
            `;
        }

        query += " ORDER BY CT.CaseTypeName";

        const result = await pool.request()
            .input("userId", sql.Int, userId)
            .query(query);

        const caseTypeNames = result.recordset.map(row => row.CaseTypeName);

        res.json(caseTypeNames);

    } catch (error) {
        console.error("Error retrieving case type names for filter:", error);
        res.status(500).json({ message: "Error retrieving case type names" });
    }
};

const getCaseTypeById = async (req, res) => {
    const { caseTypeId } = req.params;
    try {
        const pool = await connectDb();
        const request = pool.request();
        request.input("caseTypeId", sql.Int, caseTypeId);

        const result = await request.query(`SELECT * FROM CaseTypes WHERE CaseTypeId = @caseTypeId`);
        res.json(result.recordset[0]);
    } catch (error) {
        console.error("Error retrieving case type by ID:", error);
        res.status(500).json({ message: "Error retrieving case type by ID" });
    }
};

const getCaseTypeByName = async (req, res) => {
    const { caseTypeName } = req.query;

    if (!caseTypeName || caseTypeName.trim() === "") {
        return res.status(400).json({ message: "Case type name is required" });
    }

    try {
        const pool = await connectDb();
        const result = await pool.request()
            .input("caseTypeName", sql.NVarChar, `%${caseTypeName}%`) // Ensure Hebrew support
            .query(`
                SELECT
                    ct.CaseTypeId,
                    ct.CaseTypeName,
                    ct.NumberOfStages,
                    cd.CaseTypeDescriptionId,
                    cd.Stage,
                    cd.Text
                FROM CaseTypes ct
                LEFT JOIN CaseTypeDescriptions cd ON ct.CaseTypeId = cd.CaseTypeId
                WHERE ct.CaseTypeName LIKE @caseTypeName
                ORDER BY cd.Stage
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No case type found" });
        }

        const caseTypesMap = new Map();

        result.recordset.forEach(row => {
            if (!caseTypesMap.has(row.CaseTypeId)) {
                caseTypesMap.set(row.CaseTypeId, {
                    CaseTypeId: row.CaseTypeId,
                    CaseTypeName: row.CaseTypeName,
                    NumberOfStages: row.NumberOfStages,
                    Descriptions: []
                });
            }

            if (row.CaseTypeDescriptionId) {
                caseTypesMap.get(row.CaseTypeId).Descriptions.push({
                    CaseTypeDescriptionId: row.CaseTypeDescriptionId,
                    Stage: row.Stage,
                    Text: row.Text
                });
            }
        });

        // Convert the Map to an array and return
        res.json(Array.from(caseTypesMap.values())); // Return only one object
    } catch (error) {
        console.error("Error retrieving case type by name:", error);
        res.status(500).json({ message: "Error retrieving case type" });
    }
};

const deleteCaseType = async (req, res) => {
    const { CaseTypeId } = req.params;

    if (!CaseTypeId) {
        return res.status(400).json({ message: "CaseTypeId is required for deletion" });
    }

    try {
        const pool = await connectDb();
        const request = pool.request();

        request.input("CaseTypeId", sql.Int, CaseTypeId);

        await request.query(`
            DELETE FROM UploadedFiles WHERE CaseId IN (SELECT CaseId FROM Cases WHERE CaseTypeId = @CaseTypeId);
            DELETE FROM CaseDescriptions WHERE CaseId IN (SELECT CaseId FROM Cases WHERE CaseTypeId = @CaseTypeId);
            DELETE FROM CaseTypeDescriptions WHERE CaseTypeId = @CaseTypeId;
            DELETE FROM Cases WHERE CaseTypeId = @CaseTypeId;
        `);

        const result = await request.query("DELETE FROM CaseTypes WHERE CaseTypeId = @CaseTypeId");

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Case type not found or already deleted" });
        }

        res.status(200).json({ message: "Case type deleted successfully" });
    } catch (error) {
        console.error("Error deleting case type:", error);
        res.status(500).json({ message: "Error deleting case type" });
    }
};

const addCaseType = async (req, res) => {
    const { CaseTypeName, NumberOfStages, Descriptions = [] } = req.body;

    try {
        const pool = await connectDb();
        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        const caseTypeRequest = new sql.Request(transaction);
        caseTypeRequest.input("CaseTypeName", sql.NVarChar, CaseTypeName);
        caseTypeRequest.input("NumberOfStages", sql.Int, NumberOfStages);

        const caseTypeResult = await caseTypeRequest.query(`
            INSERT INTO CaseTypes (CaseTypeName, NumberOfStages)
            OUTPUT INSERTED.CaseTypeId
            VALUES (@CaseTypeName, @NumberOfStages)
        `);

        const CaseTypeId = caseTypeResult.recordset[0].CaseTypeId;

        if (Descriptions.length > 0) {
            for (const desc of Descriptions) {
                const descRequest = new sql.Request(transaction);
                descRequest.input("CaseTypeId", sql.Int, CaseTypeId);
                descRequest.input("Stage", sql.Int, desc.Stage);
                descRequest.input("Text", sql.NVarChar, desc.Text);

                await descRequest.query(`
                    INSERT INTO CaseTypeDescriptions (CaseTypeId, Stage, Text)
                    VALUES (@CaseTypeId, @Stage, @Text)
                `);
            }
        }

        await transaction.commit();

        res.status(201).json({ message: "Case type created successfully", CaseTypeId });
    } catch (error) {
        console.error("Error creating case type:", error);
        res.status(500).json({ message: "Error creating case type" });
    }
};

const updateCaseType = async (req, res) => {
    const { caseTypeId } = req.params;
    const { CaseTypeName, NumberOfStages, Descriptions = [] } = req.body;

    const caseTypeIdInt = parseInt(caseTypeId, 10);

    if (isNaN(caseTypeIdInt)) {
        return res.status(400).json({ message: "Invalid CaseTypeId" });
    }

    let transaction;
    try {
        const pool = await connectDb();
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        const updateCaseTypeRequest = new sql.Request(transaction);
        updateCaseTypeRequest.input("caseTypeId", sql.Int, caseTypeIdInt);
        updateCaseTypeRequest.input("CaseTypeName", sql.NVarChar, CaseTypeName);
        updateCaseTypeRequest.input("NumberOfStages", sql.Int, NumberOfStages);

        await updateCaseTypeRequest.query(`
            UPDATE CaseTypes
            SET CaseTypeName = @CaseTypeName, NumberOfStages = @NumberOfStages
            WHERE CaseTypeId = @caseTypeId
        `);

        const existingDescriptionsResult = await pool.request()
            .input("caseTypeId", sql.Int, caseTypeIdInt)
            .query("SELECT CaseTypeDescriptionId, Stage FROM CaseTypeDescriptions WHERE CaseTypeId = @caseTypeId");

        const existingDescriptionsMap = new Map(existingDescriptionsResult.recordset.map(desc => [desc.Stage, desc.CaseTypeDescriptionId]));

        for (const desc of Descriptions) {
            const descRequest = new sql.Request(transaction);
            descRequest.input("caseTypeId", sql.Int, caseTypeIdInt);
            descRequest.input("stage", sql.Int, desc.Stage);
            descRequest.input("text", sql.NVarChar, desc.Text);

            if (existingDescriptionsMap.has(desc.Stage)) {
                descRequest.input("CaseTypeDescriptionId", sql.Int, existingDescriptionsMap.get(desc.Stage));
                await descRequest.query(`
                    UPDATE CaseTypeDescriptions
                    SET Text = @text
                    WHERE CaseTypeDescriptionId = @CaseTypeDescriptionId
                `);
            } else {
                await descRequest.query(`
                    INSERT INTO CaseTypeDescriptions (CaseTypeId, Stage, Text)
                    VALUES (@caseTypeId, @stage, @text)
                `);
            }
        }

        const deleteUnUsedDescriptions = new sql.Request(transaction);
        await deleteUnUsedDescriptions
            .input("caseTypeId", sql.Int, caseTypeIdInt)
            .input("numberOfStages", sql.Int, NumberOfStages)
            .query(`
                    DELETE FROM CaseTypeDescriptions
                    WHERE CaseTypeId = @caseTypeId AND Stage > @numberOfStages
                `);


        await transaction.commit();
        res.status(200).json({ message: "Case type updated successfully" });

    } catch (error) {
        console.error("Error updating case type:", error);

        if (transaction) {
            try {
                await transaction.rollback();
            } catch (rollbackError) {
                console.error("Error during transaction rollback:", rollbackError);
            }
        }

        res.status(500).json({ message: "Error updating case type" });
    }
};

module.exports = {
    getCaseTypes,
    getCaseTypesForFilter,
    getCaseTypeById,
    getCaseTypeByName,
    deleteCaseType,
    addCaseType,
    updateCaseType,
};
