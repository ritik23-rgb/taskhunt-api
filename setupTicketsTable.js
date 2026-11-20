const pool = require('./config/db');

async function setupTickets() {
    const createEventsSql = `
        CREATE TABLE IF NOT EXISTS events (
            id INT AUTO_INCREMENT PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT,
            xp_cost INT NOT NULL,
            created_by INT NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    const createTicketsSql = `
        CREATE TABLE IF NOT EXISTS tickets (
            id INT AUTO_INCREMENT PRIMARY KEY,
            event_id INT NOT NULL,
            student_id INT NOT NULL,
            purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    `;

    const alterations = [
        `ALTER TABLE events ADD COLUMN created_by INT NULL`,
        `ALTER TABLE events ADD COLUMN created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`,
        `ALTER TABLE tickets ADD COLUMN event_id INT NOT NULL`,
        `ALTER TABLE tickets ADD COLUMN student_id INT NOT NULL`,
        `ALTER TABLE tickets ADD COLUMN purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`
    ];

    try {
        await pool.query(createEventsSql);
        console.log('✅ Verified events table');

        await pool.query(createTicketsSql);
        console.log('✅ Verified tickets table');

        for (const sql of alterations) {
            try {
                await pool.query(sql);
                console.log('✅ Applied:', sql.split(' ').slice(0, 6).join(' '));
            } catch (err) {
                if (err.code === 'ER_DUP_FIELDNAME') {
                    console.log('ℹ️ Column already exists, skipping...');
                } else {
                    throw err;
                }
            }
        }

        const [cols] = await pool.query('SHOW COLUMNS FROM tickets');
        console.log('📋 Current tickets columns:', cols.map(c => c.Field).join(', '));
        console.log('🚀 Tickets & Events database setup complete!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration Error:', error);
        process.exit(1);
    }
}

setupTickets();