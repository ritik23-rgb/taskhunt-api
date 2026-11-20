const express = require('express');
const pool = require('../config/db');
const { verifyToken, requireRole } = require('../middlewares/authMiddleware');

const router = express.Router();

// Auto-cleanup: Purge closed or expired tasks older than 2 days (student XP & ratings remain safe on users table)
async function cleanupExpiredHistory() {
    try {
        const [oldTasks] = await pool.query(`
            SELECT id FROM tasks
            WHERE (status = 'closed' AND closed_at IS NOT NULL AND closed_at < NOW() - INTERVAL 2 DAY)
               OR (deadline IS NOT NULL AND deadline < NOW() - INTERVAL 2 DAY)
        `);

        if (oldTasks.length > 0) {
            const ids = oldTasks.map(t => t.id);
            await pool.query(`DELETE FROM task_submissions WHERE task_id IN (?)`, [ids]);
            await pool.query(`DELETE FROM tasks WHERE id IN (?)`, [ids]);
        }
    } catch (err) {
        console.error('2-day cleanup warning:', err.message);
    }
}

// --- 1. STUDENT: View All Open Bounties (Active & Before Deadline) ---
router.get('/', verifyToken, async (req, res) => {
    await cleanupExpiredHistory();
    try {
        const [tasks] = await pool.query(
            `SELECT t.id, t.title, t.description, t.xp_reward, t.deadline, t.created_at,
                    u.name AS creator_name,
                    u.role AS creator_role,
                    (SELECT COUNT(*) FROM task_submissions ts WHERE ts.task_id = t.id) AS competitor_count,
                    (SELECT COUNT(*) FROM task_submissions ts WHERE ts.task_id = t.id AND ts.student_id = ?) AS already_accepted
             FROM tasks t
             LEFT JOIN users u ON t.created_by = u.id
             WHERE t.status = 'open'
               AND (t.deadline IS NULL OR t.deadline > NOW())
             ORDER BY t.deadline ASC, t.created_at DESC`,
            [req.user.id]
        );
        res.json(tasks);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch open bounties.' });
    }
});

