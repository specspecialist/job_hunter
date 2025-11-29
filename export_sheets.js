const jwt = require('jsonwebtoken');
const { google } = require('googleapis');

const SECRET = process.env.JWT_SECRET || 'change_me';
const GS_CREDS_B64 = process.env.GS_CREDS_B64 || '';
const GS_SHEET_ID = process.env.GS_SHEET_ID || '';

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

async function fetchJobs(hours) {
  const siteUrl = process.env.SITE_URL || `https://your-site.netlify.app`;
  const url = `${siteUrl}/.netlify/functions/jobs?hours=${hours}`;
  const r = await fetch(url);
  if (!r.ok) throw new Error('Failed jobs fetch');
  return r.json();
}

exports.handler = async function(event) {
  try {
    const user = verifyAuth(event);
    if (!user) return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) };

    if (!GS_CREDS_B64 || !GS_SHEET_ID) {
      return { statusCode: 500, body: JSON.stringify({ error: 'Google Sheets not configured (GS_CREDS_B64 or GS_SHEET_ID missing)' }) };
    }

    const hours = (event.queryStringParameters && event.queryStringParameters.hours) || '24';
    const jobsResp = await fetchJobs(hours);
    const jobs = jobsResp.jobs || [];

    const credsJson = JSON.parse(Buffer.from(GS_CREDS_B64, 'base64').toString('utf8'));

    const auth = new google.auth.GoogleAuth({
      credentials: credsJson,
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });

    const sheets = google.sheets({ version: 'v4', auth });
    const rows = [
      ['title', 'company', 'location', 'url', 'posted_at', 'source'],
      ...jobs.map(j => [j.title || '', j.company || '', j.location || '', j.url || '', j.posted_at || '', j.source || ''])
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: GS_SHEET_ID,
      range: 'Sheet1!A1',
      valueInputOption: 'RAW',
      requestBody: { values: rows }
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ success: true, written: rows.length })
    };

  } catch (err) {
    console.error(err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
