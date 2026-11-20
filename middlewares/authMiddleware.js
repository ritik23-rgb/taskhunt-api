// middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');

// 1. Verify the JWT Token
const verifyToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    
    // The token comes in as "Bearer <token>"
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({ error: "Access denied. No token provided." });
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded; // Attach user payload (id, role) to the request object
        next(); // Proceed to the next middleware or route
    } catch (err) {
        return res.status(403).json({ error: "Invalid or expired token." });
    }
};

// 2. Check the User's Role (RBAC)
const requireRole = (requiredRoles) => {
    return (req, res, next) => {
        if (!req.user || !requiredRoles.includes(req.user.role)) {
            return res.status(403).json({ error: "Unauthorized: You do not have permission to perform this action." });
        }
        next();
    };
};

module.exports = { verifyToken, requireRole };