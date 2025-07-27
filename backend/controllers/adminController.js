const { sql, connectDb } = require("../config/db");
const bcrypt = require("bcrypt");

const getAdmins = async (req, res) => {
    try {
        const pool = await connectDb();
        const adminUsersResult = await pool.request().query("SELECT UserId, Name, Email, PhoneNumber, CompanyName, CreatedAt FROM Users WHERE Role = 'Admin'");
        res.json(adminUsersResult.recordset);
    } catch (error) {
        console.error("Error retrieving Admins:", error);
        res.status(500).json({ message: "Error retrieving Admins" });
    }
};

const getAdminByName = async (req, res) => {
    const { name } = req.query;

    if (!name || name.trim() === "") {
        return res.status(400).json({ message: "Admin name is required for search" });
    }

    try {
        const pool = await connectDb();
        const result = await pool.request()
            .input("name", sql.NVarChar, `%${name}%`)
            .query("SELECT UserId, Name, Email, PhoneNumber, CompanyName, CreatedAt FROM Users WHERE Role = 'Admin' AND Name LIKE @name");

        if (result.recordset.length === 0) {
            return res.status(404).json({ message: "No admin found with this name" });
        }

        res.json(result.recordset);
    } catch (error) {
        console.error("Error retrieving admin:", error);
        res.status(500).json({ message: "Error retrieving admin by name" });
    }
};

const updateAdmin = async (req, res) => {
    const { adminId } = req.params;
    const { name, email, phoneNumber, password } = req.body;

    if (!adminId) {
        return res.status(400).json({ message: "Admin ID is required" });
    }

    try {
        const pool = await connectDb();
        const request = pool.request();
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
};

const deleteAdmin = async (req, res) => {
    const { adminId } = req.params;

    if (!adminId) {
        return res.status(400).json({ message: "Admin ID is required" });
    }

    try {
        const pool = await connectDb();
        const request = pool.request();
        request.input("adminId", sql.Int, adminId);

        const result = await request.query(`DELETE FROM Users WHERE UserId = @adminId AND Role = 'Admin'`);

        if (result.rowsAffected[0] === 0) {
            return res.status(404).json({ message: "Admin not found or already deleted" });
        }

        res.status(200).json({ message: "Admin deleted successfully" });
    } catch (error) {
        console.error("Error deleting admin:", error);
        res.status(500).json({ message: "Error deleting admin" });
    }
};

const addAdmin = async (req, res) => {
    const { name, email, phoneNumber, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        const pool = await connectDb();
        const request = pool.request();
        request.input("name", sql.NVarChar, name);
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
};

module.exports = {
    getAdmins,
    getAdminByName,
    updateAdmin,
    deleteAdmin,
    addAdmin,
};
