console.log("[BOOT] Cargando sistema...");
const express = require('express');
console.log("[BOOT] Express ok");
const cors = require('cors');
console.log("[BOOT] Cors ok");
const { spawn, execFile } = require('child_process');

// Lazy load heavy libraries to speed up boot on cloud drives
const lazyRequire = (moduleName, prop) => {
    let _mod = null;
    return new Proxy({}, {
        get: (target, p) => {
            if (!_mod) {
                console.log(`[BOOT] Lazy loading ${moduleName}...`);
                const required = require(moduleName);
                _mod = prop ? required[prop] : required;
                console.log(`[BOOT] ${moduleName} loaded.`);
            }
            return _mod[p];
        }
    });
};

const google = lazyRequire('googleapis', 'google');
const admin = lazyRequire('firebase-admin');
const axios = lazyRequire('axios');

const path = require('path');
const fs = require('fs');
const multer = require('multer');

// Configure multer for file uploads (PDFs, EPUBs)
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });
const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => cb(null, uploadsDir),
        filename: (req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`)
    }),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['.pdf', '.epub', '.txt', '.doc', '.docx'];
        const ext = path.extname(file.originalname).toLowerCase();
        if (allowed.includes(ext)) cb(null, true);
        else cb(new Error(`Tipo de archivo no soportado: ${ext}. Permitidos: ${allowed.join(', ')}`));
    }
});

// FFmpeg removed

console.log("[BOOT] Core modules ok");

const app = express();
const PORT = 3001;


app.use(cors());
app.use(express.json());

// Explicit CORS Headers (Brute force fix)
app.use((req, res, next) => {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }
    next();
});

// Global Request Logger
app.use((req, res, next) => {
    console.log(`[REQUEST] ${req.method} ${req.url}`);
    next();
});

// Path to the MCP executable (Validated in previous steps)
const MCP_PATH = "/Users/maccuatro/.local/bin/notebooklm-mcp";
// Path to the nlm CLI tool (for auth checks and re-login)
const NLM_CLI = "/Users/maccuatro/.local/share/uv/tools/notebooklm-mcp-cli/bin/nlm";

// NotebookLM auth state (updated on startup and on each check)
let nlmAuthValid = null; // null=unknown, true=ok, false=expired

const checkNLMAuth = () => new Promise((resolve) => {
    execFile(NLM_CLI, ['notebook', 'list', '--json'], { timeout: 15000 }, (err) => {
        if (err) {
            console.warn('[NLM Auth] ⚠️  Autenticación expirada o error de conexión:', err.message.substring(0, 120));
            nlmAuthValid = false;
            resolve(false);
        } else {
            console.log('[NLM Auth] ✅ NotebookLM conectado correctamente');
            nlmAuthValid = true;
            resolve(true);
        }
    });
});

// Initialize Firebase Admin with explicit bucket
const BUCKET_NAME = 'foresvi-libros.firebasestorage.app';
let bucketName = BUCKET_NAME;

if (!admin.apps.length) {
    const serviceAccountPath = path.join(__dirname, 'firebase-admin-key.json');

    if (fs.existsSync(serviceAccountPath)) {
        const serviceAccount = require(serviceAccountPath);

        (async () => { // Use an async IIFE to allow await
            try {
                console.log(`[Firebase] Initializing specific bucket: ${BUCKET_NAME}`);
                admin.initializeApp({
                    credential: admin.credential.cert(serviceAccount),
                    storageBucket: BUCKET_NAME
                });

                // CONFIGURAR CORS EN EL BUCKET (CRUCIAL PARA AUDIO PLAYBACK)
                const bucket = admin.storage().bucket(BUCKET_NAME);
                await bucket.setCorsConfiguration([
                    {
                        maxAgeSeconds: 3600,
                        method: ["GET", "HEAD", "PUT", "POST", "DELETE"],
                        origin: ["*"], // Permitir todo (o pon http://localhost:5174)
                        responseHeader: ["*"] // Permitir todos los headers
                    }
                ]);
                console.log(`[Firebase] ✅ CORS configurado en el bucket para permitir reproducción.`);
                console.log(`[Firebase] Admin SDK initialized. Bucket: ${BUCKET_NAME}`);
            } catch (firebaseErr) {
                console.error("[Firebase] Error initializing or setting CORS:", firebaseErr);
            }
        })();
    } else {
        console.log('[Firebase] Service account key not found.');
    }
}

// Job Persistence
const JOBS_FILE = path.join(__dirname, 'jobs-persist.json');
let jobs = {};

function loadJobs() {
    try {
        if (fs.existsSync(JOBS_FILE)) {
            const data = fs.readFileSync(JOBS_FILE, 'utf8');
            jobs = JSON.parse(data);
            console.log(`[Jobs] Loaded ${Object.keys(jobs).length} jobs from disk.`);
        }
    } catch (e) {
        console.error('[Jobs] Failed to load persistence:', e.message);
    }
}

function saveJobs() {
    try {
        fs.writeFileSync(JOBS_FILE, JSON.stringify(jobs, null, 2));
    } catch (e) {
        console.error('[Jobs] Failed to save persistence:', e.message);
    }
}

loadJobs(); // Load on start

// ... (rest of code)


// --- PERSISTENT MCP CLIENT ---
class MCPClient {
    constructor(executablePath) {
        this.path = executablePath;
        this.process = null;
        this.requestId = 1;
        this.pendingRequests = new Map(); // id -> {resolve, reject}
        this.buffer = '';
        this.isInitialized = false;
        this.initPromise = null;
    }

    start() {
        if (this.process) return this.initPromise;

        console.log(`[MCP] Starting persistent process at ${this.path}...`);
        this.process = spawn(this.path, [], {
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        this.process.stderr.on('data', (data) => {
            const msg = data.toString();
            // Only log real errors, ignore info messages on stderr
            if (!msg.includes('INFO') && !msg.includes('FastMCP') && !msg.includes('Update available')) {
                console.error(`[MCP STDERR] ${msg}`);
            }
            fs.appendFileSync(path.join(__dirname, 'server.log'), `[MCP STDERR] ${msg}\n`);
        });

        this.process.stdout.on('data', (chunk) => this.handleData(chunk));

        this.process.on('close', (code) => {
            console.log(`[MCP] Process exited with code ${code}`);
            this.process = null;
            this.isInitialized = false;
        });

        // Initialize Handshake
        this.initPromise = new Promise((resolve, reject) => {
            const id = this.requestId++;
            // Register pending request first
            this.pendingRequests.set(id, { resolve, reject, type: 'initialize' });

            // Send initialize AFTER a small delay to let process boot
            setTimeout(() => {
                this.send({
                    jsonrpc: "2.0",
                    id: id,
                    method: "initialize",
                    params: {
                        protocolVersion: "2024-11-05",
                        capabilities: {},
                        clientInfo: { name: "foresvi-bridge", version: "1.0" }
                    }
                });
            }, 1000); // 1s boot time
        }).then(() => {
            console.log("[MCP] Handshake complete. Sending initialized notification.");
            this.send({
                jsonrpc: "2.0",
                method: "notifications/initialized"
            });
            this.isInitialized = true;
        });

        return this.initPromise;
    }

    handleData(chunk) {
        this.buffer += chunk.toString();

        let eolIndex;
        while ((eolIndex = this.buffer.indexOf('\n')) >= 0) {
            const line = this.buffer.slice(0, eolIndex).trim();
            this.buffer = this.buffer.slice(eolIndex + 1);

            if (!line) continue;

            try {
                const msg = JSON.parse(line);
                // Matched Request?
                if (msg.id !== undefined && this.pendingRequests.has(msg.id)) {
                    const { resolve, reject, type } = this.pendingRequests.get(msg.id);
                    this.pendingRequests.delete(msg.id);

                    if (msg.error) {
                        reject(new Error(`MCP Error: ${JSON.stringify(msg.error)}`));
                    } else {
                        resolve(msg.result);
                    }
                }
            } catch (e) {
                console.error(`[MCP] JSON Parse Error: ${e.message} in line: ${line.substring(0, 50)}...`);
            }
        }
    }

    send(msg) {
        if (!this.process) throw new Error("MCP Process not running");
        this.process.stdin.write(JSON.stringify(msg) + "\n");
    }

    async callTool(name, args) {
        if (!this.isInitialized) await this.start();

        const id = this.requestId++;
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.send({
                jsonrpc: "2.0",
                id: id,
                method: "tools/call",
                params: {
                    name: name,
                    arguments: args
                }
            });
        });
    }

    async listTools() {
        if (!this.isInitialized) await this.start();

        const id = this.requestId++;
        return new Promise((resolve, reject) => {
            this.pendingRequests.set(id, { resolve, reject });
            this.send({
                jsonrpc: "2.0",
                id: id,
                method: "tools/list",
                params: {}
            });
        });
    }
}

const mcpClient = new MCPClient(MCP_PATH);

// Start immediately to be ready
(async () => {
    try {
        await mcpClient.start();
        console.log("✅ MCP Client Ready");
        // Check NotebookLM auth on startup
        const authOk = await checkNLMAuth();
        if (!authOk) {
            console.error("═══════════════════════════════════════════════════════");
            console.error("⚠️  NOTEBOOKLM AUTH EXPIRADA — el sistema no podrá");
            console.error("    crear cuadernos. Ejecuta en terminal:");
            console.error(`    ${NLM_CLI} login`);
            console.error("═══════════════════════════════════════════════════════");
        }
    } catch (e) {
        console.error("⚠️ MCP Init Failed:", e.message);
    }
})();

const runMCPTool = async (toolName, args, timeoutMs = 180000) => {
    console.log(`[MCP CALL] ${toolName} with args: ${JSON.stringify(args).substring(0, 100)}...`);

    const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error(`MCP Timeout: ${toolName} took too long (> ${timeoutMs}ms)`)), timeoutMs)
    );

    try {
        return await Promise.race([
            mcpClient.callTool(toolName, args),
            timeoutPromise
        ]);
    } catch (e) {
        console.error(`[MCP CALL FAILED] ${toolName}: ${e.message}`);
        // If broken pipe, restart?
        if (e.message.includes('not running') || e.message.includes('EPIPE')) {
            console.log("Restarting MCP...");
            await mcpClient.start();
            return await Promise.race([
                mcpClient.callTool(toolName, args),
                timeoutPromise
            ]);
        }
        throw e;
    }
};

// --- ENDPOINTS ---

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', server: 'Foresvi Bridge v1' });
});

// REFRESH MCP AUTH
app.post('/api/refresh-auth', async (req, res) => {
    console.log('[Refresh Auth] Calling NotebookLM MCP refresh_auth...');
    try {
        const result = await runMCPTool('refresh_auth', {});
        const resultText = result.content ? result.content[0].text : JSON.stringify(result);
        console.log('[Refresh Auth] Result:', resultText);
        res.json({ success: true, result: resultText });
    } catch (e) {
        console.error('[Refresh Auth] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// NLM AUTH STATUS
app.get('/api/nlm-status', async (req, res) => {
    const ok = await checkNLMAuth();
    res.json({
        connected: ok,
        message: ok
            ? '✅ NotebookLM conectado'
            : '❌ Sesión expirada — ejecuta: nlm login'
    });
});

// NLM RE-LOGIN (opens Terminal with nlm login command)
app.post('/api/nlm-relogin', (req, res) => {
    console.log('[NLM Relogin] Abriendo terminal para re-autenticación...');
    const { exec } = require('child_process');
    const cmd = `osascript -e 'tell application "Terminal" to do script "${NLM_CLI} login"'`;
    exec(cmd, (err) => {
        if (err) {
            console.error('[NLM Relogin] Error al abrir terminal:', err.message);
            return res.status(500).json({ error: err.message });
        }
        nlmAuthValid = null; // reset until next check
        res.json({ success: true, message: 'Terminal abierta. Acepta el permiso en el navegador y luego haz clic en "Verificar conexión".' });
    });
});

// LIST MCP TOOLS
app.get('/api/mcp-tools', async (req, res) => {
    console.log('[MCP Tools] Listing available tools...');
    try {
        const tools = await mcpClient.listTools();
        console.log('[MCP Tools] Result:', JSON.stringify(tools).substring(0, 200) + '...');
        res.json({ success: true, tools });
    } catch (e) {
        console.error('[MCP Tools] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// GENERIC MCP TOOL CALL (for debugging)
app.post('/api/mcp-tool', async (req, res) => {
    const { tool, args } = req.body;
    console.log(`[MCP Tool] Calling ${tool} with args:`, args);
    try {
        const result = await runMCPTool(tool, args || {});
        const resultText = result.content ? result.content[0].text : JSON.stringify(result);
        console.log(`[MCP Tool] Result:`, resultText.substring(0, 200));
        res.json({ success: true, result: resultText });
    } catch (e) {
        console.error(`[MCP Tool] Error:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

// JOB STATUS
app.get('/api/jobs/:id', (req, res) => {
    const job = jobs[req.params.id];
    if (!job) {
        console.log(`[Job Query] ID ${req.params.id} NOT FOUND`);
        return res.status(404).json({ error: 'Job not found' });
    }
    console.log(`[Job Query] ID ${req.params.id} -> Status: ${job.status}, Progress: ${job.progress}%`);
    res.json(job);
});

// SYNC AUDIO STATUS (Manual Check)
app.get('/api/sync-audio/:notebookId', async (req, res) => {
    const { notebookId } = req.params;
    console.log(`[Sync Audio] Checking status for Notebook ID: ${notebookId}`);

    try {
        const statusRes = await runMCPTool('studio_status', { notebook_id: notebookId });
        const statusText = statusRes.content ? statusRes.content[0].text : "";
        console.log(`[Sync Audio] Status raw: ${statusText.substring(0, 100)}...`);

        let audioUrl = null;
        let statusData = null;
        try { statusData = JSON.parse(statusText); } catch (e) { }

        console.log("[Sync Audio] FULL DATA:", JSON.stringify(statusData, null, 2));

        let artifactId = null;
        if (statusData && statusData.artifacts) {
            // New Logic: Iterate through artifacts
            const audioArtifact = statusData.artifacts.find(a => a.type === 'audio' || a.type === 'audio_overview');
            if (audioArtifact && audioArtifact.status === 'completed') {
                audioUrl = audioArtifact.audio_url || audioArtifact.url;
                artifactId = audioArtifact.artifact_id;
            }
        } else if (statusData) {
            // Fallback for older structure
            const audioState = statusData.audio_overview || statusData.audio;
            if (audioState && (audioState.status === 'completed' || audioState.state === 'completed')) {
                audioUrl = audioState.url;
                artifactId = audioState.artifact_id || audioState.id;
            }
        } else if (statusText.includes("completed") && !statusText.includes("in_progress")) {
            // Basic text match fallback if structure varies
            // We validly can't get the URL easily if it's not in JSON, but usually studio_status returns JSON for completed items or a link.
            // If we can't extract it, we might just return "completed" status.
        }

        console.log("[Sync Audio] Sending response. URL found:", !!audioUrl, "Artifact ID:", artifactId);
        res.json({
            status: 'success',
            audioUrl: audioUrl,
            artifactId: artifactId
        });

    } catch (error) {
        console.error(`[Sync Audio] Error: ${error.message}`);
        res.status(500).json({ error: error.message });
    }
});

// DOWNLOAD & UPLOAD AUDIO - Complete solution
app.get('/api/ping', (req, res) => res.json({ message: 'pong' }));

app.post('/api/download-upload-audio/:bookId', async (req, res) => {
    const { bookId } = req.params;
    const { notebookId } = req.body;

    console.log(`[Download Audio] Starting for Book ID: ${bookId}, Notebook: ${notebookId}`);

    try {
        // Step 1: Get artifact info from NotebookLM
        const statusRes = await runMCPTool('studio_status', { notebook_id: notebookId });
        const statusText = statusRes.content ? statusRes.content[0].text : "";
        let statusData = null;
        try { statusData = JSON.parse(statusText); } catch (e) { }

        if (!statusData || !statusData.artifacts) {
            return res.status(404).json({ error: 'No artifacts found' });
        }

        const audioArtifact = statusData.artifacts.find(a => a.type === 'audio' || a.type === 'audio_overview');
        if (!audioArtifact || audioArtifact.status !== 'completed') {
            return res.status(404).json({ error: 'Audio not ready' });
        }

        const audioUrl = audioArtifact.audio_url || audioArtifact.url;
        const artifactId = audioArtifact.artifact_id;
        if (!audioUrl) {
            return res.status(404).json({ error: 'No audio URL found' });
        }

        console.log(`[Download Audio] Requesting authenticated download via MCP download_artifact...`);

        // Use MCP download_artifact tool which downloads to a local file
        const tmpDir = path.join(__dirname, 'tmp_downloads');
        if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
        const tmpFilePath = path.join(tmpDir, `${bookId}_${Date.now()}.audio`);

        const downloadResult = await runMCPTool('download_artifact', {
            notebook_id: notebookId,
            artifact_type: 'audio',
            output_path: tmpFilePath,
            artifact_id: artifactId || undefined
        }, 900000); // 15 mins timeout
        const downloadText = downloadResult.content ? downloadResult.content[0].text : JSON.stringify(downloadResult);
        let downloadData = null;
        try { downloadData = JSON.parse(downloadText); } catch (e) { downloadData = { raw: downloadText }; }

        console.log(`[Download Audio] MCP download_artifact result:`, downloadText.substring(0, 300));

        // Check if file was downloaded
        if (!fs.existsSync(tmpFilePath)) {
            console.error(`[Download Audio] File not found at ${tmpFilePath}`);
            return res.status(502).json({
                error: 'Audio Download Failed',
                details: 'download_artifact did not create the expected file',
                mcpResult: downloadText.substring(0, 500)
            });
        }

        // Read the downloaded file
        const audioBuffer = fs.readFileSync(tmpFilePath);
        const contentType = downloadData?.content_type || downloadData?.mime_type || 'audio/mp4';

        console.log(`[Download Audio] Success! Size: ${audioBuffer.length} bytes, Type: ${contentType}`);

        // Clean up temp file
        try { fs.unlinkSync(tmpFilePath); } catch (e) { /* ignore cleanup errors */ }

        // Detect format for valid audio
        let extension = 'm4a';
        if (contentType.includes('mpeg') || contentType.includes('mp3')) {
            extension = 'mp3';
        } else if (contentType.includes('wav')) {
            extension = 'wav';
        }

        console.log(`[Upload] Detected Valid Audio Type: ${contentType} -> Ext: .${extension}`);

        const fileName = `audio/${bookId}_${Date.now()}.${extension}`;
        console.log(`[Upload] File Path: '${fileName}'`);

        const bucket = admin.storage().bucket(bucketName);
        const file = bucket.file(fileName);

        // Check if bucket exists explicitly before stream (Pre-flight check)
        try {
            const [exists] = await bucket.exists();
            if (!exists) {
                const msg = `[Upload] CRITICAL: Bucket '${bucketName}' DOES NOT EXIST according to admin SDK.`;
                console.error(msg);
                throw new Error(msg);
            }
        } catch (e) {
            console.error(`[Upload] Error checking bucket existence: ${e.message}`);
            // Proceed anyway in case it's just a permission error on 'exists' but 'write' is allowed
        }

        let publicUrl = null;
        let transcription = null;
        const uploadToken = require('crypto').randomUUID(); // Generate persistent token

        await new Promise((resolve, reject) => {
            const writeStream = file.createWriteStream({
                metadata: {
                    contentType: contentType, // Use recognized content-type
                    metadata: {
                        bookId: bookId,
                        notebookId: notebookId,
                        artifactId: artifactId,
                        firebaseStorageDownloadTokens: uploadToken // CRITICAL: Embed token
                    }
                }
            });

            writeStream.on('error', (err) => {
                console.error(`[Upload] STREAM ERROR: ${err.message}`, err);
                reject(err);
            });

            writeStream.on('finish', async () => {
                console.log('[Upload] Stream finished.');
                try {
                    // CONSTRUCT OFFICIAL FIREBASE URL (Permanent, No Expiration, CORS Friendly)
                    const encodedPath = encodeURIComponent(fileName);
                    publicUrl = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodedPath}?alt=media&token=${uploadToken}`;

                    console.log(`[Upload] SUCCESS. Firebase URL generated: ${publicUrl}`);
                    resolve();
                } catch (publicErr) {
                    console.error('[Upload] Error generating URL:', publicErr);
                    // Fallback to older method just in case
                    publicUrl = `https://storage.googleapis.com/${bucketName}/${fileName}`;
                    resolve();
                }
            });

            // Write buffer and close stream
            writeStream.end(audioBuffer);
        });

        console.log(`[Download Audio] Uploaded to Firebase: ${publicUrl}`);

        // Step 4: Try to get transcription from NotebookLM
        try {
            // Check if there's a transcript available in the artifact
            if (audioArtifact.transcript || audioArtifact.transcription) {
                transcription = audioArtifact.transcript || audioArtifact.transcription;
            }
        } catch (e) {
            console.log(`[Download Audio] No transcription available:`, e.message);
        }

        // Step 5: Update the database
        const db = admin.firestore();
        await db.collection('books').doc(bookId).update({
            audioUrl: publicUrl,
            audioUrlOriginal: audioUrl,
            artifactId: artifactId,
            notebookId: notebookId,
            transcription: transcription,
            audioProcessedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[Download Audio] Complete! Saved to database.`);

        res.json({
            success: true,
            audioUrl: publicUrl,
            artifactId: artifactId,
            transcription: transcription
        });

    } catch (error) {
        console.error('[Download Audio] CRITICAL FAILURE:', error);
        res.status(500).json({ error: error.message, stack: error.stack });
    }
});

// === JOBS MANAGEMENT ENDPOINTS ===

// GET /api/jobs - List all running/completed jobs (for debugging/dashboard)
app.get('/api/jobs', (req, res) => {
    // Return summary of jobs
    const jobList = Object.entries(jobs).map(([id, job]) => ({
        id,
        status: job.status,
        bookId: job.bookId,
        createdAt: job.createdAt
    }));
    res.json(jobList);
});

// GET /api/jobs/:jobId - Poll specific job status
app.get('/api/jobs/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const job = jobs[jobId];

    if (!job) {
        // Explicit 404 for frontend to handle
        return res.status(404).json({ error: 'Job not found', status: 'not_found' });
    }

    res.json(job);
});

// DOWNLOAD AUDIO PROXY - Downloads audio from NotebookLM and serves it
app.get('/api/audio-proxy/:notebookId', async (req, res) => {
    const { notebookId } = req.params;
    console.log(`[Audio Proxy] Request for Notebook ID: ${notebookId}`);

    try {
        // First, get the artifact info to find the audio URL
        const statusRes = await runMCPTool('studio_status', { notebook_id: notebookId });
        const statusText = statusRes.content ? statusRes.content[0].text : "";
        console.log(`[Download Audio] Status Length: ${statusText.length}`);

        let statusData = null;
        try {
            // Try to clean potentially malformed JSON
            const jsonStart = statusText.indexOf('{');
            const jsonEnd = statusText.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1) {
                const cleanJson = statusText.substring(jsonStart, jsonEnd + 1);
                statusData = JSON.parse(cleanJson);
            } else {
                statusData = JSON.parse(statusText);
            }
        } catch (e) {
            console.error('[Download Audio] JSON Parse Error:', e.message);
        }

        if (!statusData || !statusData.artifacts) {
            return res.status(404).json({ error: 'No artifacts found' });
        }

        const audioArtifact = statusData.artifacts.find(a => a.type === 'audio' || a.type === 'audio_overview');
        if (!audioArtifact || audioArtifact.status !== 'completed') {
            return res.status(404).json({ error: 'Audio not ready' });
        }

        const audioUrl = audioArtifact.audio_url || audioArtifact.url;
        if (!audioUrl) {
            return res.status(404).json({ error: 'No audio URL found' });
        }

        console.log(`[Audio Proxy] Found audio URL, attempting download...`);

        // Google's URLs require following redirects and proper headers
        // We'll use a simple fetch-like approach with redirect following
        const https = require('https');
        const http = require('http');

        const downloadWithRedirects = (url, maxRedirects = 5) => {
            return new Promise((resolve, reject) => {
                const urlObj = new URL(url);
                const protocol = urlObj.protocol === 'https:' ? https : http;

                const options = {
                    hostname: urlObj.hostname,
                    path: urlObj.pathname + urlObj.search,
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                    }
                };

                protocol.get(options, (response) => {
                    // Handle redirects
                    if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307 || response.statusCode === 308) {
                        if (maxRedirects === 0) {
                            return reject(new Error('Too many redirects'));
                        }
                        const redirectUrl = response.headers.location;
                        console.log(`[Audio Proxy] Following redirect to: ${redirectUrl.substring(0, 50)}...`);
                        return downloadWithRedirects(redirectUrl, maxRedirects - 1).then(resolve).catch(reject);
                    }

                    if (response.statusCode !== 200) {
                        return reject(new Error(`HTTP ${response.statusCode}`));
                    }

                    resolve(response);
                }).on('error', reject);
            });
        };

        const audioStream = await downloadWithRedirects(audioUrl);

        // Set appropriate headers
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader('Accept-Ranges', 'bytes');
        res.setHeader('Access-Control-Allow-Origin', '*');

        // Stream the audio to the client
        audioStream.pipe(res);

    } catch (error) {
        console.error(`[Audio Proxy] Error:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

// GENERATE NOTEBOOK & ASSETS
app.post('/api/generate', async (req, res) => {
    const { title, description, options } = req.body;
    console.log(`[API START] New Request: ${title}, Options:`, options);

    const jobId = Date.now().toString();

    // Create Job
    jobs[jobId] = {
        id: jobId,
        status: 'starting',
        progress: 0,
        logs: [],
        result: null
    };

    res.json({ jobId, message: 'Generation started' });

    // --- ASYNC PROCESSING ---
    (async () => {
        const log = (msg) => {
            console.log(`[Job ${jobId}] ${msg}`);
            jobs[jobId].logs.push({ time: new Date(), msg });
        };

        const updateState = (status, code, progress) => {
            jobs[jobId].status = status;
            jobs[jobId].stepCode = code; // internal code for UI text mapping if needed
            jobs[jobId].progress = progress;
            log(`State Update: ${status} (${progress}%)`);
        };

        try {
            // 0. Generate Cover Image (Infographic)
            // We do this concurrently or first so we have a nice visual early
            let coverImageUrl = null;
            if (req.body.apiKey) {
                updateState('generating_image', 'image', 5);
                log("Generando infografía de portada...");
                try {
                    const imagePrompt = `A professional, minimalistic 3D isometric infographic icon representing: "${title}". Corporate tech style, clean background, high quality.`;
                    const imgRes = await fetch('https://api.openai.com/v1/images/generations', {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                            'Authorization': `Bearer ${req.body.apiKey}`
                        },
                        body: JSON.stringify({
                            model: "dall-e-3",
                            prompt: imagePrompt,
                            n: 1,
                            size: "1024x1024"
                        })
                    });

                    if (imgRes.ok) {
                        const imgData = await imgRes.json();
                        coverImageUrl = imgData.data[0].url;
                        jobs[jobId].thumbnail = coverImageUrl; // Save to job
                        log("Cover image created successfully.");
                    } else {
                        const err = await imgRes.text();
                        log("Image gen failed: " + err);
                    }
                } catch (e) {
                    log("Image gen error: " + e.message);
                }
            }

            // 1. Create Notebook
            updateState('creating_notebook', 'notebook', 20);
            log(`Creating notebook: ${title}...`);

            let notebookId;
            try {
                const createRes = await runMCPTool('notebook_create', { title: title || "Foresvi Notebook" });
                const text = createRes.content[0].text;
                let data;
                try { data = JSON.parse(text); } catch (e) { data = text; }

                log(`Create msg raw: ${text}`);

                // Extract ID (Robust)
                notebookId = data.id || data.notebook_id;
                if (!notebookId && typeof data === 'string') {
                    const match = data.match(/(?:notebook_id|id)["']?\s*[:=]\s*["']?([a-zA-Z0-9-_]+)/i);
                    if (match) notebookId = match[1];
                }

                if (!notebookId) {
                    log("⚠️ ID missing in output. Fetching list fallback...");
                    const listRes = await runMCPTool('notebook_list', {});
                    // Assuming listRes returns a list where the first one is the newest
                    const listText = listRes.content[0].text;
                    const listData = JSON.parse(listText);
                    const list = Array.isArray(listData) ? listData : (listData.notebooks || []);
                    if (list.length > 0) {
                        // We assume the new one is first or last? NotebookLM lists usually are chronological or recent 
                        // Let's grab the first one matching our title if possible, or just the first one
                        const matchTitle = list.find(n => n.title === title);
                        notebookId = matchTitle ? matchTitle.id : list[0].id;
                        log(`Fallback ID found: ${notebookId} (${matchTitle ? 'Title Match' : 'Recent'})`);
                    }
                }

                if (!notebookId) throw new Error("Could not acquire Notebook ID. Create output: " + text.substring(0, 100));

                jobs[jobId].notebookId = notebookId;
                updateState('notebook_ready', 'notebook', 40);
                log(`Notebook ID: ${notebookId}`);

            } catch (err) {
                throw err;
            }

            // 2. Add Sources
            updateState('adding_sources', 'sources', 50);

            // Description (Context)
            if (description) {
                log("Adding style guide...");
                await runMCPTool('source_add', {
                    notebook_id: notebookId,
                    source_type: 'text',
                    title: "GUÍA DE ESTILO Y CONTEXTO",
                    text: `CONTEXTO:\n${description}\n\nREGLAS:\n- Priorizar datos técnicos.\n- Tono experto.`
                });
            }

            // URLs
            if (req.body.sources && Array.isArray(req.body.sources) && req.body.sources.length > 0) {
                log(`Adding ${req.body.sources.length} sources...`);
                let addedCount = 0;
                const total = req.body.sources.length;
                for (let i = 0; i < total; i++) {
                    const url = req.body.sources[i];
                    try {
                        log(`Adding URL (${i + 1}/${total}): ${url}`);
                        await runMCPTool('source_add', { notebook_id: notebookId, source_type: 'url', url });
                        addedCount++;
                        // Update progress within this step
                        jobs[jobId].progress = 50 + Math.floor((i / total) * 30); // 50 -> 80
                    } catch (e) {
                        log(`Failed to add URL ${url}: ${e.message}`);
                    }
                }
                jobs[jobId].sourcesAdded = addedCount;
            }

            // 3. Generate Audio
            if (options && (options.audioShort || options.audioLong || true)) { // Keep debug true for now
                updateState('generating_audio', 'audio', 80);
                log("Generating Audio Overview...");
                try {
                    // Pass confirm: true to skip the confirmation step
                    const audioRes = await runMCPTool('studio_create', {
                        notebook_id: notebookId,
                        artifact_type: 'audio',
                        confirm: true
                    });

                    // Check if it's still asking for confirmation (just in case)
                    const audioText = audioRes.content ? audioRes.content[0].text : JSON.stringify(audioRes);
                    log("Audio generation response: " + audioText);

                    // Polling logic
                    if (audioText.includes("studio_status") || audioText.includes("in_progress")) {
                        log("⏳ Audio generation is running... Waiting for completion (this may take a few minutes)...");

                        let isAudioDone = false;
                        let pollAttempts = 0;
                        const maxPolls = 120; // 10 minutes (assuming 5s interval)

                        while (!isAudioDone && pollAttempts < maxPolls) {
                            await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds
                            pollAttempts++;

                            try {
                                const statusRes = await runMCPTool('studio_status', { notebook_id: notebookId });
                                const statusText = statusRes.content ? statusRes.content[0].text : "";

                                // Log snippet to keep user informed (truncate to avoid spam)
                                const shortStatus = statusText.length > 200 ? statusText.substring(0, 200) + "..." : statusText;
                                // log(`Poll #${pollAttempts}: Checking status...`); // Optional: reduce spam

                                // Parse explicitly
                                let statusData = null;
                                try { statusData = JSON.parse(statusText); } catch (e) { }

                                if (statusData) {
                                    // Check for audio overview status
                                    // Structure might be: { audio_overview: { status: 'completed' }, ... } or just a list
                                    // Based on typical NotebookLM structure, we look for 'audio' or 'audio_overview' key.
                                    const audioState = statusData.audio_overview || statusData.audio;
                                    if (audioState && (audioState.status === 'completed' || audioState.state === 'completed')) {
                                        isAudioDone = true;
                                        log(`✅ Audio generation COMPLETED! (ID: ${audioState.id || 'N/A'})`);
                                        // Update job result
                                        jobs[jobId].audioUrl = audioState.url || "View in NotebookLM";
                                    } else if (audioState && (audioState.status === 'failed' || audioState.state === 'failed')) {
                                        isAudioDone = true; // Stop polling
                                        log("❌ Audio generation FAILED.");
                                    } else {
                                        // Still running
                                        if (pollAttempts % 4 === 0) log(`...still generating audio... (${pollAttempts * 5}s elapsed)`);
                                    }
                                } else if (statusText.includes("completed") && !statusText.includes("in_progress")) {
                                    // Fallback text check
                                    isAudioDone = true;
                                    log("✅ Audio generation indicated as COMPLETED (text match).");
                                }

                            } catch (pollErr) {
                                log(`⚠️ Polling warning: ${pollErr.message}`);
                            }
                        }

                        if (!isAudioDone) {
                            log("⚠️ Audio generation timed out or is still running in background.");
                        }
                    }

                } catch (e) {
                    log(`Audio gen warning: ${e.message}`);
                }
            }

            // 4. Wrap up
            updateState('completed', 'done', 100);
            log("All tasks completed successfully.");

        } catch (error) {
            log(`ERROR: ${error.message}`);
            jobs[jobId].status = 'failed';
            jobs[jobId].error = error.message;
        }
    })();
});

// --- ORCHESTRATION v2 (Robust CLI FFMPEG) ---

// Ensure exports directory
const publicExportsDir = path.join(__dirname, 'public', 'exports');
if (!fs.existsSync(publicExportsDir)) {
    fs.mkdirSync(publicExportsDir, { recursive: true });
    console.log(`[Init] Created directory: ${publicExportsDir}`);
}

// Serve static exports via Express directly (fallback if Vite doesn't catch new files)
app.use('/exports', express.static(publicExportsDir));


const PROMPTS = {
    audio: (c, t) => `Genera un AUDIO con las siguientes características:
Formato: ${c.audio.formato}
Idioma: ${c.audio.idioma}
Duración: ${c.audio.duracion}

Instrucciones para los presentadores de IA:
${c.audio.foco}

Inicio obligatorio del audio:
"BIENVENIDA a la conversación sobre ${t}"

Este audio debe permitir interacción posterior y la conversación debe limitarse exclusivamente a este episodio.`,

    video: (c) => `Genera un VÍDEO con las siguientes características:
Formato: ${c.video.formato}
Idioma: ${c.video.idioma}

Estilo visual:
Usa un estilo profesional con la siguiente identidad visual:
- Azul Foresvi #003349
- Rojo Foresvi #E25454
- Blanco #FFFFFF
- Gris medio #717B8D
Tipografías:
- Glancyr para titulares y destacados
- Inter para textos generales

Instrucciones para los presentadores de IA:
${c.video.foco}`,

    infografia: (c) => `Genera una INFOGRAFÍA con las siguientes características:
Idioma: ${c.infografia.idioma}
Orientación: ${c.infografia.orientacion}
Nivel de detalle: ${c.infografia.nivel_detalle}

Descripción:
${c.infografia.descripcion}`
};


// ============================================================================
// ENDPOINT: Check NotebookLM Artifacts Status (Non-blocking)
// ============================================================================
const checkArtifactsCache = {}; // { notebookId: { data, timestamp } }
const CHECK_ARTIFACTS_CACHE_TTL = 20000; // 20 seconds

app.get('/api/check-artifacts/:notebookId', async (req, res) => {
    const { notebookId } = req.params;

    // Return cached response if fresh enough
    const cached = checkArtifactsCache[notebookId];
    if (cached && (Date.now() - cached.timestamp) < CHECK_ARTIFACTS_CACHE_TTL) {
        return res.json(cached.data);
    }

    try {
        console.log(`[Check Artifacts] Checking status for notebook: ${notebookId}`);

        // Call studio_status to get current state
        let statusData = null;
        try {
            const statusRes = await runMCPTool('studio_status', { notebook_id: notebookId });
            if (statusRes.content && statusRes.content[0] && statusRes.content[0].text) {
                try {
                    statusData = JSON.parse(statusRes.content[0].text);
                } catch (parseErr) {
                    console.error('[Check Artifacts] Failed to parse MCP response:', parseErr);
                    statusData = { status: 'error', error: 'Invalid JSON from MCP' };
                }
            } else {
                console.warn('[Check Artifacts] Empty response from MCP');
                statusData = { status: 'error', error: 'Empty response from MCP' };
            }
        } catch (mcpErr) {
            console.error('[Check Artifacts] MCP Tool Call Failed:', mcpErr.message);
            statusData = { status: 'error', error: mcpErr.message };
        }

        // Short summary log instead of full dump
        const artifactCount = statusData?.artifacts?.length || 0;
        console.log(`[Check Artifacts] Response for ${notebookId}: status=${statusData?.status}, artifacts=${artifactCount}`);

        if (!statusData || statusData.status !== 'success') {
            console.warn('[Check Artifacts] Studio status not success:', statusData);
            // Return a safe "empty" state instead of 500 to keep polling alive if transient
            return res.json({
                notebookId,
                status: 'error',
                error: statusData?.error || 'Unknown error',
                summary: { total: 0, completed: 0, in_progress: 0, failed: 0 },
                allComplete: false // Keep polling
            });
        }

        // Parse artifacts from response
        const artifacts = statusData.artifacts || [];
        const summary = statusData.summary || {};

        console.log(`[Check Artifacts] Found ${artifacts.length} artifact(s):`, artifacts.map(a => `${a.type}:${a.status}`).join(', '));

        // Find different artifact types
        const audioArtifact = artifacts.find(a => a.type === 'audio' || a.type === 'audio_overview');
        const infographicArtifact = artifacts.find(a => a.type === 'infographic');
        const videoArtifact = artifacts.find(a => a.type === 'video' || a.type === 'video_overview');
        const reportArtifact = artifacts.find(a => (a.title && a.title.includes('INFORME')) || a.type === 'report');

        // Helper function to normalize status
        const normalizeStatus = (artifact) => {
            if (!artifact) return null;

            const status = artifact.status?.toLowerCase() || 'unknown';

            // Map intermediate states
            if (['queued', 'pending', 'waiting'].includes(status)) {
                return 'queued';
            }
            if (['generating', 'processing', 'in_progress', 'running'].includes(status)) {
                return 'in_progress';
            }
            if (['completed', 'done', 'ready', 'success'].includes(status)) {
                return 'completed';
            }
            if (['failed', 'error', 'failure'].includes(status)) {
                return 'failed';
            }
            if (['unknown', 'unavailable'].includes(status)) {
                // "unknown" usually means completed but without full metadata
                return artifact.audio_url || artifact.video_url || artifact.infographic_url ? 'completed' : 'unknown';
            }

            return status; // Return as-is if not recognized
        };

        // Build response with normalized statuses
        const response = {
            notebookId,
            notebookUrl: statusData.notebook_url,
            summary: {
                total: summary.total || 0,
                completed: summary.completed || 0,
                in_progress: summary.in_progress || 0,
                failed: summary.failed || 0
            },
            audio: audioArtifact ? {
                status: normalizeStatus(audioArtifact),
                rawStatus: audioArtifact.status,
                url: audioArtifact.audio_url,
                duration: audioArtifact.duration_seconds,
                created_at: audioArtifact.created_at,
                artifact_id: audioArtifact.artifact_id
            } : null,
            infographic: infographicArtifact ? {
                status: normalizeStatus(infographicArtifact),
                rawStatus: infographicArtifact.status,
                url: infographicArtifact.infographic_url,
                created_at: infographicArtifact.created_at,
                artifact_id: infographicArtifact.artifact_id
            } : null,
            video: videoArtifact ? {
                status: normalizeStatus(videoArtifact),
                rawStatus: videoArtifact.status,
                url: videoArtifact.video_url,
                created_at: videoArtifact.created_at,
                artifact_id: videoArtifact.artifact_id
            } : null,
            report: reportArtifact ? {
                status: 'completed',
                title: reportArtifact.title,
                url: `https://notebooklm.google.com/notebook/${notebookId}`
            } : null,
            allComplete: summary.completed === summary.total && summary.total > 0 && summary.in_progress === 0
        };

        console.log(`[Check Artifacts] Status Summary:`);
        console.log(`  Audio: ${response.audio?.status || 'N/A'} (raw: ${response.audio?.rawStatus || 'N/A'})`);
        console.log(`  Infographic: ${response.infographic?.status || 'N/A'} (raw: ${response.infographic?.rawStatus || 'N/A'})`);
        console.log(`  Video: ${response.video?.status || 'N/A'} (raw: ${response.video?.rawStatus || 'N/A'})`);
        console.log(`  All Complete: ${response.allComplete}`);

        // Cache the response
        checkArtifactsCache[notebookId] = { data: response, timestamp: Date.now() };
        res.json(response);

    } catch (e) {
        console.error('[Check Artifacts] Error:', e.message);
        // Return 200 with error info instead of 500 to prevent frontend from counting this as a hard failure
        res.json({
            notebookId,
            status: 'error',
            error: e.message,
            summary: { total: 0, completed: 0, in_progress: 0, failed: 0 },
            allComplete: false
        });
    }
});

// ============================================================================
// ENDPOINT: Process Artifacts - Download to Local Google Drive
// ============================================================================
const DRIVE_BASE_PATH = "/Users/maccuatro/Library/CloudStorage/GoogleDrive-actionbdmgalicia@gmail.com/Mi unidad/0_FORESVI/FORESVI LIBROS";

// Helper: sanitize folder name (remove invalid chars for filesystem)
const sanitizeFolderName = (name) => {
    return name
        .replace(/[<>:"/\\|?*]/g, '') // Remove invalid chars
        .replace(/\s+/g, ' ')         // Collapse whitespace
        .trim()
        .substring(0, 100);           // Max length
};

app.post('/api/process-artifacts/:bookId', async (req, res) => {
    const { bookId } = req.params;
    const { notebookId, title, description } = req.body;

    console.log(`[Process Artifacts] Starting for Book: "${title}" (${bookId}), Notebook: ${notebookId}`);

    if (!notebookId) {
        return res.status(400).json({ error: 'notebookId is required' });
    }

    try {
        // 1. Get artifact status from NotebookLM
        const statusRes = await runMCPTool('studio_status', { notebook_id: notebookId });
        const statusText = statusRes.content ? statusRes.content[0].text : "";
        let statusData = null;
        try { statusData = JSON.parse(statusText); } catch (e) { }

        if (!statusData || !statusData.artifacts || statusData.artifacts.length === 0) {
            return res.status(404).json({ error: 'No artifacts found for this notebook' });
        }

        const artifacts = statusData.artifacts;
        console.log(`[Process Artifacts] Found ${artifacts.length} artifact(s)`);

        // 2. Create folder for this investigation
        const folderName = sanitizeFolderName(title || `Investigacion_${bookId}`);
        const folderPath = path.join(DRIVE_BASE_PATH, folderName);

        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
            console.log(`[Process Artifacts] Created folder: ${folderPath}`);
        }

        // 3. Download each completed artifact
        const results = {};
        const artifactTypes = [
            { type: 'audio', ext: 'mp3', label: 'Audio Overview' },
            { type: 'video', ext: 'mp4', label: 'Video Overview' },
            { type: 'infographic', ext: 'png', label: 'Infografia' },
        ];

        for (const { type, ext, label } of artifactTypes) {
            const artifact = artifacts.find(a => a.type === type || a.type === `${type}_overview`);

            if (artifact && artifact.status === 'completed') {
                const fileName = `${folderName} - ${label}.${ext}`;
                const filePath = path.join(folderPath, fileName);

                console.log(`[Process Artifacts] Downloading ${type} -> ${filePath}`);

                try {
                    const downloadRes = await runMCPTool('download_artifact', {
                        notebook_id: notebookId,
                        artifact_type: type,
                        output_path: filePath,
                        artifact_id: artifact.artifact_id || null
                    }, 900000); // 15 mins timeout

                    const downloadText = downloadRes.content ? downloadRes.content[0].text : '';
                    let downloadData = null;
                    try { downloadData = JSON.parse(downloadText); } catch (e) { }

                    if (fs.existsSync(filePath)) {
                        const stats = fs.statSync(filePath);
                        results[type] = {
                            status: 'downloaded',
                            path: filePath,
                            fileName: fileName,
                            size: stats.size,
                            artifact_id: artifact.artifact_id
                        };
                        console.log(`[Process Artifacts] ✅ ${label} downloaded (${(stats.size / 1024 / 1024).toFixed(2)} MB)`);
                    } else {
                        results[type] = {
                            status: 'download_attempted',
                            mcpResult: downloadText?.substring(0, 300),
                            artifact_id: artifact.artifact_id
                        };
                        console.log(`[Process Artifacts] ⚠️ ${label} file not found at expected path. MCP: ${downloadText?.substring(0, 200)}`);
                    }
                } catch (dlErr) {
                    results[type] = { status: 'error', error: dlErr.message };
                    console.error(`[Process Artifacts] ❌ ${label} download failed: ${dlErr.message}`);
                }
            } else if (artifact) {
                results[type] = { status: artifact.status, artifact_id: artifact.artifact_id };
                console.log(`[Process Artifacts] ⏳ ${label} not ready (status: ${artifact.status})`);
            }
        }

        // 3b. Extract notes/reports as .docx files and presentations as .pptx
        try {
            console.log(`[Process Artifacts] Checking for notes/reports...`);
            const notesRes = await runMCPTool('note', { notebook_id: notebookId, action: 'list' });
            const notesText = notesRes.content ? notesRes.content[0].text : '';
            let notesData = null;
            try { notesData = JSON.parse(notesText); } catch (e) { }

            if (notesData && notesData.notes && notesData.notes.length > 0) {
                const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

                for (const note of notesData.notes) {
                    const noteTitle = note.title || 'Nota sin titulo';
                    const noteContent = note.content || '';

                    let reportText = noteContent;
                    try {
                        const parsed = JSON.parse(noteContent);
                        if (parsed.answer) reportText = parsed.answer;
                        else if (parsed.content) reportText = parsed.content;
                    } catch (e) { /* plain text */ }

                    if (reportText.length > 50) {
                        const safeTitle = sanitizeFolderName(noteTitle);
                        const isPresentation = noteTitle.toUpperCase().startsWith('PRESENTACI');

                        if (isPresentation) {
                            // ── GENERATE PPTX ──────────────────────────────────────────────
                            try {
                                const PptxGenJS = require('pptxgenjs');
                                const pres = new PptxGenJS();
                                pres.layout = 'LAYOUT_WIDE'; // 16:9

                                // FORESVI Brand Colors
                                const C_NAVY  = '003349';
                                const C_RED   = 'E25454';
                                const C_WHITE = 'FFFFFF';
                                const C_GRAY  = '717B8D';
                                const C_LIGHT = 'F0F5F7';
                                const C_DARK_TEXT = '1A2B38';

                                // Parse slides from markdown content
                                const slideBlocks = reportText.split(/(?=^## DIAPOSITIVA)/m).filter(s => s.trim());
                                const parsedSlides = slideBlocks.map(block => {
                                    const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
                                    const header = lines[0].replace(/^##\s*DIAPOSITIVA\s*\d+[:\s]+/i, '').trim();
                                    const bullets = lines.slice(1).filter(l => l).map(l => l.replace(/^[-*•]\s*/, ''));
                                    return { title: header, bullets };
                                });

                                // Fallback: if parsing failed, split into raw paragraphs
                                const slides = parsedSlides.length > 0 ? parsedSlides :
                                    reportText.split(/\n\n+/).slice(0, 10).map((p, i) => ({
                                        title: i === 0 ? noteTitle.replace(/^PRESENTACI[ÓO]N\s+/i, '') : `Punto ${i}`,
                                        bullets: p.split('\n').map(l => l.replace(/^[-*•]\s*/, '')).filter(Boolean)
                                    }));

                                for (let i = 0; i < slides.length; i++) {
                                    const s = slides[i];
                                    const slide = pres.addSlide();
                                    const isFirst = i === 0;
                                    const isLast = i === slides.length - 1;

                                    if (isFirst) {
                                        // ── PORTADA ──
                                        slide.background = { color: C_NAVY };
                                        // Línea roja decorativa
                                        slide.addShape(pres.ShapeType.rect, { x: 0, y: 4.5, w: 10, h: 0.06, fill: { color: C_RED }, line: { width: 0 } });
                                        // Bloque de color superior
                                        slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 10, h: 0.4, fill: { color: C_RED }, line: { width: 0 } });
                                        slide.addText('FORESVI', { x: 0.4, y: 0.05, w: 9.2, h: 0.3, color: C_WHITE, fontSize: 11, fontFace: 'Inter', bold: true });
                                        // Título
                                        slide.addText(s.title, {
                                            x: 0.7, y: 1.2, w: 8.6, h: 2.2,
                                            color: C_WHITE, fontSize: 38, fontFace: 'Inter', bold: true,
                                            align: 'center', valign: 'middle', wrap: true
                                        });
                                        // Subtítulo / bullets
                                        if (s.bullets.length > 0) {
                                            slide.addText(s.bullets.join('  ·  '), {
                                                x: 0.7, y: 3.5, w: 8.6, h: 0.8,
                                                color: 'AACAD8', fontSize: 16, fontFace: 'Inter', align: 'center', wrap: true
                                            });
                                        }
                                        // Fecha
                                        slide.addText(new Date().toLocaleDateString('es-ES', { year: 'numeric', month: 'long' }), {
                                            x: 0.4, y: 4.6, w: 9.2, h: 0.4, color: C_GRAY, fontSize: 11, fontFace: 'Inter', align: 'right'
                                        });
                                    } else if (isLast) {
                                        // ── CONCLUSIONES ──
                                        slide.background = { color: C_NAVY };
                                        slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 0.15, h: 5.63, fill: { color: C_RED }, line: { width: 0 } });
                                        slide.addText(s.title, {
                                            x: 0.45, y: 0.3, w: 9.2, h: 0.9,
                                            color: C_WHITE, fontSize: 28, fontFace: 'Inter', bold: true, valign: 'middle'
                                        });
                                        if (s.bullets.length > 0) {
                                            slide.addText(
                                                s.bullets.map(b => ({ text: b, options: { bullet: { type: 'bullet', color: C_RED } } })),
                                                { x: 0.55, y: 1.4, w: 9, h: 3.5, color: 'D0E8F0', fontSize: 18, fontFace: 'Inter', lineSpacingMultiple: 1.6 }
                                            );
                                        }
                                        slide.addText('FORESVI', {
                                            x: 7.5, y: 5.1, w: 2.1, h: 0.3, color: C_GRAY, fontSize: 10, fontFace: 'Inter', bold: true, align: 'right'
                                        });
                                    } else {
                                        // ── DIAPOSITIVA DE CONTENIDO ──
                                        slide.background = { color: C_WHITE };
                                        // Header bar
                                        slide.addShape(pres.ShapeType.rect, { x: 0, y: 0, w: 10, h: 1.05, fill: { color: C_NAVY }, line: { width: 0 } });
                                        slide.addText(s.title, {
                                            x: 0.35, y: 0.1, w: 8.8, h: 0.85,
                                            color: C_WHITE, fontSize: 22, fontFace: 'Inter', bold: true, valign: 'middle'
                                        });
                                        // Nº diapositiva (en rojo, alineado a la derecha del header)
                                        slide.addText(`${i + 1}`, {
                                            x: 8.7, y: 0.1, w: 0.9, h: 0.85,
                                            color: C_RED, fontSize: 22, fontFace: 'Inter', bold: true, align: 'right', valign: 'middle'
                                        });
                                        // Línea decorativa roja bajo el header
                                        slide.addShape(pres.ShapeType.rect, { x: 0, y: 1.05, w: 10, h: 0.05, fill: { color: C_RED }, line: { width: 0 } });
                                        // Bullets de contenido
                                        if (s.bullets.length > 0) {
                                            slide.addText(
                                                s.bullets.map(b => ({ text: b, options: { bullet: { type: 'bullet', color: C_NAVY } } })),
                                                { x: 0.5, y: 1.3, w: 9, h: 3.8, color: C_DARK_TEXT, fontSize: 18, fontFace: 'Inter', lineSpacingMultiple: 1.7, valign: 'top' }
                                            );
                                        }
                                        // Footer
                                        slide.addShape(pres.ShapeType.rect, { x: 0, y: 5.2, w: 10, h: 0.04, fill: { color: C_GRAY }, line: { width: 0 } });
                                        slide.addText('FORESVI', {
                                            x: 0.35, y: 5.27, w: 4, h: 0.25, color: C_GRAY, fontSize: 9, fontFace: 'Inter'
                                        });
                                    }
                                }

                                // Generate PPTX first
                                const presPptxFileName = `${safeTitle}-temp.pptx`;
                                const presPptxPath = path.join(folderPath, presPptxFileName);
                                await pres.writeFile({ fileName: presPptxPath });

                                // Convert to PDF (NotebookLM native format)
                                const presFileName = `${safeTitle}.pdf`;
                                const presPath = path.join(folderPath, presFileName);
                                const presDir = path.dirname(presPptxPath);

                                try {
                                    await new Promise((resolve, reject) => {
                                        execFile('libreoffice', ['--headless', '--convert-to', 'pdf', '--outdir', presDir, presPptxPath], { timeout: 60000 }, (err) => {
                                            if (err) reject(err);
                                            else resolve();
                                        });
                                    });

                                    // Clean up temporary PPTX
                                    fs.unlinkSync(presPptxPath);

                                    if (fs.existsSync(presPath)) {
                                        const stats = fs.statSync(presPath);
                                        results['presentation'] = {
                                            status: 'downloaded',
                                            path: presPath,
                                            fileName: presFileName,
                                            size: stats.size,
                                            note_id: note.id,
                                            title: noteTitle
                                        };
                                        console.log(`[Process Artifacts] ✅ Presentation exported as PDF: ${presFileName} (${slides.length} slides, ${(stats.size / 1024).toFixed(0)} KB)`);
                                    } else {
                                        throw new Error('PDF file not created after conversion');
                                    }
                                } catch (pdfErr) {
                                    console.warn(`[Process Artifacts] ⚠️ PDF conversion failed: ${pdfErr.message}. Keeping PPTX as fallback.`);
                                    // Fallback: use PPTX if PDF conversion fails
                                    if (fs.existsSync(presPptxPath)) {
                                        const stats = fs.statSync(presPptxPath);
                                        results['presentation'] = {
                                            status: 'downloaded',
                                            path: presPptxPath,
                                            fileName: presPptxFileName.replace('-temp', '').replace('.pptx', '.pptx'),
                                            size: stats.size,
                                            note_id: note.id,
                                            title: noteTitle
                                        };
                                        console.log(`[Process Artifacts] ℹ️ Using PPTX fallback (PDF conversion unavailable)`);
                                    }
                                }
                            } catch (pptxErr) {
                                console.error(`[Process Artifacts] ❌ PPTX generation failed: ${pptxErr.message}`);
                                results['presentation'] = { status: 'error', error: pptxErr.message };
                            }

                        } else {
                            // ── GENERATE DOCX (existing logic) ──────────────────────────
                            const reportFileName = `${safeTitle}.docx`;
                            const reportPath = path.join(folderPath, reportFileName);

                            const paragraphs = reportText.split('\n').map(line => {
                                const trimmed = line.trim();
                                if (trimmed.startsWith('### ')) {
                                    return new Paragraph({ text: trimmed.replace('### ', ''), heading: HeadingLevel.HEADING_3 });
                                } else if (trimmed.startsWith('## ')) {
                                    return new Paragraph({ text: trimmed.replace('## ', ''), heading: HeadingLevel.HEADING_2 });
                                } else if (trimmed.startsWith('# ')) {
                                    return new Paragraph({ text: trimmed.replace('# ', ''), heading: HeadingLevel.HEADING_1 });
                                } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
                                    return new Paragraph({ children: [new TextRun(trimmed.substring(2))], bullet: { level: 0 } });
                                } else if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
                                    return new Paragraph({ children: [new TextRun({ text: trimmed.replace(/\*\*/g, ''), bold: true })] });
                                } else if (trimmed === '') {
                                    return new Paragraph({ text: '' });
                                }
                                const runs = [];
                                const parts = trimmed.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/);
                                for (const part of parts) {
                                    if (part.startsWith('**') && part.endsWith('**')) {
                                        runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
                                    } else if (part.startsWith('*') && part.endsWith('*')) {
                                        runs.push(new TextRun({ text: part.slice(1, -1), italics: true }));
                                    } else if (part) {
                                        runs.push(new TextRun(part));
                                    }
                                }
                                return new Paragraph({ children: runs });
                            });

                            const doc = new Document({
                                sections: [{
                                    properties: {},
                                    children: [
                                        new Paragraph({ text: noteTitle, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
                                        new Paragraph({ children: [new TextRun({ text: `Generado por NotebookLM | Notebook: ${notebookId}`, italics: true, size: 18, color: '888888' })] }),
                                        new Paragraph({ children: [new TextRun({ text: `Fecha: ${new Date().toLocaleString('es-ES')}`, italics: true, size: 18, color: '888888' })] }),
                                        new Paragraph({ text: '' }),
                                        ...paragraphs
                                    ]
                                }]
                            });

                            const buffer = await Packer.toBuffer(doc);
                            fs.writeFileSync(reportPath, buffer);

                            results['report_' + note.id] = {
                                status: 'downloaded',
                                path: reportPath,
                                fileName: reportFileName,
                                size: buffer.length,
                                note_id: note.id,
                                title: noteTitle
                            };
                            console.log(`[Process Artifacts] ✅ Report saved as DOCX: ${reportFileName} (${reportText.length} chars)`);
                        }
                    }
                }
            } else {
                console.log(`[Process Artifacts] No notes found in notebook.`);
            }
        } catch (noteErr) {
            console.error(`[Process Artifacts] ⚠️ Error fetching notes: ${noteErr.message}`);
        }

        // 4. Update Firestore with results
        const dbRef = admin.firestore();
        const downloadedCount = Object.values(results).filter(r => r.status === 'downloaded').length;
        const totalArtifacts = Object.keys(results).length;

        await dbRef.collection('books').doc(bookId).update({
            orchestrationStatus: downloadedCount > 0 ? 'completed' : 'waiting_artifacts',
            driveFolderPath: folderPath,
            driveFolderName: folderName,
            artifactDownloads: results,
            notebookUrl: `https://notebooklm.google.com/notebook/${notebookId}`,
            driveProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
            message: downloadedCount > 0
                ? `✅ ${downloadedCount}/${totalArtifacts} artefactos descargados a Google Drive`
                : '⏳ Artefactos aún en proceso...'
        });

        console.log(`[Process Artifacts] Complete! ${downloadedCount}/${totalArtifacts} downloaded to: ${folderPath}`);

        res.json({
            success: true,
            folderPath,
            folderName,
            downloaded: downloadedCount,
            total: totalArtifacts,
            results
        });

    } catch (error) {
        console.error('[Process Artifacts] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// ENDPOINT: Import an existing NotebookLM notebook (reverse import)
// ============================================================================
app.post('/api/import-notebook', async (req, res) => {
    const { notebookId, topicId, level } = req.body;

    console.log(`[Import Notebook] Starting import for Notebook: ${notebookId}`);

    if (!notebookId) {
        return res.status(400).json({ error: 'notebookId is required' });
    }

    try {
        // 1. Get notebook info
        console.log(`[Import Notebook] Fetching notebook info...`);
        const nbInfo = await runMCPTool('notebook_get', { notebook_id: notebookId });
        console.log(`[Import Notebook] Notebook info:`, JSON.stringify(nbInfo).substring(0, 500));

        const notebookTitle = nbInfo?.notebook?.title || `Importado ${notebookId.substring(0, 8)}`;
        const sourceCount = nbInfo?.notebook?.source_count || 0;
        const sources = nbInfo?.sources || [];

        // 2. Get studio status (what artifacts exist)
        console.log(`[Import Notebook] Checking studio artifacts...`);
        const studioInfo = await runMCPTool('studio_status', { notebook_id: notebookId });
        console.log(`[Import Notebook] Studio status:`, JSON.stringify(studioInfo).substring(0, 500));

        const artifacts = studioInfo?.artifacts || [];
        const artifactSummary = studioInfo?.summary || { total: 0, completed: 0, in_progress: 0 };

        // 3. Create book ID from title
        const bookId = `import-${sanitizeFolderName(notebookTitle).toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`;

        // 4. Create drive folder and download artifacts
        const folderName = `Investigación ${sanitizeFolderName(notebookTitle)}`;
        const folderPath = path.join(DRIVE_BASE_PATH, folderName);

        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
            console.log(`[Import Notebook] Created folder: ${folderPath}`);
        }

        const artifactTypes = [
            { type: 'audio', ext: 'mp3', label: 'Audio Overview' },
            { type: 'video', ext: 'mp4', label: 'Video Overview' },
            { type: 'infographic', ext: 'png', label: 'Infografia' },
        ];

        const results = {};
        let downloadedCount = 0;
        const totalArtifacts = artifactTypes.length;

        for (const artifact of artifactTypes) {
            const fileName = `${sanitizeFolderName(notebookTitle)} - ${artifact.label}.${artifact.ext}`;
            const filePath = path.join(folderPath, fileName);

            // Check if artifact exists as completed in studio
            const existingArtifact = artifacts.find(a => a.type === artifact.type && a.status === 'completed');

            if (!existingArtifact) {
                console.log(`[Import Notebook] ⏭️ ${artifact.label} not found or not completed, skipping`);
                results[artifact.type] = { status: 'not_found', fileName };
                continue;
            }

            console.log(`[Import Notebook] Downloading ${artifact.label} -> ${filePath}`);
            try {
                const dlResult = await runMCPTool('download_artifact', {
                    notebook_id: notebookId,
                    artifact_type: artifact.type,
                    output_path: filePath
                }, 900000); // 15 mins timeout

                if (dlResult && (dlResult.status === 'success' || fs.existsSync(filePath))) {
                    const stat = fs.statSync(filePath);
                    results[artifact.type] = {
                        status: 'downloaded',
                        fileName: fileName,
                        path: filePath,
                        size: stat.size,
                        title: artifact.label
                    };
                    downloadedCount++;
                    console.log(`[Import Notebook] ✅ ${artifact.label} downloaded (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);
                } else {
                    results[artifact.type] = { status: 'failed', fileName, error: 'Download failed' };
                    console.log(`[Import Notebook] ⚠️ ${artifact.label} download failed`);
                }
            } catch (dlErr) {
                results[artifact.type] = { status: 'failed', fileName, error: dlErr.message };
                console.log(`[Import Notebook] ⚠️ ${artifact.label} error: ${dlErr.message}`);
            }
        }

        // 5. Download notes/reports as .docx
        try {
            const notesData = await runMCPTool('note', { notebook_id: notebookId, action: 'list' });
            if (notesData && notesData.notes && notesData.notes.length > 0) {
                const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = require('docx');

                for (const note of notesData.notes) {
                    const noteTitle = note.title || 'Informe';
                    const reportFileName = `${noteTitle.replace(/[^a-zA-Z0-9\u00C0-\u024F\s-]/g, '').trim()}.docx`;
                    const reportPath = path.join(folderPath, reportFileName);

                    const noteContent = note.content || '';
                    const paragraphs = noteContent.split('\n').map(line => {
                        const trimmed = line.trim();
                        if (trimmed.startsWith('# ')) {
                            return new Paragraph({ text: trimmed.substring(2), heading: HeadingLevel.HEADING_1 });
                        } else if (trimmed.startsWith('## ')) {
                            return new Paragraph({ text: trimmed.substring(3), heading: HeadingLevel.HEADING_2 });
                        } else if (trimmed.startsWith('### ')) {
                            return new Paragraph({ text: trimmed.substring(4), heading: HeadingLevel.HEADING_3 });
                        } else if (trimmed === '') {
                            return new Paragraph({ text: '' });
                        }
                        const runs = [];
                        const parts = trimmed.split(/(\*\*[^*]+\*\*)/g);
                        for (const part of parts) {
                            if (part.startsWith('**') && part.endsWith('**')) {
                                runs.push(new TextRun({ text: part.slice(2, -2), bold: true }));
                            } else {
                                runs.push(new TextRun({ text: part }));
                            }
                        }
                        return new Paragraph({ children: runs });
                    });

                    const doc = new Document({
                        sections: [{
                            properties: {},
                            children: [
                                new Paragraph({ text: noteTitle, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
                                new Paragraph({ text: `Importado de NotebookLM: ${notebookTitle}`, alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
                                ...paragraphs
                            ]
                        }]
                    });

                    const buffer = await Packer.toBuffer(doc);
                    fs.writeFileSync(reportPath, buffer);

                    results[`report_${notesData.notes.indexOf(note)}`] = {
                        status: 'downloaded',
                        fileName: reportFileName,
                        path: reportPath,
                        size: buffer.length,
                        title: noteTitle
                    };
                    downloadedCount++;
                    console.log(`[Import Notebook] ✅ Report saved: ${reportFileName}`);
                }
            }
        } catch (noteErr) {
            console.error(`[Import Notebook] ⚠️ Error fetching notes: ${noteErr.message}`);
        }

        // 6. Generate a thumbnail/description via notebook_describe
        let summary = '';
        try {
            const descResult = await runMCPTool('notebook_describe', { notebook_id: notebookId });
            if (descResult && descResult.summary) {
                summary = descResult.summary;
            }
        } catch (descErr) {
            console.log(`[Import Notebook] Could not get description: ${descErr.message}`);
        }

        // 7. Save to Firestore
        const bookData = {
            title: `Investigación: ${notebookTitle}`,
            notebookId: notebookId,
            notebookUrl: `https://notebooklm.google.com/notebook/${notebookId}`,
            sourceType: 'notebooklm',
            sourceCount: sourceCount,
            orchestrationStatus: downloadedCount > 0 ? 'completed' : 'idle',
            driveFolderPath: folderPath,
            driveFolderName: folderName,
            artifactDownloads: results,
            summary: summary,
            topicId: topicId || '',
            level: level || 'Iniciación',
            isVisible: true,
            isRecommended: false,
            isFavorite: false,
            acceptedDate: new Date().toISOString(),
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            importedAt: admin.firestore.FieldValue.serverTimestamp(),
            importedFrom: 'notebooklm',
            thumbnail: '',
            message: downloadedCount > 0
                ? `✅ Importado con ${downloadedCount} artefactos desde NotebookLM`
                : '📥 Notebook importado, artefactos pendientes'
        };

        await admin.firestore().collection('books').doc(bookId).set(bookData);
        console.log(`[Import Notebook] ✅ Book saved to Firestore: ${bookId}`);

        console.log(`[Import Notebook] Complete! ${downloadedCount} artifacts imported.`);
        res.json({
            success: true,
            bookId,
            title: bookData.title,
            downloaded: downloadedCount,
            total: totalArtifacts,
            artifacts: results,
            sources: sources.map(s => ({ title: s.title, type: s.source_type_name })),
            summary: summary.substring(0, 500)
        });

    } catch (error) {
        console.error('[Import Notebook] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// ENDPOINT: Upload PDF/EPUB as source for NotebookLM
// ============================================================================
app.post('/api/upload-source', upload.single('file'), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const filePath = req.file.path;
        const fileName = req.file.originalname;
        const fileSize = req.file.size;

        console.log(`[Upload Source] Received: ${fileName} (${(fileSize / 1024 / 1024).toFixed(1)} MB) -> ${filePath}`);

        res.json({
            success: true,
            file: {
                name: fileName,
                path: filePath,
                size: fileSize,
                type: path.extname(fileName).toLowerCase().replace('.', '')
            }
        });
    } catch (error) {
        console.error('[Upload Source] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ============================================================================
// ENDPOINT: Serve files from local Google Drive for admin preview
// ============================================================================
app.get('/api/drive-file', (req, res) => {
    try {
        const filePath = req.query.path;
        const isDownload = req.query.download === 'true';

        if (!filePath) {
            return res.status(400).json({ error: 'Missing path parameter' });
        }

        // Security: ensure the path is within DRIVE_BASE_PATH
        const resolvedPath = path.resolve(filePath);
        if (!resolvedPath.startsWith(DRIVE_BASE_PATH)) {
            return res.status(403).json({ error: 'Access denied: path outside allowed directory' });
        }

        if (!fs.existsSync(resolvedPath)) {
            return res.status(404).json({ error: 'File not found' });
        }

        // Determine content type
        const ext = path.extname(resolvedPath).toLowerCase();
        const contentTypes = {
            '.mp3': 'audio/mpeg',
            '.mp4': 'video/mp4',
            '.png': 'image/png',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.webp': 'image/webp',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.md': 'text/markdown',
            '.pdf': 'application/pdf'
        };

        const contentType = contentTypes[ext] || 'application/octet-stream';
        const fileName = path.basename(resolvedPath);
        const stat = fs.statSync(resolvedPath);

        // Handle range requests for audio/video streaming
        const range = req.headers.range;
        if (range && (ext === '.mp3' || ext === '.mp4')) {
            const parts = range.replace(/bytes=/, '').split('-');
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : stat.size - 1;
            const chunkSize = (end - start) + 1;

            res.writeHead(206, {
                'Content-Range': `bytes ${start}-${end}/${stat.size}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunkSize,
                'Content-Type': contentType,
            });

            const stream = fs.createReadStream(resolvedPath, { start, end });
            stream.pipe(res);
        } else {
            // Regular response
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Length', stat.size);

            if (isDownload) {
                res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`);
            }

            const stream = fs.createReadStream(resolvedPath);
            stream.pipe(res);
        }

        console.log(`[Drive File] Serving: ${fileName} (${(stat.size / 1024 / 1024).toFixed(1)} MB)`);
    } catch (error) {
        console.error('[Drive File] Error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

app.post('/api/generate-orchestrated', async (req, res) => {
    const { bookId, title, sources, config, searchQuery } = req.body;

    // Create Job
    const jobId = Math.random().toString(36).substring(7);
    jobs[jobId] = { id: jobId, status: 'initializing', progress: 0, logs: [] };

    console.log(`[Orchestrator] Starting V2 Job ${jobId} for "${title}"`);
    res.json({ success: true, jobId, message: 'Orchestration (V2) started' });

    const log = (msg) => {
        const ts = new Date().toISOString().split('T')[1].split('.')[0];
        console.log(`[Orchestrator ${jobId}] ${msg}`);
        if (jobs[jobId]) jobs[jobId].logs.push(`${ts} - ${msg}`);
        // Push ONLY message to DB — do NOT overwrite orchestrationStatus
        const db = admin.firestore();
        db.collection('books').doc(bookId).set({
            message: msg,
            lastUpdate: new Date()
        }, { merge: true }).catch(e => { });
    }

    const updateDB = async (status, data = {}) => {
        try {
            const db = admin.firestore();
            await db.collection('books').doc(bookId).set({
                orchestrationStatus: status,
                lastUpdate: new Date(),
                ...data
            }, { merge: true });
        } catch (e) {
            console.error("DB Update Error", e);
        }
    };

    // Async Process
    (async () => {
        try {
            await updateDB('initializing');
            log(`Starting orchestration for: ${title}`);

            // 2. Create Notebook
            log('Step 1: NotebookLM Setup...');
            await updateDB('initializing');

            log(`Calling notebook_create with title="Foresvi: ${title}"...`);
            let mcpRes;
            try {
                mcpRes = await runMCPTool('notebook_create', { title: `Foresvi: ${title}` });
            } catch (notebookErr) {
                const isAuth = notebookErr.message.includes('400') || /auth|cookie|session|login/i.test(notebookErr.message);
                nlmAuthValid = false;
                log(`❌ Error creando cuaderno: ${notebookErr.message}`);
                const errMsg = isAuth
                    ? '❌ Sesión de NotebookLM expirada. Re-autentícate desde el panel de Admin (botón 🔑 Re-autenticar).'
                    : `❌ Error al crear cuaderno: ${notebookErr.message}`;
                await updateDB('error', { error: isAuth ? 'auth_expired' : 'notebook_error', message: errMsg });
                jobs[jobId].status = 'failed';
                return;
            }

            const mcpResText = mcpRes.content && mcpRes.content[0] ? mcpRes.content[0].text : JSON.stringify(mcpRes);
            console.log('[MCP notebook_create raw]', mcpResText.slice(0, 1500));

            // Detect auth errors in response text (400 Bad Request from NLM)
            if (/400|Bad Request|HTTPStatusError|auth|cookie/i.test(mcpResText)) {
                nlmAuthValid = false;
                log('❌ Error 400 de NotebookLM — cookies expiradas');
                await updateDB('error', { error: 'auth_expired', message: '❌ Sesión de NotebookLM expirada. Re-autentícate desde el panel de Admin (botón 🔑 Re-autenticar).' });
                jobs[jobId].status = 'failed';
                return;
            }

            let notebookId = null;
            try {
                // Try to parse the output as JSON (expected from FastMCP)
                const json = JSON.parse(mcpResText);
                if (json.status === 'success' && json.notebook && json.notebook.id) {
                    notebookId = json.notebook.id;
                    jobs[jobId].notebookId = notebookId;
                    log(`Notebook created: ${notebookId}`);
                    // Save to DB using helper
                    await updateDB('initializing', { notebookId, message: 'Notebook Creado ✅' });
                } else {
                    log(`Warning: Could not parse notebook ID. Raw response: ${mcpResText}`);
                    await updateDB('initializing', { message: 'Iniciando fuentes...' });
                }
            } catch (e) {
                log(`Error parsing notebook response: ${e.message}`);
            }

            // Sources
            if (notebookId && sources && sources.length > 0) {
                for (const src of sources) {
                    if (src) {
                        // Handle FILE sources (uploaded PDFs/EPUBs)
                        if (typeof src === 'object' && src.sourceType === 'file' && src.filePath) {
                            log(`Adding file source: ${src.fileName} (${src.filePath})`);
                            try {
                                await runMCPTool('source_add', {
                                    notebook_id: notebookId,
                                    source_type: 'file',
                                    file_path: src.filePath
                                });
                                log(`✅ File source added: ${src.fileName}`);
                            } catch (srcErr) {
                                log(`Failed to add file source ${src.fileName}: ${srcErr.message}`);
                            }
                            continue;
                        }

                        let finalUrl = null;

                        // Handle String (Direct URL)
                        if (typeof src === 'string') {
                            finalUrl = src;
                        }
                        // Handle Object with URL
                        else if (typeof src === 'object') {
                            if (src.url) {
                                finalUrl = src.url;
                            } else if (src.link) {
                                finalUrl = src.link;
                            } else if (src.id && (src.source === 'youtube' || src.type === 'youtube')) {
                                finalUrl = `https://www.youtube.com/watch?v=${src.id}`;
                            } else if (src.id && !src.url) {
                                finalUrl = `https://www.youtube.com/watch?v=${src.id}`;
                            }
                        }

                        if (finalUrl) {
                            log(`Adding source: ${finalUrl}`);
                            try {
                                await runMCPTool('source_add', { notebook_id: notebookId, source_type: 'url', url: finalUrl });
                            } catch (srcErr) {
                                log(`Failed to add source ${finalUrl}: ${srcErr.message}`);
                            }
                        } else {
                            log(`Warning: Could not extract URL from source object: ${JSON.stringify(src)}`);
                        }
                    }
                }
            } else {
                log('Skipping sources (No ID or empty list).');
            }

            log('Sources process finished. Waiting 10s for indexing...');
            await new Promise(r => setTimeout(r, 10000));

            // 2. Audio Generation
            log('Step 2: Generate Audio Overview...');
            // await updateDB('generating_audio'); // Keep status
            const focusPrompt = PROMPTS.audio(config, title);

            try {
                // Use unified artifact tool
                const audioRes = await runMCPTool('studio_create', {
                    notebook_id: notebookId,
                    artifact_type: 'audio',
                    focus_prompt: focusPrompt,
                    language: config.audio?.idioma === 'Inglés' ? 'en' : 'es',
                    confirm: true
                });

                const audioRaw = audioRes.content ? audioRes.content[0].text : JSON.stringify(audioRes);
                console.log(`[studio_create audio RAW]`, audioRaw.slice(0, 2000));

                if (audioRaw.includes('Unknown tool')) {
                    throw new Error('Tool studio_create not found. Cannot generate audio.');
                }
                log('Audio generation request sent successfully.');
            } catch (e) {
                log(`CRITICAL: Audio Generation Failed. ${e.message}`);
                // Proceed to polling anyway? Or fail? If audio gen failed, polling won't find anything.
                // But maybe manual generation works? Let's proceed but warn.
            }

            // 3. Infographic Generation (REAL MCP TOOL)
            log('Step 3: Generate Infographic...');
            await updateDB('generating_infographic');

            try {
                const infographicRes = await runMCPTool('studio_create', {
                    notebook_id: jobs[jobId].notebookId,
                    artifact_type: 'infographic',
                    language: config.infografia.idioma === 'Español' ? 'es' :
                        config.infografia.idioma === 'Inglés' ? 'en' : 'fr',
                    orientation: config.infografia.orientacion === 'Cuadrado' ? 'square' :
                        config.infografia.orientacion === 'Vertical' ? 'portrait' : 'landscape',
                    detail_level: config.infografia.nivel_detalle === 'Conciso' ? 'concise' :
                        config.infografia.nivel_detalle === 'Detallado' ? 'detailed' : 'standard',
                    focus_prompt: config.infografia.descripcion || '',
                    confirm: true
                });

                const infographicText = infographicRes.content ? infographicRes.content[0].text : JSON.stringify(infographicRes);
                console.log('[studio_create infographic RAW]', infographicText.slice(0, 500));
                log('✅ Infographic generation requested successfully.');
            } catch (e) {
                log(`⚠️ Infographic generation failed: ${e.message}`);
                // Continue anyway - infographic is optional
            }

            // 3.5 Report Generation
            log('Step 3.5: Generating Real Report via AI...');
            await updateDB('generating_report');

            if (config.informe) {
                try {
                    const reportPrompt = `Actúa como un analista experto. Genera un informe ${config.informe.tipo} en ${config.informe.idioma} sobre este cuaderno. ` +
                        `Foco específico: ${config.informe.foco}. ` +
                        `ESTRUCTURA OBLIGATORIA: # RESUMEN EJECUTIVO, ## ANÁLISIS DETALLADO, ## PUNTOS CLAVE, ## CONCLUSIONES Y RECOMENDACIONES.`;

                    // Generate content via query
                    const queryRes = await runMCPTool('notebook_query', {
                        notebook_id: jobs[jobId].notebookId,
                        query: reportPrompt
                    });

                    const reportText = queryRes.content?.[0]?.text || 'No se pudo generar contenido para el informe.';
                    const reportTitle = `INFORME ${config.informe.tipo.toUpperCase()} - ${title}`;

                    // Save the generated report as a note so it appears as an artifact
                    await runMCPTool('note', {
                        notebook_id: jobs[jobId].notebookId,
                        action: 'create',
                        title: reportTitle,
                        content: reportText
                    });

                    log('✅ Report generated and saved successfully.');
                } catch (e) {
                    log(`⚠️ Report generation failed: ${e.message}`);
                }
            }

            // 3.6 Presentation Generation
            log('Step 3.6: Generating Presentation content via AI...');
            await updateDB('generating_presentation');

            if (config.presentacion) {
                try {
                    const duracion = config.presentacion.duracion || 'Corto';
                    const numSlides = duracion === 'Corto' ? '8-10' : duracion === 'Medio' ? '12-15' : '18-20';
                    const presPrompt = `Actúa como un diseñador de presentaciones experto. Genera el contenido estructurado para una presentación de ${numSlides} diapositivas en ${config.presentacion.idioma} sobre este tema.
Formato: ${config.presentacion.formato || 'Presentación detallada'}.
Objetivo: ${config.presentacion.foco || 'Crea una presentación que resuma las principales ideas del libro para que un dueño o gerente de una PYME pueda aplicar en su entorno laboral.'}

FORMATO OBLIGATORIO — usa EXACTAMENTE esta estructura para cada diapositiva:
## DIAPOSITIVA 1: TÍTULO
[Título principal]
[Subtítulo o descripción breve]

## DIAPOSITIVA 2: INTRODUCCIÓN
- [Punto clave 1]
- [Punto clave 2]
- [Punto clave 3]

## DIAPOSITIVA N: [TEMA PRINCIPAL]
- [Punto 1]
- [Punto 2]
- [Punto 3]

## DIAPOSITIVA FINAL: CONCLUSIONES Y PRÓXIMOS PASOS
- [Conclusión 1]
- [Conclusión 2]
- [Llamada a la acción]

Sé concreto, usa lenguaje ejecutivo y enfócate en puntos accionables. Máximo 4-5 puntos por diapositiva.`;

                    const queryRes = await runMCPTool('notebook_query', {
                        notebook_id: jobs[jobId].notebookId,
                        query: presPrompt
                    });

                    const presContent = queryRes.content?.[0]?.text || '';
                    const presNoteTitle = `PRESENTACIÓN ${(config.presentacion.formato || 'DETALLADA').replace(/[^A-Z0-9]/g, '').toUpperCase()} - ${title}`;

                    if (presContent.length > 100) {
                        await runMCPTool('note', {
                            notebook_id: jobs[jobId].notebookId,
                            action: 'create',
                            title: presNoteTitle,
                            content: presContent
                        });
                        log('✅ Presentation content generated and saved as note.');
                    } else {
                        log('⚠️ Presentation content too short, skipping note creation.');
                    }
                } catch (e) {
                    log(`⚠️ Presentation generation failed: ${e.message}`);
                }
            }

            // 4. Video Overview Generation (REAL MCP TOOL)
            log('Step 4: Generate Video Overview...');
            await updateDB('generating_video');

            try {
                const videoRes = await runMCPTool('studio_create', {
                    notebook_id: jobs[jobId].notebookId,
                    artifact_type: 'video',
                    video_format: config.video.formato === 'Vídeo explicativo' ? 'explainer' : 'brief',
                    language: config.video.idioma === 'Español' ? 'es' :
                        config.video.idioma === 'Inglés' ? 'en' : 'fr',
                    focus_prompt: config.video.foco || '',
                    confirm: true
                });

                const videoText = videoRes.content ? videoRes.content[0].text : JSON.stringify(videoRes);
                console.log('[studio_create video RAW]', videoText.slice(0, 500));
                log('✅ Video overview generation requested successfully.');
            } catch (e) {
                log(`⚠️ Video overview generation failed: ${e.message}`);
                // Continue anyway - video is optional
            }

            // 5. Generation Launched - Return Control to Frontend
            log('Step 5: All generations launched. Returning control to frontend...');
            await updateDB('waiting_artifacts', {
                notebookId: jobs[jobId].notebookId,
                notebookUrl: `https://notebooklm.google.com/notebook/${jobs[jobId].notebookId}`,
                message: 'Audio, infografía y video en generación. Esto puede tardar 10-15 minutos. El frontend verificará automáticamente el progreso.'
            });

            jobs[jobId].status = 'waiting_artifacts';
            jobs[jobId].progress = 60;

            log('✅ Orchestration initiated successfully.');
            log('📊 Frontend should poll GET /api/check-artifacts/:notebookId for completion.');
            log('⏱️  Expected wait time: Audio 10-15 min, Infographic 5 min, Video 10-15 min.');

            // NOTE: We EXIT here. The frontend will poll periodically.
            // When artifacts are ready (audio.status === 'completed'), 
            // frontend should call a new endpoint like /api/download-and-process-artifacts
            // to complete the video rendering flow.

            return; // ← Exit orchestration here (frontend takes over)

            // Orchestration launched. Frontend will poll for status.

        } catch (e) {
            log(`Critical Error: ${e.message}`);
            await updateDB('error', { error: e.message });
            jobs[jobId].status = 'failed';
        }
    })();
});

// DEBUG: Log active jobs every 10s
setInterval(() => {
    const active = Object.values(jobs).filter(j => j.status !== 'completed' && j.status !== 'failed');
    if (active.length > 0) {
        console.log(`[MONITOR] ${active.length} active jobs:`);
        active.forEach(j => console.log(` - Job ${j.id}: ${j.status} (${j.progress}%) [Notebook: ${j.notebookId || 'N/A'}]`));
    }
}, 10000);

app.listen(PORT, () => {
    console.log(`Foresvi Bridge Server running on http://localhost:${PORT}`);
    console.log(`MCP Path: ${MCP_PATH}`);
});


// Google Drive & Auth removed

// ============================================================================
// ENDPOINT: Manual YouTube Link
// ============================================================================
app.post('/api/books/:bookId/youtube-link', async (req, res) => {
    const { bookId } = req.params;
    const { youtubeUrl } = req.body;

    if (!youtubeUrl) return res.status(400).json({ error: 'youtubeUrl is required' });

    try {
        let youtubeId = null;
        const patterns = [
            /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
            /^([a-zA-Z0-9_-]{11})$/ // Raw ID
        ];
        for (const p of patterns) {
            const match = youtubeUrl.match(p);
            if (match) { youtubeId = match[1]; break; }
        }

        if (!youtubeId) return res.status(400).json({ error: 'Invalid YouTube URL or ID' });

        const docRef = admin.firestore().collection('books').doc(bookId);
        await docRef.update({
            youtubeId,
            videoUrl: `https://youtu.be/${youtubeId}`,
            youtubeLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[YouTube Link] Book ${bookId} -> ${youtubeId}`);
        res.json({ success: true, youtubeId });
    } catch (e) {
        console.error('[YouTube Link] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ============================================================================
// ENDPOINT: Sync YouTube Playlist
// ============================================================================
app.post('/api/youtube/sync-playlist', async (req, res) => {
    const { playlistId } = req.body;
    const targetPlaylistId = playlistId || process.env.YOUTUBE_PLAYLIST_ID;

    if (!targetPlaylistId) {
        return res.status(400).json({ error: 'playlistId required (or set YOUTUBE_PLAYLIST_ID in .env)' });
    }

    if (!process.env.YOUTUBE_API_KEY) {
        return res.status(500).json({ error: 'YOUTUBE_API_KEY not configured' });
    }

    try {
        // Use API Key instead of OAuth
        const youtube = google.youtube({ version: 'v3', auth: process.env.YOUTUBE_API_KEY });

        // Fetch all items from playlist
        let allItems = [];
        let nextPageToken = null;
        do {
            const plRes = await youtube.playlistItems.list({
                part: 'snippet',
                playlistId: targetPlaylistId,
                maxResults: 50,
                pageToken: nextPageToken
            });
            allItems = allItems.concat(plRes.data.items || []);
            nextPageToken = plRes.data.nextPageToken;
        } while (nextPageToken);

        console.log(`[Playlist Sync] Found ${allItems.length} videos in playlist.`);

        // Fetch all books from Firestore
        const booksSnap = await admin.firestore().collection('books').get();
        const books = [];
        booksSnap.forEach(doc => books.push({ id: doc.id, ...doc.data() }));

        let matched = 0;
        const results = [];

        for (const item of allItems) {
            const videoTitle = (item.snippet.title || '').toLowerCase().trim();
            const videoId = item.snippet.resourceId?.videoId;
            if (!videoId) continue;

            const matchingBook = books.find(b => {
                const bookTitle = (b.title || '').toLowerCase().trim();
                return bookTitle && (
                    videoTitle.includes(bookTitle) ||
                    bookTitle.includes(videoTitle) ||
                    videoTitle.includes(bookTitle.split(':')[0].trim())
                );
            });

            if (matchingBook && !matchingBook.youtubeId) {
                await admin.firestore().collection('books').doc(matchingBook.id).update({
                    youtubeId: videoId,
                    videoUrl: `https://youtu.be/${videoId}`,
                    youtubeLinkedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                matched++;
                results.push({ book: matchingBook.title, videoId, status: 'linked' });
                console.log(`[Playlist Sync] ✅ "${matchingBook.title}" -> ${videoId}`);
            } else if (matchingBook) {
                results.push({ book: matchingBook.title, videoId, status: 'already_linked' });
            }
        }

        res.json({ success: true, totalVideos: allItems.length, matched, results });
    } catch (e) {
        console.error('[Playlist Sync] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ============================================================================
// ENDPOINT: Generate Structured Roadmap
// ============================================================================
app.post('/api/books/:bookId/generate-roadmap', async (req, res) => {
    const { bookId } = req.params;

    try {
        const docRef = admin.firestore().collection('books').doc(bookId);
        const docSnap = await docRef.get();
        if (!docSnap.exists) return res.status(404).json({ error: 'Book not found' });

        const data = docSnap.data();
        const notebookId = data.notebookId;
        if (!notebookId) return res.status(400).json({ error: 'No notebookId for this book' });

        console.log(`[Roadmap] Generating for: "${data.title}" (${bookId})`);

        const prompt = `Analiza el contenido completo de este cuaderno y genera un informe estructurado en formato JSON PURO (sin markdown, sin backticks, solo el JSON).

El JSON debe seguir esta estructura EXACTA:
{
  "resumen_ejecutivo": "Un párrafo de 3-5 frases resumiendo el contenido y sus ideas principales",
  "aprendizajes_clave": [
    {"punto": "Título corto", "descripcion": "Descripción de 1-2 frases"}
  ],
  "roadmap_accionable": {
    "fase_1_inmediato": [{"accion": "Acción concreta esta semana", "objetivo": "Resultado esperado"}],
    "fase_2_medio_plazo": [{"accion": "Acción para 1-3 meses", "objetivo": "Resultado esperado"}],
    "fase_3_maestria": [{"accion": "Acción de largo plazo", "objetivo": "Resultado esperado"}]
  },
  "indicadores_exito": ["Indicador medible 1", "Indicador medible 2"]
}

IMPORTANTE: Al menos 3 aprendizajes, 2 acciones por fase, 3 indicadores. SOLO JSON.`;

        const queryRes = await runMCPTool('notebook_query', { notebook_id: notebookId, query: prompt });
        const rawText = queryRes.content?.[0]?.text || '';

        let roadmap = null;

        // Multi-level JSON extraction
        const tryParse = (text) => {
            try { return JSON.parse(text); } catch { return null; }
        };

        roadmap = tryParse(rawText);

        if (!roadmap) {
            // Try extracting from notebook_query response structure
            const parsed = tryParse(rawText);
            if (parsed?.answer) {
                roadmap = tryParse(parsed.answer);
                if (!roadmap) {
                    const m = parsed.answer.match(/\{[\s\S]*\}/);
                    if (m) roadmap = tryParse(m[0]);
                }
            }
        }

        if (!roadmap) {
            // Extract JSON from any text wrapper
            const m = rawText.match(/\{[\s\S]*\}/);
            if (m) roadmap = tryParse(m[0]);
        }

        if (!roadmap) {
            console.warn('[Roadmap] Could not parse. Creating minimal from summary.');
            roadmap = {
                resumen_ejecutivo: data.summary || `Análisis de "${data.title}"`,
                aprendizajes_clave: [{ punto: 'Pendiente', descripcion: 'El roadmap no pudo generarse automáticamente.' }],
                roadmap_accionable: {
                    fase_1_inmediato: [{ accion: 'Revisar NotebookLM', objetivo: 'Comprender ideas principales' }],
                    fase_2_medio_plazo: [{ accion: 'Aplicar conceptos', objetivo: 'Implementación práctica' }],
                    fase_3_maestria: [{ accion: 'Profundizar', objetivo: 'Dominio del tema' }]
                },
                indicadores_exito: ['Completar análisis']
            };
        }

        // Validate structure
        const validated = {
            resumen_ejecutivo: roadmap.resumen_ejecutivo || '',
            aprendizajes_clave: Array.isArray(roadmap.aprendizajes_clave) ? roadmap.aprendizajes_clave : [],
            roadmap_accionable: {
                fase_1_inmediato: Array.isArray(roadmap.roadmap_accionable?.fase_1_inmediato) ? roadmap.roadmap_accionable.fase_1_inmediato : [],
                fase_2_medio_plazo: Array.isArray(roadmap.roadmap_accionable?.fase_2_medio_plazo) ? roadmap.roadmap_accionable.fase_2_medio_plazo : [],
                fase_3_maestria: Array.isArray(roadmap.roadmap_accionable?.fase_3_maestria) ? roadmap.roadmap_accionable.fase_3_maestria : []
            },
            indicadores_exito: Array.isArray(roadmap.indicadores_exito) ? roadmap.indicadores_exito : [],
            generatedAt: new Date().toISOString()
        };

        await docRef.update({
            roadmap: validated,
            roadmapGeneratedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`[Roadmap] ✅ Saved for "${data.title}"`);
        res.json({ success: true, roadmap: validated });

    } catch (e) {
        console.error('[Roadmap] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});


// ============================================================================
// MAIN PROCESSING ENDPOINT V4: Google Drive Storage
// ============================================================================
// Google Drive & Local Process V4 REMOVED
