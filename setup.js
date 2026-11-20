const pool = require('./config/db');

async function setupDatabase() {
    try {
        console.log("Creating users table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(100) NOT NULL,
                email VARCHAR(100) UNIQUE NOT NULL,
                password VARCHAR(255) NOT NULL,
                role ENUM('student', 'teacher', 'club') NOT NULL,
                xp_wallet INT DEFAULT 0,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            ) ENGINE=InnoDB;
        `);

        console.log("Creating tasks table...");
        await pool.query(`
            CREATE TABLE IF NOT EXISTS tasks (
                id INT AUTO_INCREMENT PRIMARY KEY,
                title VARCHAR(255) NOT NULL,
                description TEXT,
                xp_reward INT NOT NULL,
                status ENUM('open', 'claimed', 'completed') DEFAULT 'open',
                assigned_to INT NULL,
                created_by INT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (assigned_to) REFERENCES users(id),
                FOREIGN KEY (created_by) REFERENCES users(id)
            ) ENGINE=InnoDB;
        `);

        console.log("✅ All tables created successfully!");
        process.exit(0);
    } catch (error) {
        console.error("❌ Database Error:", error);
        process.exit(1);
    }
}

setupDatabase();