const pool = require('./config/db');

async function setupEventTables() {
    try {
        console.log("Creating events table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS events (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                xp_cost INT NOT NULL,
                created_by INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (created_by) REFERENCES users(id)
            ) ENGINE=InnoDB;
        `);

        console.log("Creating tickets table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tickets (
                id INT AUTO_INCREMENT PRIMARY KEY,
                event_id INT NOT NULL,
                student_id INT NOT NULL,
                purchased_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (event_id) REFERENCES events(id),
                FOREIGN KEY (student_id) REFERENCES users(id)
            ) ENGINE=InnoDB;
        `);

        console.log("✅ Event tables created successfully!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Database Error:", error);
        process.exit(1);
    }
}

setupEventTables();