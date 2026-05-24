const fs = require('fs');
const path = require('path');
const https = require('https');

const CONFIG_PATH = path.join(__dirname, 'webapp', 'config.default.json');
const WEBAPP_DIR = path.join(__dirname, 'webapp');

// Helper function to download a file with redirect support
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            // Handle redirects (e.g., unpkg often redirects to exact file paths)
            if (response.statusCode === 301 || response.statusCode === 302) {
                return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
            }
            
            if (response.statusCode !== 200) {
                return reject(new Error(`Failed to download '${url}'. Status Code: ${response.statusCode}`));
            }

            const file = fs.createWriteStream(dest);
            response.pipe(file);
            
            file.on('finish', () => {
                file.close(resolve);
            });
        }).on('error', (err) => {
            fs.unlink(dest, () => reject(err));
        });
    });
}

async function downloadLibraries() {
    console.log(`Reading config from ${CONFIG_PATH}...`);
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    
    const cdnPaths = config.cdnPaths || {};
    const localPaths = config.localPaths || {};
    
    for (const key of Object.keys(cdnPaths)) {
        const url = cdnPaths[key];
        const localRelativePath = localPaths[key];
        
        if (!url || !localRelativePath) {
            console.warn(`[WARN] Skipping '${key}': Missing CDN or local path mapping.`);
            continue;
        }
        
        const destPath = path.join(WEBAPP_DIR, localRelativePath);
        const destDir = path.dirname(destPath);
        
        if (!fs.existsSync(destDir)) {
            fs.mkdirSync(destDir, { recursive: true });
        }
        
        console.log(`Downloading [${key}]...`);
        await downloadFile(url, destPath)
            .then(() => console.log(`  ✓ Saved to ${localRelativePath}`))
            .catch(err => console.error(`  ✗ Error downloading [${key}]: ${err.message}`));
    }
    console.log('\nAll downloads completed!');
}

downloadLibraries();