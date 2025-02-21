require("dotenv").config();
const express = require("express");
const sql = require("mssql");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.JWT_SECRET || "supersecretkey";

const companyName = 'MelamedLaw'

app.use(express.json());
app.use(cors());

// Database Connection
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: true,
        trustServerCertificate: true,
        enableArithAbort: true,
    },
};

sql.connect(dbConfig).then(() => console.log("Connected to Azure SQL Database"));

// Middleware for JWT Authentication
const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "Unauthorized: No token provided" });

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = {
            UserId: decoded.UserId,
            Role: decoded.role,
            PhoneNumber: decoded.phoneNumber
        };
        next();
    } catch (error) {
        res.status(401).json({ message: "Unauthorized: Invalid token" });
    }
};

// OTP APIs
app.post("/RequestOtp", async (req, res) => {
    const { phoneNumber } = req.body;

    if (!phoneNumber) {
        return res.status(400).json({ message: "Phone number is required" });
    }

    try {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

        const userResult = await sql.query(`SELECT UserId FROM Users WHERE PhoneNumber = '${phoneNumber}'`);
        if (userResult.recordset.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        const userId = userResult.recordset[0].UserId;

        await sql.query(`
            MERGE INTO OTPs AS target
            USING (SELECT '${phoneNumber}' AS PhoneNumber, '${otp}' AS OTP, '${expiry.toISOString()}' AS Expiry, ${userId} AS UserId) AS source
            ON target.PhoneNumber = source.PhoneNumber
            WHEN MATCHED THEN UPDATE SET OTP = source.OTP, Expiry = source.Expiry
            WHEN NOT MATCHED THEN INSERT (PhoneNumber, OTP, Expiry, UserId) VALUES (source.PhoneNumber, source.OTP, source.Expiry, source.UserId);
        `);

        console.log(`OTP for ${phoneNumber}: ${otp}`); // Debugging output
        res.status(200).json({ message: "OTP sent successfully" });
    } catch (error) {
        console.error("Error in /request-otp:", error);
        res.status(500).json({ message: "Error generating OTP", error: error.message });
    }
});

// Verify OTP and return JWT token with role
app.post("/VerifyOtp", async (req, res) => {
    const { phoneNumber, otp } = req.body;
    try {
        const result = await sql.query(`
            SELECT Users.UserId, Users.Role 
            FROM OTPs 
            JOIN Users ON OTPs.UserId = Users.UserId 
            WHERE OTPs.PhoneNumber = '${phoneNumber}' 
            AND OTPs.OTP = '${otp}' 
            AND OTPs.Expiry > GETDATE()
        `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ message: "Invalid or expired OTP" });
        }

        const { UserId, Role } = result.recordset[0];

        const token = jwt.sign(
            { UserId, phoneNumber, role: Role },
            SECRET_KEY,
            { expiresIn: "2h" }
        );

        res.status(200).json({ message: "OTP verified successfully", token, role: Role });
    } catch (error) {
        res.status(500).json({ message: "Error verifying OTP" });
    }
});

// Case APIs
app.get("/GetCases", authMiddleware, async (req, res) => {
    const userId = req.user?.UserId;
    const userRole = req.user?.Role;

    if (!userId) {
        return res.status(401).json({ message: "Unauthorized: User ID missing" });
    }

    try {
        const pool = await sql.connect(dbConfig);

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
});

app.get("/GetCase/:caseId", authMiddleware, async (req, res) => {
    try {
        const caseId = req.params.caseId;

        if (!caseId) {
            return res.status(400).json({ message: "Invalid case ID" });
        }

        const result = await sql.query(`SELECT * FROM Cases WHERE CaseId = ${caseId}`);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Case not found" });
        }

        res.json(result.recordset[0]);
    } catch (error) {
        console.error("Error retrieving case:", error);
        res.status(500).json({ message: "Error retrieving case by ID" });
    }
});

