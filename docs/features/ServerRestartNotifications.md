# Server Restart Notification System

## Overview

The Server Restart Notification system provides automated Discord notifications when the CastBot development or production server restarts. It includes smart button detection, test result tracking, and visual feedback mechanisms to streamline the development workflow.

## 🎯 Purpose

- **Immediate Visibility**: Notifies developers when server restarts complete
- **Test Tracking**: Pass/Fail buttons provide feedback on deployment success
- **Smart Context**: Automatically detects changed features and provides relevant buttons
- **Audit Trail**: Logs test results for future analysis

## 📋 Components

### 1. Core Files

#### `/scripts/notify-restart.js`
The main notification script that sends restart messages to Discord.

**Key Functions**:
- `sendRestartNotification()` - Main entry point
- `analyzeChanges()` - Risk assessment based on changed files
- `generateTestSteps()` - Creates context-aware test instructions
- `generateAutoClaudeMessage()` - AI-friendly status messages
- `generateFileSummary()` - Summarizes changed files

**Configuration**:
```javascript
const GUILD_ID = '1331657596087566398';        // CastBot server
const CHANNEL_ID = '1337754151655833694';       // #💎deploy channel
const TIMEOUT_MS = 8000;                        // 8 second timeout
```

#### `/scripts/buttonDetection.js`
Smart button generation based on git changes.

**Key Function**:
- `generateDeploymentButtons()` - Analyzes changes and returns relevant buttons

**Button Priority**:
1. Safari-related changes → Safari button
2. Menu changes → Prod Menu button
3. Default → Standard menu buttons

#### `/app.js` (Lines 5792-5881)
Handles Pass/Fail button interactions.

**Handler Configuration**:
```javascript
} else if (custom_id === 'restart_status_passed' || custom_id === 'restart_status_failed') {
  return ButtonHandlerFactory.create({
    id: custom_id,
    updateMessage: true,  // Updates existing message
    handler: async (context) => {
      // Toggle button states and log test results
    }
  })(req, res, client);
}
```

### 2. Integration Scripts

#### `/scripts/dev/dev-restart.sh`
Development restart script that triggers notifications.

**Usage**:
```bash
./scripts/dev/dev-restart.sh [optional-commit-message]
```

**Process**:
1. Commits changes to git
2. Pushes to GitHub
3. Sends restart notification
4. Restarts CastBot
5. Reports status

## 🎨 Message Structure

### Discord Components V2 Format

The notification uses Discord's Components V2 architecture:

```javascript
{
  type: 17,                    // Container
  accent_color: 0xe74c3c,      // Red (dev) or 0x3498db (prod)
  components: [
    {
      type: 10,                // Text Display
      content: "message",      // Formatted restart details
      id: 2
    },
    {
      type: 14,                // Separator
      divider: true,
      spacing: 1,
      id: 3
    },
    {
      type: 1,                 // Action Row
      components: [buttons],   // Max 5 buttons
      id: 4
    }
  ]
}
```

### Message Content Sections

#### Header
```
> # `🖥️ DEVELOPMENT Server Restart!`
```

#### Sections
- **🕐 Time**: Local time of restart
- **💎 Change**: Git commit message
- **📁 Files Changed**: Modified files (max 5 shown)
- **🔴/🟡/🟢 Risk Level**: Based on file analysis
- **🧪 Test Steps**: Context-aware testing instructions
- **🤖 Claude Message**: AI-friendly status update

## 🔘 Button System

### Standard Buttons

| Button | Custom ID | Purpose | Style |
|--------|-----------|---------|-------|
| 🧪 #test | URL | Links to test channel | Link (5) |
| 📋 Prod Menu | `viral_menu` | Opens production menu | Secondary (2) |
| ✅ Pass | `restart_status_passed` | Mark test as passed | Secondary/Success (2/3) |
| ❌ Fail | `restart_status_failed` | Mark test as failed | Secondary/Danger (2/4) |

### Smart Context Buttons

Based on changed files, the second button may be:
- **🦁 Safari** (`prod_safari_menu`) - Safari system changes
- **📋 Castlist** (`show_castlist`) - Castlist changes
- **🏆 Cast Ranking** (`ranking_menu`) - Ranking system changes

### Button State Management

**Toggle Logic**:
- Clicking Pass → Pass button turns green, Fail turns grey
- Clicking Fail → Fail button turns red, Pass turns grey
- State persists in the message via UPDATE_MESSAGE

**Style Values**:
- `2` = Secondary (Grey) - Inactive state
- `3` = Success (Green) - Pass active
- `4` = Danger (Red) - Fail active

