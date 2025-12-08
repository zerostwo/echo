const { spawn } = require('child_process');
const syncConfig = require('./sync-config');

// 1. Sync config first
syncConfig();

console.log('> Building Next.js app...');

// Use shell: true with a single command string to avoid DeprecationWarning
const child = spawn('next build', {
  stdio: 'inherit',
  shell: true
});

child.on('close', (code) => {
  process.exit(code);
});
