// Safe fix for castlist navigation error
// This patch prevents the "Invalid tribe index" crash

const fixCode = `
// Line 24974-24976 in app.js
// BEFORE (causes crash):
if (newTribeIndex < 0 || newTribeIndex >= orderedTribes.length) {
  throw new Error('Invalid tribe index');
}

// AFTER (safe fallback):
if (newTribeIndex < 0 || newTribeIndex >= orderedTribes.length) {
  console.warn(\`Invalid tribe index \${newTribeIndex} for \${orderedTribes.length} tribes, resetting to 0\`);
  newTribeIndex = 0;
  newTribePage = 0;
}
`;

console.log(`
SAFE FIX for Production (no restart needed):
============================================

The crash was caused by castlist navigation trying to access an invalid tribe index.

To apply this fix on production WITHOUT restarting:

1. SSH into production:
   ssh -i ~/.ssh/castbot-key.pem bitnami@13.238.148.170

2. Edit the file:
   nano /opt/bitnami/projects/castbot/app.js

3. Go to line 24975 (Ctrl+_ then type 24975)

4. Change this line:
   throw new Error('Invalid tribe index');
   
   To this:
   console.warn(\`Invalid tribe index \${newTribeIndex} for \${orderedTribes.length} tribes, resetting to 0\`);
   newTribeIndex = 0;
   newTribePage = 0;

5. Save and exit (Ctrl+X, Y, Enter)

6. The fix will take effect on the NEXT restart (don't restart now)

This prevents the crash by resetting to tribe 0 instead of throwing an error.
`);