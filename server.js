const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const api = require('./instagram.js');

const app = express();
const port = 8000;

app.use(bodyParser.json());
app.use(cors());

app.get('/health', (req, res) => {
  res.status(200).send('Server is running');
});

app.post('/login', (req, res) => {
  const { username, password } = req.body;
  api.login(username, password)
    .then((userData) => res.json(userData))
    .catch((err) => res.status(400).json({ error: err.message }));
});

app.listen(port, () => {
  console.log(`Server running on port ${port}`);
});