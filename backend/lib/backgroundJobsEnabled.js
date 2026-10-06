module.exports = function backgroundJobsEnabled(env = process.env) {
    return env.BACKGROUND_JOBS_ENABLED === undefined || String(env.BACKGROUND_JOBS_ENABLED).toLowerCase() === 'true';
};