app.get("/GetCaseByName", authMiddleware, async (req, res) => {
    let { caseName } = req.query;

    if (!caseName || caseName.trim() === "") {
        return res.status(400).json({ message: "Case name is required for search" });
    }

    const userId = req.user?.UserId;
    const userRole = req.user?.Role;

    try {
        const pool = await sql.connect(dbConfig);
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
            query += " AND C.UserId = @userId"; // Clients only see their own cases
        }

        query += " ORDER BY C.CaseId, CD.Stage";

        const result = await pool.request()
            .input("caseName", sql.NVarChar, `%${caseName}%`)
            .input("userId", sql.Int, userId)
            .query(query);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No cases found with this name" });
        }

        // **✅ Process Data to Group Case with Descriptions**
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
        console.error("Error retrieving case:", error);
        res.status(500).json({ message: "Error retrieving case by name" });
    }
});

app.post("/AddCase", authMiddleware, async (req, res) => {
    const { CaseName, CaseTypeId, CaseTypeName, UserId, CompanyName, CurrentStage, Descriptions, IsTagged } = req.body;

    try {
        const pool = await sql.connect(dbConfig);
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

        await transaction.commit();
        res.status(201).json({ message: "Case created successfully", caseId });

    } catch (error) {
        console.error("Error creating case:", error);
        res.status(500).json({ message: "Error creating case" });
    }
});

