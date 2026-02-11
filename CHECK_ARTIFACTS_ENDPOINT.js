// ============================================================================
// ENDPOINT: Check NotebookLM Artifacts Status (Non-blocking)
// ============================================================================
app.get('/api/check-artifacts/:notebookId', async (req, res) => {
    const { notebookId } = req.params;

    try {
        console.log(`[Check Artifacts] Checking status for notebook: ${notebookId}`);

        // Call studio_status to get current state
        const statusRes = await runMCPTool('studio_status', { notebook_id: notebookId });
        const statusData = statusRes.content ? JSON.parse(statusRes.content[0].text) : null;

        if (!statusData || statusData.status !== 'success') {
            return res.status(500).json({
                error: 'Failed to get studio status',
                details: statusData
            });
        }

        // Parse artifacts from response
        const artifacts = statusData.artifacts || [];
        const summary = statusData.summary || {};

        // Find audio and infographic artifacts
        const audioArtifact = artifacts.find(a => a.type === 'audio' || a.type === 'audio_overview');
        const infographicArtifact = artifacts.find(a => a.type === 'infographic');

        // Build response
        const response = {
            notebookId,
            notebookUrl: statusData.notebook_url,
            summary: {
                total: summary.total || 0,
                completed: summary.completed || 0,
                in_progress: summary.in_progress || 0
            },
            audio: audioArtifact ? {
                status: audioArtifact.status,
                url: audioArtifact.audio_url,
                duration: audioArtifact.duration_seconds,
                created_at: audioArtifact.created_at
            } : null,
            infographic: infographicArtifact ? {
                status: infographicArtifact.status,
                url: infographicArtifact.infographic_url,
                created_at: infographicArtifact.created_at
            } : null,
            allComplete: summary.completed === summary.total && summary.total > 0
        };

        console.log(`[Check Artifacts] Audio: ${response.audio?.status || 'N/A'}, Infographic: ${response.infographic?.status || 'N/A'}`);

        res.json(response);

    } catch (e) {
        console.error('[Check Artifacts] Error:', e);
        res.status(500).json({ error: e.message });
    }
});
