const fs = require('fs');
const { google } = require('googleapis');

const creds = JSON.parse(fs.readFileSync('youtube-oauth-client.json'));
const tokens = JSON.parse(fs.readFileSync('youtube-token.json'));
const key = creds.installed || creds.web;

console.log('client_id:', key.client_id.substring(0, 20) + '...');
console.log('tiene refresh_token:', !!tokens.refresh_token);

const oauth2 = new google.auth.OAuth2(key.client_id, key.client_secret, 'http://localhost:3001/api/auth/youtube/callback');
oauth2.setCredentials(tokens);

console.log('Intentando refresh...');
setTimeout(() => { console.log('TIMEOUT'); process.exit(1); }, 10000);

oauth2.getAccessToken((err, token) => {
  if (err) { console.error('ERROR:', err.message); process.exit(1); }
  const merged = { ...tokens, access_token: token, expiry_date: Date.now() + 3600000 };
  fs.writeFileSync('youtube-token.json', JSON.stringify(merged, null, 2));
  console.log('Token guardado. Expira:', new Date(merged.expiry_date).toLocaleString());
  process.exit(0);
});