app.put("/UpdateCase/:caseId", authMiddleware, async (req, res) => {
    const { caseId } = req.params;
    const { CaseName, CurrentStage, IsClosed, IsTagged, Descriptions } = req.body;

    try {
        const pool = await sql.connect(dbConfig);
        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        const caseRequest = new sql.Request(transaction);
        caseRequest.input("CaseId", sql.Int, caseId);
        caseRequest.input("CaseName", sql.NVarChar, CaseName);
        caseRequest.input("CurrentStage", sql.Int, CurrentStage);
        caseRequest.input("IsClosed", sql.Bit, IsClosed);
        caseRequest.input("IsTagged", sql.Bit, IsTagged);

        await caseRequest.query(`
            UPDATE Cases 
            SET CaseName = @CaseName, 
                CurrentStage = @CurrentStage, 
                IsClosed = @IsClosed, 
                IsTagged = @IsTagged 
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

        await transaction.commit();
        res.status(200).json({ message: "Case and descriptions updated successfully" });

    } catch (error) {
        console.error("Error updating case:", error);
        res.status(500).json({ message: "Error updating case" });
    }
});

app.delete("/DeleteCase/:caseId", authMiddleware, async (req, res) => {
    const { caseId } = req.params;

    try {
        const pool = await sql.connect(dbConfig);
        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        // **Step 1: Delete all descriptions associated with the case**
        await transaction.request()
            .input("caseId", sql.Int, caseId)
            .query("DELETE FROM CaseDescriptions WHERE CaseId = @caseId");

        // **Step 2: Delete the case**
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
});

app.put("/TagCase/:CaseId", authMiddleware, async (req, res) => {
    const { CaseId } = req.params;
    const { IsTagged } = req.body;

    try {
        const pool = await sql.connect(dbConfig);
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
        console.error("Error updating case:", error);
        res.status(500).json({ message: "Error updating case" });
    }
});

app.get("/TaggedCases", authMiddleware, async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
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
});

app.get("/TaggedCasesByName", authMiddleware, async (req, res) => {
    let { caseName } = req.query;

    if (!caseName || caseName.trim() === "") {
        return res.status(400).json({ message: "Case name is required for search" });
    }

    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool
            .request()
            .input("caseName", sql.NVarChar, `%${caseName}%`) // Ensure Hebrew support
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
                AND C.IsTagged = 1  -- ✅ Only return tagged cases
                ORDER BY C.CaseId, CD.Stage
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No tagged cases found with this name" });
        }

        // **✅ Process Data to Group Case with Descriptions**
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
});

// Admins APIs
app.get("/GetAdmins", authMiddleware, async (req, res) => {
    try {
        const adminUsersResult = await sql.query("SELECT * FROM Users WHERE Role = 'Admin'");
        res.json(adminUsersResult.recordset);
    } catch (error) {
        res.status(500).json({ message: "Error retrieving Admins" });
    }
});

app.get("/GetAdminByName", authMiddleware, async (req, res) => {
    const { name } = req.query;

    if (!name || name.trim() === "") {
        return res.status(400).json({ message: "Admin name is required for search" });
    }

    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input("name", sql.NVarChar, `%${name}%`) // Use NVarChar for Unicode
            .query("SELECT * FROM Users WHERE Role = 'Admin' AND Name LIKE @name");

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No admin found with this name" });
        }

        res.json(result.recordset);
    } catch (error) {
        console.error("Error retrieving admin:", error);
        res.status(500).json({ message: "Error retrieving admin by name" });
    }
});

app.put("/UpdateAdmin/:adminId", authMiddleware, async (req, res) => {
    const { adminId } = req.params;
    const { name, email, phoneNumber, password } = req.body;

    if (!adminId) {
        return res.status(400).json({ message: "Admin ID is required" });
    }

    try {
        const request = sql.request();
        request.input("adminId", sql.Int, adminId);
        request.input("name", sql.NVarChar, name);
        request.input("email", sql.NVarChar, email);
        request.input("phoneNumber", sql.NVarChar, phoneNumber);

        // Update password only if it's provided
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            request.input("password", sql.NVarChar, hashedPassword);
            await request.query(`
                UPDATE Users 
                SET Name = @name, Email = @email, PhoneNumber = @phoneNumber, PasswordHash = @password
                WHERE UserId = @adminId AND Role = 'Admin'
            `);
        } else {
            await request.query(`
                UPDATE Users 
                SET Name = @name, Email = @email, PhoneNumber = @phoneNumber
                WHERE UserId = @adminId AND Role = 'Admin'
            `);
        }

        res.status(200).json({ message: "Admin updated successfully" });
    } catch (error) {
        console.error("Error updating admin:", error);
        res.status(500).json({ message: "Error updating admin" });
    }
});

app.delete("/DeleteAdmin/:adminId", authMiddleware, async (req, res) => {
    const { adminId } = req.params;

    if (!adminId) {
        return res.status(400).json({ message: "Admin ID is required" });
    }

    try {
        const result = await sql.query(`DELETE FROM Users WHERE UserId = ${adminId} AND Role = 'Admin'`);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Admin not found or already deleted" });
        }

        res.status(200).json({ message: "Admin deleted successfully" });
    } catch (error) {
        console.error("Error deleting admin:", error);
        res.status(500).json({ message: "Error deleting admin" });
    }
});

app.post("/AddAdmin", authMiddleware, async (req, res) => {
    const { name, email, phoneNumber, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const pool = await sql.connect(dbConfig);
        const request = pool.request();
        request.input("name", sql.NVarChar, name); // ✅ Use NVARCHAR to keep Hebrew encoding
        request.input("email", sql.NVarChar, email);
        request.input("phoneNumber", sql.NVarChar, phoneNumber);
        request.input("password", sql.NVarChar, hashedPassword);
        request.input("role", sql.NVarChar, "Admin");

        await request.query(`
            INSERT INTO Users (Name, Email, PhoneNumber, PasswordHash, Role, CreatedAt)
            VALUES (@name, @email, @phoneNumber, @password, @role, GETDATE())
        `);

        res.status(201).json({ message: "Admin added successfully" });
    } catch (error) {
        console.error("Error adding admin:", error);
        res.status(500).json({ message: "Error adding admin" });
    }
});

// Customer APIs
app.get("/GetCustomers", authMiddleware, async (req, res) => {
    try {
        const result = await sql.query("SELECT * FROM Users WHERE Role <> 'Admin'");
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ message: "Error retrieving customers" });
    }
});

app.post("/AddCustomer", authMiddleware, async (req, res) => {
    const { name, email, phoneNumber, companyName } = req.body;

    try {
        const pool = await sql.connect(dbConfig);
        const request = pool.request();

        request.input("Name", sql.NVarChar, name);
        request.input("Email", sql.NVarChar, email);
        request.input("PhoneNumber", sql.NVarChar, phoneNumber);
        request.input("PasswordHash", sql.NVarChar, null); // Store as NULL
        request.input("Role", sql.NVarChar, "User");
        request.input("CompanyName", sql.NVarChar, companyName);
        request.input("CreatedAt", sql.DateTime, new Date());

        await request.query(`
            INSERT INTO Users (Name, Email, PhoneNumber, PasswordHash, Role, CompanyName, CreatedAt)
            VALUES (@Name, @Email, @PhoneNumber, @PasswordHash, @Role, @CompanyName, @CreatedAt)
        `);

        res.status(201).json({ message: "Customer created successfully" });

    } catch (error) {
        console.error("Error creating customer:", error);
        res.status(500).json({ message: "Error creating customer" });
    }
});

app.put("/GetCustomer/:customerId", authMiddleware, async (req, res) => {
    const { customerId } = req.params;
    const { name, email, phoneNumber, role, companyName } = req.body;
    try {
        await sql.query(`UPDATE Users SET Name = '${name}', Email = '${email}', PhoneNumber = '${phoneNumber}', Role = '${role}', CompanyName = '${companyName}' WHERE UserId = ${customerId}`);
        res.status(200).json({ message: "Customer updated successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error updating customer" });
    }
});

app.get("/GetCustomerByName", authMiddleware, async (req, res) => {
    const { userName } = req.query;

    if (!userName || userName.trim() === "") {
        return res.status(400).json({ message: "User name is required for search" });
    }

    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input("userName", sql.NVarChar, `%${userName}%`)
            .query(`
                SELECT UserId, Name, Email, PhoneNumber, CompanyName 
                FROM Users 
                WHERE Name LIKE @userName
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No users found" });
        }

        res.json(result.recordset);
    } catch (error) {
        console.error("Error retrieving users:", error);
        res.status(500).json({ message: "Error retrieving users" });
    }
});

