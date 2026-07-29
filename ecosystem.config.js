module.exports = {
  apps: [{
    name: 'agentboard',
    script: './server.js',
    cwd: __dirname,
    max_restarts: 5,
    min_uptime: '10s',
    restart_delay: 5000,
    kill_timeout: 5000,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
