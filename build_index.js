const fs = require('fs');
const path = require('path');

const DATA_DIR = process.env.DATA_DIR || './data';
const apiPath = path.join(DATA_DIR,'api_jobs.json');
const scrapedPath = path.join(DATA_DIR,'scraped_jobs.json');
const outPath = path.join(DATA_DIR,'index.json');

function safeRead(p) {
  if (!fs.existsSync(p)) return { jobs: [] };
  try { return JSON.parse(fs.readFileSync(p,'utf8')); } catch(e) { return { jobs: [] }; }
}

const api = safeRead(apiPath);
const scraped = safeRead(scrapedPath);

const all = [];
const seen = new Set();
for (const j of (api.jobs || [])) {
  const key = j.url || j.id || JSON.stringify([j.title,j.company]);
  if (!seen.has(key)) { seen.add(key); all.push(j); }
}
for (const j of (scraped.jobs || [])) {
  const key = j.url || j.id || JSON.stringify([j.title,j.company]);
  if (!seen.has(key)) { seen.add(key); all.push(j); }
}

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR,{recursive:true});
fs.writeFileSync(outPath, JSON.stringify({ generated_at: new Date().toISOString(), jobs: all }, null, 2));
console.log('Index built', all.length, 'jobs');
