const jwt = require('jsonwebtoken');
const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');

const SECRET = process.env.JWT_SECRET || 'change_me';
const STORAGE = process.env.STORAGE_TYPE || 'local';
const DATA_DIR = process.env.DATA_DIR || './data';
const S3_BUCKET = process.env.S3_BUCKET || '';

function verifyAuth(event){
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  if(!auth.startsWith('Bearer ')) return null;
  try { return jwt.verify(auth.split(' ')[1], SECRET); } catch(e) { return null; }
}

async function readIndexFromS3(){
  const client = new S3Client({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }});
  const res = await client.send(new GetObjectCommand({ Bucket: S3_BUCKET, Key: 'index.json' }));
  const chunks = [];
  for await (const c of res.Body) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

async function writeIndexToS3(obj){
  const client = new S3Client({ region: process.env.AWS_REGION, credentials: { accessKeyId: process.env.AWS_ACCESS_KEY_ID, secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY }});
  const body = Buffer.from(JSON.stringify(obj, null, 2), 'utf8');
  await client.send(new PutObjectCommand({ Bucket: S3_BUCKET, Key: 'index.json', Body: body, ContentType:'application/json' }));
}

exports.handler = async function(event){
  try {
    const user = verifyAuth(event);
    if(!user) return { statusCode:401, body: JSON.stringify({ error:'Unauthorized' }) };
    if(event.httpMethod !== 'POST') return { statusCode:405, body: JSON.stringify({ error:'Method not allowed' }) };
    const payload = JSON.parse(event.body || '{}');
    const { id, url } = payload;
    if(!id && !url) return { statusCode:400, body: JSON.stringify({ error:'Missing id or url' }) };

    let indexObj;
    if(STORAGE === 's3') {
      if(!S3_BUCKET) return { statusCode:500, body: JSON.stringify({ error:'S3_BUCKET not configured' }) };
      indexObj = await readIndexFromS3();
    } else {
      const p = path.join(DATA_DIR, 'index.json');
      if(!fs.existsSync(p)) return { statusCode:500, body: JSON.stringify({ error:'index.json not found' }) };
      indexObj = JSON.parse(fs.readFileSync(p,'utf8'));
    }

    const origCount = (indexObj.jobs||[]).length;
    const filtered = (indexObj.jobs||[]).filter(j => {
      if(id && j.id === id) return false;
      if(url && j.url === url) return false;
      return true;
    });
    indexObj.jobs = filtered;

    if(STORAGE === 's3') {
      await writeIndexToS3(indexObj);
      return { statusCode:200, body: JSON.stringify({ success:true, removed: origCount - filtered.length }) };
    } else {
      const p = path.join(DATA_DIR, 'index.json');
      fs.writeFileSync(p, JSON.stringify(indexObj, null, 2));
      return { statusCode:200, body: JSON.stringify({ success:true, removed: origCount - filtered.length, warning:'Local write done; on Netlify this may not persist across deploys. Use S3 or run GitHub Action to commit.' }) };
    }
  } catch(err){
    console.error(err);
    return { statusCode:500, body: JSON.stringify({ error: err.message }) };
  }
};
