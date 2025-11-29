const fs = require('fs');
const Path = require('path');
const Parser = require('rss-parser');
const parser = new Parser();
const fetch = require('node-fetch');
const { shouldScrapeSource } = require('./decider');

const DATA_DIR = process.env.DATA_DIR || './data';
const JOB_SOURCES = (() => { try { return JSON.parse(process.env.JOB_SOURCES || '[]'); } catch(e) { console.error('Invalid JOB_SOURCES'); return []; } })();

function safeDateIso(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function normalizeGenericApi(item, sourceName) {
  return {
    id: item.id || item.job_id || item.uuid || (item.url || item.link) || `${sourceName}-${Math.random()}`,
    title: item.title || item.jobTitle || item.position || item.text || null,
    company: item.company || item.organization || item.employer || null,
    location: item.location || item.city || item.region || null,
    url: item.url || item.apply_url || item.link || null,
    posted_at: safeDateIso(item.posted_at || item.created_at || item.date || item.pubDate || item.posted),
    source: sourceName,
    source_type: 'api',
    crawl_time: new Date().toISOString(),
    raw: item
  };
}

async function run() {
  console.log('JOB_SOURCES', JOB_SOURCES.length);
  const collected = [];
  const toScrape = [];
  const manualReview = [];
  for (const src of JOB_SOURCES) {
    try {
      const decision = await shouldScrapeSource(src, { whitelist: (process.env.SCRAPE_WHITELIST||'').split(',').filter(Boolean), blacklist: (process.env.SCRAPE_BLACKLIST||'').split(',').filter(Boolean) });
      console.log('Decision for', src.name, decision);
      if (decision.shouldScrape) {
        toScrape.push({ name: src.name, url: src.url, reason: decision.reason });
        continue;
      } else {
        if (['no-url','explicit-api','explicit-rss','json-endpoint','rss-endpoint'].includes(decision.reason)) {
          // proceed to fetch as API/RSS
        } else {
          manualReview.push({ name: src.name, url: src.url, reason: decision.reason });
          continue;
        }
      }
      console.log('Fetching', src.name, src.url);
      const res = await fetch(src.url, { timeout: 20000 });
      if (!res.ok) { console.warn('Source failed', src.name, res.status); continue; }
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('xml') || ct.includes('rss') || src.forceRss) {
        const text = await res.text();
        const feed = await parser.parseString(text);
        for (const item of feed.items || []) {
          const norm = {
            id: item.guid || item.link || `${src.name}-${item.title}`,
            title: item.title,
            company: item.creator || null,
            location: null,
            url: item.link,
            posted_at: safeDateIso(item.pubDate || item.isoDate),
            source: src.name,
            source_type: 'rss',
            crawl_time: new Date().toISOString(),
            raw: item
          };
          collected.push(norm);
        }
      } else {
        const json = await res.json();
        let items = json;
        if (src.pathToJobs) {
          const parts = src.pathToJobs.split('.');
          items = parts.reduce((o,p)=> (o && o[p] ? o[p] : null), json);
        }
        if (!Array.isArray(items)) {
          if (json && Array.isArray(json.jobs)) items = json.jobs;
          else items = [];
        }
        for (const it of items) {
          const norm = normalizeGenericApi(it, src.name);
          collected.push(norm);
        }
      }
    } catch (e) {
      console.warn('Source error', src.name, e.message);
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const j of collected) {
    const key = j.url || j.id || JSON.stringify([j.title, j.company]);
    if (!seen.has(key)) { seen.add(key); deduped.push(j); }
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(Path.join(DATA_DIR, 'api_jobs.json'), JSON.stringify({ generated_at: new Date().toISOString(), jobs: deduped }, null, 2));
  fs.writeFileSync(Path.join(DATA_DIR, 'sources_to_scrape.json'), JSON.stringify({ generated_at: new Date().toISOString(), sources: toScrape }, null, 2));
  fs.writeFileSync(Path.join(DATA_DIR, 'manual_review.json'), JSON.stringify({ generated_at: new Date().toISOString(), items: manualReview }, null, 2));

  console.log('Fetched', deduped.length, 'api/rss jobs; toScrape:', toScrape.length, 'manualReview:', manualReview.length);
}

run().catch(e=>{ console.error(e); process.exit(1); });
