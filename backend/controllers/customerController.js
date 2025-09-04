const pool = require("../config/db");
const { formatPhoneNumber } = require("../utils/phoneUtils");
const { sendMessage, COMPANY_NAME } = require("../utils/sendMessage");

const getCustomers = async (req, res) => {
    try {
        const result = await pool.query("SELECT * FROM users WHERE role <> 'Admin'");
        res.json(result.rows.map(row => ({
            UserId: row.userid,
            Name: row.name,
            Email: row.email,
            PhoneNumber: row.phonenumber,
            CompanyName: row.companyname,
            CreatedAt: row.createdat,
            DateOfBirth: row.dateofbirth,
            ProfilePicUrl: row.profilepicurl,
            Role: row.role
        })));
    } catch (error) {
        console.error("Error retrieving customers:", error);
        res.status(500).json({ message: "Error retrieving customers" });
    }
};

const addCustomer = async (req, res) => {
    const { name, phoneNumber, email, companyName } = req.body;

    try {
        await pool.query(
            `
            INSERT INTO users (name, email, phonenumber, passwordhash, role, companyname, createdat)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [name, email, phoneNumber, null, "User", companyName, new Date()]
        );

        const formattedPhone = formatPhoneNumber(phoneNumber);
        sendMessage(`היי ${name}, ברוכים הבאים לשירות החדש שלנו.\n\n בלינק הבא תוכל להשלים את ההרשמה לשירות.\n\n בברכה ${COMPANY_NAME}`, formattedPhone);

        res.status(201).json({ message: "לקוח הוקם בהצלחה" });

    } catch (error) {
        console.error('Error adding customer:', error);
        res.status(500).json({ message: "שגיאה ביצירת לקוח" });
    }
};

const updateCustomerById = async (req, res) => {
    const { customerId } = req.params;

    const { name, email, phoneNumber, companyName } = req.body;
    try {
        const result = await pool.query(
            `
            UPDATE users
            SET
                name = $1,
                email = $2,
                phonenumber = $3,
                companyname = $4
            WHERE userid = $5
            `,
            [name, email, phoneNumber, companyName, customerId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "לקוח לא נמצא" });
        }

        res.status(200).json({ message: "לקוח עודכן בהצלחה" });
    } catch (error) {
        console.error("Error updating customer by ID:", error);
        res.status(500).json({ message: "שגיאה בעדכון לקוח" });
    }
};

const getCustomerByName = async (req, res) => {
    const { userName } = req.query;

    if (!userName || userName.trim() === "") {
        return res.status(400).json({ message: "User name is required for search" });
    }

    try {
        const result = await pool.query(
            `
            SELECT userid, name, email, phonenumber, companyname
            FROM users
            WHERE name ILIKE $1 OR email ILIKE $1 OR phonenumber ILIKE $1 OR companyname ILIKE $1
            `,
            [`%${userName}%`]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "No users found" });
        }

        res.json(result.rows.map(row => ({
            UserId: row.userid,
            Name: row.name,
            Email: row.email,
            PhoneNumber: row.phonenumber,
            CompanyName: row.companyname
        })));
    } catch (error) {
        console.error("Error retrieving users by name:", error);
        res.status(500).json({ message: "Error retrieving users" });
    }
};

const getCurrentCustomer = async (req, res) => {
    try {
        const userId = req.user.UserId;

        const result = await pool.query(
            `
            SELECT
                userid,
                name,
                email,
                phonenumber,
                companyname,
                dateofbirth,
                profilepicurl,
                role
            FROM users
            WHERE userid = $1
            `,
            [userId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ message: "Current user not found." });
        }

        const row = result.rows[0];
        res.json({
            UserId: row.userid,
            Name: row.name,
            Email: row.email,
            PhoneNumber: row.phonenumber,
            CompanyName: row.companyname,
            DateOfBirth: row.dateofbirth,
            ProfilePicUrl: row.profilepicurl,
            Role: row.role
        });
    } catch (error) {
        console.error("Error retrieving current customer:", error);
        res.status(500).json({ message: "Error retrieving current customer profile." });
    }
};

const updateCurrentCustomer = async (req, res) => {
    const userId = req.user.UserId;
    const { name, phoneNumber, email, companyName, dateOfBirth, profilePicBase64 } = req.body;

    try {
        let updateQuery = `
            UPDATE users
            SET
                name = $1,
                email = $2,
                phonenumber = $3,
                companyname = $4,
                dateofbirth = $5
        `;
        const params = [name, email, phoneNumber, companyName, dateOfBirth ? new Date(dateOfBirth) : null];
        let paramIndex = params.length;

        if (profilePicBase64 !== null && profilePicBase64 !== undefined) {
            paramIndex++;
            updateQuery += `, profilepicurl = $${paramIndex}`;
            params.push(profilePicBase64);
        }

        paramIndex++;
        updateQuery += ` WHERE userid = $${paramIndex}`;
        params.push(userId);

        const result = await pool.query(updateQuery, params);

        if (result.rowCount === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        res.status(200).json({ message: "עדכון פרופיל לקוח בוצע בהצלחה" });
    } catch (error) {
        console.error("Error updating current customer profile:", error);
        res.status(500).json({ message: "שגיאה בעדכון פרופיל לקוח" });
    }
};

const deleteCustomer = async (req, res) => {
    const { userId } = req.params;

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            await client.query(
                `
                DELETE FROM casedescriptions
                WHERE caseid IN (SELECT caseid FROM cases WHERE userid = $1)
                `,
                [userId]
            );

            await client.query(
                `
                DELETE FROM cases WHERE userid = $1
                `,
                [userId]
            );

            const deleteResult = await client.query(
                "DELETE FROM users WHERE userid = $1",
                [userId]
            );

            await client.query('COMMIT');

            if (deleteResult.rowCount === 0) {
                return res.status(404).json({ message: "Customer not found" });
            }

            res.status(200).json({ message: "לקוח ותיקים משוייכים נמחקו בהצלחה" });
        } catch (innerError) {
            await client.query('ROLLBACK');
            throw innerError;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Error deleting customer:", error);
        res.status(500).json({ message: "שגיאה במחיקת לקוח" });
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
