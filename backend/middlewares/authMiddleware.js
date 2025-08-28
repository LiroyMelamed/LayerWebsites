const jwt = require("jsonwebtoken");
require("dotenv").config();

// Define a secret key for JWTs. Use an environment variable in production.
const SECRET_KEY = process.env.JWT_SECRET || "supersecretkey";

/**
 * Express middleware to authenticate a user via a JWT from the request header.
 * If authentication is successful, the user's data is attached to the request object.
 * @param {object} req - The Express request object.
 * @param {object} res - The Express response object.
 * @param {function} next - The next middleware function.
 */
const authMiddleware = (req, res, next) => {
    // Extract the token from the "Authorization" header
    const token = req.headers.authorization?.split(" ")[1];

    // If no token is provided, return a 401 Unauthorized response
    if (!token) {
        return res.status(401).json({ message: "נא לבצע התחברות מחדש" });
    }

    try {
        // Verify and decode the JWT using the secret key
        const decoded = jwt.verify(token, SECRET_KEY);

        // Attach the decoded user data to the request object for use in subsequent middleware and route handlers
        req.user = {
            UserId: decoded.userid,
            Role: decoded.role,
            PhoneNumber: decoded.phoneNumber
        };

        // Pass control to the next handler in the middleware chain
        next();
    } catch (error) {
        // If token verification fails (e.g., invalid or expired token), return a 401 Unauthorized response
        res.status(401).json({ message: "נא לבצע התחברות מחדש" });
    }
};

module.exports = authMiddleware;
