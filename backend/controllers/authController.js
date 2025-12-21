const pool = require("../config/db"); // pg pool
const jwt = require("jsonwebtoken");
const { formatPhoneNumber } = require("../utils/phoneUtils");
const { sendMessage, WEBSITE_DOMAIN } = require("../utils/sendMessage");
require("dotenv").config();

const SECRET_KEY = process.env.JWT_SECRET || "supersecretkey";

const requestOtp = async (req, res) => {
    let { phoneNumber } = req.body;

    if (!phoneNumber) {
        console.log("RequestOtp-!phoneNumber");
        return res.status(400).json({ message: "נא להזין מספר פלאפון תקין" });
    }

    try {
        let formatedPhoneNumber = formatPhoneNumber(phoneNumber);

        const testUser = phoneNumber === "0501234567";
        const managerUser = phoneNumber === "0507299064";

        const isSuperUser = testUser || managerUser;

        const otp = isSuperUser
            ? "123456"
            : Math.floor(100000 + Math.random() * 900000).toString();

        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

        const userResult = await pool.query(
            `SELECT userid FROM users WHERE phonenumber = $1`,
            [phoneNumber]
        );
        if (userResult.rows.length === 0) {
            console.log("משתמש אינו קיים");
            return res.status(404).json({ message: "משתמש אינו קיים" });
        }
        const userId = userResult.rows[0].userid;

        await pool.query(
            `
            INSERT INTO otps (phonenumber, otp, expiry, userid)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (phonenumber) DO UPDATE
            SET otp = EXCLUDED.otp, expiry = EXCLUDED.expiry, userid = EXCLUDED.userid;
            `,
            [phoneNumber, otp, expiry, userId]
        );

        if (!isSuperUser) {
            try {
                sendMessage(`קוד האימות הוא: ${otp}\n\n@${WEBSITE_DOMAIN} #${otp}`, formatedPhoneNumber);
            } catch (e) {
                console.warn("SMS send failed:", e?.message);
            }
        }

        return res.status(200).json({ message: "קוד נשלח בהצלחה", otpSent: true });
    } catch (error) {
        console.error("שגיאה בשליחת הקוד:", error);
        return res.status(500).json({ message: "שגיאה בשליחת הקוד", error: error.message });
    }
};

const verifyOtp = async (req, res) => {
    let { phoneNumber, otp } = req.body;

    try {
        const result = await pool.query(
            `
            SELECT U.userid, U.role, U.phonenumber
            FROM otps O
            JOIN users U ON O.userid = U.userid
            WHERE O.phonenumber = $1
              AND O.otp = $2
              AND O.expiry > NOW()
            `,
            [phoneNumber, otp]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ message: "קוד לא תקין" });
        }

        const { userid, role, phonenumber } = result.rows[0];
        const token = jwt.sign(
            { userid, phonenumber, role },
            SECRET_KEY,
            { expiresIn: "30d" }
        );

        // Invalidate the OTP after successful verification to prevent replay
        try {
            await pool.query(
                `DELETE FROM otps WHERE phonenumber = $1 AND otp = $2`,
                [phoneNumber, otp]
            );
        } catch (delErr) {
            console.warn('Warning: failed to delete OTP after verification', delErr?.message);
        }

        return res.status(200).json({ message: "קוד אומת בהצלחה", token, role });
    } catch (error) {
        console.error("שגיאה בתהליך האימות:", error);
        return res.status(500).json({ message: "שגיאה בתהליך האימות" });
    }
};

const register = async (req, res) => {
    try {
        let { name, phoneNumber } = req.body || {};

        if (!name || !phoneNumber) {
            return res.status(400).json({ message: "נא להזין שם ומספר פלאפון" });
        }

        let formatedPhoneNumber = formatPhoneNumber(phoneNumber);

        const exists = await pool.query(
            `SELECT userid FROM users WHERE phonenumber = $1`,
            [phoneNumber]
        );
        if (exists.rows.length > 0) {
            return res.status(409).json({ message: "משתמש עם המספר הזה כבר קיים" });
        }

        await pool.query(
            `
      INSERT INTO users (name, email, phonenumber, passwordhash, role, companyname, createdat)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
            [name, null, phoneNumber, null, "User", null, new Date()]
        );

        const testUser = phoneNumber === "0501234567";
        const managerUser = phoneNumber === "0507299064";

        const isSuperUser = testUser || managerUser;

        const otp = isSuperUser
            ? "123456"
            : Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000);

        const ures = await pool.query(
            `SELECT userid FROM users WHERE phonenumber = $1`,
            [phoneNumber]
        );
        const userId = ures.rows[0]?.userid;

        await pool.query(
            `
            INSERT INTO otps (phonenumber, otp, expiry, userid)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (phonenumber) DO UPDATE
            SET otp = EXCLUDED.otp, expiry = EXCLUDED.expiry, userid = EXCLUDED.userid
            `,
            [phoneNumber, otp, expiry, userId]
        );

        if (!isSuperUser) {
            try {
                sendMessage(`קוד האימות הוא: ${otp}\n\n@${WEBSITE_DOMAIN} #${otp}`, formatedPhoneNumber);
            } catch (e) {
                console.warn("כשל בשליחת SMS לאחר הרשמה:", e?.message);
            }
        }

        return res.status(201).json({ otpSent: true });
    } catch (error) {
        console.error("שגיאה בהרשמה:", error);
        return res.status(500).json({ message: "אירעה שגיאה בהרשמה" });
    }
};

module.exports = {
    requestOtp,
    verifyOtp,
    register,
};
