import { rm, readdir } from 'fs/promises';
import { join } from 'path';
import { homedir, platform } from 'os';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'fs';

const TARGET_EXTENSIONS = [
  'google.geminicodeassist',
  'googlecloudtools.cloudcode'
];

const getCodeBaseDir = () => {
  const home = homedir();
  if (platform() === 'win32') return join(process.env.APPDATA || '', 'Code', 'User');
  if (platform() === 'darwin') return join(home, 'Library', 'Application Support', 'Code', 'User');
  return join(home, '.config', 'Code', 'User');
};

const scrubDatabase = (dbPath) => {
  if (!existsSync(dbPath)) return;
  
  try {
    const db = new DatabaseSync(dbPath);
    const query = db.prepare(`
      DELETE FROM ItemTable 
      WHERE key LIKE '%geminicode%' 
         OR key LIKE '%cloudcode%' 
         OR key LIKE '%google.gemini%'
    `);
    
    const result = query.run();
    db.close();
    
    if (result.changes > 0) {
      console.log(`💀 Scrubbed ${result.changes} embedded context rows from: ${dbPath}`);
    }
  } catch (err) {
    if (err.message.includes('SQLITE_BUSY')) {
      console.error(`\n❌ DATABASE LOCKED: ${dbPath}`);
      console.error(`❌ CLOSE VS CODE COMPLETELY AND TRY AGAIN.\n`);
    } else if (!err.message.includes('no such table')) {
      console.error(`⚠️ Error reading DB ${dbPath}: ${err.message}`);
    }
  }
};

const nukeEverything = async () => {
  const baseDir = getCodeBaseDir();
  if (!baseDir) {
    console.error('❌ Could not determine VSCode directory for your OS.');
    return;
  }

  const globalStorageDir = join(baseDir, 'globalStorage');
  const workspaceStorageDir = join(baseDir, 'workspaceStorage');

  console.log(`\n🔥 Commencing orbital strike on ALL Gemini VSCode context...\n`);

  // 1. Scrub the Global Database
  const globalDbPath = join(globalStorageDir, 'state.vscdb');
  scrubDatabase(globalDbPath);

  // 2. Wipe Global Storage Folders
  for (const ext of TARGET_EXTENSIONS) {
    const targetPath = join(globalStorageDir, ext);
    try {
      await rm(targetPath, { recursive: true, force: true });
      console.log(`🗑️  Deleted physical global files: ${targetPath}`);
    } catch (err) {}
  }

  // 3. Scrub Every Single Workspace Database & Folder
  try {
    const workspaces = await readdir(workspaceStorageDir);
    for (const workspace of workspaces) {
      const workspaceDir = join(workspaceStorageDir, workspace);
      
      // Scrub the workspace DB
      const workspaceDbPath = join(workspaceDir, 'state.vscdb');
      scrubDatabase(workspaceDbPath);

      // Wipe physical workspace folders
      for (const ext of TARGET_EXTENSIONS) {
        const targetPath = join(workspaceDir, ext);
        try {
          await rm(targetPath, { recursive: true, force: true });
        } catch (err) {}
      }
    }
  } catch (err) {
    console.error(`⚠️ Could not read workspace storage: ${err.message}`);
  }

  console.log(`\n✅ Gemini context has been violently excised from your machine.`);
  console.log(`You can now boot VS Code back up.`);
};

nukeEverything();