const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// --- 1. ALL ROLES: View Events (Includes Current Student's Redeemed Ticket Code If Any) ---
router.get('/events', verifyToken, async (req, res) => {
    try {
        const [events] = await pool.query(
            `SELECT e.*,
                    u.name AS host_name,
                    (SELECT COUNT(*) FROM tickets t WHERE t.event_id = e.id) AS tickets_sold,
                    (SELECT t2.ticket_code FROM tickets t2 WHERE t2.event_id = e.id AND t2.student_id = ? LIMIT 1) AS my_ticket_code
             FROM events e
             LEFT JOIN users u ON e.created_by = u.id
             ORDER BY e.created_at DESC`,
            [req.user.id]
        );
        res.json(events);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch campus events.' });
    }
});

// --- 2. STUDENT: My Redeemed VIP Passes ---
router.get('/my-tickets', verifyToken, requireRole(['student']), async (req, res) => {
    try {
        const [tickets] = await pool.query(
            `SELECT t.id, t.ticket_code, t.purchased_at,
                    e.title AS event_title, e.description AS event_description, e.xp_cost,
                    u.name AS host_name
             FROM tickets t
             JOIN events e ON t.event_id = e.id
             LEFT JOIN users u ON e.created_by = u.id
             WHERE t.student_id = ?
             ORDER BY t.purchased_at DESC`,
            [req.user.id]
        );
        res.json(tickets);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to load your VIP passes.' });
    }
});

// --- 3. CLUB: Publish Event ---
router.post('/events', verifyToken, requireRole(['club']), async (req, res) => {
    const { title, description, xp_cost } = req.body;
    if (!title || !xp_cost || Number(xp_cost) < 10) {
        return res.status(400).json({ error: 'Valid event title and XP price are required.' });
    }

    try {
        const [result] = await pool.query(
            'INSERT INTO events (title, description, xp_cost, created_by) VALUES (?, ?, ?, ?)',
            [title.trim(), (description || '').trim(), Number(xp_cost), req.user.id]
        );
        res.status(201).json({ message: 'Event pass published live!', eventId: result.insertId });
    } catch (error) {
        res.status(500).json({ error: 'Failed to publish event.' });
    }
});

// --- 4. CLUB: View Attendees with Allotted Ticket IDs & Student Info ---
router.get('/events/:id/attendees', verifyToken, requireRole(['club']), async (req, res) => {
    try {
        const [[event]] = await pool.query(
            'SELECT id, title, created_by FROM events WHERE id = ?',
            [req.params.id]
        );
        if (!event) return res.status(404).json({ error: 'Event not found.' });
        if (Number(event.created_by) !== Number(req.user.id)) {
            return res.status(403).json({ error: 'You can only view attendees for your own events.' });
        }

        const [attendees] = await pool.query(
            `SELECT t.ticket_code, t.purchased_at, u.name, u.roll_number, u.email, u.xp_wallet
             FROM tickets t
             JOIN users u ON t.student_id = u.id
             WHERE t.event_id = ?
             ORDER BY t.purchased_at DESC`,
            [req.params.id]
        );

        res.json({ eventTitle: event.title, attendees });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to load attendees.' });
    }
});

// --- 5. CLUB: Delete Unsold Event ---
router.delete('/events/:id', verifyToken, requireRole(['club']), async (req, res) => {
    try {
        const [[event]] = await pool.query('SELECT id, created_by FROM events WHERE id = ?', [req.params.id]);
        if (!event) return res.status(404).json({ error: 'Event not found.' });
        if (Number(event.created_by) !== Number(req.user.id)) {
            return res.status(403).json({ error: 'Unauthorized.' });
        }

        const [[sold]] = await pool.query('SELECT COUNT(*) AS c FROM tickets WHERE event_id = ?', [req.params.id]);
        if (sold.c > 0) {
            return res.status(400).json({ error: 'Cannot delete an event after passes have been redeemed.' });
        }

        await pool.query('DELETE FROM events WHERE id = ?', [req.params.id]);
        res.json({ message: 'Event removed.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete event.' });
    }
});

// --- 6. STUDENT: Redeem Single Unique Ticket (Allots Unique Ticket ID) ---
router.post('/events/:id/buy', verifyToken, requireRole(['student']), async (req, res) => {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [events] = await connection.query('SELECT * FROM events WHERE id = ?', [req.params.id]);
        if (events.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Event not found.' });
        }
        const event = events[0];

        // Strict single-ticket enforcement per student per event
        const [existing] = await connection.query(
            'SELECT ticket_code FROM tickets WHERE event_id = ? AND student_id = ? FOR UPDATE',
            [event.id, req.user.id]
        );
        if (existing.length > 0) {
            await connection.rollback();
            return res.status(400).json({
                error: `Only 1 ticket allowed per student! Your allotted ID is ${existing[0].ticket_code}.`
            });
        }

        const [users] = await connection.query(
            'SELECT xp_wallet FROM users WHERE id = ? FOR UPDATE',
            [req.user.id]
        );
        const currentXp = users[0].xp_wallet;

        if (currentXp < event.xp_cost) {
            await connection.rollback();
            return res.status(400).json({ error: `Insufficient XP! You need ${event.xp_cost - currentXp} more XP.` });
        }

        const remainingXp = currentXp - event.xp_cost;
        const ticketCode = `TH-EV${event.id}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;

        await connection.query('UPDATE users SET xp_wallet = ? WHERE id = ?', [remainingXp, req.user.id]);
        await connection.query(
            'INSERT INTO tickets (event_id, student_id, ticket_code) VALUES (?, ?, ?)',
            [event.id, req.user.id, ticketCode]
        );

        await connection.commit();
        res.json({
            message: `VIP Pass Redeemed! Your Ticket ID: ${ticketCode}`,
            ticketCode,
            remainingXp
        });
    } catch (error) {
        await connection.rollback();
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({ error: 'You have already redeemed a ticket for this event.' });
        }
        console.error(error);
        res.status(500).json({ error: 'Ticket redemption failed.' });
    } finally {
        connection.release();
    }
});

module.exports = router;