// helpers.js — spawn 真 server（临时 home + 随机端口），返回 base/kill
const { spawn } = require('child_process');
const path = require('path');
const PROJECT_DIR = path.join(__dirname, '..', '..');

function randomPort() {
  return 40000 + Math.floor(Math.random() * 10000);
}

// 等待 server 就绪：轮询 /api/tools 200
async function waitReady(base, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(base + '/api/tools', { signal: AbortSignal.timeout(1500) });
      if (res.ok) return true;
    } catch (_) {}
    await new Promise(r => setTimeout(r, 250));
  }
  return false;
}

// spawn 真 server。返回 { base, home, port, kill, logs }
function spawnServer(home, opts) {
  opts = opts || {};
  const port = opts.port || randomPort();
  const base = 'http://127.0.0.1:' + port;
  const env = Object.assign({}, process.env, {
    AGENTBOARD_HOME: home,
    AGENTBOARD_APPS_REGISTRY: path.join(home, 'apps'),
    PORT: String(port)
  });
  const child = spawn(process.execPath, ['server.js'], {
    cwd: PROJECT_DIR,
    env: env,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let logs = '';
  child.stdout.on('data', d => { logs += d; });
  child.stderr.on('data', d => { logs += d; });
  child.on('error', e => { logs += 'spawn error: ' + e.message + '\n'; });

  return {
    base: base,
    home: home,
    port: port,
    child: child,
    logs: () => logs,
    kill: function () {
      return new Promise(resolve => {
        if (!child || child.killed || child.exitCode !== null) return resolve();
        child.once('exit', resolve);
        try { child.kill('SIGTERM'); } catch (_) {}
        setTimeout(() => { try { child.kill('SIGKILL'); } catch (_) {} resolve(); }, 2000);
      });
    }
  };
}

// 造 home + 起 server，返回一次性对象；finally 里 kill + 删目录
async function boot(t, opts) {
  const fixtures = require('./fixtures');
  const homeObj = fixtures.makeHome(opts);
  const srv = spawnServer(homeObj.home, opts);
  const ready = await waitReady(srv.base, 15000);
  if (!ready) {
    fixtures.rmrf(homeObj.home);
    throw new Error('server failed to start, logs:\n' + srv.logs());
  }
  t.after(async () => {
    await srv.kill();
    fixtures.rmrf(homeObj.home);
  });
  return Object.assign(srv, homeObj);
}

module.exports = { spawnServer, waitReady, boot, randomPort, PROJECT_DIR };