## 📊 Test Result Tracking

### Logging Format

When Pass/Fail buttons are clicked, the system logs:

```json
📊 TEST RESULT: {
  "result": "PASSED" | "FAILED",
  "timestamp": "2025-08-23T06:36:18.850Z",
  "messageId": "1408701025212301434",
  "userId": "391415444084490240",
  "change": "Add lightweight test result tracking"
}
```

### Implementation Details

**Location**: `app.js` lines 5811-5828

**Features**:
- Non-blocking (wrapped in try/catch)
- Extracts change description from message
- Console logging only (no file I/O)
- Zero performance impact

### Usage for AI Assistants

Future Claude iterations can:
1. Search logs for `📊 TEST RESULT:`
2. Analyze patterns in pass/fail results
3. Correlate failures with specific file changes
4. Learn from immediate user feedback

## 🚀 Deployment Workflow

### Development Environment

1. **Make code changes**
2. **Run restart script**:
   ```bash
   ./scripts/dev/dev-restart.sh "Fixed Safari button issue"
   ```
3. **Notification appears** in #💎deploy
4. **Test the changes**
5. **Click Pass/Fail** to record result

### Production Environment

Same process but uses:
```bash
npm run deploy-remote-wsl
```

**Visual Differences**:
- Blue accent color (instead of red)
- "PRODUCTION" label (instead of "DEVELOPMENT")

## 🔍 Risk Assessment

### File Risk Levels

The system analyzes changed files and assigns risk levels:

**High Risk** 🔴:
- `app.js` modifications
- Core system changes

**Medium Risk** 🟡:
- `safariManager.js` changes
- Feature module updates

**Low Risk** 🟢:
- Documentation changes
- Config file updates

### Warnings & Insights

**Example Output**:
```
## 🔴 Risk Level: HIGH
**⚠️ Warnings:**
• Core app.js modified - test all interactions

**💡 Insights:**
• Safari system changes - check player data
• Affects: Safari, Menu
```

## 🛠️ Configuration

### Environment Variables

- `PRODUCTION` - Set to 'TRUE' for production mode
- `APP_ID` - Discord application ID
- `BOT_TOKEN` - Discord bot token

### Customization Points

#### Modify Test Channel
In `notify-restart.js` line 304:
```javascript
url: `https://discord.com/channels/1331657596087566398/1396134920954450074`
```

#### Change Notification Channel
In `notify-restart.js` line 20:
```javascript
const CHANNEL_ID = '1337754151655833694';
```

#### Adjust Timeout
In `notify-restart.js` line 21:
```javascript
const TIMEOUT_MS = 8000; // milliseconds
```

## 🐛 Troubleshooting

### Common Issues

#### "This interaction failed" on Pass/Fail
- **Cause**: Container structure not preserved
- **Solution**: Ensure full Container returned in UPDATE_MESSAGE

#### Buttons not changing color
- **Cause**: Message components not found
- **Solution**: Check for Container wrapper (type 17) at components[0]

#### Notification not sent
- **Cause**: Discord API timeout
- **Solution**: Check network, verify bot token

### Debug Logging

Enable detailed logging by checking for:
```
🔍 START: restart_status_passed - user 391415444084490240
📊 TEST RESULT: {"result":"PASSED"...}
✅ SUCCESS: restart_status_passed - toggled to PASS
```

## 📈 Future Enhancements

### Potential Improvements

1. **Persistent Storage**: Save test results to `test-results.json`
2. **Analytics Dashboard**: Visualize pass/fail trends
3. **Auto-Rollback**: Trigger rollback on multiple failures
4. **Failure Details Modal**: Capture specific error information
5. **Team Notifications**: Mention specific users based on changed files

### Integration Opportunities

- **CI/CD Pipeline**: Integrate with GitHub Actions
- **Monitoring Systems**: Send metrics to monitoring platforms
- **Issue Tracking**: Auto-create issues for failed tests

## 📚 Related Documentation

- [Components V2 Issues](../troubleshooting/ComponentsV2Issues.md) - Container structure details
- [Button Handler Factory](../architecture/ButtonHandlerFactory.md) - Button implementation patterns
- [Dev Workflow](../workflow/DevWorkflow.md) - Development best practices

## 🔒 Security Considerations

- **No sensitive data** in notifications
- **User ID filtering** for analytics exclusions
- **Ephemeral messages** for admin interfaces
- **Git commit sanitization** before display

---

*Last Updated: August 2025*
*Version: 1.0.0*