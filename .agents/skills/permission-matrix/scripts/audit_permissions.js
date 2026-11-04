const fs = require('fs');
const path = require('path');

// Re-export or invoke root audit script
const rootAudit = path.resolve(__dirname, '../../../../scripts/audit_permissions.js');
if (fs.existsSync(rootAudit)) {
  require(rootAudit);
} else {
  console.error('Audit script not found at:', rootAudit);
  process.exit(1);
}
