// server.js
const express = require('express');
const cors = require('cors');
require('dotenv').config();

// 1. Import Routes
const authRoutes = require('./routes/authRoutes');
const taskRoutes = require('./routes/taskRoutes');
const clubRoutes = require('./routes/clubRoutes');

// 2. Initialize App
const app = express();

// 3. Global Middleware
app.use(cors()); 
app.use(express.json({ limit: '10mb' })); // Essential for parsing JSON bodies

// 4. Mount Routes
app.use('/api/auth', authRoutes);
app.use('/api/tasks', taskRoutes);
app.use('/api/clubs', clubRoutes);

// 5. Test Route
app.get('/api/health', (req, res) => {
    res.json({ status: 'TaskHunt API is fully operational' });
});

// 6. Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});