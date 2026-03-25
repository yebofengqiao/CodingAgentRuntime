const fs = require('fs');
const caseId = process.argv[2];
const path = '.evaluation/mock-result.json';
if (!fs.existsSync(path)) { console.error('missing mock result'); process.exit(1); }
const payload = JSON.parse(fs.readFileSync(path, 'utf8'));
if (payload.case_id !== caseId) { console.error(`case mismatch: ${payload.case_id}`); process.exit(1); }
console.log(`mock build passed for ${caseId}`);
