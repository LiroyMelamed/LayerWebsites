const { GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const pool = require("../config/db");
const { formatPhoneNumber } = require("../utils/phoneUtils");
const { sendMessage, COMPANY_NAME } = require("../utils/sendMessage");
const { BUCKET, r2 } = require("../utils/r2");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { requireInt } = require("../utils/paramValidation");
const { getPagination } = require("../utils/pagination");
const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
const { userHasLegalData } = require('../utils/legalData');
const { insertAuditEvent, getRequestIp, getRequestUserAgent } = require('../utils/auditEvents');
const { invalidateMainScreenDataCache } = require('../utils/mainScreenDataCache');

function requireAdmin(req, res) {
    if (req.user?.Role !== 'Admin') {
        res.status(403).json({ message: "אין הרשאה", code: 'FORBIDDEN' });
        return false;
    }
    return true;
}

function normalizePhoneDigits(phone) {
    const digits = String(phone ?? '').replace(/\D/g, '');
    return digits || null;
}

const getCustomers = async (req, res) => {
    if (!requireAdmin(req, res)) return;
    try {
        const pagination = getPagination(req, res, { defaultLimit: 200, maxLimit: 500 });
        if (pagination === null) return;

        const query = pagination.enabled
            ? "SELECT * FROM users WHERE role <> 'Admin' AND role <> 'Deleted' ORDER BY createdat DESC LIMIT $1 OFFSET $2"
            : "SELECT * FROM users WHERE role <> 'Admin' AND role <> 'Deleted'";

        const params = pagination.enabled ? [pagination.limit, pagination.offset] : [];
        const result = await pool.query(query, params);
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
    if (!requireAdmin(req, res)) return;
    const { name, phoneNumber, email, companyName } = req.body;

    try {
        const phoneDigits = normalizePhoneDigits(phoneNumber);
        if (!phoneDigits) {
            return res.status(400).json({ message: "נא להזין מספר פלאפון תקין", code: 'INVALID_PHONE' });
        }

        const existing = await pool.query(
            `SELECT userid FROM users WHERE regexp_replace(phonenumber, '\\D', '', 'g') = $1 LIMIT 1`,
            [phoneDigits]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ message: "מספר פלאפון כבר קיים במערכת", code: 'PHONE_ALREADY_EXISTS' });
        }

        await pool.query(
            `
            INSERT INTO users (name, email, phonenumber, passwordhash, role, companyname, createdat)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            `,
            [name, email, phoneNumber, null, "User", companyName, new Date()]
        );

        const formattedPhone = formatPhoneNumber(phoneNumber);
        try {
            sendMessage(
                `היי ${name}, ברוכים הבאים לשירות החדש שלנו.\n\n בלינק הבא תוכל להשלים את ההרשמה לשירות.\n\n בברכה ${COMPANY_NAME}`,
                formattedPhone
            );
        } catch (e) {
            console.warn('Warning: failed to send welcome SMS:', e?.message);
        }

        res.status(201).json({ message: "לקוח הוקם בהצלחה" });

    } catch (error) {
        console.error('Error adding customer:', error);
        if (error?.code === '23505') {
            return res.status(409).json({ message: "מספר פלאפון כבר קיים במערכת", code: 'PHONE_ALREADY_EXISTS' });
        }
        res.status(500).json({ message: "שגיאה ביצירת לקוח" });
    }
};

const updateCustomerById = async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const customerId = requireInt(req, res, { source: 'params', name: 'customerId' });
    if (customerId === null) return;

    const { name, email, phoneNumber, companyName } = req.body;
    try {
        const phoneDigits = normalizePhoneDigits(phoneNumber);
        if (!phoneDigits) {
            return res.status(400).json({ message: "נא להזין מספר פלאפון תקין", code: 'INVALID_PHONE' });
        }

        const existing = await pool.query(
            `SELECT userid FROM users WHERE regexp_replace(phonenumber, '\\D', '', 'g') = $1 AND userid <> $2 LIMIT 1`,
            [phoneDigits, customerId]
        );
        if (existing.rows.length > 0) {
            return res.status(409).json({ message: "מספר פלאפון כבר קיים במערכת", code: 'PHONE_ALREADY_EXISTS' });
        }

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
        if (error?.code === '23505') {
            return res.status(409).json({ message: "מספר פלאפון כבר קיים במערכת", code: 'PHONE_ALREADY_EXISTS' });
        }
        res.status(500).json({ message: "שגיאה בעדכון לקוח" });
    }
};

