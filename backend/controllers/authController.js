const pool = require("../config/db"); // pg pool
const jwt = require("jsonwebtoken");
const { formatPhoneNumber } = require("../utils/phoneUtils");
const { sendMessage, WEBSITE_DOMAIN } = require("../utils/sendMessage");
require("dotenv").config();

const SECRET_KEY = process.env.JWT_SECRET || "supersecretkey";

// Helper to avoid exposing full phone number
function maskPhone(phone) {
    if (!phone) return phone;
    const cleaned = phone.toString().trim();
    if (cleaned.length <= 4) return "***" + cleaned;
    return cleaned.slice(0, 3) + "****" + cleaned.slice(-2);
}

const requestOtp = async (req, res) => {
    const requestId = Date.now() + "-" + Math.random().toString(36).substring(2, 8);
    console.log("=== [requestOtp] START ===", { requestId, time: new Date().toISOString() });

    let { phoneNumber } = req.body || {};
    console.log("[requestOtp] incoming body:", {
        requestId,
        rawBody: req.body,
        phoneNumberMasked: maskPhone(phoneNumber),
    });

    if (!phoneNumber) {
        console.log("[requestOtp] !phoneNumber → 400", { requestId });
        return res.status(400).json({ message: "נא להזין מספר פלאפון תקין" });
    }

    try {
        let formatedPhoneNumber = formatPhoneNumber(phoneNumber);
        console.log("[requestOtp] formatted phone:", {
            requestId,
            formatted: formatedPhoneNumber,
            originalMasked: maskPhone(phoneNumber),
        });

        const testUser = phoneNumber === "0501234567";
        const managerUser = phoneNumber === "0507299064";
        const isSuperUser = testUser || managerUser;

        console.log("[requestOtp] user classification:", {
            requestId,
            testUser,
            managerUser,
            isSuperUser,
        });

        const otp = isSuperUser
            ? "123456"
            : Math.floor(100000 + Math.random() * 900000).toString();

        const expiry = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
        console.log("[requestOtp] generated OTP (masked in logs):", {
            requestId,
            otpLength: otp.length,
            expiry,
        });

        console.log("[requestOtp] querying user by phone", {
            requestId,
            phoneNumberMasked: maskPhone(phoneNumber),
        });

        const userResult = await pool.query(
            `SELECT userid FROM users WHERE phonenumber = $1`,
            [phoneNumber]
        );

        console.log("[requestOtp] user query result:", {
            requestId,
            rowCount: userResult.rows.length,
            rowsSample: userResult.rows.slice(0, 1),
        });

        if (userResult.rows.length === 0) {
            console.log("[requestOtp] user not found → 404", {
                requestId,
                phoneNumberMasked: maskPhone(phoneNumber),
            });
            return res.status(404).json({ message: "משתמש אינו קיים" });
        }

        const userId = userResult.rows[0].userid;
        console.log("[requestOtp] inserting/updating OTP in DB", {
            requestId,
            userId,
            phoneNumberMasked: maskPhone(phoneNumber),
        });

        await pool.query(
            `
            INSERT INTO otps (phonenumber, otp, expiry, userid)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (phonenumber) DO UPDATE
            SET otp = EXCLUDED.otp, expiry = EXCLUDED.expiry, userid = EXCLUDED.userid;
            `,
            [phoneNumber, otp, expiry, userId]
        );

        console.log("[requestOtp] OTP saved to DB", { requestId, userId });

        if (!isSuperUser) {
            try {
                console.log("[requestOtp] sending SMS via Twilio", {
                    requestId,
                    to: formatedPhoneNumber,
                });
                sendMessage(
                    `קוד האימות הוא: ${otp} \n\n @${WEBSITE_DOMAIN}`,
                    formatedPhoneNumber
                );
                console.log("[requestOtp] SMS send attempted (no exception thrown)", {
                    requestId,
                });
            } catch (e) {
                console.warn("[requestOtp] SMS send failed:", {
                    requestId,
                    message: e?.message,
                    stack: e?.stack,
                });
            }
        } else {
            console.log("[requestOtp] super user → skipping SMS send", { requestId });
        }

        console.log("[requestOtp] SUCCESS → 200", { requestId });
        return res.status(200).json({ message: "קוד נשלח בהצלחה", otpSent: true });
    } catch (error) {
        console.error("[requestOtp] ERROR:", {
            requestId,
            message: error?.message,
            stack: error?.stack,
        });
        return res
            .status(500)
            .json({ message: "שגיאה בשליחת הקוד", error: error.message });
    } finally {
        console.log("=== [requestOtp] END ===", { requestId, time: new Date().toISOString() });
    }
};