app.put("/UpdateCustomer/:userId", authMiddleware, async (req, res) => {
    const { userId } = req.params;
    const { name, email, phoneNumber, companyName } = req.body;

    try {
        const pool = await sql.connect(dbConfig);

        const existingUser = await pool.request()
            .input("userId", sql.Int, userId)
            .query(`SELECT Name, Email, PhoneNumber, CompanyName FROM Users WHERE UserId = @userId`);

        if (existingUser.recordset.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }

        const currentUser = existingUser.recordset[0];

        const updatedName = name ?? currentUser.Name;
        const updatedEmail = email ?? currentUser.Email;
        const updatedPhoneNumber = phoneNumber ?? currentUser.PhoneNumber;
        const updatedCompanyName = companyName ?? currentUser.CompanyName;

        await pool.request()
            .input("userId", sql.Int, userId)
            .input("name", sql.NVarChar, updatedName)
            .input("email", sql.NVarChar, updatedEmail)
            .input("phoneNumber", sql.NVarChar, updatedPhoneNumber)
            .input("companyName", sql.NVarChar, updatedCompanyName)
            .query(`
                UPDATE Users 
                SET 
                    Name = @name, 
                    Email = @email, 
                    PhoneNumber = @phoneNumber, 
                    CompanyName = @companyName
                WHERE UserId = @userId
            `);

        res.status(200).json({ message: "User updated successfully" });
    } catch (error) {
        console.error("Error updating user:", error);
        res.status(500).json({ message: "Error updating user" });
    }
});

app.delete("/DeleteCustomer/:userId", authMiddleware, async (req, res) => {
    const { userId } = req.params;

    try {
        const pool = await sql.connect(dbConfig);
        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        await transaction.request()
            .input("userId", sql.Int, userId)
            .query(`
                DELETE FROM CaseDescriptions
                WHERE CaseId IN (SELECT CaseId FROM Cases WHERE UserId = @userId)
            `);

        await transaction.request()
            .input("userId", sql.Int, userId)
            .query(`
                DELETE FROM Cases WHERE UserId = @userId
            `);

        const deleteResult = await transaction.request()
            .input("userId", sql.Int, userId)
            .query("DELETE FROM Users WHERE UserId = @userId");

        await transaction.commit();

        if (deleteResult.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Customer not found" });
        }

        res.status(200).json({ message: "Customer and associated cases deleted successfully" });

    } catch (error) {
        console.error("Error deleting customer:", error);
        res.status(500).json({ message: "Error deleting customer" });
    }
});

