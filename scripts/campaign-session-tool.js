const path = require('path');
const tool = require(path.join(__dirname, '../NebryssCompanion/scripts/campaign-session-tool.js'));

if (typeof tool.main === 'function') {
  tool.main().catch(err => {
    console.error('Error in campaign-session-tool:', err.message || err);
    process.exit(1);
  });
}
