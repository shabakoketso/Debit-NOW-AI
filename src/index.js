// Compatibility entrypoint for Render services that still have the legacy command
// `node src/index.js` saved in their service settings.
// The canonical application entrypoint remains the repository-root ../index.js.
require('../index.js');
