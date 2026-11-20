const express = require('express');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { verifyToken } = require('../middlewares/authMiddleware');

let bcrypt;
try {
    bcrypt = require('bcryptjs');
} catch {
    bcrypt = require('bcrypt');
}

const router = express.Router();

// Auto-detect password column name (password vs password_hash)
let cachedPwdCol = null;
async function getPasswordColumn() {
    if (cachedPwdCol) return cachedPwdCol;
    const [cols] = await pool.query('SHOW COLUMNS FROM users');
    const names = cols.map(c => c.Field);
    cachedPwdCol = names.includes('password_hash') ? 'password_hash' : 'password';
    return cachedPwdCol;
}

// --- 1. REGISTER (Strict @gla.ac.in + Conditional Role Fields) ---
router.post('/register', async (req, res) => {
    const { name, email, password, role, roll_number, faculty_id, department, club_position } = req.body;

    if (!name || !email || !password || !role) {
        return res.status(400).json({ error: 'All required fields must be filled.' });
    }

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail.endsWith('@gla.ac.in')) {
        return res.status(400).json({ error: 'Only official GLA University emails (@gla.ac.in) are allowed.' });
    }

    if (!['student', 'teacher', 'club'].includes(role)) {
        return res.status(400).json({ error: 'Invalid role selected.' });
    }

    if (role === 'student' && (!roll_number || !roll_number.trim())) {
        return res.status(400).json({ error: 'University Roll Number is required for Students.' });
    }
    if (role === 'teacher' && (!faculty_id || !faculty_id.trim())) {
        return res.status(400).json({ error: 'Faculty ID is required for Teachers.' });
    }
    if (role === 'club' && (!club_position || !club_position.trim())) {
        return res.status(400).json({ error: 'Club Designation / Role is required for Club accounts.' });
    }

    try {
        const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [cleanEmail]);
        if (existing.length > 0) {
            return res.status(400).json({ error: 'An account with this @gla.ac.in email already exists.' });
        }

        if (role === 'student') {
            const [dupRoll] = await pool.query('SELECT id FROM users WHERE roll_number = ?', [roll_number.trim()]);
            if (dupRoll.length > 0) {
                return res.status(400).json({ error: 'This Roll Number is already registered.' });
            }
        }

        const hashed = await bcrypt.hash(password, 10);
        const pwdCol = await getPasswordColumn();

        await pool.query(
            `INSERT INTO users (name, email, ${pwdCol}, role, xp_wallet, roll_number, faculty_id, department, club_position)
             VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)`,
            [
                name.trim(),
                cleanEmail,
                hashed,
                role,
                role === 'student' ? roll_number.trim() : null,
                role === 'teacher' ? faculty_id.trim() : null,
                role === 'teacher' ? (department || '').trim() : null,
                role === 'club' ? club_position.trim() : null
            ]
        );

        res.status(201).json({ message: 'GLA TaskHunt account created successfully! Please sign in.' });
    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({ error: 'Registration failed. Please try again.' });
    }
});

// --- 2. LOGIN ---
router.post('/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res.status(400).json({ error: 'Email and password are required.' });
    }

    try {
        const pwdCol = await getPasswordColumn();
        const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()]);
        if (users.length === 0) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const user = users[0];
        const valid = await bcrypt.compare(password, user[pwdCol]);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid email or password.' });
        }

        const token = jwt.sign(
            { id: user.id, role: user.role, name: user.name },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );

        res.json({
            token,
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
                role: user.role,
                xp: user.xp_wallet || 0,
                roll_number: user.roll_number || null,
                faculty_id: user.faculty_id || null,
                department: user.department || null,
                club_position: user.club_position || null
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Login failed.' });
    }
});

// --- 3. ALL ROLES: Campus XP Leaderboard (Rank Board) ---
router.get('/leaderboard', verifyToken, async (req, res) => {
    try {
        const [leaders] = await pool.query(`
            SELECT id,
                   name,
                   roll_number,
                   email,
                   xp_wallet AS xp,
                   completed_tasks,
                   CASE WHEN rating_count > 0 THEN ROUND(rating_sum / rating_count, 1) ELSE NULL END AS avg_quality
            FROM users
            WHERE role = 'student'
            ORDER BY xp_wallet DESC, completed_tasks DESC, id ASC
            LIMIT 25
        `);
        res.json(leaders);
    } catch (error) {
        console.error('Leaderboard error:', error);
        res.status(500).json({ error: 'Failed to load Campus Rank Board.' });
    }
});

module.exports = router;