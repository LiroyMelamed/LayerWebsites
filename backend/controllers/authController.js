const sql = require('mssql');
const jwt = require('jsonwebtoken');
const { pool } = require('../db'); // Make sure your db.js exports the pool
const { formatPhoneNumber, sendMessage } = require('../utils/phoneUtils'); // Adjust path if needed

const SECRET_KEY = process.env.JWT_SECRET || "your-secret-key";
const WEBSITE_DOMAIN = process.env.WEBSITE_DOMAIN || "yourdomain.com";

// Request OTP
const requestOtp = async (req, res) => {
    const { phoneNumber } = req.body;

    console.log('RequestOtp', phoneNumber);

    if (!phoneNumber) {
        return res.status(400).json({ message: "נא להזין מספר פלאפון תקין" });
    }

    try {
        if (!pool) {
            console.error("Database pool not initialized.");
            return res.status(500).json({ message: "שגיאה פנימית בשרת: בסיס נתונים אינו זמין." });
        }

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes from now

        console.log('Generated OTP for DB:', otp);
        console.log('Calculated Expiry for DB:', expiry.toISOString());
        console.log('Current Time:', new Date().toISOString());

        const userRequest = pool.request();
        userRequest.input('phoneNumber', sql.NVarChar, phoneNumber);
        const userResult = await userRequest.query(`SELECT UserId FROM Users WHERE PhoneNumber = @phoneNumber`);

        if (userResult.recordset.length === 0) {
            return res.status(404).json({ message: "משתמש אינו קיים" });
        }

        const userId = userResult.recordset[0].UserId;

        // 2. Insert/Update OTP
        const otpRequest = pool.request();
        otpRequest.input('phoneNumber', sql.NVarChar, phoneNumber);
        otpRequest.input('otp', sql.NVarChar, otp);
        otpRequest.input('expiry', sql.DateTime2, expiry);
        otpRequest.input('userId', sql.Int, userId);

        await otpRequest.query(`
            MERGE INTO OTPs AS target
            USING (SELECT @phoneNumber AS PhoneNumber, @otp AS OTP, @expiry AS Expiry, @userId AS UserId) AS source
            ON target.PhoneNumber = source.PhoneNumber
            WHEN MATCHED THEN 
                UPDATE SET OTP = source.OTP, Expiry = source.Expiry
            WHEN NOT MATCHED THEN 
                INSERT (PhoneNumber, OTP, Expiry, UserId) 
                VALUES (source.PhoneNumber, source.OTP, source.Expiry, source.UserId);
        `);

        const formattedPhone = formatPhoneNumber(phoneNumber);
        sendMessage(`קוד האימות הוא: ${otp} \n\n @${WEBSITE_DOMAIN}`, formattedPhone);

        res.status(200).json({ message: "קוד נשלח בהצלחה" });
    } catch (error) {
        console.error("שגיאה בשליחת הקוד:", error);
        res.status(500).json({ message: "שגיאה בשליחת הקוד", error: error.message });
    }
};

// Verify OTP
const verifyOtp = async (req, res) => {
    const { phoneNumber, otp } = req.body;

    try {
        const result = await sql.query(`
            SELECT Users.UserId, Users.Role 
            FROM OTPs 
            JOIN Users ON OTPs.UserId = Users.UserId 
            WHERE OTPs.PhoneNumber = '${phoneNumber}' 
            AND OTPs.OTP = '${otp}' 
            AND OTPs.Expiry > GETUTCDATE()
        `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ message: "קוד לא תקין" });
        }

        const { UserId, Role } = result.recordset[0];

        const token = jwt.sign(
            { UserId, phoneNumber, role: Role },
            SECRET_KEY,
            { expiresIn: "2h" }
        );

        res.status(200).json({ message: "קוד אומת בהצלחה", token, role: Role });
    } catch (error) {
        console.error("שגיאה בתהליך האימות:", error);
        res.status(500).json({ message: "שגיאה בתהליך האימות" });
    }
};

module.exports = {
    requestOtp,
    verifyOtp
};
