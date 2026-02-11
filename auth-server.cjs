
const express = require('express');
const { google } = require('googleapis');
const fs = require('fs');
const path = require('path');
// const open = require('open'); // REMOVED

const app = express();
const PORT = 3000;

app.get('/oauth2callback', async (req, res) => {
    const { code } = req.query;
    try {
        const CREDIT_PATH = path.join(__dirname, 'youtube-oauth-client.json');
        const content = fs.readFileSync(CREDIT_PATH);
        const credentials = JSON.parse(content);
        const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;

        // Ensure redirect URI matches exactly what is in the file (http://localhost:3000/oauth2callback)
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        const { tokens } = await oAuth2Client.getToken(code);
        fs.writeFileSync(path.join(__dirname, 'youtube-token.json'), JSON.stringify(tokens, null, 2));

        res.send(`<h1>Authentication Successful!</h1><p>Token saved.</p>`);
        console.log('Token saved to youtube-token.json');

        // Exit process after short delay
        setTimeout(() => process.exit(0), 1000);

    } catch (e) {
        console.error('Error:', e.message);
        res.status(500).send('Authentication failed: ' + e.message);
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Auth Server running on http://localhost:${PORT}`);

    // Generate Auth URL
    const CREDIT_PATH = path.join(__dirname, 'youtube-oauth-client.json');
    if (fs.existsSync(CREDIT_PATH)) {
        const content = fs.readFileSync(CREDIT_PATH);
        const credentials = JSON.parse(content);
        const { client_secret, client_id, redirect_uris } = credentials.installed || credentials.web;
        const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris[0]);

        const authUrl = oAuth2Client.generateAuthUrl({
            access_type: 'offline',
            scope: ['https://www.googleapis.com/auth/youtube.upload']
        });

        console.log('\n\n=== ACTION REQUIRED ===');
        console.log('Please open this URL to authenticate:');
        console.log(authUrl);
        console.log('=======================\n\n');
    }
});
