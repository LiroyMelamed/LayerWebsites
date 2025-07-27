const jwt = require("jsonwebtoken");
const SECRET_KEY = process.env.JWT_SECRET || "supersecretkey";

const authMiddleware = (req, res, next) => {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ message: "נא לבצע התחברות מחדש" });

    try {
        const decoded = jwt.verify(token, SECRET_KEY);
        req.user = {
            UserId: decoded.UserId,
            Role: decoded.role,
            PhoneNumber: decoded.phoneNumber,
        };
        next();
    } catch (error) {
        return res.status(401).json({ message: "נא לבצע התחברות מחדש" });
    }
};

module.exports = authMiddleware;
