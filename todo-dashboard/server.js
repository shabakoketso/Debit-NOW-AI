const express = require('express');
const path = require('path');

const app = express();
const port = process.env.PORT || process.env.TODO_PORT || 3200;

app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

if (require.main === module) {
  app.listen(port, () => console.log(`To-do app running on port ${port}`));
}

module.exports = app;
