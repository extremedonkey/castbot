# Safari Initialization System Guide

This guide explains the comprehensive Safari initialization system for CastBot production servers.

## Overview

The Safari initialization system ensures that all production servers have the proper Safari data structure without data loss. It provides:

- 🔄 **Automatic initialization** when Safari functions are first called
- 🛡️ **Safe migration** of existing partial Safari data
- 🔧 **Manual repair tools** for corrupted data structures
- 📊 **Import/Export compatibility** verification
- 🚀 **Production-ready deployment scripts**

## Data Structure

The initialization system creates this complete Safari data structure for each guild:

```json
{
  "guildId": {
    "buttons": {},
    "safaris": {},
    "applications": {},
    "stores": {},
    "items": {},
    "safariConfig": {
      "currencyName": "coins",
      "inventoryName": "Inventory",
      "currencyEmoji": "🪙",
      "goodEventName": "Good Event",
      "badEventName": "Bad Event",
      "goodEventEmoji": "✅",
      "badEventEmoji": "❌",
      "round1GoodProbability": 70,
      "round2GoodProbability": 50,
      "round3GoodProbability": 30,
      "currentRound": 1,
      "lastRoundTimestamp": null
    },
    "roundHistory": [],
    "attackQueue": {},
    "metadata": {
      "createdAt": 1751207200000,
      "lastModified": 1751207200000,
      "version": "MVP2",
      "initializedBy": "safariInitialization.js"
    }
  }
}
```

## Production Deployment

### Method 1: Automatic Initialization Script (Recommended)

Use the production initialization script for safe, automated deployment:

```bash
# Navigate to CastBot directory
cd /path/to/castbot

# Initialize all production guilds (dry run first)
node scripts/initializeSafariProduction.js --dry-run

# Initialize all production guilds (actual deployment)
node scripts/initializeSafariProduction.js

# Initialize specific guild
node scripts/initializeSafariProduction.js --guild-id 1234567890

# Initialize with custom configuration
node scripts/initializeSafariProduction.js --custom-config '{"currencyName":"gems","currencyEmoji":"💎"}'

# Force repair corrupted data
node scripts/initializeSafariProduction.js --guild-id 1234567890 --force-repair

# Enable verbose logging
node scripts/initializeSafariProduction.js --verbose
```

#### Script Features:

- ✅ **Dry-run mode** for safe preview
- 🔄 **Automatic backup** creation before changes
- 📊 **Comprehensive logging** with timestamps
- ⚠️ **Error handling** with graceful fallbacks
- 🔧 **Force repair** option for corrupted data
- 🎛️ **Custom configuration** support

### Method 2: Programmatic Integration

The Safari system now automatically initializes when Safari functions are first called:

```javascript
import { initializeGuildSafariData } from './safariInitialization.js';

// Manual initialization
const safariData = await initializeGuildSafariData(guildId, customConfig);

// Check status
import { checkSafariInitializationStatus } from './safariInitialization.js';
const status = await checkSafariInitializationStatus(guildId);
```

### Method 3: Integration Points

The system automatically initializes Safari data when:

1. **First Safari button created** - `createCustomButton()` function
2. **First store accessed** - Store management functions
3. **First inventory operation** - Inventory display functions
4. **First configuration access** - Safari config functions

## Validation and Status Checking

### Check Initialization Status

```javascript
import { checkSafariInitializationStatus } from './safariInitialization.js';

const status = await checkSafariInitializationStatus(guildId);
console.log(status);
```

Status responses:

```javascript
// Not initialized
{
  initialized: false,
  status: 'not_initialized',
  message: 'Guild has no Safari data structure'
}

// Partially initialized (missing structures)
{
  initialized: false,
  status: 'partial_initialization',
  message: 'Missing structures: stores, items',
  missingStructures: ['stores', 'items']
}

// Incomplete configuration
{
  initialized: false,
  status: 'incomplete_config',
  message: 'Missing config fields: currencyEmoji, inventoryName',
  missingConfigFields: ['currencyEmoji', 'inventoryName']
}

// Fully initialized
{
  initialized: true,
  status: 'fully_initialized',
  message: 'Guild Safari data is fully initialized',
  metadata: { ... },
  config: { ... }
}
```

## Error Recovery and Repair

### Emergency Repair Function

For corrupted Safari data structures:

```bash
# Repair specific guild
node scripts/initializeSafariProduction.js --guild-id 1234567890 --force-repair
```

Or programmatically:

```javascript
import { repairSafariData } from './safariInitialization.js';

// Auto-repair with defaults
const repairLog = await repairSafariData(guildId);

// Repair with backup data
const repairLog = await repairSafariData(guildId, backupData);
```

### Import/Export Compatibility

Ensure all guilds are compatible with the Import/Export system:

```bash
# Check compatibility
node scripts/initializeSafariProduction.js
```

This automatically runs compatibility checks and updates metadata structures.

## Custom Configuration

### Default Configuration

