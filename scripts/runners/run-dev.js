const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const syncConfig = require('./sync-config');

// 1. Sync config first
syncConfig();

const rootConfigPath = path.join(__dirname, '../../echo.config.json');

try {
  const content = fs.readFileSync(rootConfigPath, 'utf8');
  const config = JSON.parse(content);
  
  const port = config.server?.ports?.dev || 3000;

  console.log(`> Starting dev server on port ${port} (read from echo.config.json)`);

  // Use shell: true with a single command string to avoid DeprecationWarning
  const child = spawn(`next dev -p ${port}`, {
    stdio: 'inherit',
    shell: true
  });

  child.on('close', (code) => {
    process.exit(code);
  });
} catch (error) {
  console.error('Failed to read site config:', error);
  process.exit(1);
}
