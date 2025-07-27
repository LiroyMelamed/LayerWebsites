const { sql, connectDb } = require("../config/db");
const { formatPhoneNumber } = require("../utils/phoneUtils");
const { sendMessage, COMPANY_NAME } = require("../utils/sendMessage");

const getCustomers = async (req, res) => {
    try {
        const pool = await connectDb();
        const result = await pool.request().query("SELECT * FROM Users WHERE Role <> 'Admin'");
        res.json(result.recordset);
    } catch (error) {
        console.error("Error retrieving customers:", error);
        res.status(500).json({ message: "Error retrieving customers" });
    }
};

const addCustomer = async (req, res) => {
    const { Name, PhoneNumber, Email, CompanyName } = req.body;

    try {
        const pool = await connectDb();
        const request = pool.request();

        request.input("Name", sql.NVarChar, Name);
        request.input("Email", sql.NVarChar, Email);
        request.input("PhoneNumber", sql.NVarChar, PhoneNumber);
        request.input("PasswordHash", sql.NVarChar, null);
        request.input("Role", sql.NVarChar, "User");
        request.input("CompanyName", sql.NVarChar, CompanyName);
        request.input("CreatedAt", sql.DateTime, new Date());

        await request.query(`
            INSERT INTO Users (Name, Email, PhoneNumber, PasswordHash, Role, CompanyName, CreatedAt)
            VALUES (@Name, @Email, @PhoneNumber, @PasswordHash, @Role, @CompanyName, @CreatedAt)
        `);

        const formattedPhone = formatPhoneNumber(PhoneNumber);

        sendMessage(`היי ${Name}, ברוכים הבאים לשירות החדש שלנו.\n\n בלינק הבא תוכל להשלים את ההרשמה לשירות.\n\n בברכה ${COMPANY_NAME}`, formattedPhone);

        res.status(201).json({ message: "לקוח הוקם בהצלחה" });

    } catch (error) {
        console.error('Error adding customer:', error);
        res.status(500).json({ message: "שגיאה ביצירת לקוח" });
    }
};

const updateCustomerById = async (req, res) => {
    const { customerId } = req.params;
    const { name, email, phoneNumber, role, companyName } = req.body;
    try {
        const pool = await connectDb();
        const request = pool.request();
        request.input("customerId", sql.Int, customerId);
        request.input("name", sql.NVarChar, name);
        request.input("email", sql.NVarChar, email);
        request.input("phoneNumber", sql.NVarChar, phoneNumber);
        request.input("role", sql.NVarChar, role);
        request.input("companyName", sql.NVarChar, companyName);

        await request.query(`
            UPDATE Users
            SET
                Name = @name,
                Email = @email,
                PhoneNumber = @phoneNumber,
                Role = @role,
                CompanyName = @companyName
            WHERE UserId = @customerId
        `);
        res.status(200).json({ message: "Customer updated successfully" });
    } catch (error) {
        console.error("Error updating customer by ID:", error);
        res.status(500).json({ message: "Error updating customer" });
    }
};

const getCustomerByName = async (req, res) => {
    const { userName } = req.query;

    if (!userName || userName.trim() === "") {
        return res.status(400).json({ message: "User name is required for search" });
    }

    try {
        const pool = await connectDb();
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
        console.error("Error retrieving users by name:", error);
        res.status(500).json({ message: "Error retrieving users" });
    }
};

const getCurrentCustomer = async (req, res) => {
    try {
        const userId = req.user.UserId;

        const pool = await connectDb();
        const result = await pool.request()
            .input("userId", sql.Int, userId)
            .query(`
                SELECT
                    UserId,
                    Name,
                    Email,
                    PhoneNumber,
                    CompanyName,
                    DateOfBirth,
                    ProfilePicUrl
                FROM Users
                WHERE UserId = @userId
            `);

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "Current user not found." });
        }

        res.json(result.recordset[0]);
    } catch (error) {
        console.error("Error retrieving current customer:", error);
        res.status(500).json({ message: "Error retrieving current customer profile." });
    }
};

const updateCurrentCustomer = async (req, res) => {
    const userId = req.user.UserId;
    const { Name, PhoneNumber, Email, CompanyName, dateOfBirth, profilePicBase64 } = req.body;

    try {
        const pool = await connectDb();
        const request = pool.request();

        const existingUser = await request
            .input("userIdCheck", sql.Int, userId)
            .query(`SELECT UserId FROM Users WHERE UserId = @userIdCheck`);

        if (existingUser.recordset.length === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        request.input("userId", sql.Int, userId);
        request.input("name", sql.NVarChar, Name);
        request.input("email", sql.NVarChar, Email);
        request.input("phoneNumber", sql.NVarChar, PhoneNumber);
        request.input("companyName", sql.NVarChar, CompanyName);
        request.input("dateOfBirth", sql.Date, dateOfBirth ? new Date(dateOfBirth) : null);

        let profilePicUrlToStore = null;
        if (profilePicBase64) {
            profilePicUrlToStore = profilePicBase64;
        } else {
            profilePicUrlToStore = null;
        }
        request.input("profilePicUrl", sql.NVarChar(sql.MAX), profilePicUrlToStore);

        await request.query(`
            UPDATE Users
            SET
                Name = @name,
                Email = @email,
                PhoneNumber = @phoneNumber,
                CompanyName = @companyName,
                DateOfBirth = @dateOfBirth,
                ProfilePicUrl = @profilePicUrl
            WHERE UserId = @userId
        `);

        res.status(200).json({ message: "עדכון פרופיל לקוח בוצע בהצלחה" });
    } catch (error) {
        console.error("Error updating current customer profile:", error);
        res.status(500).json({ message: "שגיאה בעדכון פרופיל לקוח" });
    }
};

const deleteCustomer = async (req, res) => {
    const { userId } = req.params;

    try {
        const pool = await connectDb(); // Get the connected pool
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
};

module.exports = {
    getCustomers,
    addCustomer,
    updateCustomerById,
    getCustomerByName,
    getCurrentCustomer,
    updateCurrentCustomer,
    deleteCustomer,
};
