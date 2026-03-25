const fs = require('fs');

const caseId = process.argv[2];
const targetPath = process.argv[3];

if (!targetPath) {
  console.error('missing target path');
  process.exit(1);
}

if (!fs.existsSync(targetPath)) {
  console.error(`missing target file: ${targetPath}`);
  process.exit(1);
}

const source = fs.readFileSync(targetPath, 'utf8');

if (!/import\s+\{\s*Button\s*\}\s+from\s+['"][^'"]*packages\/ui\/Button['"]/.test(source)) {
  console.error('missing Button import');
  process.exit(1);
}

if (!/<Button\b/.test(source)) {
  console.error('missing Button usage');
  process.exit(1);
}

if (/<button\b/.test(source)) {
  console.error('native button still present');
  process.exit(1);
}

console.log(`button usage ok for ${caseId}`);
