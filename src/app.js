const express = require('express');
const cors = require('cors');
const authRouter = require('./routes/auth');
const { requireAuth } = require('./middleware/requireAuth');
const accountsRouter = require('./routes/accounts');
const { foreignKeyMessage } = require('./lib/foreignKeyError');

const app = express();
// CORS_ORIGIN is the deployed frontend's origin (e.g. https://outcomes.vercel.app).
// Falls back to allowing any origin so local dev and first deploys work without it set.
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

app.use('/auth', authRouter);
app.use('/accounts', requireAuth, accountsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === '23503') return res.status(409).json({ error: foreignKeyMessage(err), detail: err.detail });
  if (err.code === '23505') return res.status(409).json({ error: 'duplicate value', detail: err.detail });
  if (err.code === '22P02') return res.status(400).json({ error: 'invalid input', detail: err.message });
  res.status(500).json({ error: 'internal server error' });
});

module.exports = app;
