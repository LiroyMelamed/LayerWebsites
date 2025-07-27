const { sql, connectDb } = require("../config/db");

const getMainScreenData = async (req, res) => {
    try {
        const pool = await connectDb();

        const casesResult = await pool.request().query("SELECT * FROM Cases");
        const customersResult = await pool.request().query("SELECT * FROM Users WHERE LOWER(Role) <> 'admin'");

        const activeCustomers = await pool.request().query(`
            SELECT DISTINCT U.UserId, U.Name, U.Email, U.PhoneNumber, U.CompanyName, U.CreatedAt, U.DateOfBirth, U.ProfilePicUrl
            FROM Users U
            JOIN Cases C ON C.UserId = U.UserId
            WHERE C.IsClosed = 0 AND LOWER(U.Role) <> 'admin'
        `);

        const casesArray = casesResult.recordset;
        const customersArray = customersResult.recordset;
        const activeCustomersArray = activeCustomers.recordset;

        const closedCases = casesArray.filter(caseItem => caseItem.IsClosed === true);
        const taggedCases = casesArray.filter(caseItem => caseItem.IsTagged === true);

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

module.exports = {
    getMainScreenData,
};
