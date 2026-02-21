// Direct import of the pg pool instance from a local configuration file
const pool = require("../config/db");
const { getMainScreenDataCached } = require("../utils/mainScreenDataCache");

/**
 * Retrieves and aggregates all necessary data for the main dashboard screen.
 * This includes all cases, all customers (excluding admins), and a list of
 * active customers with open cases.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
const getMainScreenData = async (req, res) => {
    try {
        const payload = await getMainScreenDataCached({
            loader: async () => {
                // Fetch only the columns needed for dashboard aggregates.
                // (Avoid SELECT * on potentially large tables.)
                const casesResult = await pool.query(
                    "SELECT caseid, isclosed, istagged FROM Cases"
                );

                // Fetch all customers (users with a role other than 'Admin')
                const customersResult = await pool.query(
                    "SELECT userid, name, email, phonenumber, companyname, createdat, dateofbirth, profilepicurl FROM Users WHERE LOWER(Role) <> 'admin' AND LOWER(Role) <> 'deleted'"
                );

                // Fetch a list of distinct users who have at least one open case
                // (either as the case owner OR as a linked user via case_users)
                const activeCustomers = await pool.query(`
                    SELECT DISTINCT U.UserId, U.Name, U.Email, U.PhoneNumber, U.CompanyName, U.CreatedAt, U.DateOfBirth, U.ProfilePicUrl
                    FROM Users U
                    WHERE LOWER(U.Role) <> 'admin' AND LOWER(U.Role) <> 'deleted'
                      AND (
                        EXISTS (SELECT 1 FROM Cases C WHERE C.UserId = U.UserId AND C.IsClosed = FALSE)
                        OR EXISTS (SELECT 1 FROM case_users CU JOIN Cases C ON C.caseid = CU.caseid WHERE CU.userid = U.UserId AND C.IsClosed = FALSE)
                      )
                `);

                // Extract the rows from the query results
                const casesArray = casesResult.rows;
                const customersArray = customersResult.rows;
                const activeCustomersArray = activeCustomers.rows;

                // Filter the cases data to find closed and tagged cases
                const closedCases = casesArray.filter(caseItem => caseItem.isclosed === true);
                const taggedCases = casesArray.filter(caseItem => caseItem.istagged === true);

                return {
                    AllCasesData: casesArray,
                    ClosedCasesData: closedCases,
                    TaggedCases: taggedCases,
                    NumberOfClosedCases: closedCases.length,
                    NumberOfTaggedCases: taggedCases.length,
                    AllCustomersData: customersArray,
                    ActiveCustomers: activeCustomersArray,
                };
            },
        });

        res.status(200).json(payload);
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
    if (!userId) return res.status(401).json({ message: "Unauthorized" });

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

// Export the function for use in routes
module.exports = {
    getMainScreenData,
    getClientDashboardData,
};