const getCustomerByName = async (req, res) => {
    if (!requireAdmin(req, res)) return;
    const rawUserName = req?.query?.userName;
    const userName = typeof rawUserName === 'string' ? rawUserName.trim() : '';

    try {
        const pagination = getPagination(req, res, { defaultLimit: 50, maxLimit: 200 });
        if (pagination === null) return;

        // If empty query: return a default list so dropdowns can preload.
        if (!userName) {
            const limit = pagination.enabled ? pagination.limit : 200;
            const offset = pagination.enabled ? pagination.offset : 0;

            const result = await pool.query(
                `
                SELECT userid, name, email, phonenumber, companyname
                FROM users
                WHERE role <> 'Admin' AND role <> 'Deleted'
                ORDER BY userid DESC
                LIMIT $1 OFFSET $2
                `,
                [limit, offset]
            );

            return res.json(result.rows.map(row => ({
                UserId: row.userid,
                Name: row.name,
                Email: row.email,
                PhoneNumber: row.phonenumber,
                CompanyName: row.companyname
            })));
        }

        const baseQuery = `
            SELECT userid, name, email, phonenumber, companyname
                        FROM users
                        WHERE role <> 'Admin' AND role <> 'Deleted'
              AND (name ILIKE $1 OR email ILIKE $1 OR phonenumber ILIKE $1 OR companyname ILIKE $1)
        `;

        const query = pagination.enabled
            ? `${baseQuery} ORDER BY userid DESC LIMIT $2 OFFSET $3`
            : baseQuery;

        const params = pagination.enabled
            ? [`%${userName}%`, pagination.limit, pagination.offset]
            : [`%${userName}%`];

        const result = await pool.query(query, params);

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

        const v = row.profilepicurl;
        let profilePicReadUrl = null;
        let photoKey = null;

        if (v) {
            const isR2Key = typeof v === "string" && v.startsWith(`users/${row.userid}/`);
            const isHttp = typeof v === "string" && /^https?:\/\//i.test(v);
            const isDataUrl = typeof v === "string" && /^data:image\//i.test(v);

            if (isR2Key) {
                try {
                    const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: v });
                    profilePicReadUrl = await getSignedUrl(r2, cmd, { expiresIn: 600 });
                    photoKey = v;
                } catch (e) {
                }
            } else if (isHttp || isDataUrl) {
                profilePicReadUrl = v;
            } else if (typeof v === "string" && v.length > 200) {
                profilePicReadUrl = `data:image/jpeg;base64,${v}`;
            }
        }

        return res.json({
            UserId: row.userid,
            Name: row.name,
            Email: row.email,
            PhoneNumber: row.phonenumber,
            CompanyName: row.companyname,
            DateOfBirth: row.dateofbirth,
            ProfilePicUrl: row.profilepicurl,
            ProfilePicReadUrl: profilePicReadUrl,
            PhotoKey: photoKey,
            Role: row.role
        });
    } catch (error) {
        console.error("Error retrieving current customer:", error);
        res.status(500).json({ message: "Error retrieving current customer profile." });
    }
};


