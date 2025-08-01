// index.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';
const API_BASE = isProduction ? '/api' : (process.env.API_BASE_URL || '/api');

// Middleware
app.use(cors());
app.use(express.json());

// Import routes
const grammarCrawler = require('./routes/grammar_crawler');

// Mount routes with dynamic base path
app.use(`${API_BASE}/crawler`, grammarCrawler);

// Root route
app.get('/', (req, res) => {
  res.send({ status: 'API is running locally' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});