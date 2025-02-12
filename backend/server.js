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
        req.user = jwt.verify(token, SECRET_KEY);
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
        // Generate a 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

        // Fetch UserId for the given PhoneNumber
        const userResult = await sql.query(`SELECT UserId FROM Users WHERE PhoneNumber = '${phoneNumber}'`);
        if (userResult.recordset.length === 0) {
            return res.status(404).json({ message: "User not found" });
        }
        const userId = userResult.recordset[0].UserId;

        // Store OTP in the database
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
        const result = await sql.query(`SELECT Users.Role FROM OTPs JOIN Users ON OTPs.UserId = Users.UserId WHERE OTPs.PhoneNumber = '${phoneNumber}' AND OTPs.OTP = '${otp}' AND OTPs.Expiry > GETDATE()`);

        if (result.recordset.length === 0) {
            return res.status(401).json({ message: "Invalid or expired OTP" });
        }

        const userRole = result.recordset[0].Role;
        const token = jwt.sign({ phoneNumber, role: userRole }, SECRET_KEY, { expiresIn: "24h" });

        res.status(200).json({ message: "OTP verified successfully", token, role: userRole });
    } catch (error) {
        res.status(500).json({ message: "Error verifying OTP" });
    }
});

// Case APIs
app.get("/GetCases", authMiddleware, async (req, res) => {
    try {
        const result = await sql.query("SELECT * FROM Cases");
        res.json(result.recordset);
    } catch (error) {
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
    let { caseName } = req.query; // Get caseName from query parameters

    if (!caseName || caseName.trim() === "") {
        return res.status(400).json({ message: "Case name is required for search" });
    }

    try {
        const pool = await sql.connect(dbConfig); // Ensure database connection
        const result = await pool
            .request()
            .input("caseName", sql.NVarChar, `%${caseName}%`) // Pass caseName safely
            .query("SELECT * FROM Cases WHERE CaseName LIKE @caseName");

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No cases found with this name" });
        }

        res.json(result.recordset);
    } catch (error) {
        console.error("Error retrieving case:", error);
        res.status(500).json({ message: "Error retrieving case by name" });
    }
});


app.post("/AddCase", authMiddleware, async (req, res) => {
    const { caseName, caseTypeId, userId, companyName } = req.body;
    try {
        const result = await sql.query(`INSERT INTO Cases (CaseName, CaseTypeId, UserId, CompanyName, CurrentStage, IsClosed, IsTagged) OUTPUT INSERTED.CaseId VALUES ('${caseName}', ${caseTypeId}, ${userId}, '${companyName}', 1, 0, 0)`);
        res.status(201).json({ message: "Case created successfully", caseId: result.recordset[0].CaseId });
    } catch (error) {
        res.status(500).json({ message: "Error creating case" });
    }
});

app.put("/UpdateCase/:caseId", authMiddleware, async (req, res) => {
    const { caseId } = req.params;
    const { caseName, currentStage, isClosed, isTagged } = req.body;

    try {
        const pool = await sql.connect(dbConfig);
        const request = pool.request();
        request.input("caseId", sql.Int, caseId);
        request.input("caseName", sql.NVarChar, caseName);
        request.input("currentStage", sql.Int, currentStage);
        request.input("isClosed", sql.Bit, isClosed);
        request.input("isTagged", sql.Bit, isTagged);

        await request.query(`
            UPDATE Cases 
            SET CaseName = @caseName, 
                CurrentStage = @currentStage, 
                IsClosed = @isClosed, 
                IsTagged = @isTagged 
            WHERE CaseId = @caseId
        `);

        res.status(200).json({ message: "Case updated successfully" });
    } catch (error) {
        console.error("Error updating case:", error);
        res.status(500).json({ message: "Error updating case" });
    }
});

app.get("/TaggedCases", authMiddleware, async (req, res) => {
    try {
        const result = await sql.query("SELECT * FROM Cases WHERE IsTagged = 1");
        res.json(result.recordset);
    } catch (error) {
        res.status(500).json({ message: "Error retrieving tagged cases" });
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
    const { name, email, phoneNumber, password, role, companyName } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        await sql.query(`INSERT INTO Users (Name, Email, PhoneNumber, PasswordHash, Role, CompanyName, CreatedAt) VALUES ('${name}', '${email}', '${phoneNumber}', '${hashedPassword}', '${role}', '${companyName}', GETDATE())`);
        res.status(201).json({ message: "Customer created successfully" });
    } catch (error) {
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

// Case Type APIs - Get Case Types with Associated Descriptions
app.get("/GetCasesType", authMiddleware, async (req, res) => {
    try {
        const result = await sql.query(`
            SELECT 
                CT.CaseTypeId, 
                CT.CaseTypeName, 
                CT.NumberOfStages, 
                COALESCE(JSON_QUERY((
                    SELECT CD.DescriptionId, CD.Stage, CD.Text, CD.Timestamp, CD.IsNew
                    FROM CaseDescriptions CD
                    INNER JOIN Cases C ON CD.CaseId = C.CaseId
                    WHERE C.CaseTypeId = CT.CaseTypeId
                    FOR JSON PATH
                )), '[]') AS Descriptions
            FROM CaseTypes CT
        `);

        res.json(result.recordset);
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

    if (!caseTypeName) {
        return res.status(400).json({ message: "Case type name is required" });
    }

    try {
        const result = await sql.query(`
            SELECT * FROM CaseTypes WHERE CaseTypeName LIKE '%${caseTypeName}%'
        `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No case type found" });
        }

        res.status(200).json(result.recordset);
    } catch (error) {
        console.error("Error retrieving case type:", error);
        res.status(500).json({ message: "Error retrieving case type" });
    }
});


app.post("/AddCaseType", authMiddleware, async (req, res) => {
    const { caseTypeName, numberOfStages } = req.body;

    try {
        await sql.query(`INSERT INTO CaseTypes (CaseTypeName, NumberOfStages) VALUES ('${caseTypeName}', ${numberOfStages})`);
        res.status(201).json({ message: "Case type created successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error creating case type" });
    }
});

app.put("/UpdateCaseType/:caseTypeId", authMiddleware, async (req, res) => {
    const { caseTypeId } = req.params;
    const { caseTypeName, numberOfStages } = req.body;
    try {
        await sql.query(`UPDATE CaseTypes SET CaseTypeName = '${caseTypeName}', NumberOfStages = ${numberOfStages} WHERE CaseTypeId = ${caseTypeId}`);
        res.status(200).json({ message: "Case type updated successfully" });
    } catch (error) {
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
