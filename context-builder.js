const fs = require('fs');
const path = require('path');

// Folders and files to exclude from the context
const IGNORE_DIRS = ['node_modules', 'libs', '.git', 'dist'];
const IGNORE_EXTS = ['.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg', '.woff2', '.ttf'];
const IGNORE_FILES = ['package-lock.json', 'context-builder.js', 'context.txt'];

function buildContext(dir) {
    let result = '';
    const files = fs.readdirSync(dir);

    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            if (!IGNORE_DIRS.includes(file)) {
                result += buildContext(fullPath);
            }
        } else {
            const ext = path.extname(file).toLowerCase();
            if (!IGNORE_EXTS.includes(ext) && !IGNORE_FILES.includes(file)) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    const lang = ext ? ext.substring(1) : 'text';
                    result += `${fullPath}\n\`\`\`${lang}\n${content}\n\`\`\`\n\n`;
                } catch (err) {
                    console.error(`Skipping ${fullPath} (unreadable or binary)`);
                }
            }
        }
    }
    return result;
}

const output = buildContext(__dirname);
fs.writeFileSync(path.join(__dirname, 'context.txt'), output, 'utf8');
console.log('Context successfully written to context.txt');