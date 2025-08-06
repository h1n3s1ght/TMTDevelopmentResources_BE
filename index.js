// index.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

const grammarRoutes = require('./routes/grammarRoute');
const seoRoutes = require('./routes/seoRoute');
const designRoutes = require('./routes/designRoute');
const migrationRoutes = require('./routes/migrationRoute');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/api/runGrammarScan', grammarRoutes);
app.use('/api/seoScan', seoRoutes);
app.use('/api/designScan', designRoutes);
app.use('/api/migrationScan', migrationRoutes);

app.get('/', (req, res) => {
  res.send({ status: 'API is running' });
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});
