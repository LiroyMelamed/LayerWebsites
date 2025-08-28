const pool = require("../config/db"); // Direct import of the pg pool
const bcrypt = require("bcrypt");

/**
 * Retrieves all users with the 'Admin' role.
 */
const getAdmins = async (req, res) => {
    try {
        // Query uses lowercase column names to match PostgreSQL's default behavior
        const result = await pool.query("SELECT userid, name, email, phonenumber, companyname, createdat FROM users WHERE role = 'Admin'");
        // Access rows directly and return them
        res.json(result.rows);
    } catch (error) {
        console.error("Error retrieving Admins:", error);
        res.status(500).json({ message: "Error retrieving Admins" });
    }
};

/**
 * Retrieves an admin by a partial name search (case-insensitive).
 */
const getAdminByName = async (req, res) => {
    // Note: The query parameter is already lowercase
    const { name } = req.query;

    if (!name || name.trim() === "") {
        return res.status(400).json({ message: "Admin name is required for search" });
    }

    try {
        // Use parameterized query with $1 for PostgreSQL and ILIKE for case-insensitive search
        const result = await pool.query(
            "SELECT userid, name, email, phonenumber, companyname, createdat FROM users WHERE role = 'Admin' AND name ILIKE $1",
            [`%${name}%`] // Parameters passed as an array
        );

        // Check if any rows were returned
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No admin found with this name" });
        }

        // Return the found rows
        res.json(result.rows);
    } catch (error) {
        console.error("Error retrieving admin:", error);
        res.status(500).json({ message: "Error retrieving admin by name" });
    }
};

/**
 * Updates an admin's details.
 */
const updateAdmin = async (req, res) => {
    const { adminId } = req.params;
    const { name, email, phoneNumber, password } = req.body;

    if (!adminId) {
        return res.status(400).json({ message: "Admin ID is required" });
    }

    try {
        let query;
        let params;

        // Update password only if it's provided
        if (password) {
            const hashedPassword = await bcrypt.hash(password, 10);
            query = `
                UPDATE users
                SET name = $1, email = $2, phonenumber = $3, passwordhash = $4
                WHERE userid = $5 AND role = 'Admin'
            `;
            // Using lowercase column names in the params array as well
            params = [name, email, phoneNumber, hashedPassword, adminId];
        } else {
            query = `
                UPDATE users
                SET name = $1, email = $2, phonenumber = $3
                WHERE userid = $4 AND role = 'Admin'
            `;
            // Using lowercase column names in the params array as well
            params = [name, email, phoneNumber, adminId];
        }

        await pool.query(query, params); // Execute query with parameters

        res.status(200).json({ message: "Admin updated successfully" });
    } catch (error) {
        console.error("Error updating admin:", error);
        res.status(500).json({ message: "Error updating admin" });
    }
};

/**
 * Deletes an admin.
 */
const deleteAdmin = async (req, res) => {
    const { adminId } = req.params;

    if (!adminId) {
        return res.status(400).json({ message: "Admin ID is required" });
    }

    try {
        const result = await pool.query(
            `DELETE FROM users WHERE userid = $1 AND role = 'Admin'`,
            [adminId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "Admin not found or already deleted" });
        }

        res.status(200).json({ message: "Admin deleted successfully" });
    } catch (error) {
        console.error("Error deleting admin:", error);
        res.status(500).json({ message: "Error deleting admin" });
    }
};

/**
 * Adds a new admin.
 */
const addAdmin = async (req, res) => {
    const { name, email, phoneNumber, password } = req.body;
    try {
        const hashedPassword = await bcrypt.hash(password, 10);

        await pool.query(
            `
            INSERT INTO users (name, email, phonenumber, passwordhash, role, createdat)
            VALUES ($1, $2, $3, $4, $5, NOW())
            `,
            [name, email, phoneNumber, hashedPassword, "Admin"]
        );

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