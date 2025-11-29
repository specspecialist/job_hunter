const fetch = require('node-fetch');
const { URL } = require('url');

async function getContentType(url, headers={}) {
  try {
    const res = await fetch(url, { method: 'HEAD', headers, redirect: 'follow', timeout: 10000 });
    const ct = res.headers.get('content-type') || '';
    return { ok: res.ok, status: res.status, contentType: ct };
  } catch (e) {
    try {
      const res2 = await fetch(url, { method: 'GET', headers, redirect: 'follow', timeout: 15000 });
      const ct = res2.headers.get('content-type') || '';
      return { ok: res2.ok, status: res2.status, contentType: ct };
    } catch (err) {
      return { ok: false, status: 0, contentType: '' };
    }
  }
}

async function robotsAllows(urlString, userAgent='*') {
  try {
    const u = new URL(urlString);
    const robotsUrl = `${u.protocol}//${u.host}/robots.txt`;
    const res = await fetch(robotsUrl, { method: 'GET', timeout: 5000 });
    if (!res.ok) return true;
    const txt = await res.text();
    const lines = txt.split('\n').map(l => l.trim());
    let applies = false;
    const disallowPaths = [];
    for (const l of lines) {
      if (!l) continue;
      if (/^User-agent:/i.test(l)) {
        const ua = l.split(':')[1].trim();
        applies = (ua === '*' || ua.toLowerCase().includes(userAgent.toLowerCase()));
        continue;
      }
      if (applies && /^Disallow:/i.test(l)) {
        const p = l.split(':')[1].trim();
        if (p) disallowPaths.push(p);
      }
    }
    const path = new URL(urlString).pathname || '/';
    for (const d of disallowPaths) {
      if (d === '/') return false;
      if (path.startsWith(d)) return false;
    }
    return true;
  } catch (e) {
    return true;
  }
}

function hostMatchesAny(hostname, list=[]) {
  if (!hostname) return false;
  const h = hostname.toLowerCase();
  return list.some(item => {
    if (!item) return false;
    const it = item.toLowerCase();
    return it === h || h.endsWith('.' + it);
  });
}

async function shouldScrapeSource(src, opts = {}) {
  if (!src || !src.url) return { shouldScrape:false, reason:'no-url' };
  if (src.forceApi || (src.type && src.type.toLowerCase() === 'api')) return { shouldScrape:false, reason:'explicit-api' };
  if (src.forceRss || (src.type && src.type.toLowerCase() === 'rss')) return { shouldScrape:false, reason:'explicit-rss' };
  if (src.forceScrape) return { shouldScrape:true, reason:'forceScrape' };
  const urlObj = new URL(src.url);
  const host = urlObj.hostname;
  if (hostMatchesAny(host, opts.blacklist || [])) return { shouldScrape:false, reason:'blacklisted' };
  if ((opts.whitelist || []).length && !hostMatchesAny(host, opts.whitelist)) return { shouldScrape:false, reason:'not-in-whitelist' };
  const probe = await getContentType(src.url, {});
  const ct = (probe.contentType || '').toLowerCase();
  if (ct.includes('json')) return { shouldScrape:false, reason:'json-endpoint' };
  if (ct.includes('xml') || ct.includes('rss')) return { shouldScrape:false, reason:'rss-endpoint' };
  const robotsOk = await robotsAllows(src.url, opts.userAgent || '*');
  if (!robotsOk) return { shouldScrape:false, reason:'robots-disallow' };
  if (src.disallowScrape) return { shouldScrape:false, reason:'disallowScrape' };
  if (typeof src.allowScrape !== 'undefined') return { shouldScrape:!!src.allowScrape, reason: src.allowScrape ? 'allowScrape' : 'explicit-disallow' };
  return { shouldScrape:true, reason:'html-allowed' };
}

module.exports = { shouldScrapeSource, getContentType, robotsAllows };
