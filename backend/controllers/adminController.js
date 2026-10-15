const pool = require("../config/db"); // Direct import of the pg pool
const bcrypt = require("bcrypt");
const { requireInt } = require("../utils/paramValidation");
const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
const { userHasLegalData } = require('../utils/legalData');
const { insertAuditEvent } = require('../utils/auditEvents');

/** Parse HIDDEN_ADMIN_USER_IDS env var into an array of numbers */
function _getHiddenAdminIds() {
    const raw = String(process.env.HIDDEN_ADMIN_USER_IDS || '').trim();
    if (!raw) return [];
    return raw.split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0);
}

/**
 * Retrieves all users with the 'Admin' role (excluding hidden admins).
 */
const getAdmins = async (req, res) => {
    try {
        const hidden = _getHiddenAdminIds();
        let query = "SELECT userid, name, email, phonenumber, companyname, createdat FROM users WHERE role = 'Admin'";
        const params = [];
        if (hidden.length > 0) {
            query += " AND userid <> ALL($1::int[])";
            params.push(hidden);
        }
        const result = await pool.query(query, params);
        res.json(result.rows);
    } catch (error) {
        console.error("Error retrieving Admins:", error);
        res.status(500).json({ message: "שגיאה בשליפת מנהלים" });
    }
};

/**
 * Retrieves an admin by a partial name search (case-insensitive).
 */
const getAdminByName = async (req, res) => {
    // Note: The query parameter is already lowercase
    const rawName = req?.query?.name;
    const name = typeof rawName === 'string' ? rawName.trim() : '';

    // If empty query: return a default list so dropdowns can preload.
    if (!name) {
        try {
            const hidden = _getHiddenAdminIds();
            let query = "SELECT userid, name, email, phonenumber, companyname, createdat FROM users WHERE role = 'Admin'";
            const params = [];
            if (hidden.length > 0) {
                query += " AND userid <> ALL($1::int[])";
                params.push(hidden);
            }
            query += " ORDER BY createdat DESC";
            const result = await pool.query(query, params);
            return res.json(result.rows);
        } catch (error) {
            console.error("Error retrieving admins:", error);
            return res.status(500).json({ message: "שגיאה בשליפת מנהלים" });
        }
    }

    try {
        const hidden = _getHiddenAdminIds();
        let query = "SELECT userid, name, email, phonenumber, companyname, createdat FROM users WHERE role = 'Admin' AND name ILIKE $1";
        const params = [`%${name}%`];
        if (hidden.length > 0) {
            query += " AND userid <> ALL($2::int[])";
            params.push(hidden);
        }
        query += " ORDER BY createdat DESC";
        const result = await pool.query(query, params);

        // Check if any rows were returned
        if (result.rows.length === 0) {
            return res.status(404).json({ message: "לא נמצא מנהל עם שם זה" });
        }

        // Return the found rows
        res.json(result.rows);
    } catch (error) {
        console.error("Error retrieving admin:", error);
        res.status(500).json({ message: "שגיאה בשליפת מנהל לפי שם" });
    }
};

/**
 * Updates an admin's details.
 */
const updateAdmin = async (req, res) => {
    const adminUserId = requireInt(req, res, { source: 'params', name: 'adminId' });
    if (adminUserId === null) return;
    const { name, email, phoneNumber, password } = req.body;

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
            params = [name, email, phoneNumber, hashedPassword, adminUserId];
        } else {
            query = `
                UPDATE users
                SET name = $1, email = $2, phonenumber = $3
                WHERE userid = $4 AND role = 'Admin'
            `;
            // Using lowercase column names in the params array as well
            params = [name, email, phoneNumber, adminUserId];
        }

        await pool.query(query, params); // Execute query with parameters

        res.status(200).json({ message: "המנהל עודכן בהצלחה" });
    } catch (error) {
        console.error("Error updating admin:", error);
        res.status(500).json({ message: "שגיאה בעדכון מנהל" });
    }
};

/**
 * Deletes an admin.
 */
