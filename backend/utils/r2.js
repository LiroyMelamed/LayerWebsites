const { S3Client } = require("@aws-sdk/client-s3");

const r2 = new S3Client({
    region: "auto",
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.S3_KEY,
        secretAccessKey: process.env.S3_SECRET,
    },
});

const BUCKET = process.env.S3_BUCKET;

module.exports = { r2, BUCKET };
