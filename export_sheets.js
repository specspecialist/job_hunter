const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');

const GS_CREDS_B64 = process.env.GS_CREDS_B64 || '';
const GS_SHEET_ID = process.env.GS_SHEET_ID || '';
const DATA_DIR = process.env.DATA_DIR || './data';
const INDEX_PATH = process.env.INDEX_PATH || path.join(DATA_DIR, 'index.json');

const CATEGORY_KEYWORDS = {
  'digital marketing': ['digital marketing','social media','google ads','seo','ppc','content marketing'],
  'software dev': ['developer','engineer','react','node','python'],
  'design': ['designer','ux','ui','graphic']
};

function norm(s=''){return (s||'').toString().toLowerCase().replace(/\s+/g,' ').trim();}
function matchesKeywords(text,keywords){ if(!text||!keywords||!keywords.length) return false; const t=norm(text); for(const kw of keywords){ const k=kw.toLowerCase(); if(k.includes(' ')){ if(t.indexOf(k)!==-1) return true; } else { const re=new RegExp('\\b'+k.replace(/[.*+?^${}()|[\\]\\]/g,'\\$&')+'\\b','i'); if(re.test(t)) return true; } } return false; }
function scoreJobForCategory(job,categoryKeywords){ let score=0; try{ if(matchesKeywords(job.title,categoryKeywords)) score+=5; if(matchesKeywords(job.company,categoryKeywords)) score+=2; const desc=(job.raw && (job.raw.description||job.raw.job_description||job.raw.content))||job.description||job.summary||''; if(matchesKeywords(desc,categoryKeywords)) score+=3; if(matchesKeywords(job.source,categoryKeywords)) score+=1; }catch(e){} return score; }

async function writeToSheets(jobs){ if(!GS_CREDS_B64||!GS_SHEET_ID) throw new Error('GS_CREDS_B64 or GS_SHEET_ID not configured'); const credsJson=JSON.parse(Buffer.from(GS_CREDS_B64,'base64').toString('utf8')); const auth=new google.auth.GoogleAuth({ credentials: credsJson, scopes:['https://www.googleapis.com/auth/spreadsheets'] }); const sheets=google.sheets({ version:'v4', auth }); const rows=[['title','company','location','url','posted_at','source','source_type','crawl_time','score']]; for(const j of jobs) rows.push([j.title||'',j.company||'',j.location||'',j.url||'',j.posted_at||'',j.source||'',j.source_type||'',j.crawl_time||'',j._score||'']); await sheets.spreadsheets.values.append({ spreadsheetId: GS_SHEET_ID, range: 'Sheet1!A1', valueInputOption: 'RAW', requestBody: { values: rows }}); return rows.length-1; }

async function main({ hours='24', category='', q='' }={}){ if(!fs.existsSync(INDEX_PATH)) throw new Error('index.json not found at '+INDEX_PATH); const data=JSON.parse(fs.readFileSync(INDEX_PATH,'utf8')); const all=data.jobs||[]; const now=Date.now(); const hrs=parseInt(hours,10); let categoryKeywords=[]; if(category){ const key=category.toLowerCase(); if(CATEGORY_KEYWORDS[key]) categoryKeywords=CATEGORY_KEYWORDS[key].slice(); else categoryKeywords=[category]; } if(q){ const extras=q.split(',').map(s=>s.trim()).filter(Boolean); categoryKeywords.push(...extras); } const filteredByTime=all.filter(job=>{ if(job.posted_at){ const t=new Date(job.posted_at).getTime(); if(!isNaN(t) && (now - t) <= hrs * 3600 * 1000) return true; } if(job.source_type==='scraped' && job.crawl_time){ const t=new Date(job.crawl_time).getTime(); if(!isNaN(t) && (now - t) <= hrs * 3600 * 1000) return true; } return false; }); const matched=[]; for(const job of filteredByTime){ if(!categoryKeywords.length){ matched.push(job); continue; } const score=scoreJobForCategory(job,categoryKeywords); if(score>=4){ job._score=score; matched.push(job); } } const written=await writeToSheets(matched); return { written, matched: matched.length }; }

if(require.main===module){ const argv=process.argv.slice(2); const hours=argv[0]||process.env.HOURS||'24'; const category=argv[1]||process.env.EXPORT_CATEGORY||''; const q=argv[2]||process.env.EXPORT_Q||''; main({ hours, category, q }).then(r=>{ console.log('Export complete', r); process.exit(0); }).catch(err=>{ console.error(err); process.exit(2); }); }
module.exports = { main, scoreJobForCategory };
