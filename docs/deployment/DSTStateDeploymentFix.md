# DST State Deployment Fix

## Problem
`dstState.json` is in `.gitignore` to keep DEV/PROD data separate, but this causes deployment failures when the file is missing or inaccessible during git operations.

## Solution Options

### Option 1: Check dstState.json into Git (Recommended)
```bash
# Remove from .gitignore
git rm --cached .gitignore
sed -i '/dstState\.json/d' .gitignore
git add .gitignore dstState.json
git commit -m "Track dstState.json - it's configuration not data"
```

**Pros:**
- Deployments always have the file
- No manual copying needed
- Version controlled configuration

**Cons:**
- DEV and PROD have same timezone states (probably fine - it's just config)

### Option 2: Create Deployment-Safe Loading

```javascript
// storage.js - Make loading more resilient
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function loadDSTState() {
  if (dstStateCache) return dstStateCache;

  // Try multiple paths in order
  const paths = [
    './dstState.json',                                    // Relative
    path.join(__dirname, 'dstState.json'),               // Script directory
    '/opt/bitnami/projects/castbot/dstState.json',       // Absolute prod
    '/home/reece/castbot/dstState.json',                 // Absolute dev
    './dstState.json.default'                            // Fallback default
  ];

  for (const filepath of paths) {
    try {
      const data = await fs.readFile(filepath, 'utf8');
      dstStateCache = JSON.parse(data);
      console.log(`✅ DST state loaded from ${filepath}:`, Object.keys(dstStateCache).length, 'timezones');
      return dstStateCache;
    } catch (error) {
      // Try next path
      continue;
    }
  }

  // If all paths fail, return hardcoded defaults
  console.error('⚠️ Using hardcoded DST defaults - no dstState.json found');
  return getHardcodedDSTDefaults();
}

function getHardcodedDSTDefaults() {
  return {
    "PT": {
      "displayName": "Pacific Time",
      "roleFormat": "PST / PDT",
      "standardOffset": -8,
      "dstOffset": -7,
      "currentOffset": -8,
      "isDST": false,
      "standardAbbrev": "PST",
      "dstAbbrev": "PDT",
      "dstObserved": true
    },
    // ... other timezones
  };
}
```

### Option 3: Deployment Script Enhancement

```bash
#!/bin/bash
# deploy-remote-wsl script enhancement

echo "📋 Checking for required files..."

# Save dstState.json before git operations
ssh bitnami@$SERVER "cp /opt/bitnami/projects/castbot/dstState.json /tmp/dstState.backup 2>/dev/null || true"

# Do git pull
ssh bitnami@$SERVER "cd /opt/bitnami/projects/castbot && git pull"

# Restore dstState.json after git operations
ssh bitnami@$SERVER "cp /tmp/dstState.backup /opt/bitnami/projects/castbot/dstState.json 2>/dev/null || true"

# Verify file exists
ssh bitnami@$SERVER "test -f /opt/bitnami/projects/castbot/dstState.json" || {
    echo "❌ ERROR: dstState.json missing after deployment!"
    echo "🔄 Attempting to restore from backup..."
    # Copy from a known good backup location
    ssh bitnami@$SERVER "cp /opt/bitnami/backups/dstState.json /opt/bitnami/projects/castbot/ 2>/dev/null" || {
        echo "❌ FATAL: No dstState.json backup available!"
        exit 1
    }
}

echo "✅ All required files present"
```

## Recommended Approach

**Short term (NOW):**
1. Add the null check to roleManager.js (prevents crashes)
2. Add absolute path fallback to loadDSTState()

**Medium term:**
1. Remove dstState.json from .gitignore
2. Check it into version control
3. It's configuration, not user data - should be versioned

**Long term:**
1. Move timezone configuration to environment variables or a config service
2. Separate configuration (what timezones exist) from state (current DST status)