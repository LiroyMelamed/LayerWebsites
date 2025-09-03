// Direct import of the pg pool instance from a local configuration file
const pool = require("../config/db");

/**
 * Retrieves and aggregates all necessary data for the main dashboard screen.
 * This includes all cases, all customers (excluding admins), and a list of
 * active customers with open cases.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 */
const getMainScreenData = async (req, res) => {
    try {
        // Fetch all cases
        const casesResult = await pool.query("SELECT * FROM Cases");

        // Fetch all customers (users with a role other than 'Admin')
        const customersResult = await pool.query("SELECT * FROM Users WHERE LOWER(Role) <> 'admin'");

        // Fetch a list of distinct users who have at least one open case
        const activeCustomers = await pool.query(`
            SELECT DISTINCT U.UserId, U.Name, U.Email, U.PhoneNumber, U.CompanyName, U.CreatedAt, U.DateOfBirth, U.ProfilePicUrl
            FROM Users U
            JOIN Cases C ON C.UserId = U.UserId
            WHERE C.IsClosed = FALSE AND LOWER(U.Role) <> 'admin'
        `);

        // Extract the rows from the query results
        const casesArray = casesResult.rows;
        const customersArray = customersResult.rows;
        const activeCustomersArray = activeCustomers.rows;

        // Filter the cases data to find closed and tagged cases
        const closedCases = casesArray.filter(caseItem => caseItem.isclosed === true);
        const taggedCases = casesArray.filter(caseItem => caseItem.istagged === true);

        // Send a JSON response with all the aggregated data
        res.status(200).json({
            AllCasesData: casesArray,
            ClosedCasesData: closedCases,
            TaggedCases: taggedCases,
            NumberOfClosedCases: closedCases.length,
            NumberOfTaggedCases: taggedCases.length,
            AllCustomersData: customersArray,
            ActiveCustomers: activeCustomersArray
        });
    } catch (error) {
        console.error("Error retrieving main screen data:", error);
        res.status(500).json({ message: "שגיאה בקבלת נתוני מסך הבית" });
    }
};

// Export the function for use in routes
module.exports = {
    getMainScreenData,
};
