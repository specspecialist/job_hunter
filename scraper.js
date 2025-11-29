const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const DATA_DIR = process.env.DATA_DIR || './data';

const scrapers = {
  'remoteok.com': async function scrapeRemoteOK() {
    const url = 'https://remoteok.com/remote-dev-jobs';
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const jobs = await page.$$eval('table#jobsboard tr.job', rows => rows.map(r => {
      const title = r.querySelector('h2') ? r.querySelector('h2').innerText.trim() : null;
      const company = r.querySelector('.companyLink h3') ? r.querySelector('.companyLink h3').innerText.trim() : null;
      const linkEl = r.querySelector('a.preventLink');
      const link = linkEl ? linkEl.href : null;
      const dateEl = r.querySelector('time');
      const posted = dateEl ? dateEl.getAttribute('datetime') || dateEl.innerText : null;
      return { title, company, url: link, posted_at: posted };
    }));
    await browser.close();
    return jobs.map(j=>({ id: j.url || `remoteok-${Math.random()}`, title: j.title, company: j.company, location: null, url: j.url, posted_at: j.posted_at, source: 'remoteok', source_type: 'scraped', crawl_time: new Date().toISOString(), raw: j }));
  },
  'weworkremotely.com': async function scrapeWeWorkRemotely() {
    const url = 'https://weworkremotely.com/categories/remote-programming-jobs';
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    const jobs = await page.$$eval('section.jobs li.feature', items => items.map(it => {
      const a = it.querySelector('a');
      const link = a ? a.href : null;
      const title = it.querySelector('span.title') ? it.querySelector('span.title').innerText.trim() : (a ? a.innerText.trim() : null);
      const company = it.querySelector('span.company') ? it.querySelector('span.company').innerText.trim() : null;
      const dateEl = it.querySelector('time');
      const posted = dateEl ? dateEl.getAttribute('datetime') || dateEl.innerText : null;
      return { title, company, url: link, posted_at: posted };
    }));
    await browser.close();
    return jobs.map(j=>({ id: j.url || `wwr-${Math.random()}`, title: j.title, company: j.company, location: null, url: j.url, posted_at: j.posted_at, source: 'weworkremotely', source_type: 'scraped', crawl_time: new Date().toISOString(), raw: j }));
  }
};

async function run() {
  let sources = [];
  const sourcesPath = path.join(DATA_DIR, 'sources_to_scrape.json');
  if (fs.existsSync(sourcesPath)) {
    try {
      const s = JSON.parse(fs.readFileSync(sourcesPath,'utf8'));
      sources = s.sources || [];
    } catch(e){ sources = []; }
  }

  const hosts = new Set();
  for (const s of sources) {
    try {
      const u = new URL(s.url);
      hosts.add(u.hostname);
    } catch(e){}
  }

  if (hosts.size === 0) hosts.add('remoteok.com'), hosts.add('weworkremotely.com');

  const all = [];
  for (const h of hosts) {
    const short = h.replace(/^www\./,'').toLowerCase();
    if (scrapers[short]) {
      try {
        const res = await scrapers[short]();
        all.push(...res);
      } catch(e){ console.error('scraper failed', short, e.message); }
    } else {
      console.log('No scraper available for', short, '— skipping');
    }
  }

  const seen = new Set();
  const deduped = [];
  for (const j of all) {
    const key = j.url || j.id || JSON.stringify([j.title, j.company]);
    if (!seen.has(key)) { seen.add(key); deduped.push(j); }
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(path.join(DATA_DIR,'scraped_jobs.json'), JSON.stringify({ generated_at: new Date().toISOString(), jobs: deduped }, null, 2));
  console.log('Scraped', deduped.length, 'jobs');
}

run().catch(e=>{ console.error(e); process.exit(1); });