// Case Type APIs - Get Case Types with Associated Descriptions
app.get("/GetCasesType", authMiddleware, async (req, res) => {
    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request().query(`
            SELECT 
                CT.CaseTypeId, 
                CT.CaseTypeName, 
                CT.NumberOfStages, 
                CD.CaseTypeDescriptionId,
                CD.Stage,
                CD.Text
            FROM CaseTypes CT
            LEFT JOIN CaseTypeDescriptions CD ON CT.CaseTypeId = CD.CaseTypeId
            ORDER BY CT.CaseTypeId, CD.Stage
        `);

        // ✅ **Process Data to Group CaseType with its Descriptions**
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
});

app.get("/GetCaseType/:caseTypeId", authMiddleware, async (req, res) => {
    const { caseTypeId } = req.params;
    try {
        const result = await sql.query(`SELECT * FROM CaseTypes WHERE CaseTypeId = ${caseTypeId}`);
        res.json(result.recordset[0]);
    } catch (error) {
        res.status(500).json({ message: "Error retrieving case type by ID" });
    }
});

app.get("/GetCaseTypeByName", authMiddleware, async (req, res) => {
    const { caseTypeName } = req.query;

    if (!caseTypeName || caseTypeName.trim() === "") {
        return res.status(400).json({ message: "Case type name is required" });
    }

    try {
        const pool = await sql.connect(dbConfig);
        const result = await pool.request()
            .input("caseTypeName", sql.NVarChar, `%${caseTypeName}%`) // ✅ Ensure Hebrew support
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

        // ✅ Grouping descriptions under each case type
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

        // ✅ Convert the Map to an array and return
        res.json(Array.from(caseTypesMap.values())); // Return only one object
    } catch (error) {
        console.error("Error retrieving case type:", error);
        res.status(500).json({ message: "Error retrieving case type" });
    }
});

app.delete("/DeleteCaseType/:CaseTypeId", authMiddleware, async (req, res) => {
    console.log("req.params", req.params);

    const { CaseTypeId } = req.params;

    console.log("CaseTypeId", CaseTypeId);

    if (!CaseTypeId) {
        return res.status(400).json({ message: "CaseTypeId is required for deletion" });
    }

    try {
        const pool = await sql.connect(dbConfig); // Ensure database connection
        const request = pool.request();

        // Securely pass CaseTypeId as an input parameter
        request.input("CaseTypeId", sql.Int, CaseTypeId);

        const result = await request.query("DELETE FROM CaseTypes WHERE CaseTypeId = @CaseTypeId");

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Case type not found" });
        }

        res.status(200).json({ message: "Case type deleted successfully" });
    } catch (error) {
        console.error("Error deleting case type:", error);
        res.status(500).json({ message: "Error deleting case type" });
    }
});

