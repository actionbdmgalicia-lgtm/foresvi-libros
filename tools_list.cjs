const { spawn } = require('child_process');

// Path to MCP - ADJUST THIS TO MATCH YOUR SERVER.CJS PATH
const MCP_PATH = "/Users/maccuatro/.local/bin/notebooklm-mcp";

const runTest = async () => {
    console.log("🚀 Iniciando prueba aislada de NotebookLM MCP tools/list...");

    return new Promise((resolve, reject) => {
        const proc = spawn(MCP_PATH, [], {
            env: { ...process.env, PYTHONUNBUFFERED: '1' }
        });

        let step = 'init';
        let pendingBuffer = '';

        proc.stdout.on('data', (chunk) => {
            pendingBuffer += chunk.toString();
            let eolIndex;
            while ((eolIndex = pendingBuffer.indexOf('\n')) >= 0) {
                const line = pendingBuffer.slice(0, eolIndex).trim();
                pendingBuffer = pendingBuffer.slice(eolIndex + 1);
                if (!line) continue;

                try {
                    const msg = JSON.parse(line);

                    if (step === 'init' && msg.id === 1) {
                        console.log("✅ Handshake OK. Enviando 'initialized'...");
                        proc.stdin.write(JSON.stringify({
                            jsonrpc: "2.0",
                            method: "notifications/initialized"
                        }) + "\n");

                        console.log("📄 Solicitando tools/list...");
                        step = 'tool_call';
                        proc.stdin.write(JSON.stringify({
                            jsonrpc: "2.0",
                            id: 2,
                            method: "tools/list"
                        }) + "\n");
                    }
                    else if (step === 'tool_call' && msg.id === 2) {
                        console.log("✅ Resultado recibido!");
                        if (msg.result && msg.result.tools) {
                            console.log("Tools disponibles detallado:", JSON.stringify(msg.result.tools.filter(t => ['source_add', 'studio_create', 'note'].includes(t.name)), null, 2));
                        } else {
                            console.log("Raw Result:", JSON.stringify(msg.result));
                        }
                        proc.kill();
                        resolve();
                    }
                } catch (e) {
                }
            }
        });

        proc.stderr.on('data', d => console.error(`[MCP ERR] ${d}`));

        // Start Handshake
        console.log("🤝 Enviando handshake inicial...");
        proc.stdin.write(JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "initialize",
            params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "test", version: "1.0" } }
        }) + "\n");
    });
};

runTest();