// --- 2. STUDENT: Live XP, Quality Rating & Campus Rank ---
router.get('/student-stats', verifyToken, requireRole(['student']), async (req, res) => {
    try {
        const [[userRow]] = await pool.query(
            `SELECT xp_wallet, completed_tasks, rating_sum, rating_count, roll_number
             FROM users WHERE id = ?`,
            [req.user.id]
        );

        const [[activeRow]] = await pool.query(
            `SELECT COUNT(*) AS active_count
             FROM task_submissions ts
             JOIN tasks t ON ts.task_id = t.id
             WHERE ts.student_id = ?
               AND ts.status IN ('accepted', 'submitted', 'rejected')
               AND t.status = 'open'`,
            [req.user.id]
        );

        const [[rankRow]] = await pool.query(
            `SELECT COUNT(*) + 1 AS my_rank
             FROM users
             WHERE role = 'student' AND xp_wallet > ?`,
            [userRow ? userRow.xp_wallet : 0]
        );

        const avgQuality =
            userRow && userRow.rating_count > 0
                ? Number((userRow.rating_sum / userRow.rating_count).toFixed(1))
                : null;

        res.json({
            xp: userRow ? userRow.xp_wallet : 0,
            roll_number: userRow ? userRow.roll_number : null,
            active_count: activeRow ? activeRow.active_count : 0,
            completed_count: userRow ? userRow.completed_tasks : 0,
            avg_quality: avgQuality,
            campus_rank: rankRow ? rankRow.my_rank : 1
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to fetch student stats.' });
    }
});

// --- 3. STUDENT: My Accepted Quests & 2-Day History ---
router.get('/my-history', verifyToken, requireRole(['student']), async (req, res) => {
    await cleanupExpiredHistory();
    try {
        const [rows] = await pool.query(
            `SELECT ts.id AS submission_id,
                    ts.task_id,
                    ts.status AS submission_status,
                    ts.proof_image,
                    ts.proof_note,
                    ts.quality_rating,
                    ts.review_note,
                    ts.accepted_at,
                    ts.submitted_at,
                    ts.reviewed_at,
                    t.title,
                    t.description,
                    t.xp_reward,
                    t.deadline,
                    t.status AS task_status,
                    t.closed_at,
                    c.name AS creator_name,
                    w.name AS winner_name
             FROM task_submissions ts
             JOIN tasks t ON ts.task_id = t.id
             LEFT JOIN users c ON t.created_by = c.id
             LEFT JOIN users w ON t.winner_id = w.id
             WHERE ts.student_id = ?
             ORDER BY COALESCE(ts.reviewed_at, ts.submitted_at, ts.accepted_at) DESC`,
            [req.user.id]
        );
        res.json(rows);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to load quest history.' });
    }
});

// --- 4. TEACHER / CLUB: Post New Task with Mandatory Deadline ---
router.post('/', verifyToken, requireRole(['teacher', 'club']), async (req, res) => {
    const { title, description, xp_reward, deadline } = req.body;
    if (!title || !xp_reward || !deadline) {
        return res.status(400).json({ error: 'Title, XP reward, and Deadline are required.' });
    }

    // Format datetime-local (YYYY-MM-DDTHH:mm) to MySQL DATETIME
    const formattedDeadline = deadline.replace('T', ' ').slice(0, 19);
    const deadlineDate = new Date(deadline);
    if (isNaN(deadlineDate.getTime()) || deadlineDate <= new Date()) {
        return res.status(400).json({ error: 'Deadline must be a valid future date and time.' });
    }

    try {
        const [result] = await pool.query(
            `INSERT INTO tasks (title, description, xp_reward, deadline, status, created_by)
             VALUES (?, ?, ?, ?, 'open', ?)`,
            [title.trim(), (description || '').trim(), Number(xp_reward), formattedDeadline, req.user.id]
        );
        res.status(201).json({ message: 'Bounty deployed live with deadline!', taskId: result.insertId });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to create task.' });
    }
});

// --- 5. TEACHER / CLUB: View Tasks + All Competing Student Submissions ---
router.get('/my-tasks', verifyToken, requireRole(['teacher', 'club']), async (req, res) => {
    await cleanupExpiredHistory();
    try {
        const [tasks] = await pool.query(
            `SELECT t.*, w.name AS winner_name, w.roll_number AS winner_roll
             FROM tasks t
             LEFT JOIN users w ON t.winner_id = w.id
             WHERE t.created_by = ?
             ORDER BY t.created_at DESC`,
            [req.user.id]
        );

        if (tasks.length === 0) return res.json([]);

        const taskIds = tasks.map(t => t.id);
        const [subs] = await pool.query(
            `SELECT ts.*, u.name AS student_name, u.roll_number AS student_roll, u.email AS student_email
             FROM task_submissions ts
             JOIN users u ON ts.student_id = u.id
             WHERE ts.task_id IN (?)
             ORDER BY COALESCE(ts.submitted_at, ts.accepted_at) ASC`,
            [taskIds]
        );

        const subMap = {};
        subs.forEach(s => {
            if (!subMap[s.task_id]) subMap[s.task_id] = [];
            subMap[s.task_id].push(s);
        });

        const enriched = tasks.map(t => ({
            ...t,
            submissions: subMap[t.id] || []
        }));

        res.json(enriched);
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to load tasks and submissions.' });
    }
});

// --- 6. STUDENT: Accept an Open Task (Multiple Students Allowed!) ---
router.post('/:id/claim', verifyToken, requireRole(['student']), async (req, res) => {
    try {
        const [[task]] = await pool.query('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
        if (!task) return res.status(404).json({ error: 'Task not found.' });
        if (task.status !== 'open') return res.status(400).json({ error: 'This task is already closed.' });
        if (task.deadline && new Date(task.deadline) <= new Date()) {
            return res.status(400).json({ error: 'Deadline for this task has passed.' });
        }

        const [existing] = await pool.query(
            'SELECT id FROM task_submissions WHERE task_id = ? AND student_id = ?',
            [task.id, req.user.id]
        );
        if (existing.length > 0) {
            return res.status(400).json({ error: 'You already accepted this task! Check My Quests & Proof.' });
        }

        await pool.query(
            `INSERT INTO task_submissions (task_id, student_id, status) VALUES (?, ?, 'accepted')`,
            [task.id, req.user.id]
        );

        res.json({ message: 'Task accepted! Finish fast & upload image proof—first approved student wins the XP!' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to accept task.' });
    }
});

// --- 7. STUDENT: Upload Image Proof ---
router.post('/:id/submit-proof', verifyToken, requireRole(['student']), async (req, res) => {
    const { proof_image, proof_note } = req.body;
    if (!proof_image || !proof_image.startsWith('data:image/')) {
        return res.status(400).json({ error: 'Please attach a valid image proof.' });
    }

    try {
        const [[task]] = await pool.query('SELECT status, deadline FROM tasks WHERE id = ?', [req.params.id]);
        if (!task || task.status !== 'open') {
            return res.status(400).json({ error: 'This task is already closed because another student won.' });
        }
        if (task.deadline && new Date(task.deadline) <= new Date()) {
            return res.status(400).json({ error: 'Task deadline has expired.' });
        }

        const [result] = await pool.query(
            `UPDATE task_submissions
             SET status = 'submitted',
                 proof_image = ?,
                 proof_note = ?,
                 review_note = NULL,
                 submitted_at = NOW()
             WHERE task_id = ? AND student_id = ? AND status IN ('accepted', 'rejected')`,
            [proof_image, (proof_note || '').trim(), req.params.id, req.user.id]
        );

        if (result.affectedRows === 0) {
            return res.status(400).json({ error: 'Cannot submit proof for this task right now.' });
        }

        res.json({ message: 'Proof uploaded! Waiting for Teacher/Club verification.' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Failed to upload image proof.' });
    }
});

// --- 8. TEACHER / CLUB: Approve First Valid Proof (Closes Task for All Other Students!) ---
router.post('/submissions/:subId/approve', verifyToken, requireRole(['teacher', 'club']), async (req, res) => {
    const quality_rating = Number(req.body.quality_rating) || 5;
    const review_note = (req.body.review_note || '').trim();

    if (quality_rating < 1 || quality_rating > 5) {
        return res.status(400).json({ error: 'Quality rating must be between 1 and 5.' });
    }

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        const [subRows] = await connection.query(
            'SELECT * FROM task_submissions WHERE id = ? FOR UPDATE',
            [req.params.subId]
        );
        if (subRows.length === 0) {
            await connection.rollback();
            return res.status(404).json({ error: 'Submission not found.' });
        }
        const submission = subRows[0];

        const [taskRows] = await connection.query(
            'SELECT * FROM tasks WHERE id = ? FOR UPDATE',
            [submission.task_id]
        );
        const task = taskRows[0];

        if (!task || task.status !== 'open') {
            await connection.rollback();
            return res.status(400).json({ error: 'This task has already been awarded to another student.' });
        }
        if (submission.status !== 'submitted') {
            await connection.rollback();
            return res.status(400).json({ error: 'This student has not submitted proof.' });
        }

        // 1. Close task and record winner
        await connection.query(
            `UPDATE tasks SET status = 'closed', winner_id = ?, closed_at = NOW() WHERE id = ?`,
            [submission.student_id, task.id]
        );

        // 2. Mark winning submission approved
        await connection.query(
            `UPDATE task_submissions
             SET status = 'approved', quality_rating = ?, review_note = ?, reviewed_at = NOW()
             WHERE id = ?`,
            [quality_rating, review_note, submission.id]
        );

        // 3. Auto-invalidate all other competing submissions for this task
        await connection.query(
            `UPDATE task_submissions
             SET status = 'closed_other_won',
                 review_note = 'Task closed — another student completed and got approved first.',
                 reviewed_at = NOW()
             WHERE task_id = ? AND id != ?`,
            [task.id, submission.id]
        );

        // 4. Credit XP & permanent quality stats to the winner
        await connection.query(
            `UPDATE users
             SET xp_wallet = xp_wallet + ?,
                 completed_tasks = completed_tasks + 1,
                 rating_sum = rating_sum + ?,
                 rating_count = rating_count + 1
             WHERE id = ?`,
            [task.xp_reward, quality_rating, submission.student_id]
        );

        await connection.commit();
        res.json({
            message: `Winner approved! Awarded +${task.xp_reward} XP (${quality_rating}★) and closed competing submissions.`
        });
    } catch (error) {
        await connection.rollback();
        console.error(error);
        res.status(500).json({ error: 'Approval transaction failed.' });
    } finally {
        connection.release();
    }
});

// --- 9. TEACHER / CLUB: Reject Specific Student Proof ---
router.post('/submissions/:subId/reject', verifyToken, requireRole(['teacher', 'club']), async (req, res) => {
    const review_note = (req.body.review_note || '').trim() || 'Please upload a clearer proof image.';
    try {
        const [result] = await pool.query(
            `UPDATE task_submissions
             SET status = 'rejected', review_note = ?, reviewed_at = NOW()
             WHERE id = ? AND status = 'submitted'`,
            [review_note, req.params.subId]
        );
        if (result.affectedRows === 0) {
            return res.status(400).json({ error: 'Submission is not awaiting review.' });
        }
        res.json({ message: 'Submission sent back for resubmission.' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to reject submission.' });
    }
});

module.exports = router;