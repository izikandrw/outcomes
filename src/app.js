const express = require('express');
const accountsRouter = require('./routes/accounts');

const app = express();
app.use(express.json());

app.use('/accounts', accountsRouter);

app.use((req, res) => {
  res.status(404).json({ error: 'not found' });
});

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === '23503') return res.status(409).json({ error: 'referenced by or references a missing row', detail: err.detail });
  if (err.code === '23505') return res.status(409).json({ error: 'duplicate value', detail: err.detail });
  if (err.code === '22P02') return res.status(400).json({ error: 'invalid input', detail: err.message });
  res.status(500).json({ error: 'internal server error' });
});

module.exports = app;
