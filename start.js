// Pre-start guard: kill orphan processes on agentboard port before starting.
// Prevents node -e "require('./server.js')" orphans from blocking pm2 restarts.
const { execSync } = require('child_process');
const PORT = 3099;

try {
  execSync(`npx kill-port ${PORT}`, { stdio: 'ignore', timeout: 5000 });
} catch (e) {
  // kill-port fails if port is free — that's fine
}

require('./server.js');
