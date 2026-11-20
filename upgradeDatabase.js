const pool = require('./config/db');

async function upgradeDatabase() {
    try {
        console.log("Upgrading Users Table...");
        await pool.query(`
            ALTER TABLE users 
            ADD COLUMN roll_number VARCHAR(50) NULL,
            ADD COLUMN course VARCHAR(50) NULL,
            ADD COLUMN semester INT NULL,
            ADD COLUMN avatar_url VARCHAR(255) NULL
        `);

        console.log("Creating Task Submissions Table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS task_submissions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                task_id INT NOT NULL,
                student_id INT NOT NULL,
                proof_file_url VARCHAR(500) NOT NULL,
                proof_type ENUM('image', 'video', 'audio', 'document') NOT NULL,
                remarks TEXT NULL,
                status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
                rejection_reason TEXT NULL,
                submitted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (task_id) REFERENCES tasks(id),
                FOREIGN KEY (student_id) REFERENCES users(id)
            ) ENGINE=InnoDB;
        `);

        console.log("Creating XP Transactions (Audit Log)...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS xp_transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                user_id INT NOT NULL,
                amount INT NOT NULL,
                transaction_type ENUM('earned', 'spent', 'penalty') NOT NULL,
                description VARCHAR(255) NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            ) ENGINE=InnoDB;
        `);

        // Update task status options safely
        await pool.query(`ALTER TABLE tasks MODIFY status ENUM('open', 'claimed', 'submitted', 'completed') DEFAULT 'open'`);

        console.log("✅ Database successfully upgraded to v2.0!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Upgrade Error:", error);
        process.exit(1);
    }
}
upgradeDatabase();