app.post("/AddCaseType", authMiddleware, async (req, res) => {
    const { CaseTypeName, NumberOfStages, Descriptions = [] } = req.body;

    console.log("req.body", req.body);

    try {
        const pool = await sql.connect(dbConfig);
        const transaction = new sql.Transaction(pool);

        await transaction.begin();

        // 🔹 **Step 1: Insert into CaseTypes**
        const caseTypeRequest = new sql.Request(transaction);
        caseTypeRequest.input("CaseTypeName", sql.NVarChar, CaseTypeName);
        caseTypeRequest.input("NumberOfStages", sql.Int, NumberOfStages);

        const caseTypeResult = await caseTypeRequest.query(`
            INSERT INTO CaseTypes (CaseTypeName, NumberOfStages) 
            OUTPUT INSERTED.CaseTypeId
            VALUES (@CaseTypeName, @NumberOfStages)
        `);

        const CaseTypeId = caseTypeResult.recordset[0].CaseTypeId;

        console.log(`✅ Created CaseTypeId: ${CaseTypeId}`);

        // 🔹 **Step 2: Insert Descriptions into CaseTypeDescriptions**
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
});

app.put("/UpdateCaseType/:caseTypeId", authMiddleware, async (req, res) => {
    const { caseTypeId } = req.params;
    const { CaseTypeName, NumberOfStages, Descriptions = [] } = req.body; // Get descriptions array

    try {
        const pool = await sql.connect(dbConfig);
        const transaction = new sql.Transaction(pool);
        await transaction.begin();

        // ✅ **Update CaseType Name & NumberOfStages**
        const updateCaseTypeRequest = new sql.Request(transaction);
        updateCaseTypeRequest.input("caseTypeId", sql.Int, caseTypeId);
        updateCaseTypeRequest.input("CaseTypeName", sql.NVarChar, CaseTypeName);
        updateCaseTypeRequest.input("NumberOfStages", sql.Int, NumberOfStages);

        await updateCaseTypeRequest.query(`
            UPDATE CaseTypes 
            SET CaseTypeName = @CaseTypeName, NumberOfStages = @NumberOfStages 
            WHERE CaseTypeId = @caseTypeId
        `);

        // ✅ **Fetch existing descriptions for comparison**
        const existingDescriptionsResult = await pool.request()
            .input("caseTypeId", sql.Int, caseTypeId)
            .query("SELECT CaseTypeDescriptionId, Stage FROM CaseTypeDescriptions WHERE CaseTypeId = @caseTypeId");

        const existingDescriptionsMap = new Map(existingDescriptionsResult.recordset.map(desc => [desc.Stage, desc.CaseTypeDescriptionId]));

        // ✅ **Handle descriptions update**
        for (const desc of Descriptions) {
            const descRequest = new sql.Request(transaction);
            descRequest.input("caseTypeId", sql.Int, caseTypeId);
            descRequest.input("stage", sql.Int, desc.Stage);
            descRequest.input("text", sql.NVarChar, desc.Text);

            if (existingDescriptionsMap.has(desc.Stage)) {
                // ✅ **Update existing description using `CaseTypeDescriptionId`**
                descRequest.input("CaseTypeDescriptionId", sql.Int, existingDescriptionsMap.get(desc.Stage));
                await descRequest.query(`
                    UPDATE CaseTypeDescriptions 
                    SET Text = @text
                    WHERE CaseTypeDescriptionId = @CaseTypeDescriptionId
                `);
            } else {
                // ✅ **Insert new description if it doesn't exist**
                await descRequest.query(`
                    INSERT INTO CaseTypeDescriptions (CaseTypeId, Stage, Text)
                    VALUES (@caseTypeId, @stage, @text)
                `);
            }
        }

        // ✅ **Remove extra descriptions if `NumberOfStages` decreased**
        await pool.request()
            .input("caseTypeId", sql.Int, caseTypeId)
            .input("numberOfStages", sql.Int, NumberOfStages)
            .query(`
                DELETE FROM CaseTypeDescriptions 
                WHERE CaseTypeId = @caseTypeId AND Stage > @numberOfStages
            `);

        await transaction.commit();
        res.status(200).json({ message: "Case type updated successfully" });

    } catch (error) {
        console.error("Error updating case type:", error);
        res.status(500).json({ message: "Error updating case type" });
    }
});

//FullPagesData
// Get Main Screen Data
app.get("/GetMainScreenData", authMiddleware, async (req, res) => {
    try {
        const casesResult = await sql.query("SELECT * FROM Cases");
        const customersResult = await sql.query("SELECT * FROM Users WHERE LOWER(Role) <> 'admin'");

        const casesArray = casesResult.recordset;
        const customersArray = customersResult.recordset;

        const closedCases = casesArray.filter(caseItem => caseItem.IsClosed === true);
        const taggedCases = casesArray.filter(caseItem => caseItem.IsTagged === true);

        res.status(200).json({
            AllCasesData: casesArray,
            ClosedCasesData: closedCases,
            TaggedCases: taggedCases,
            NumberOfClosedCases: closedCases.length,
            NumberOfTaggedCases: taggedCases.length,
            AllCustomersData: customersArray
        });
    } catch (error) {
        console.error("Error fetching main screen data:", error);
        res.status(500).json({ message: "Error fetching main screen data" });
    }
});

app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
