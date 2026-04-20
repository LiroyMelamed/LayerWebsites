module.exports = {
    apps: [
        {
            name: 'ashrafessa-api',
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

            out_file: '/var/log/ashrafessa-api/out.log',
            error_file: '/var/log/ashrafessa-api/err.log',
            log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
            merge_logs: true,

            // All tenant-specific values (DB creds, secrets, SMTP, R2) live in backend/.env
            // (gitignored, root-owned on the server). Do NOT put real secrets here.
            // Only non-secret, non-overriding defaults belong in env_production.
            env_production: {
                NODE_ENV: 'production',
                IS_PRODUCTION: 'true',
                TRUST_PROXY: 'true',
            },
        },
    ],
};
