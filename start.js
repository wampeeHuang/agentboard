// Pre-start guard: kill orphan processes on agentboard port before starting.
// 防止残留进程占端口，阻塞重启。
const { execSync } = require('child_process');
const PORT = 3099;

try {
  execSync(`npx kill-port ${PORT}`, { stdio: 'ignore', timeout: 5000 });
} catch (e) {
  // kill-port fails if port is free — that's fine
}

const { startServer } = require('./server.js');
startServer();
