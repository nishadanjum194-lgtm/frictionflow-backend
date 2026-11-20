const fs = require('node:fs');
const path = require('node:path');

const projectRoot = path.resolve(__dirname, '..');
const source = path.join(projectRoot, 'extension');
const output = path.join(projectRoot, 'dist', 'firefox-extension');

fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });
for (const name of fs.readdirSync(source)) {
  fs.cpSync(path.join(source, name), path.join(output, name), { recursive: true });
}

const manifestPath = path.join(output, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.background = { scripts: ['domain-utils.js', 'background.js'], persistent: false };
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

console.log('Firefox extension package created at ' + output);
