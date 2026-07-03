module.exports = {
  apps: [{
    name: 'agentboard',
    script: './server.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
