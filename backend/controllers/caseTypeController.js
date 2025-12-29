const pool = require("../config/db");

const getCaseTypes = async (req, res) => {
    try {
        const userId = req.user?.UserId;
        const userRole = req.user?.Role;

        let query = `
            SELECT
                ct.casetypeid,
                ct.casetypename,
                ct.numberofstages,
                cd.casetypedescriptionid,
                cd.stage,
                cd.text
            FROM casetypes ct
            LEFT JOIN casetypedescriptions cd ON ct.casetypeid = cd.casetypeid
        `;
        const params = [];

        if (userRole !== "Admin") {
            query += `
                WHERE ct.casetypeid IN (
                    SELECT DISTINCT c.casetypeid
                    FROM cases c
                    WHERE c.userid = $1
                )
            `;
            params.push(userId);
        }

        query += " ORDER BY ct.casetypeid, cd.stage";

        const result = await pool.query(query, params);

        const caseTypesMap = new Map();

        result.rows.forEach(row => {
            const caseTypeId = row.casetypeid;
            if (!caseTypesMap.has(caseTypeId)) {
                caseTypesMap.set(caseTypeId, {
                    CaseTypeId: caseTypeId,
                    CaseTypeName: row.casetypename,
                    NumberOfStages: row.numberofstages,
                    Descriptions: []
                });
            }

            if (row.casetypedescriptionid) {
                caseTypesMap.get(caseTypeId).Descriptions.push({
                    CaseTypeDescriptionId: row.casetypedescriptionid,
                    Stage: row.stage,
                    Text: row.text
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

        let query = `
            SELECT DISTINCT ct.casetypename
            FROM casetypes ct
        `;
        const params = [];

        if (userRole !== "Admin") {
            query += `
                WHERE ct.casetypeid IN (
                    SELECT DISTINCT c.casetypeid
                    FROM cases c
                    WHERE c.userid = $1
                )
            `;
            params.push(userId);
        }

        query += " ORDER BY ct.casetypename";

        const result = await pool.query(query, params);

        const caseTypeNames = result.rows.map(row => row.casetypename);

        res.json(caseTypeNames);

    } catch (error) {
        console.error("Error retrieving case type names for filter:", error);
        res.status(500).json({ message: "Error retrieving case type names" });
    }
};

const getCaseTypeById = async (req, res) => {
    const CaseTypeId = req.params?.caseTypeId ?? req.params?.CaseTypeId;
    const caseTypeIdInt = parseInt(CaseTypeId, 10);

    if (!CaseTypeId || Number.isNaN(caseTypeIdInt)) {
        return res.status(400).json({ message: "Invalid CaseTypeId" });
    }
    try {
        const result = await pool.query(`SELECT * FROM casetypes WHERE casetypeid = $1`, [caseTypeIdInt]);
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Case type not found" });
        }
        res.json(result.rows[0]);
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
        const result = await pool.query(
            `
            SELECT
                ct.casetypeid,
                ct.casetypename,
                ct.numberofstages,
                cd.casetypedescriptionid,
                cd.stage,
                cd.text
            FROM casetypes ct
            LEFT JOIN casetypedescriptions cd ON ct.casetypeid = cd.casetypeid
            WHERE ct.casetypename ILIKE $1
            ORDER BY cd.stage
            `,
            [`%${caseTypeName}%`]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No case type found" });
        }

        const caseTypesMap = new Map();

        result.rows.forEach(row => {
            const caseTypeId = row.casetypeid;
            if (!caseTypesMap.has(caseTypeId)) {
                caseTypesMap.set(caseTypeId, {
                    CaseTypeId: caseTypeId,
                    CaseTypeName: row.casetypename,
                    NumberOfStages: row.numberofstages,
                    Descriptions: []
                });
            }

            if (row.casetypedescriptionid) {
                caseTypesMap.get(caseTypeId).Descriptions.push({
                    CaseTypeDescriptionId: row.casetypedescriptionid,
                    Stage: row.stage,
                    Text: row.text
                });
            }
        });

        res.json(Array.from(caseTypesMap.values()));
    } catch (error) {
        console.error("Error retrieving case type by name:", error);
        res.status(500).json({ message: "Error retrieving case type" });
    }
};

const deleteCaseType = async (req, res) => {
    const { CaseTypeId } = req.params;

    if (!CaseTypeId) {
        return res.status(400).json({ message: "caseTypeId is required for deletion" });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        await client.query(`DELETE FROM uploadedfiles WHERE caseid IN (SELECT caseid FROM cases WHERE casetypeid = $1)`, [CaseTypeId]);
        await client.query(`DELETE FROM casedescriptions WHERE caseid IN (SELECT caseid FROM cases WHERE casetypeid = $1)`, [CaseTypeId]);
        await client.query(`DELETE FROM cases WHERE casetypeid = $1`, [CaseTypeId]);
        await client.query(`DELETE FROM casetypedescriptions WHERE casetypeid = $1`, [CaseTypeId]);
        const result = await client.query("DELETE FROM casetypes WHERE casetypeid = $1", [CaseTypeId]);

        await client.query('COMMIT');

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Case type not found or already deleted" });
        }

        res.status(200).json({ message: "Case type deleted successfully" });
    } catch (error) {
        console.error("Error deleting case type:", error);
        if (client) {
            await client.query('ROLLBACK');
        }
        res.status(500).json({ message: "Error deleting case type" });
    } finally {
        if (client) {
            client.release();
        }
    }
};

const addCaseType = async (req, res) => {
    const { CaseTypeName, NumberOfStages, Descriptions = [] } = req.body;

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        const caseTypeResult = await client.query(
            `
            INSERT INTO casetypes (casetypename, numberofstages)
            VALUES ($1, $2)
            RETURNING casetypeid
            `,
            [CaseTypeName, NumberOfStages]
        );

        const caseTypeId = caseTypeResult.rows[0].casetypeid;

        if (Descriptions.length > 0) {
            for (const desc of Descriptions) {
                await client.query(
                    `
                    INSERT INTO casetypedescriptions (casetypeid, stage, text)
                    VALUES ($1, $2, $3)
                    `,
                    [caseTypeId, desc.Stage, desc.Text]
                );
            }
        }

        await client.query('COMMIT');

        res.status(201).json({ message: "Case type created successfully", CaseTypeId: caseTypeId });
    } catch (error) {
        console.error("Error creating case type:", error);
        if (client) {
            await client.query('ROLLBACK');
        }
        res.status(500).json({ message: "Error creating case type" });
    } finally {
        if (client) {
            client.release();
        }
    }
};

const updateCaseType = async (req, res) => {
    const { caseTypeId } = req.params;
    const { CaseTypeName, NumberOfStages, Descriptions = [] } = req.body;

    const caseTypeIdInt = parseInt(caseTypeId, 10);

    if (isNaN(caseTypeIdInt)) {
        return res.status(400).json({ message: "Invalid CaseTypeId" });
    }

    let client;
    try {
        client = await pool.connect();
        await client.query('BEGIN');

        await client.query(
            `
            UPDATE casetypes
            SET casetypename = $1, numberofstages = $2
            WHERE casetypeid = $3
            `,
            [CaseTypeName, NumberOfStages, caseTypeIdInt]
        );

        const existingDescriptionsResult = await client.query(
            "SELECT casetypedescriptionid, stage FROM casetypedescriptions WHERE casetypeid = $1",
            [caseTypeIdInt]
        );

        const existingDescriptionsMap = new Map(existingDescriptionsResult.rows.map(desc => [desc.stage, desc.casetypedescriptionid]));

        for (const desc of Descriptions) {
            if (existingDescriptionsMap.has(desc.Stage)) {
                await client.query(
                    `
                    UPDATE casetypedescriptions
                    SET text = $1
                    WHERE casetypedescriptionid = $2
                    `,
                    [desc.Text, existingDescriptionsMap.get(desc.Stage)]
                );
            } else {
                await client.query(
                    `
                    INSERT INTO casetypedescriptions (casetypeid, stage, text)
                    VALUES ($1, $2, $3)
                    `,
                    [caseTypeIdInt, desc.Stage, desc.Text]
                );
            }
        }

        await client.query(
            `
            DELETE FROM casetypedescriptions
            WHERE casetypeid = $1 AND stage > $2
            `,
            [caseTypeIdInt, NumberOfStages]
        );

        await client.query('COMMIT');
        res.status(200).json({ message: "Case type updated successfully" });

    } catch (error) {
        console.error("Error updating case type:", error);
        if (client) {
            try {
                await client.query('ROLLBACK');
            } catch (rollbackError) {
                console.error("Error during transaction rollback:", rollbackError);
            }
        }
        res.status(500).json({ message: "Error updating case type" });
    } finally {
        if (client) {
            client.release();
        }
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
