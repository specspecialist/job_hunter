const jwt = require('jsonwebtoken');
const { stringify } = require('csv-stringify/sync');

const SECRET = process.env.JWT_SECRET || 'change_me';
const SITE_URL = process.env.SITE_URL || '';

function verifyAuth(event) {
  const h = event.headers || {};
  const auth = h.authorization || h.Authorization || '';
  if (!auth.startsWith('Bearer ')) return null;
  const token = auth.split(' ')[1];
  try {
    return jwt.verify(token, SECRET);
  } catch (e) {
    return null;
  }
}

exports.handler = async function(event) {
  try {
    const user = verifyAuth(event);
    if (!user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    const qs = event.queryStringParameters || {};
    const hours = qs.hours || '24';
    const site = SITE_URL || (`https://${event.headers.host}`);
    const url = `${site}/.netlify/functions/jobs?hours=${hours}`;

    const res = await fetch(url);
    if (!res.ok) return { statusCode: 502, body: JSON.stringify({ error: 'Failed to fetch jobs' }) };
    const data = await res.json();
    const rows = (data.jobs || []).map(j => [j.title || '', j.company || '', j.location || '', j.url || '', j.posted_at || '', j.source || '']);

    const header = ['title', 'company', 'location', 'url', 'posted_at', 'source'];
    const csv = stringify([header, ...rows], { header: false });

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="jobs-${hours}h.csv"`
      },
      body: csv
    };
  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
