const fs = require('fs');
const path = require('path');

const files = [
    'src/pages/AdminDashboard.jsx',
    'src/pages/BookDetail.jsx'
];

files.forEach(file => {
    const fullPath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(fullPath)) {
        console.log(`Skipping ${file} (not found)`);
        return;
    }

    let content = fs.readFileSync(fullPath, 'utf8');
    let changed = false;

    // 1. Ensure API_BASE is defined (if not already there)
    // We check if it's already defined to avoid duplicates
    if (!content.includes('const API_BASE = import.meta.env.VITE_API_BASE_URL')) {
        const lines = content.split('\n');
        let lastImportIdx = -1;
        for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim().startsWith('import ') || lines[i].trim().startsWith('const YOUTUBE_API_KEY')) {
                lastImportIdx = i;
            }
        }
        if (lastImportIdx !== -1) {
            lines.splice(lastImportIdx + 1, 0, "const API_BASE = import.meta.env.VITE_API_BASE_URL || '';");
            content = lines.join('\n');
            changed = true;
            console.log(`Added API_BASE definition to ${file}`);
        }
    }

    // 2. Replace calls
    // Pattern A: fetch('/api/ -> fetch(`${API_BASE}/api/
    // This handles: fetch('/api/generate', ...)
    if (content.match(/fetch\('\/api\//)) {
        content = content.replace(/fetch\('\/api\//g, "fetch(`${API_BASE}/api/");
        // Fix closing quote to backtick if needed? No, because we opened with backtick.
        // Wait: fetch(`${API_BASE}/api/generate', ...) is invalid syntax (mixed quotes).
        // Better: Replace entire string start.
        // "fetch(`${API_BASE}/api/" implies we use backticks.
        // If original was single quote: fetch('/api/foo') -> fetch(`${API_BASE}/api/foo`)
        // We need to find the matching closing quote and change it to backtick? That's hard with regex.

        // Alternative: Use concatenation for single quotes: fetch(API_BASE + '/api/
        content = content.replace(/fetch\('\/api\//g, "fetch(API_BASE + '/api/");
        changed = true;
    }

    // Pattern B: fetch(`/api/ -> fetch(`${API_BASE}/api/
    // This handles: fetch(`/api/jobs/${id}`)
    if (content.match(/fetch\(`\/api\//)) {
        content = content.replace(/fetch\(`\/api\//g, "fetch(`${API_BASE}/api/");
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(fullPath, content);
        console.log(`Updated URLs in ${file}`);
    } else {
        console.log(`No changes needed for ${file}`);
    }
});
