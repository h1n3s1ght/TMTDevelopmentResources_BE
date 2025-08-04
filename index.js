// index.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const grammarRoutes = require('./routes/grammarRoute');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Mount routes
app.use('/api/runGrammarScan', grammarRoutes);

// Health check
app.get('/', (req, res) => {
  res.send({ status: 'API is running' });
});

// Start server
app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
