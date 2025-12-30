module.exports = {
  apps: [
    {
      name: 'melamedlaw-api',
      cwd: __dirname,
      script: 'server.js',

      // Load environment variables from a local .env file in the backend directory.
      // This matches the production workflow where you deploy a backend/.env on the server.
      // NOTE: Do NOT commit backend/.env (secrets). Use backend/.env.production.example as a template.
      env_file: '.env',
      // Keep fork mode by default (safe with in-memory rate limiting/caching).
      // If you later move shared state to Redis, you can switch to `exec_mode: 'cluster'`.
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      restart_delay: 2000,
      exp_backoff_restart_delay: 100,
      min_uptime: 5000,
      time: true,

      out_file: '/var/log/melamedlaw-api/out.log',
      error_file: '/var/log/melamedlaw-api/err.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,

      // IMPORTANT: This file is committed, so do NOT put real secrets here.
      // Fill secrets via server env (recommended) or a root-owned env file.
      env_production: {
        NODE_ENV: 'production',
        IS_PRODUCTION: 'true',
        TRUST_PROXY: 'true',
        PORT: '5000',

        // Auth
        JWT_SECRET: '__SET_IN_SERVER_ENV__',

        // Postgres (local on the Ubuntu server)
        DB_HOST: '127.0.0.1',
        DB_PORT: '5432',
        DB_NAME: 'melamedlaw',
        DB_USER: 'melamedlaw_app',
        DB_PASSWORD: '__SET_IN_SERVER_ENV__',
        DB_SSL: 'false',

        // Pool tuning (safe defaults; tune based on server size)
        DB_POOL_MAX: '20',
        DB_POOL_IDLE_TIMEOUT_MS: '30000',
        DB_POOL_CONN_TIMEOUT_MS: '5000',

        // Rate limiting (tune based on real traffic)
        RATE_LIMIT_IP_WINDOW_MS: '60000',
        RATE_LIMIT_IP_MAX: '600',
        RATE_LIMIT_AUTH_IP_WINDOW_MS: '600000',
        RATE_LIMIT_AUTH_IP_MAX: '40',
        RATE_LIMIT_USER_WINDOW_MS: '300000',
        RATE_LIMIT_USER_MAX: '600',

        // Object storage (S3/R2)
        S3_ENDPOINT: '__SET_IN_SERVER_ENV__',
        S3_BUCKET: '__SET_IN_SERVER_ENV__',
        S3_KEY: '__SET_IN_SERVER_ENV__',
        S3_SECRET: '__SET_IN_SERVER_ENV__',

        // SMS (Twilio)
        TWILIO_ACCOUNT_SID: '__SET_IN_SERVER_ENV__',
        TWILIO_AUTH_TOKEN: '__SET_IN_SERVER_ENV__',
        TWILIO_PHONE_NUMBER: '__SET_IN_SERVER_ENV__',
      },
    },
  ],
};
