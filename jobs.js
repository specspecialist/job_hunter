const HOURS_DEFAULT = 24;

function parseSourcesEnv() {
  const raw = process.env.JOB_SOURCES || "[]";
  try {
    return JSON.parse(raw);
  } catch (e) {
    console.error("JOB_SOURCES parse error", e);
    return [];
  }
}

function safeDateIso(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

function isWithinHours(isoDate, hours) {
  if (!isoDate) return false;
  const posted = new Date(isoDate).getTime();
  const diff = Date.now() - posted;
  return diff >= 0 && diff <= hours * 60 * 60 * 1000;
}

function normalizeGreenhouse(item, sourceName) {
  return {
    id: item.id || item.name || item.absolute_url || `${sourceName}-${Math.random()}`,
    title: item.title || item.name || null,
    company: item.company || null,
    location: (item.location && item.location.name) || item.location || null,
    url: item.absolute_url || item.url || item.apply_url || null,
    posted_at: safeDateIso(item.updated_at || item.posted_at || item.created_at || item.offered_at),
    source: sourceName,
    raw: item
  };
}

function normalizeWorkable(item, sourceName) {
  const location = (item.locations && item.locations.length) ? item.locations.map(l=>l.name || l).join(", ") : (item.location || item.city || null);
  return {
    id: item.id || item.job_id || item.key || `${sourceName}-${Math.random()}`,
    title: item.title || item.position || null,
    company: item.company || item.employer || null,
    location: location || null,
    url: item.apply_url || item.url || item.shortlink || null,
    posted_at: safeDateIso(item.published_at || item.published_at_local || item.created || item.created_at || item.posted_at),
    source: sourceName,
    raw: item
  };
}

function normalizeZoho(item, sourceName) {
  return {
    id: item.id || item.job_id || item.Id || `${sourceName}-${Math.random()}`,
    title: item.Job_Title || item.job_title || item.title || item.JobTitle || null,
    company: item.Company || item.company || null,
    location: item.Job_Location || item.job_location || item.location || item.city || null,
    url: item.apply_url || item.url || item.JobURL || null,
    posted_at: safeDateIso(item.created_time || item.created_at || item.posted_at || item.published_at),
    source: sourceName,
    raw: item
  };
}

function normalizeLever(item, sourceName) {
  const location = (item.categories && (item.categories.location || item.categories.locationGroup)) || item.location || null;
  return {
    id: item.id || item.requisitionId || item.uuid || `${sourceName}-${Math.random()}`,
    title: item.text || item.title || item.role || null,
    company: item.company || null,
    location: (typeof location === "object" ? (location.name || JSON.stringify(location)) : location) || null,
    url: item.hostedUrl || item.applyUrl || item.apply_url || item.href || null,
    posted_at: safeDateIso(item.createdAt || item.created_at || item.posted_at || item.publishDate),
    source: sourceName,
    raw: item
  };
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
    raw: item
  };
}

exports.handler = async function(event) {
  try {
    const qp = event.queryStringParameters || {};
    const hours = parseInt(qp.hours || process.env.DEFAULT_HOURS || HOURS_DEFAULT, 10);
    const sources = parseSourcesEnv();
    const collected = [];

    for (const src of sources) {
      try {
        const headers = {};
        if (src.authEnv) {
          const token = process.env[src.authEnv];
          if (token) {
            headers["Authorization"] = token.startsWith("Bearer ") ? token : `Bearer ${token}`;
          }
        }
        if (src.apiKeyHeader && src.apiKeyEnv) {
          const v = process.env[src.apiKeyEnv];
          if (v) headers[src.apiKeyHeader] = v;
        }

        const res = await fetch(src.url, { headers });
        if (!res.ok) {
          console.warn(`source ${src.name} returned ${res.status}`);
          continue;
        }
        const contentType = res.headers.get("content-type") || "";
        let json;
        if (contentType.includes("json")) json = await res.json();
        else {
          console.warn(`source ${src.name} returned non-json content-type ${contentType}`);
          continue;
        }

        let items = json;
        if (src.pathToJobs) {
          const parts = src.pathToJobs.split(".");
          items = parts.reduce((o, p) => (o && o[p] ? o[p] : null), json);
        }
        if (!Array.isArray(items)) {
          if (items && items.jobs && Array.isArray(items.jobs)) items = items.jobs;
          else if (json && json.jobs && Array.isArray(json.jobs)) items = json.jobs;
          else items = [];
        }

        for (const it of items) {
          let norm;
          const type = (src.type || "").toLowerCase();
          if (type === "greenhouse") norm = normalizeGreenhouse(it, src.name);
          else if (type === "workable") norm = normalizeWorkable(it, src.name);
          else if (type === "zoho") norm = normalizeZoho(it, src.name);
          else if (type === "lever") norm = normalizeLever(it, src.name);
          else norm = normalizeGenericApi(it, src.name);

          if (isWithinHours(norm.posted_at, hours)) collected.push(norm);
        }
      } catch (err) {
        console.warn("source fetch error", src && src.name, err.message);
      }
    }

    const seen = new Set();
    const deduped = [];
    for (const j of collected) {
      const key = j.url || j.id || JSON.stringify([j.title, j.company]);
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(j);
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ count: deduped.length, hours, jobs: deduped })
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