const updateCurrentCustomer = async (req, res) => {
    const userId = req.user.UserId;
    const {
        Name,
        PhoneNumber,
        Email,
        CompanyName,
        dateOfBirth,
        PhotoKey,
        profilePicBase64,
    } = req.body;

    try {
        const cur = await pool.query("SELECT profilepicurl FROM users WHERE userid = $1", [userId]);
        const oldKey = cur.rows?.[0]?.profilepicurl || null;

        let sql = `
      UPDATE users
      SET name=$1,
          email=$2,
          phonenumber=$3,
          companyname=$4,
          dateofbirth=$5
    `;
        const params = [Name, Email, PhoneNumber, CompanyName, dateOfBirth ? new Date(dateOfBirth) : null];
        let i = params.length;

        if (PhotoKey !== undefined && PhotoKey !== null) {
            i++; sql += `, profilepicurl=$${i}`;
            params.push(PhotoKey);
        } else if (profilePicBase64 !== undefined && profilePicBase64 !== null) {
            i++; sql += `, profilepicurl=$${i}`;
            params.push(profilePicBase64);
        }

        i++; sql += ` WHERE userid=$${i}`;
        params.push(userId);

        const result = await pool.query(sql, params);
        if (result.rowCount === 0) {
            return res.status(404).json({ message: "User not found." });
        }

        if (PhotoKey && oldKey && oldKey !== PhotoKey && oldKey.startsWith(`users/${userId}/`)) {
            try {
                try { await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: oldKey })); } catch { }
                await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: oldKey }));
            } catch (e) {
                console.warn("Failed to delete old profile photo:", e?.message);
            }
        }

        let profilePicReadUrl = null;
        let finalKey = PhotoKey ?? (typeof profilePicBase64 === "string" ? null : null);

        if (PhotoKey) {
            try {
                const cmd = new GetObjectCommand({ Bucket: BUCKET, Key: PhotoKey });
                profilePicReadUrl = await getSignedUrl(r2, cmd, { expiresIn: 600 });
            } catch { }
        } else if (profilePicBase64) {
            profilePicReadUrl = `data:image/jpeg;base64,${profilePicBase64}`;
        }

        return res.status(200).json({
            message: "עדכון פרופיל לקוח בוצע בהצלחה",
            PhotoKey: finalKey || null,
            ProfilePicReadUrl: profilePicReadUrl,
        });
    } catch (error) {
        console.error("Error updating current customer profile:", error);
        return res.status(500).json({ message: "שגיאה בעדכון פרופיל לקוח" });
    }
};

const deleteCustomer = async (req, res, next) => {
    const userId = requireInt(req, res, { source: 'params', name: 'userId' });
    if (userId === null) return;

    const role = String(req.user?.Role || '');
    const isAdmin = role === 'Admin';
    const isLawyer = role === 'Lawyer';
    if (!isAdmin && !isLawyer) {
        return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
    }

    const confirmRaw = String(req.query?.confirmLegalDelete ?? '').trim().toLowerCase();
    const confirmLegalDelete = confirmRaw === '1' || confirmRaw === 'true' || confirmRaw === 'yes';
    if (confirmLegalDelete && !isAdmin && !isLawyer) {
        return next(createAppError('FORBIDDEN', 403, getHebrewMessage('FORBIDDEN')));
    }

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // If the client has legal/evidentiary data, we do NOT hard-delete.
            // Instead we require explicit confirmation and then anonymize + disable the account
            // (role='Deleted') so all cases/signing/audit history stays intact.
            const hasLegalData = await userHasLegalData(client, userId);
            if (hasLegalData && !confirmLegalDelete) {
                await client.query('ROLLBACK');
                return next(
                    createAppError(
                        'CLIENT_HAS_LEGAL_DATA',
                        409,
                        getHebrewMessage('CLIENT_HAS_LEGAL_DATA'),
                        { clientId: userId },
                        undefined,
                        { legacyErrorCode: 'USER_HAS_LEGAL_DATA' }
                    )
                );
            }

            const shouldAuditConfirmedDelete = Boolean(hasLegalData && confirmLegalDelete);

            const actorAuditRes = await client.query(
                'SELECT 1 FROM audit_events WHERE actor_userid = $1 LIMIT 1',
                [userId]
            );
            const hasActorAuditEvents = actorAuditRes.rowCount > 0;

            // 1. מחיקת רשומות קשורות בטבלה userdevices
            await client.query("DELETE FROM userdevices WHERE userid = $1", [userId]);

            // 2. מחיקת רשומות קשורות בטבלה otps
            await client.query("DELETE FROM otps WHERE userid = $1", [userId]);

            // 3. מחיקת רשומות קשורות בטבלה usernotifications
            await client.query("DELETE FROM usernotifications WHERE userid = $1", [userId]);

            let deleteResult;

            if (hasLegalData) {
                // Keep cases/signing/audit history. Only anonymize + disable the user.
                deleteResult = await client.query(
                    `UPDATE users
                     SET name = $2,
                         email = NULL,
                         phonenumber = NULL,
                         passwordhash = NULL,
                         role = 'Deleted',
                         companyname = NULL,
                         dateofbirth = NULL,
                         profilepicurl = NULL
                     WHERE userid = $1`,
                    [userId, `לקוח מחוק (${userId})`]
                );
            } else {
                // No legal/evidentiary data: proceed with cleanup + hard-delete when possible.
                // Detach signing files if any (should be none in this branch, but keep it safe).
                await client.query("UPDATE signingfiles SET clientid = NULL WHERE clientid = $1", [userId]);

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

                // If this user appears in audit_events.actor_userid, hard delete would attempt
                // to UPDATE audit_events (ON DELETE SET NULL) and will fail due to append-only trigger.
                // In that case, anonymize + disable the account instead of deleting the row.
                deleteResult = hasActorAuditEvents
                    ? await client.query(
                        `UPDATE users
                         SET name = $2,
                             email = NULL,
                             phonenumber = NULL,
                             passwordhash = NULL,
                             role = 'Deleted',
                             companyname = NULL,
                             dateofbirth = NULL,
                             profilepicurl = NULL
                         WHERE userid = $1`,
                        [userId, `לקוח מחוק (${userId})`]
                    )
                    : await client.query('DELETE FROM users WHERE userid = $1', [userId]);
            }

            await client.query('COMMIT');

            // Ensure dashboard reflects the change immediately.
            invalidateMainScreenDataCache();

            if (shouldAuditConfirmedDelete && deleteResult.rowCount > 0) {
                await insertAuditEvent({
                    req,
                    eventType: 'CLIENT_DELETE_CONFIRMED',
                    actorUserId: req.user?.UserId || null,
                    actorType: role || null,
                    success: true,
                    metadata: {
                        clientId: userId,
                        ip: getRequestIp(req),
                        userAgent: getRequestUserAgent(req),
                    },
                });
            }

            if (deleteResult.rowCount === 0) {
                return res.status(404).json({ message: "Customer not found" });
            }

            if (hasLegalData) {
                return res.status(200).json({ message: "הלקוח הוסר מרשימת הלקוחות והמידע המשפטי נשמר" });
            }

            return res.status(200).json({ message: "לקוח וכל הנתונים המשוייכים נמחקו בהצלחה" });
        } catch (innerError) {
            await client.query('ROLLBACK');
            throw innerError;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Error deleting customer:", error);
        return next(error);
    }
};

