const fs = require('fs');
const path = require('path');

const DIRS = [
    path.join(__dirname, 'webapp', 'handlers'),
    path.join(__dirname, 'webapp', 'helpers'),
    path.join(__dirname, 'webapp', 'services')
];

const replaceRules = [
    { from: /\boView\b/g, to: 'activeView' },
    { from: /\bsViewId\b/g, to: 'viewId' },
    { from: /\bfnGetText\b/g, to: 'getTextDelegate' },
    { from: /\bbIsFullScreen\b/g, to: 'isFullScreen' },
    { from: /\boRenderHandler\b/g, to: 'renderHandler' },
    { from: /\boFullScreenHandler\b/g, to: 'fullScreenHandler' },
    { from: /\boCanvasActionHandler\b/g, to: 'canvasActionHandler' },
    { from: /\boVideoRecordHandler\b/g, to: 'videoRecordHandler' },
    { from: /\baCoreHandlers\b/g, to: 'coreHandlers' },
    { from: /\boUiModel\b/g, to: 'uiModel' },
    { from: /\boDataModel\b/g, to: 'dataModel' },
    { from: /\bsEngine\b/g, to: 'engineId' },
    { from: /\boRouter\b/g, to: 'router' },
    { from: /\boHtmlControl\b/g, to: 'htmlControl' },
    { from: /\boConfig\b/g, to: 'config' }
];

function processFile(filePath) {
    if (!fs.existsSync(filePath)) return;
    let content = fs.readFileSync(filePath, 'utf8');
    let original = content;

    replaceRules.forEach(rule => {
        content = content.replace(rule.from, rule.to);
    });

    if (content !== original) {
        fs.writeFileSync(filePath, content, 'utf8');
        console.log(`Purged Hungarian Notation: ${filePath}`);
    }
}

function traverse(dir) {
    if (!fs.existsSync(dir)) return;
    const files = fs.readdirSync(dir);
    files.forEach(file => {
        const fullPath = path.join(dir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            traverse(fullPath);
        } else if (fullPath.endsWith('.ts')) {
            processFile(fullPath);
        }
    });
}

console.log("Purging Global Hungarian Notation...");
DIRS.forEach(dir => traverse(dir));
// Also hit specific controllers
processFile(path.join(__dirname, 'webapp', 'controller', 'Diagram.controller.ts'));
processFile(path.join(__dirname, 'webapp', 'controller', 'Selection.controller.ts'));
processFile(path.join(__dirname, 'webapp', 'controller', 'SettingsDialog.controller.ts'));
console.log("Purge Complete.");
