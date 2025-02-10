require("dotenv").config();
const express = require("express");
const sql = require("mssql");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const cors = require("cors");

const app = express();
const PORT = process.env.PORT || 5000;
const SECRET_KEY = process.env.JWT_SECRET || "supersecretkey";

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
    const { caseId } = req.params;
    try {
        const result = await sql.query(`SELECT * FROM Cases WHERE CaseId = ${caseId}`);
        res.json(result.recordset[0]);
    } catch (error) {
        res.status(500).json({ message: "Error retrieving case by ID" });
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
        await sql.query(`UPDATE Cases SET CaseName = '${caseName}', CurrentStage = ${currentStage}, IsClosed = ${isClosed}, IsTagged = ${isTagged} WHERE CaseId = ${caseId}`);
        res.status(200).json({ message: "Case updated successfully" });
    } catch (error) {
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

// Customer APIs
app.get("/GetCustomers", authMiddleware, async (req, res) => {
    try {
        const result = await sql.query("SELECT * FROM Users");
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

// Case Type APIs
app.get("/GetCasesType", authMiddleware, async (req, res) => {
    try {
        const result = await sql.query("SELECT * FROM CaseTypes");
        res.json(result.recordset);
    } catch (error) {
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
        const customersResult = await sql.query("SELECT * FROM Users");

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