const deleteAdmin = async (req, res, next) => {
    const adminUserId = requireInt(req, res, { source: 'params', name: 'adminId' });
    if (adminUserId === null) return;

    try {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');

            // Block deletion if the user has any legal/evidentiary data.
            // Must run BEFORE any DELETE/UPDATE query.
            const hasLegalData = await userHasLegalData(client, adminUserId);
            if (hasLegalData) {
                await client.query('ROLLBACK');
                return next(createAppError('USER_HAS_LEGAL_DATA', 409, getHebrewMessage('USER_HAS_LEGAL_DATA')));
            }

            // Ensure the target exists and is an Admin before cascading deletes.
            const roleRes = await client.query('SELECT role FROM users WHERE userid = $1', [adminUserId]);
            if (roleRes.rowCount === 0 || roleRes.rows[0]?.role !== 'Admin') {
                await client.query('ROLLBACK');
                return res.status(404).json({ message: 'המנהל לא נמצא או כבר נמחק' });
            }

            // Mirror customer deletion cascade to satisfy FK constraints.
            await client.query('DELETE FROM userdevices WHERE userid = $1', [adminUserId]);
            await client.query('DELETE FROM otps WHERE userid = $1', [adminUserId]);
            await client.query('DELETE FROM usernotifications WHERE userid = $1', [adminUserId]);

            // Signing: signingfiles has FKs to users (lawyerid/clientid) without ON DELETE CASCADE.
            // Delete related signingfiles first so deleting the admin user succeeds.
            await client.query('DELETE FROM signingfiles WHERE lawyerid = $1 OR clientid = $1', [adminUserId]);

            // Cases (defensive): if an admin ever owns cases, remove them too.
            await client.query(
                `
                DELETE FROM casedescriptions
                WHERE caseid IN (SELECT caseid FROM cases WHERE userid = $1)
                `,
                [adminUserId]
            );
            await client.query('DELETE FROM cases WHERE userid = $1', [adminUserId]);

            const result = await client.query(
                `DELETE FROM users WHERE userid = $1 AND role = 'Admin'`,
                [adminUserId]
            );

            await client.query('COMMIT');

            if (result.rowCount === 0) {
                return res.status(404).json({ message: 'המנהל לא נמצא או כבר נמחק' });
            }

            return res.status(200).json({ message: 'המנהל נמחק בהצלחה' });
        } catch (innerError) {
            await client.query('ROLLBACK');
            throw innerError;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Error deleting admin:", error);
        res.status(500).json({ message: "שגיאה במחיקת מנהל" });
    }
};

/**
 * Adds a new admin.
 */
const addAdmin = async (req, res) => {
    const { name, email, phoneNumber, password } = req.body;
    try {
        if (!password) {
            return res.status(422).json({ message: "סיסמה היא שדה חובה" });
        }
        const hashedPassword = await bcrypt.hash(password, 10);

        const insertResult = await pool.query(
            `
            INSERT INTO users (name, email, phonenumber, passwordhash, role, createdat)
            VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING userid
            `,
            [name, email, phoneNumber, hashedPassword, "Admin"]
        );
        const newAdminId = insertResult.rows[0]?.userid;

        try {
            await insertAuditEvent({
                req,
                eventType: 'ADMIN_CREATED',
                actorUserId: req.user?.UserId ?? null,
                actorType: 'Admin',
                success: true,
                metadata: { newAdminId, newAdminName: name },
            });
        } catch (auditErr) {
            console.error('[addAdmin] Audit log failed (non-fatal):', auditErr?.message);
        }

        res.status(201).json({ message: "המנהל נוסף בהצלחה" });
    } catch (error) {
        console.error("Error adding admin:", error);
        res.status(500).json({ message: "שגיאה בהוספת מנהל" });
    }
};

// Platform-owned plan assignment (tenant = lawyer userId).
// Tenants cannot change retention; only platform admins can assign plans.
const setTenantPlan = async (req, res) => {
    const tenantId = requireInt(req, res, { source: 'params', name: 'tenantId' });
    if (tenantId === null) return;

    const planKeyRaw = req?.body?.plan_key ?? req?.body?.planKey;
    const planKey = String(planKeyRaw || '').trim().toUpperCase();
    if (!planKey) {
        return res.status(422).json({ message: 'שדה plan_key הוא חובה' });
    }

    try {
        const planRes = await pool.query(
            'SELECT plan_key FROM subscription_plans WHERE plan_key = $1 LIMIT 1',
            [planKey]
        );
        if (planRes.rowCount === 0) {
            return res.status(404).json({ message: 'מפתח תוכנית לא מוכר' });
        }

        await pool.query(
            `INSERT INTO tenant_subscriptions(tenant_id, plan_key, status, starts_at, ends_at, updated_at)
             VALUES ($1, $2, 'active', now(), NULL, now())
             ON CONFLICT (tenant_id) DO UPDATE
             SET plan_key = EXCLUDED.plan_key,
                 status = 'active',
                 ends_at = NULL,
                 starts_at = COALESCE(tenant_subscriptions.starts_at, now()),
                 updated_at = now()`,
            [tenantId, planKey]
        );

        return res.status(200).json({ tenantId, plan_key: planKey, status: 'active' });
    } catch (error) {
        console.error('Error setting tenant plan:', error);
        return res.status(500).json({ message: 'שגיאה בהגדרת תוכנית הדייר' });
    }
};

module.exports = {
    getAdmins,
    getAdminByName,
    updateAdmin,
    deleteAdmin,
    addAdmin,
    setTenantPlan,
};