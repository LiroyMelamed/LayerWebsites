const { sql, connectDb } = require("../config/db");
const jwt = require("jsonwebtoken");
const { formatPhoneNumber } = require("../utils/phoneUtils");
const { sendMessage, WEBSITE_DOMAIN } = require("../utils/sendMessage");
require("dotenv").config();

const SECRET_KEY = process.env.JWT_SECRET || "supersecretkey";

const requestOtp = async (req, res) => {
    const { phoneNumber } = req.body;

    console.log('RequestOtp', phoneNumber);

    if (!phoneNumber) {
        console.log('RequestOtp-!phoneNumber');
        return res.status(400).json({ message: "נא להזין מספר פלאפון תקין" });
    }

    try {
        const pool = await connectDb(); // Get the connected pool

        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes expiry

        console.log('Generated OTP for DB:', otp);
        console.log('Calculated Expiry for DB:', expiry.toISOString());
        console.log('Current Time:', new Date().toISOString());

        // 1. Check for user existence using a parameterized query
        const userRequest = pool.request();
        userRequest.input('phoneNumber', sql.NVarChar, phoneNumber);
        const userResult = await userRequest.query(`SELECT UserId FROM Users WHERE PhoneNumber = @phoneNumber`);

        if (userResult.recordset.length === 0) {
            console.log("משתמש אינו קיים");
            return res.status(404).json({ message: "משתמש אינו קיים" });
        }
        const userId = userResult.recordset[0].UserId;

        // 2. MERGE INTO OTPs using parameterized query
        const otpRequest = pool.request();
        otpRequest.input('phoneNumber', sql.NVarChar, phoneNumber);
        otpRequest.input('otp', sql.NVarChar, otp);
        otpRequest.input('expiry', sql.DateTime2, expiry);
        otpRequest.input('userId', sql.Int, userId);

        await otpRequest.query(`
            MERGE INTO OTPs AS target
            USING (SELECT @phoneNumber AS PhoneNumber, @otp AS OTP, @expiry AS Expiry, @userId AS UserId) AS source
            ON target.PhoneNumber = source.PhoneNumber
            WHEN MATCHED THEN UPDATE SET OTP = source.OTP, Expiry = source.Expiry
            WHEN NOT MATCHED THEN INSERT (PhoneNumber, OTP, Expiry, UserId) VALUES (source.PhoneNumber, source.OTP, source.Expiry, source.UserId);
        `);

        const formattedPhone = formatPhoneNumber(phoneNumber);

        sendMessage(`קוד האימות הוא: ${otp} \n\n @${WEBSITE_DOMAIN}`, formattedPhone);

        res.status(200).json({ message: "קוד נשלח בהצלחה" });
    } catch (error) {
        console.error("שגיאה בשליחת הקוד:", error);
        res.status(500).json({ message: "שגיאה בשליחת הקוד", error: error.message });
    }
};

const verifyOtp = async (req, res) => {
    const { phoneNumber, otp } = req.body;

    try {
        const pool = await connectDb(); // Get the connected pool
        const request = pool.request();
        request.input('phoneNumber', sql.NVarChar, phoneNumber);
        request.input('otp', sql.NVarChar, otp);

        const result = await request.query(`
            SELECT Users.UserId, Users.Role, Users.PhoneNumber
            FROM OTPs
            JOIN Users ON OTPs.UserId = Users.UserId
            WHERE OTPs.PhoneNumber = @phoneNumber
            AND OTPs.OTP = @otp
            AND OTPs.Expiry > GETUTCDATE()
        `);

        if (result.recordset.length === 0) {
            return res.status(401).json({ message: "קוד לא תקין" });
        }

        const { UserId, Role, PhoneNumber } = result.recordset[0];

        const token = jwt.sign(
            { UserId, phoneNumber: PhoneNumber, role: Role }, // Use PhoneNumber from DB for consistency
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
    verifyOtp,
};
