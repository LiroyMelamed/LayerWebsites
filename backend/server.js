const axios = require('axios');
const app = require('./app');

const PORT = process.env.PORT || 5000;

async function getPublicIp() {
    try {
        const { data } = await axios.get('https://api.ipify.org?format=json', {
            timeout: 5000,
        });
        if (data?.ip) {
            console.log(`Public IP: ${data.ip}`);
        }
    } catch (e) {
        console.warn('Public IP check failed:', e?.message);
    }
}

app.listen(PORT, async () => {
    console.log(`Server running on port ${PORT}`);
    await getPublicIp();
});
