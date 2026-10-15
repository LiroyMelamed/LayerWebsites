// Direct import of the pg pool instance from a local configuration file
const pool = require("../config/db");
const { getMainScreenDataCached } = require("../utils/mainScreenDataCache");

/**
 * Retrieves and aggregates all necessary data for the main dashboard screen.
 * Uses SQL aggregates for case counts (avoids shipping every case row to the client).
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
const getMainScreenData = async (req, res) => {
    try {
        const userId = req.user?.UserId;

        const payload = await getMainScreenDataCached({
            loader: async () => {
                const [caseCountsResult, customersResult, activeCustomersCountResult] = await Promise.all([
                    pool.query(`
                        SELECT
                            COUNT(*)::int AS total,
                            COUNT(*) FILTER (WHERE isclosed = false)::int AS open,
                            COUNT(*) FILTER (WHERE isclosed = true)::int AS closed
                        FROM cases
                    `),
                    pool.query(
                        `SELECT userid, name, email, phonenumber, companyname, createdat, dateofbirth, profilepicurl
                         FROM users
                         WHERE LOWER(role) <> 'admin' AND LOWER(role) <> 'deleted'
                         ORDER BY createdat DESC`
                    ),
                    pool.query(`
                        SELECT COUNT(DISTINCT U.userid)::int AS count
                        FROM users U
                        WHERE LOWER(U.role) <> 'admin' AND LOWER(U.role) <> 'deleted'
                          AND (
                            EXISTS (SELECT 1 FROM cases C WHERE C.userid = U.userid AND C.isclosed = false)
                            OR EXISTS (
                                SELECT 1 FROM case_users CU
                                JOIN cases C ON C.caseid = CU.caseid
                                WHERE CU.userid = U.userid AND C.isclosed = false
                            )
                          )
                    `),
                ]);

                const caseCounts = caseCountsResult.rows[0] || { total: 0, open: 0, closed: 0 };
                const customersArray = customersResult.rows;
                const numberOfActiveCustomers = activeCustomersCountResult.rows[0]?.count ?? 0;

                return {
                    TotalCases: caseCounts.total,
                    OpenCases: caseCounts.open,
                    NumberOfClosedCases: caseCounts.closed,
                    NumberOfTaggedCases: 0,
                    AllCustomersData: customersArray,
                    NumberOfActiveCustomers: numberOfActiveCustomers,
                };
            },
        });

        if (userId) {
            const taggedResult = await pool.query(
                `SELECT COUNT(*)::int AS count FROM cases WHERE istagged = true AND casemanagerid = $1`,
                [userId]
            );
            const numberOfTaggedCases = taggedResult.rows[0]?.count ?? 0;
            return res.status(200).json({
                ...payload,
                NumberOfTaggedCases: numberOfTaggedCases,
            });
        }

        const taggedAllResult = await pool.query(
            `SELECT COUNT(*)::int AS count FROM cases WHERE istagged = true`
        );
        res.status(200).json({
            ...payload,
            NumberOfTaggedCases: taggedAllResult.rows[0]?.count ?? 0,
        });
    } catch (error) {
        console.error("Error retrieving main screen data:", error);
        res.status(500).json({ message: "שגיאה בקבלת נתוני מסך הבית" });
    }
};

/**
 * Client-facing dashboard data.
 * Returns counts scoped to the authenticated user's cases + unread notifications.
 */
const getClientDashboardData = async (req, res) => {
    const userId = req.user?.UserId;
    if (!userId) return res.status(401).json({ message: "נדרש להתחבר" });

    try {
        const [casesResult, unreadResult] = await Promise.all([
            pool.query(
                `SELECT COUNT(*)::int AS total,
                        COUNT(*) FILTER (WHERE C.isclosed = false)::int AS open,
                        COUNT(*) FILTER (WHERE C.isclosed = true)::int  AS closed
                 FROM cases C
                 JOIN case_users CU ON C.caseid = CU.caseid
                 WHERE CU.userid = $1`,
                [userId]
            ),
            pool.query(
                `SELECT COUNT(*)::int AS unread
                 FROM usernotifications
                 WHERE userid = $1 AND isread = false`,
                [userId]
            ),
        ]);

        const row = casesResult.rows[0] || { total: 0, open: 0, closed: 0 };
        const unread = unreadResult.rows[0]?.unread ?? 0;

        res.status(200).json({
            totalCases: row.total,
            openCases: row.open,
            closedCases: row.closed,
            unreadNotifications: unread,
        });
    } catch (error) {
        console.error("Error retrieving client dashboard data:", error);
        res.status(500).json({ message: "שגיאה בקבלת נתוני לוח הבקרה" });
    }
};

module.exports = {
    getMainScreenData,
    getClientDashboardData,
};
