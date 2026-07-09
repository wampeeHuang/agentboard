module.exports = {
  apps: [{
    name: 'agentboard',
    script: './start.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
