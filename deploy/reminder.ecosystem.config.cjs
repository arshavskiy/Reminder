module.exports = {
  apps: [
    {
      name: "reminder-server",
      script: "bun",
      args: "run src/index.ts",
      cwd: "/var/www/reminder/server",
      interpreter: "none",       // PM2 passes args directly to bun
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
        // Secrets are loaded from /var/www/reminder/server/.env by the app
        // or set here directly (env file preferred — don't commit secrets)
      },
      error_file: "/var/log/reminder/err.log",
      out_file:   "/var/log/reminder/out.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
