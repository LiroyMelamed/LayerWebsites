const pool = require("../config/db"); // Direct import of the pg pool
const bcrypt = require("bcrypt");
const { requireInt } = require("../utils/paramValidation");
const { createAppError } = require('../utils/appError');
const { getHebrewMessage } = require('../utils/errors.he');
const { userHasLegalData } = require('../utils/legalData');

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
    const rawName = req?.query?.name;
    const name = typeof rawName === 'string' ? rawName.trim() : '';

    // If empty query: return a default list so dropdowns can preload.
    if (!name) {
        try {
            const result = await pool.query(
                "SELECT userid, name, email, phonenumber, companyname, createdat FROM users WHERE role = 'Admin' ORDER BY userid DESC"
            );
            return res.json(result.rows);
        } catch (error) {
            console.error("Error retrieving admins:", error);
            return res.status(500).json({ message: "Error retrieving Admins" });
        }
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

        res.status(200).json({ message: "Admin updated successfully" });
    } catch (error) {
        console.error("Error updating admin:", error);
        res.status(500).json({ message: "Error updating admin" });
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
                return res.status(404).json({ message: 'Admin not found or already deleted' });
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
                return res.status(404).json({ message: 'Admin not found or already deleted' });
            }

            return res.status(200).json({ message: 'Admin deleted successfully' });
        } catch (innerError) {
            await client.query('ROLLBACK');
            throw innerError;
        } finally {
            client.release();
        }
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

// Platform-owned plan assignment (tenant = lawyer userId).
// Tenants cannot change retention; only platform admins can assign plans.
const setTenantPlan = async (req, res) => {
    const tenantId = requireInt(req, res, { source: 'params', name: 'tenantId' });
    if (tenantId === null) return;

    const planKeyRaw = req?.body?.plan_key ?? req?.body?.planKey;
    const planKey = String(planKeyRaw || '').trim().toUpperCase();
    if (!planKey) {
        return res.status(422).json({ message: 'plan_key is required' });
    }

    try {
        const planRes = await pool.query(
            'SELECT plan_key FROM subscription_plans WHERE plan_key = $1 LIMIT 1',
            [planKey]
        );
        if (planRes.rowCount === 0) {
            return res.status(404).json({ message: 'Unknown plan_key' });
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
        return res.status(500).json({ message: 'Error setting tenant plan' });
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