const verifyOtp = async (req, res) => {
    const requestId = Date.now() + "-" + Math.random().toString(36).substring(2, 8);
    console.log("=== [verifyOtp] START ===", { requestId, time: new Date().toISOString() });

    let { phoneNumber, otp } = req.body || {};
    console.log("[verifyOtp] incoming body:", {
        requestId,
        phoneNumberMasked: maskPhone(phoneNumber),
        otpLength: otp ? otp.toString().length : null,
    });

    try {
        console.log("[verifyOtp] querying OTP from DB", {
            requestId,
            phoneNumberMasked: maskPhone(phoneNumber),
        });

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

        console.log("[verifyOtp] query result:", {
            requestId,
            rowCount: result.rows.length,
            rowsSample: result.rows.slice(0, 1),
        });

        if (result.rows.length === 0) {
            console.log("[verifyOtp] invalid or expired OTP → 401", { requestId });
            return res.status(401).json({ message: "קוד לא תקין" });
        }

        const { userid, role, phonenumber } = result.rows[0];
        console.log("[verifyOtp] generating JWT token", {
            requestId,
            userid,
            role,
            phoneMasked: maskPhone(phonenumber),
        });

        const token = jwt.sign(
            { userid, phonenumber, role },
            SECRET_KEY,
            { expiresIn: "30d" }
        );

        try {
            console.log("[verifyOtp] deleting OTP after verification", {
                requestId,
                phoneNumberMasked: maskPhone(phoneNumber),
            });
            await pool.query(
                `DELETE FROM otps WHERE phonenumber = $1 AND otp = $2`,
                [phoneNumber, otp]
            );
            console.log("[verifyOtp] OTP deleted", { requestId });
        } catch (delErr) {
            console.warn("[verifyOtp] failed to delete OTP", {
                requestId,
                message: delErr?.message,
                stack: delErr?.stack,
            });
        }

        console.log("[verifyOtp] SUCCESS → 200", {
            requestId,
            userid,
            role,
        });

        return res.status(200).json({ message: "קוד אומת בהצלחה", token, role });
    } catch (error) {
        console.error("[verifyOtp] ERROR:", {
            requestId,
            message: error?.message,
            stack: error?.stack,
        });
        return res.status(500).json({ message: "שגיאה בתהליך האימות" });
    } finally {
        console.log("=== [verifyOtp] END ===", { requestId, time: new Date().toISOString() });
    }
};

const register = async (req, res) => {
    const requestId = Date.now() + "-" + Math.random().toString(36).substring(2, 8);
    console.log("=== [register] START ===", { requestId, time: new Date().toISOString() });

    try {
        let { name, phoneNumber } = req.body || {};
        console.log("[register] incoming body:", {
            requestId,
            name,
            phoneNumberMasked: maskPhone(phoneNumber),
        });

        if (!name || !phoneNumber) {
            console.log("[register] missing name/phone → 400", { requestId });
            return res.status(400).json({ message: "נא להזין שם ומספר פלאפון" });
        }

        let formatedPhoneNumber = formatPhoneNumber(phoneNumber);
        console.log("[register] formatted phone:", {
            requestId,
            formatted: formatedPhoneNumber,
            originalMasked: maskPhone(phoneNumber),
        });

        console.log("[register] checking if user exists", {
            requestId,
            phoneNumberMasked: maskPhone(phoneNumber),
        });

        const exists = await pool.query(
            `SELECT userid FROM users WHERE phonenumber = $1`,
            [phoneNumber]
        );

        console.log("[register] exists query:", {
            requestId,
            rowCount: exists.rows.length,
            rowsSample: exists.rows.slice(0, 1),
        });

        if (exists.rows.length > 0) {
            console.log("[register] user already exists → 409", {
                requestId,
                phoneNumberMasked: maskPhone(phoneNumber),
            });
            return res
                .status(409)
                .json({ message: "משתמש עם המספר הזה כבר קיים" });
        }

        console.log("[register] inserting new user", {
            requestId,
            name,
            phoneNumberMasked: maskPhone(phoneNumber),
        });

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

        console.log("[register] user classification:", {
            requestId,
            testUser,
            managerUser,
            isSuperUser,
        });

        const otp = isSuperUser
            ? "123456"
            : Math.floor(100000 + Math.random() * 900000).toString();
        const expiry = new Date(Date.now() + 5 * 60 * 1000);

        console.log("[register] generated OTP (masked):", {
            requestId,
            otpLength: otp.length,
            expiry,
        });

        const ures = await pool.query(
            `SELECT userid FROM users WHERE phonenumber = $1`,
            [phoneNumber]
        );

        console.log("[register] user after insert:", {
            requestId,
            rowCount: ures.rows.length,
            rowsSample: ures.rows.slice(0, 1),
        });

        const userId = ures.rows[0]?.userid;

        console.log("[register] inserting/updating OTP for new user", {
            requestId,
            userId,
            phoneNumberMasked: maskPhone(phoneNumber),
        });

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
                console.log("[register] sending SMS via Twilio for new user", {
                    requestId,
                    to: formatedPhoneNumber,
                });
                sendMessage(
                    `קוד האימות הוא: ${otp} \n\n @${WEBSITE_DOMAIN}`,
                    formatedPhoneNumber
                );
                console.log("[register] SMS send attempted (no exception thrown)", {
                    requestId,
                });
            } catch (e) {
                console.warn("[register] כשל בשליחת SMS לאחר הרשמה:", {
                    requestId,
                    message: e?.message,
                    stack: e?.stack,
                });
            }
        } else {
            console.log("[register] super user → skipping SMS send", { requestId });
        }

        console.log("[register] SUCCESS → 201", { requestId });
        return res.status(201).json({ otpSent: true });
    } catch (error) {
        console.error("[register] ERROR:", {
            requestId,
            message: error?.message,
            stack: error?.stack,
        });
        return res.status(500).json({ message: "אירעה שגיאה בהרשמה" });
    } finally {
        console.log("=== [register] END ===", { requestId, time: new Date().toISOString() });
    }
};

module.exports = {
    requestOtp,
    verifyOtp,
    register,
};
