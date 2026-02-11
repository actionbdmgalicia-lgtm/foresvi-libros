const fs = require('fs');
const path = require('path');
const http = require('http');
const { google } = require('googleapis');
const url = require('url');
const { spawn } = require('child_process');

const CREDENTIALS_PATH = path.join(__dirname, 'youtube-oauth-client.json');
const TOKEN_PATH = path.join(__dirname, 'youtube-token.json');
const SCOPES = [
    'https://www.googleapis.com/auth/youtube.upload',
    'https://www.googleapis.com/auth/youtube',
    'https://www.googleapis.com/auth/youtube.readonly'
];

async function main() {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
        console.error('Error: youtube-oauth-client.json not found.');
        process.exit(1);
    }

    const content = fs.readFileSync(CREDENTIALS_PATH);
    const keys = JSON.parse(content);
    const key = keys.installed || keys.web;

    const redirectUri = key.redirect_uris.find(u => u.includes('localhost:3000')) || key.redirect_uris[0];

    console.log(`Using credentials from Client ID: ${key.client_id.substring(0, 10)}...`);

    const oauth2Client = new google.auth.OAuth2(
        key.client_id,
        key.client_secret,
        redirectUri
    );

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
        prompt: 'consent',
        response_type: 'code'
    });

    console.log('\n👇 ENLACE DE AUTORIZACIÓN (Copia si no se abre): 👇\n');
    console.log(authUrl);
    console.log('\n👆 ----------------------------------------------- 👆\n');

    console.log('🚀 Intentando abrir navegador automáticamente...');

    // Use spawn to avoid shell escaping issues
    const open = spawn('open', [authUrl]);

    open.on('error', (err) => {
        console.error('Error abriendo navegador:', err);
        console.log('Por favor, copia y pega el enlace manualmente.');
    });

    const server = http.createServer(async (req, res) => {
        if (req.url.startsWith('/oauth2callback')) {
            const qs = new url.URL(req.url, 'http://localhost:3000').searchParams;
            const code = qs.get('code');

            if (code) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end('<h1>¡Autenticación completada!</h1><p>Vuelve al chat.</p>');
                server.close();

                try {
                    const { tokens } = await oauth2Client.getToken(code);
                    fs.writeFileSync(TOKEN_PATH, JSON.stringify(tokens, null, 2));
                    console.log('\n🎉 ¡ÉXITO! Tokens guardados en youtube-token.json');
                    process.exit(0);
                } catch (err) {
                    console.error('Error token:', err);
                    process.exit(1);
                }
            }
        }
    }).listen(3000);
}

main().catch(console.error);