```javascript
const DEFAULT_SAFARI_CONFIG = {
    currencyName: "coins",
    inventoryName: "Inventory", 
    currencyEmoji: "🪙",
    goodEventName: "Good Event",
    badEventName: "Bad Event", 
    goodEventEmoji: "✅",
    badEventEmoji: "❌",
    round1GoodProbability: 70,
    round2GoodProbability: 50,
    round3GoodProbability: 30,
    currentRound: 1,
    lastRoundTimestamp: null
};
```

### Tycoons Game Configuration

For Tycoons-specific servers:

```javascript
const tyconsConfig = {
    currencyName: "Eggs",
    inventoryName: "Dinosaur Pen",
    currencyEmoji: "🥚",
    goodEventName: "Clear Skies",
    badEventName: "Asteroid Strike",
    goodEventEmoji: "☀️",
    badEventEmoji: "☄️",
    round1GoodProbability: 66,
    round2GoodProbability: 33,
    round3GoodProbability: 11
};
```

Apply with:

```bash
node scripts/initializeSafariProduction.js --custom-config '{"currencyName":"Eggs","inventoryName":"Dinosaur Pen","currencyEmoji":"🥚"}'
```

## Safety Features

### Data Protection

1. **Automatic backups** before any changes
2. **Dry-run mode** for preview without modification
3. **Fallback initialization** if automatic fails
4. **Validation checks** for data integrity
5. **Error recovery** with comprehensive logging

### Production Safety

1. **Non-destructive** - Only adds missing structures
2. **Idempotent** - Safe to run multiple times
3. **Rollback capability** through backup system
4. **Comprehensive logging** for audit trails
5. **Permission checks** for admin operations

## Monitoring and Logging

### Log Formats

```
[2025-06-29T12:00:00.000Z] [INFO] 🔍 Checking initialization status for guild: 1234567890
[2025-06-29T12:00:00.100Z] [INFO] 📊 Current status: fully_initialized - Guild Safari data is fully initialized
[2025-06-29T12:00:00.200Z] [INFO] ✅ Safari initialization completed successfully
```

### Debug Mode

Enable verbose logging with `--verbose` flag:

```bash
node scripts/initializeSafariProduction.js --verbose
```

Provides detailed information about:
- Structure validation results
- Configuration updates applied
- Metadata changes made
- Error recovery actions taken

## Troubleshooting

### Common Issues

1. **"Guild has no Safari data structure"**
   - **Solution**: Run initialization script
   - **Command**: `node scripts/initializeSafariProduction.js --guild-id [ID]`

2. **"Missing structures"**
   - **Solution**: Validate and update existing structure
   - **Command**: `node scripts/initializeSafariProduction.js --guild-id [ID]`

3. **"Safari initialization failed"**
   - **Solution**: Force repair with fallback
   - **Command**: `node scripts/initializeSafariProduction.js --guild-id [ID] --force-repair`

4. **"Import/Export compatibility issues"**
   - **Solution**: Run compatibility check
   - **Command**: Initialization script automatically handles this

### Manual Recovery

If automatic systems fail, manually edit `safariContent.json`:

1. **Backup current file**: `cp safariContent.json safariContent.backup.json`
2. **Add guild structure** following the template above
3. **Validate JSON syntax** with a JSON validator
4. **Restart CastBot** to reload configuration

## File Locations

- **Initialization Module**: `/safariInitialization.js`
- **Production Script**: `/scripts/initializeSafariProduction.js`
- **Data File**: `/safariContent.json`
- **Backup Location**: `safariContent.json` (timestamped backup keys)

## Integration with Existing Systems

### Safari Manager Integration

The `safariManager.js` module now automatically initializes guilds:

```javascript
// Before any Safari operation
safariData = await ensureGuildSafariData(guildId, safariData);
```

### Import/Export Compatibility

The initialization system ensures compatibility with:

- `safariImportExport.js` export functions
- Store and item metadata requirements
- Configuration field validation
- JSON structure consistency

### Storage Integration

Compatible with existing `storage.js` patterns:

- Uses same error handling approaches
- Follows existing backup strategies
- Maintains data consistency patterns
- Preserves guild structure conventions

## Best Practices

### Development

1. **Always use dry-run** for testing changes
2. **Test with single guild** before batch operations
3. **Enable verbose logging** during development
4. **Validate configuration** before deployment

### Production

1. **Schedule during low-traffic periods**
2. **Monitor logs** during and after deployment
3. **Keep backups** for rollback capability
4. **Test Safari functions** after initialization
5. **Document custom configurations** applied

### Monitoring

1. **Regular status checks** for all production guilds
2. **Error log monitoring** for initialization failures
3. **Performance monitoring** for large batch operations
4. **Backup verification** and retention policies

## Migration from Legacy Systems

If migrating from systems without Safari data:

1. **Inventory existing guilds**: Get list from `playerData.json`
2. **Plan custom configurations**: Determine per-guild settings
3. **Run dry-run deployment**: Preview all changes
4. **Execute batch initialization**: Initialize all guilds
5. **Verify functionality**: Test Safari features
6. **Monitor for issues**: Watch logs for errors

This comprehensive initialization system ensures safe, reliable Safari data structure deployment across all production servers while maintaining full compatibility with existing Import/Export and storage systems.