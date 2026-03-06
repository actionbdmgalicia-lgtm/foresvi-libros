const express = require('express');
const cors = require('cors');
const { spawn, execFile } = require('child_process');
const { google } = require('googleapis');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
const admin = require('firebase-admin');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegPath = require('ffmpeg-static');

// Configure ffmpeg
if (ffmpegPath) {
    ffmpeg.setFfmpegPath(ffmpegPath);
    console.log(`[FFmpeg] Path set to: ${ffmpegPath}`);
} else {
    console.warn(`[FFmpeg] NOT FOUND. Video generation will fail.`);
}

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

        this.process.stdout.on('data', (chunk) => this.handleData(chunk));
        this.process.stderr.on('data', (chunk) => console.error(`[MCP STDERR] ${chunk}`));
        this.process.on('close', (code) => {
            console.log(`[MCP] Process exited with code ${code}`);
            this.process = null;
            this.isInitialized = false;
        });

        // Initialize Handshake
        this.initPromise = new Promise((resolve, reject) => {
            // We use specific ID 0 for init to track it easily, although JSON-RPC usually creates new IDs
            const id = this.requestId++;
            this.pendingRequests.set(id, { resolve, reject, type: 'initialize' });

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
mcpClient.start().catch(err => console.error("MCP Init Failed:", err));

const runMCPTool = async (toolName, args) => {
    console.log(`[MCP CALL] ${toolName} with args: ${JSON.stringify(args).substring(0, 100)}...`);
    try {
        return await mcpClient.callTool(toolName, args);
    } catch (e) {
        console.error(`[MCP CALL FAILED] ${toolName}: ${e.message}`);
        // If broken pipe, restart?
        if (e.message.includes('not running') || e.message.includes('EPIPE')) {
            console.log("Restarting MCP...");
            await mcpClient.start();
            return await mcpClient.callTool(toolName, args);
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

        console.log(`[Download Audio] Requesting authenticated download via MCP...`);

        // Use MCP tool to download with authenticated session
        const downloadResult = await runMCPTool('download_secure_file', { url: audioUrl, expected_type: 'audio' });
        const downloadData = downloadResult.content ? JSON.parse(downloadResult.content[0].text) : null;

        if (!downloadData || downloadData.status !== 'success') {
            const errorMsg = downloadData?.error || 'MCP download failed';
            const preview = downloadData?.preview || '';
            console.error(`[Download Audio] MCP Error: ${errorMsg}`);
            if (preview) console.error(`[Download Audio] Preview:\n${preview.substring(0, 300)}`);

            return res.status(502).json({
                error: 'Audio Download Failed',
                details: errorMsg,
                hint: 'The audio URL requires Google authentication. MCP tool failed to download it.'
            });
        }

        // Decode base64 audio
        const audioBuffer = Buffer.from(downloadData.base64_data, 'base64');
        const contentType = downloadData.content_type || 'audio/mp4';

        console.log(`[Download Audio] Success! Size: ${downloadData.size_bytes} bytes, Type: ${contentType}`);

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
                await runMCPTool('notebook_add_text', {
                    notebook_id: notebookId,
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
                        await runMCPTool('notebook_add_url', { notebook_id: notebookId, url });
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
                    const audioRes = await runMCPTool('audio_overview_create', {
                        notebook_id: notebookId,
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

// Helper: Check YouTube Creds
const hasYouTubeCreds = () => {
    return fs.existsSync(path.join(__dirname, 'youtube-oauth-client.json')) &&
        fs.existsSync(path.join(__dirname, 'youtube-token.json'));
};

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

app.get('/api/youtube/status', (req, res) => {
    res.json({
        ready: hasYouTubeCreds(),
        driveEnabled: true,
        featureFlag: true // Now uses Drive instead of YouTube upload
    });
});

app.post('/api/youtube/upload', async (req, res) => {
    const { bookId } = req.body;

    if (!hasYouTubeCreds()) {
        return res.status(503).json({ success: false, error: 'Missing YouTube credentials' });
    }

    try {
        console.log(`[YouTube] Starting upload for Book: ${bookId}`);
        const db = admin.firestore();
        const docRef = db.collection('books').doc(bookId);
        const doc = await docRef.get();
        const data = doc.data();

        if (!data || !data.localVideoUrl) {
            return res.status(404).json({ success: false, error: 'Video not found' });
        }

        // Resolve absolute path
        // data.localVideoUrl is like "/exports/bookId/vid.mp4"
        const relativePath = data.localVideoUrl.replace(/^\/exports\//, '');
        const videoPath = path.join(publicExportsDir, relativePath);

        if (!fs.existsSync(videoPath)) {
            return res.status(404).json({ success: false, error: `File not found on server: ${videoPath}` });
        }

        // Authenticate
        const creds = JSON.parse(fs.readFileSync(path.join(__dirname, 'youtube-oauth-client.json')));
        const tokens = JSON.parse(fs.readFileSync(path.join(__dirname, 'youtube-token.json')));
        const key = creds.installed || creds.web;

        const oauth2Client = new google.auth.OAuth2(key.client_id, key.client_secret, key.redirect_uris[0]);
        oauth2Client.setCredentials(tokens);

        const youtube = google.youtube({ version: 'v3', auth: oauth2Client });

        // Upload
        const fileSize = fs.statSync(videoPath).size;
        console.log(`[YouTube] Uploading ${videoPath} (${(fileSize / 1024 / 1024).toFixed(2)} MB)...`);

        const resUpload = await youtube.videos.insert({
            part: 'snippet,status',
            requestBody: {
                snippet: {
                    title: `Resumen: ${data.title || 'Libro sin título'}`,
                    description: `Resumen generado por IA para Foresvi.\n\nContenido generado con NotebookLM.\n\n${data.subtitulo || ''}`,
                    tags: ['Foresvi', 'Resumen', 'IA', 'Educación'],
                    categoryId: '27' // Education
                },
                status: {
                    privacyStatus: 'unlisted', // No listado
                    selfDeclaredMadeForKids: false
                }
            },
            media: {
                body: fs.createReadStream(videoPath)
            }
        });

        console.log(`[YouTube] Upload Complete! ID: ${resUpload.data.id}`);
        const videoId = resUpload.data.id;

        // --- Playlist Handling ("App Foresvi") ---
        try {
            const playlistTitle = "App Foresvi";
            let playlistId = null;

            // 1. Find existing playlist
            const resPlaylists = await youtube.playlists.list({
                part: 'snippet',
                mine: true,
                maxResults: 50
            });

            const existing = resPlaylists.data.items.find(p => p.snippet.title === playlistTitle);

            if (existing) {
                playlistId = existing.id;
                console.log(`[YouTube] Found existing playlist: ${playlistId} - "${existing.snippet.title}"`);
            } else {
                // 2. Create new playlist
                console.log(`[YouTube] Creating playlist "${playlistTitle}"...`);
                const resCreate = await youtube.playlists.insert({
                    part: 'snippet,status',
                    requestBody: {
                        snippet: { title: playlistTitle },
                        status: { privacyStatus: 'unlisted' }
                    }
                });
                playlistId = resCreate.data.id;
                console.log(`[YouTube] Created playlist: ${playlistId}`);
            }

            // 3. Add video to playlist
            await youtube.playlistItems.insert({
                part: 'snippet',
                requestBody: {
                    snippet: {
                        playlistId: playlistId,
                        resourceId: {
                            kind: 'youtube#video',
                            videoId: videoId
                        }
                    }
                }
            });
            console.log(`[YouTube] Video added to playlist!`);

        } catch (playlistErr) {
            console.error(`[YouTube] Playlist Error (Non-fatal):`, playlistErr.message);
            // Don't fail the whole request
        }

        // Update DB
        await docRef.update({
            youtubeId: videoId,
            youtubeUrl: `https://youtu.be/${videoId}`,
            youtubeAvailable: true,
            uploadStatus: 'uploaded',
            lastUpdate: new Date()
        });

        res.json({
            success: true,
            youtubeId: videoId,
            youtubeUrl: `https://youtu.be/${videoId}`
        });

    } catch (e) {
        console.error('[YouTube] Upload Error:', e);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============================================================================
// ENDPOINT: Check NotebookLM Artifacts Status (Non-blocking)
// ============================================================================
app.get('/api/check-artifacts/:notebookId', async (req, res) => {
    const { notebookId } = req.params;

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

        // DEBUG: Log COMPLETE raw response for debugging
        console.log('[Check Artifacts] ===== FULL STUDIO_STATUS PAYLOAD =====');
        console.log(JSON.stringify(statusData, null, 2));
        console.log('[Check Artifacts] ===== END PAYLOAD =====');

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

        res.json(response);

    } catch (e) {
        console.error('[Check Artifacts] Error:', e);
        res.status(500).json({ error: e.message });
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
            const mcpRes = await runMCPTool('notebook_create', { title: `Foresvi: ${title}` });
            const mcpResText = mcpRes.content && mcpRes.content[0] ? mcpRes.content[0].text : JSON.stringify(mcpRes);

            console.log('[MCP notebook_create raw]', mcpResText.slice(0, 1500));

            let notebookId = null;
            try {
                // Try to parse the output as JSON (expected from FastMCP)
                const json = JSON.parse(mcpResText);
                if (json.status === 'success' && json.notebook && json.notebook.id) {
                    notebookId = json.notebook.id;
                    jobs[jobId].notebookId = notebookId;
                    log(`Notebook created: ${notebookId}`);
                    // Save to DB using helper
                    await updateDB('initializing', { notebookId });
                } else {
                    log(`Warning: Could not parse notebook ID. Raw response: ${mcpResText}`);
                }
            } catch (e) {
                log(`Error parsing notebook response: ${e.message}`);
            }

            // Sources
            if (notebookId && sources && sources.length > 0) {
                for (const src of sources) {
                    if (src) {
                        let finalUrl = null;

                        // Handle String (Direct URL)
                        if (typeof src === 'string') {
                            finalUrl = src;
                        }
                        // Handle Object
                        else if (typeof src === 'object') {
                            if (src.url) {
                                finalUrl = src.url;
                            } else if (src.link) {
                                finalUrl = src.link;
                            } else if (src.id && (src.source === 'youtube' || src.type === 'youtube')) {
                                finalUrl = `https://www.youtube.com/watch?v=${src.id}`;
                            } else if (src.id && !src.url) {
                                // Fallback: Assume YouTube ID if only ID is present? 
                                // Better to check if it looks like an ID vs URL?
                                // For now, if we have 'id' but no URL, and not explicitly youtube, log warning or try constructing?
                                // Let's follow the user's prompt example which suggested using ID.
                                finalUrl = `https://www.youtube.com/watch?v=${src.id}`;
                            }
                        }

                        if (finalUrl) {
                            log(`Adding source: ${finalUrl}`);
                            try {
                                await runMCPTool('notebook_add_url', { notebook_id: notebookId, url: finalUrl });
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
                // Use correct tool 'audio_overview_create'
                const audioRes = await runMCPTool('audio_overview_create', {
                    notebook_id: notebookId,
                    focus_prompt: focusPrompt,
                    language: config.language === 'English' ? 'en' : 'es',
                    confirm: true
                });

                const audioRaw = audioRes.content ? audioRes.content[0].text : JSON.stringify(audioRes);
                console.log(`[audio_overview_create RAW]`, audioRaw.slice(0, 2000));

                if (audioRaw.includes('Unknown tool')) {
                    throw new Error('Tool audio_overview_create not found. Cannot generate audio.');
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
                const infographicRes = await runMCPTool('infographic_create', {
                    notebook_id: jobs[jobId].notebookId,
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
                console.log('[infographic_create RAW]', infographicText.slice(0, 500));
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
                    await runMCPTool('notebook_add_text', {
                        notebook_id: jobs[jobId].notebookId,
                        title: reportTitle,
                        text: reportText
                    });

                    log('✅ Report generated and saved successfully.');
                } catch (e) {
                    log(`⚠️ Report generation failed: ${e.message}`);
                }
            }

            // 4. Video Overview Generation (REAL MCP TOOL)
            log('Step 4: Generate Video Overview...');
            await updateDB('generating_video');

            try {
                const videoRes = await runMCPTool('video_overview_create', {
                    notebook_id: jobs[jobId].notebookId,
                    format: config.video.formato === 'Vídeo explicativo' ? 'explainer' : 'brief',
                    language: config.video.idioma === 'Español' ? 'es' :
                        config.video.idioma === 'Inglés' ? 'en' : 'fr',
                    focus_prompt: config.video.foco || '',
                    confirm: true
                });

                const videoText = videoRes.content ? videoRes.content[0].text : JSON.stringify(videoRes);
                console.log('[video_overview_create RAW]', videoText.slice(0, 500));
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

            // Save Files
            const timestamp = Date.now();
            const bookDir = path.join(publicExportsDir, bookId);
            if (!fs.existsSync(bookDir)) fs.mkdirSync(bookDir, { recursive: true });

            // Audio
            const audioExt = artifacts.audio.data.content_type.includes('mpeg') ? 'mp3' : 'm4a';
            const audioFilename = `audio_${timestamp}.${audioExt}`;
            const audioPath = path.join(bookDir, audioFilename);
            fs.writeFileSync(audioPath, Buffer.from(artifacts.audio.data.base64_data, 'base64'));
            log(`Saved Audio: ${audioFilename}`);

            // Image
            let imagePath = null;
            let imageFilename = null;

            if (artifacts.image) {
                const imgExt = artifacts.image.data.content_type.includes('png') ? 'png' : 'jpg';
                imageFilename = `image_${timestamp}.${imgExt}`;
                imagePath = path.join(bookDir, imageFilename);
                fs.writeFileSync(imagePath, Buffer.from(artifacts.image.data.base64_data, 'base64'));
                log(`Saved Infographic: ${imageFilename}`);
            } else {
                log('⚠️ Infographic missing. Falling back to generated Title Card.');
                // Fallback generation
                imageFilename = `image_fallback_${timestamp}.png`;
                imagePath = path.join(bookDir, imageFilename);
                await new Promise((resolve) => {
                    const safeTitle = title.replace(/['":]/g, '').substring(0, 30);
                    execFile(ffmpegPath, [
                        '-f', 'lavfi', '-i', 'color=c=003349:s=1280x720',
                        '-frames:v', '1',
                        '-vf', `drawtext=fontfile=/System/Library/Fonts/Helvetica.ttc:text='${safeTitle}':fontsize=64:fontcolor=white:x=(w-text_w)/2:y=(h-text_h)/2`,
                        '-y', imagePath
                    ], resolve);
                });
            }

            // 6. Loop Video
            log('Step 6: Rendering MP4...');
            await updateDB('merging');
            const videoFilename = `video_${timestamp}.mp4`;
            const videoPath = path.join(bookDir, videoFilename);

            await new Promise((resolve, reject) => {
                execFile(ffmpegPath, [
                    '-loop', '1',
                    '-i', imagePath,
                    '-i', audioPath,
                    '-c:v', 'libx264',
                    '-tune', 'stillimage',
                    '-c:a', 'aac',
                    '-b:a', '192k',
                    '-pix_fmt', 'yuv420p',
                    '-shortest',
                    '-y',
                    videoPath
                ], (error) => {
                    if (error) {
                        console.error('FFmpeg Error:', error);
                        reject(error);
                    } else resolve();
                });
            });
            log(`Video rendered: ${videoFilename}`);

            // 7. Finalize (Manual Upload Mode)
            const canUpload = hasYouTubeCreds();

            await updateDB('completed', {
                localAudioUrl: `/exports/${bookId}/${audioFilename}`,
                localVideoUrl: `/exports/${bookId}/${videoFilename}`,
                localInfographicUrl: `/exports/${bookId}/${imageFilename}`,
                youtubeAvailable: canUpload,
                orchestrationLog: jobs[jobId].logs
            });

            log('Job Completed Successfully.');
            jobs[jobId].status = 'completed';

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


