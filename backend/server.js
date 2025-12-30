const axios = require('axios');
const app = require('./app');

const PORT = process.env.PORT || 5000;

const isProduction = process.env.IS_PRODUCTION === 'true';
        await pool.query('SELECT 1');
        return res.status(200).json({ ok: true });
    } catch (e) {
        console.error('DB sanity check failed:', e?.message);
        return res.status(500).json({ ok: false });
    }
});

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await getPublicIp();
});
