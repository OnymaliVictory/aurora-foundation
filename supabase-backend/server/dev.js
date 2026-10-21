// Local dev: serves public/ and the API on http://localhost:3000
const express = require('express'); const path = require('path'); const app = require('./app');
const s = express(); s.use(app); s.use(express.static(path.join(__dirname, '../../public')));
s.listen(3000, () => console.log('Aurora Estates on http://localhost:3000'));