const deleteMyAccount = async (req, res, next) => {
    const userId = req.user && (req.user.UserId || req.user.id);

    if (!userId) {
        return res.status(401).json({ message: "Not authorized" });
    }

    try {
        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // Optional: prevent admins from self-deleting via this endpoint
            const roleRes = await client.query("SELECT role FROM users WHERE userid = $1", [userId]);
            if (roleRes.rows.length === 0) {
                await client.query("ROLLBACK");
                return res.status(404).json({ message: "User not found" });
            }
            const userRole = roleRes.rows[0].role;
            if (userRole && userRole.toLowerCase() === "admin") {
                await client.query("ROLLBACK");
                return res.status(403).json({ message: "Admins cannot delete account via this endpoint" });
            }

            // Block deletion if the user has any legal/evidentiary data.
            // Must run BEFORE any DELETE/UPDATE query.
            const hasLegalData = await userHasLegalData(client, userId);
            if (hasLegalData) {
                await client.query('ROLLBACK');
                return next(createAppError('USER_HAS_LEGAL_DATA', 409, getHebrewMessage('USER_HAS_LEGAL_DATA')));
            }

            // 1) Related tables
            await client.query("DELETE FROM userdevices WHERE userid = $1", [userId]);
            await client.query("DELETE FROM otps WHERE userid = $1", [userId]);
            await client.query("DELETE FROM usernotifications WHERE userid = $1", [userId]);

            // Signing: keep signing history, just detach this account from being the client.
            await client.query("UPDATE signingfiles SET clientid = NULL WHERE clientid = $1", [userId]);
            await client.query(`
                DELETE FROM casedescriptions
                WHERE caseid IN (SELECT caseid FROM cases WHERE userid = $1)
            `, [userId]);
            await client.query("DELETE FROM cases WHERE userid = $1", [userId]);

            // 2) User
            const delRes = await client.query("DELETE FROM users WHERE userid = $1", [userId]);

            await client.query("COMMIT");

            if (delRes.rowCount === 0) {
                return res.status(404).json({ message: "User not found" });
            }

            return res.status(200).json({
                success: true,
                message: "Your account and associated data were permanently deleted. החשבון וכל הנתונים המשויכים נמחקו לצמיתות."
            });
        } catch (err) {
            await client.query("ROLLBACK");
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Error deleting my account:", error);
        return next(error);
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
    deleteMyAccount,
};
