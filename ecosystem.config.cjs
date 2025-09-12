module.exports = {
  apps: [{
    name: 'castbot-dev-pm',
    script: './app.js',
    cwd: '/home/reece/castbot',
    interpreter: 'node',
    node_args: '--experimental-specifier-resolution=node',
    env: {
      NODE_ENV: 'development'
    },
    watch: false,
    autorestart: true,
    max_memory_restart: '1G',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    merge_logs: true,
    time: true
  }]
};