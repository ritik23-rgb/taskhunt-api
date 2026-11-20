const pool = require('./config/db');

async function upgradeTasksTable() {
    const alterations = [
        `ALTER TABLE tasks MODIFY COLUMN status VARCHAR(30) DEFAULT 'open'`,
        `ALTER TABLE tasks ADD COLUMN claimed_by INT NULL`,
        `ALTER TABLE tasks ADD COLUMN proof_image LONGTEXT NULL`,
        `ALTER TABLE tasks ADD COLUMN proof_note TEXT NULL`,
        `ALTER TABLE tasks ADD COLUMN quality_rating TINYINT NULL`,
        `ALTER TABLE tasks ADD COLUMN review_note TEXT NULL`,
        `ALTER TABLE tasks ADD COLUMN submitted_at TIMESTAMP NULL`,
        `ALTER TABLE tasks ADD COLUMN completed_at TIMESTAMP NULL`
    ];

    try {
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
        console.log('🚀 Database upgraded for Image Proofs & Quality Ratings!');
        process.exit(0);
    } catch (error) {
        console.error('❌ Migration Error:', error);
        process.exit(1);
    }
}

upgradeTasksTable();