const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'change_me';
const CLIENT_ID = process.env.ADMIN_GOOGLE_CLIENT_ID || '';
const ALLOWED_EMAILS = (process.env.ADMIN_ALLOWED_EMAILS || '').split(',').map(s=>s.trim()).filter(Boolean);
const ALLOWED_DOMAIN = (process.env.ADMIN_ALLOWED_DOMAIN || '').trim();

const client = new OAuth2Client(CLIENT_ID);

async function verifyIdToken(idToken) {
  const ticket = await client.verifyIdToken({ idToken, audience: CLIENT_ID });
  return ticket.getPayload();
}

exports.handler = async function(event) {
  try {
    if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };
    const payload = JSON.parse(event.body || '{}');
    const idToken = payload.id_token;
    if (!idToken) return { statusCode: 400, body: JSON.stringify({ error: 'Missing id_token' }) };
    let ticket;
    try { ticket = await verifyIdToken(idToken); } catch (e) { console.error('id token verification failed', e.message); return { statusCode: 401, body: JSON.stringify({ error: 'Invalid id_token' }) }; }
    const email = ticket.email || '';
    const hd = ticket.hd || '';
    if (ALLOWED_EMAILS.length > 0 && !ALLOWED_EMAILS.includes(email)) return { statusCode: 403, body: JSON.stringify({ error: 'Email not allowed' }) };
    if (ALLOWED_DOMAIN && hd && ALLOWED_DOMAIN !== hd) return { statusCode: 403, body: JSON.stringify({ error: 'Google Workspace domain not allowed' }) };
    const token = jwt.sign({ role: 'admin', email }, SECRET, { expiresIn: '12h' });
    return { statusCode: 200, headers: { 'Content-Type':'application/json' }, body: JSON.stringify({ token }) };
  } catch (err) { console.error(err); return { statusCode: 500, body: JSON.stringify({ error: err.message }) }; }
};
