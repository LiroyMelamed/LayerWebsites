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

// Export the function for use in routes
module.exports = {
    getMainScreenData,
};
