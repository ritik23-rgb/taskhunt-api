const pool = require('./config/db');

async function runMigration() {
    const queries = [
        // 1. Users table: GLA identity & permanent stats (preserved after 2-day task cleanup)
        `ALTER TABLE users ADD COLUMN roll_number VARCHAR(50) NULL`,
        `ALTER TABLE users ADD COLUMN faculty_id VARCHAR(50) NULL`,
        `ALTER TABLE users ADD COLUMN department VARCHAR(100) NULL`,
        `ALTER TABLE users ADD COLUMN club_position VARCHAR(80) NULL`,
        `ALTER TABLE users ADD COLUMN completed_tasks INT DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN rating_sum INT DEFAULT 0`,
        `ALTER TABLE users ADD COLUMN rating_count INT DEFAULT 0`,

        // 2. Tasks table: deadlines & first-approved winner tracking
        `ALTER TABLE tasks MODIFY COLUMN status VARCHAR(30) DEFAULT 'open'`,
        `ALTER TABLE tasks ADD COLUMN deadline DATETIME NULL`,
        `ALTER TABLE tasks ADD COLUMN winner_id INT NULL`,
        `ALTER TABLE tasks ADD COLUMN closed_at TIMESTAMP NULL`,

        // 3. Multi-student race submissions table
        `CREATE TABLE IF NOT EXISTS task_submissions (
            id INT AUTO_INCREMENT PRIMARY KEY,
            task_id INT NOT NULL,
            student_id INT NOT NULL,
            status VARCHAR(30) DEFAULT 'accepted',
            proof_image LONGTEXT NULL,
            proof_note TEXT NULL,
            quality_rating TINYINT NULL,
            review_note TEXT NULL,
            accepted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            submitted_at TIMESTAMP NULL,
            reviewed_at TIMESTAMP NULL,
            UNIQUE KEY unique_student_task (task_id, student_id)
        )`,

        // 4. Tickets table: unique allotted Ticket ID + 1 ticket per student per event
        `CREATE TABLE IF NOT EXISTS tickets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_id INT NOT NULL,
            student_id INT NOT NULL,
            ticket_code VARCHAR(40) NULL,
            purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )`,
        `ALTER TABLE tickets ADD COLUMN ticket_code VARCHAR(40) NULL`,
        `ALTER TABLE tickets ADD UNIQUE KEY unique_ticket_code (ticket_code)`,
        `ALTER TABLE tickets ADD UNIQUE KEY unique_student_event (event_id, student_id)`
    ];

    try {
        for (const sql of queries) {
            try {
                await pool.query(sql);
                console.log('✅ Applied:', sql.trim().split('\n')[0].slice(0, 72));
            } catch (err) {
                if (['ER_DUP_FIELDNAME', 'ER_DUP_KEYNAME', 'ER_DUP_ENTRY'].includes(err.code)) {
                    console.log('ℹ️ Already applied, skipping...');
                } else {
                    throw err;
                }
            }
        }

        // Backfill ticket_code for any older tickets
        const [legacyTickets] = await pool.query(`SELECT id, event_id FROM tickets WHERE ticket_code IS NULL`);
        for (const t of legacyTickets) {
            const code = `TH-EV${t.event_id}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
            await pool.query(`UPDATE tickets SET ticket_code = ? WHERE id = ?`, [code, t.id]);
        }

        // Default deadline for older open tasks (48 hours from now)
        await pool.query(`UPDATE tasks SET deadline = DATE_ADD(NOW(), INTERVAL 48 HOUR) WHERE deadline IS NULL AND status = 'open'`);

        console.log('🚀 TaskHunt V2 Database Upgrade Complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration Failed:', error);
        process.exit(1);
    }
}

runMigration();