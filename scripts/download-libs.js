const https = require('https');
const fs = require('fs');
const path = require('path');

// Target directory for the offline libraries
const LIBS_DIR = path.join(__dirname, '..', 'webapp', 'libs');

// The exact URLs matching your config.default.json
const DEPENDENCIES = {
    "mermaid.min.js": "https://cdn.jsdelivr.net/npm/mermaid@9.4.3/dist/mermaid.min.js",
    "d3.v7.min.js": "https://d3js.org/d3.v7.min.js",
    "graphviz.umd.js": "https://unpkg.com/@hpcc-js/wasm@2.14.1/dist/graphviz.umd.js",
    "d3-graphviz.min.js": "https://unpkg.com/d3-graphviz@5.1.0/build/d3-graphviz.min.js",
    "pako.min.js": "https://cdnjs.cloudflare.com/ajax/libs/pako/2.1.0/pako.min.js",
    "cytoscape.min.js": "https://cdnjs.cloudflare.com/ajax/libs/cytoscape/3.26.0/cytoscape.min.js",
    "cytoscape-svg.min.js": "https://cdn.jsdelivr.net/npm/cytoscape-svg@0.4.0/cytoscape-svg.min.js"
};

/**
 * Downloads a file via HTTPS and writes it to the local file system.
 * Automatically follows 3xx redirects.
 */
function downloadFile(url, dest) {
    return new Promise((resolve, reject) => {
        https.get(url, (response) => {
            // Handle redirects (unpkg and jsdelivr do this frequently)
            if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
                let redirectUrl = response.headers.location;
                if (!redirectUrl.startsWith('http')) {
                    const parsedUrl = new URL(url);
                    redirectUrl = `${parsedUrl.protocol}//${parsedUrl.host}${redirectUrl}`;
                }
                resolve(downloadFile(redirectUrl, dest));
                return;
            }

            if (response.statusCode !== 200) {
                reject(new Error(`Failed to download '${url}'. Status Code: ${response.statusCode}`));
                return;
            }

            const file = fs.createWriteStream(dest);
            response.pipe(file);

            file.on('finish', () => {
                file.close();
                resolve();
            });

            file.on('error', (err) => {
                fs.unlink(dest, () => reject(err)); // Delete partial file on error
            });

        }).on('error', (err) => {
            reject(err);
        });
    });
}

/**
 * Main Execution
 */
async function run() {
    console.log(`\nStarting Download into: ${LIBS_DIR}`);
    
    // Ensure the webapp/libs directory exists
    if (!fs.existsSync(LIBS_DIR)) {
        fs.mkdirSync(LIBS_DIR, { recursive: true });
        console.log(`Created directory: ${LIBS_DIR}`);
    }

    const files = Object.keys(DEPENDENCIES);
    
    for (const filename of files) {
        const url = DEPENDENCIES[filename];
        const dest = path.join(LIBS_DIR, filename);
        
        console.log(`Downloading ${filename}...`);
        
        try {
            await downloadFile(url, dest);
            console.log(` -> Success: ${filename}`);
        } catch (error) {
            console.error(` -> Error downloading ${filename}: ${error.message}`);
        }
    }
    
    console.log(`\nAll downloads complete. Your local fallback is ready.\n`);
}

run();