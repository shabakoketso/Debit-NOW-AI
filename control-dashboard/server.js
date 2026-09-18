const { app, initDatabase } = require('../index');
const port = process.env.CONTROL_DASHBOARD_PORT || 3200;
if (require.main === module) initDatabase().then(() => app.listen(port, () => console.log(`Debit NOW dashboard: http://localhost:${port}/dashboard`)));
module.exports = app;
