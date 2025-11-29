const fs = require('fs');
const path = require('path');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

const DATA_DIR = process.env.DATA_DIR || './data';
const STORAGE_TYPE = process.env.STORAGE_TYPE || 'local';
const DEFAULT_HOURS = parseInt(process.env.DEFAULT_HOURS || '24', 10);

async function readFromS3(key) {
  const client = new S3Client({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }});
  const res = await client.send(new GetObjectCommand({ Bucket: process.env.S3_BUCKET, Key: key }));
  const streamToString = (stream) => new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
  const body = await streamToString(res.Body);
  return JSON.parse(body);
}

function isWithinHours(isoDate, hours) {
  if (!isoDate) return false;
  const posted = new Date(isoDate).getTime();
  const diff = Date.now() - posted;
  return diff >= 0 && diff <= hours * 60 * 60 * 1000;
}

exports.handler = async function(event) {
  try {
    const qp = event.queryStringParameters || {};
    const hours = parseInt(qp.hours || DEFAULT_HOURS, 10);
    let data;
    if (STORAGE_TYPE === 's3') {
      data = await readFromS3('index.json');
    } else {
      const p = path.join(DATA_DIR, 'index.json');
      if (!fs.existsSync(p)) return { statusCode: 200, body: JSON.stringify({ count: 0, hours, jobs: [] }) };
      data = JSON.parse(fs.readFileSync(p,'utf8'));
    }
    const jobs = (data.jobs || []).filter(j => {
      if (j.posted_at) return isWithinHours(j.posted_at, hours);
      if (j.source_type === 'scraped' && j.crawl_time) return isWithinHours(j.crawl_time, hours);
      return false;
    });
    return { statusCode: 200, headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ count: jobs.length, hours, jobs }) };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
