# CastBot Analytics & Logging System

## Overview

CastBot includes a comprehensive analytics and logging system that tracks user interactions, server usage, and provides insights into how the bot is being used across Discord servers.

## System Components

### 1. Analytics Logger (`analyticsLogger.js`)
The core module that handles all interaction logging with the following features:
- Tracks every user interaction (commands, buttons, selects, modals)
- Stores logs in structured format for analysis
- Supports live Discord posting for real-time monitoring
- Maintains user exclusion lists for filtering admin activity

### 2. Server Usage Analytics (`serverUsageAnalytics.js`)
Provides server-by-server usage analysis with:
- 7-day activity analysis
- Server ranking by interaction count
- User engagement metrics
- Command vs button usage ratios
- Rich Discord embed formatting for results

### 3. Live Discord Logging
Real-time posting of analytics events to a Discord channel (#logs):
- Channel ID: 1385059476243218552
- Markdown formatted messages
- Rate limited to prevent spam (1.2 second delay)
- Non-blocking error handling

## Implementation Details

### Log Format
```
[timestamp] guildName (guildId) | userName (userId) | interactionType | customId
```

Example:
```
[11:19AM] Fri 27 Dec 24 | CastBot Testing | reecepbcups (391415444084490240) | BUTTON | prod_menu
```

### Interaction Types Tracked
- `COMMAND` - Slash command executions
- `BUTTON` - Button clicks
- `SELECT` - Select menu interactions
- `MODAL` - Modal form submissions

### Data Storage
- Logs stored in `/logs/user-analytics.log`
- Rotating log files to manage disk space
- Text-based format for easy parsing and analysis

## Configuration

### Environment Configuration
Stored in `playerData.json` under `environmentConfig.liveDiscordLogging`:
```json
{
  "environmentConfig": {
    "liveDiscordLogging": {
      "enabled": true,
      "channelId": "1385059476243218552",
      "excludedUsers": ["391415444084490240"]
    }
  }
}
```

### Command-Line Management
Use the `toggle-live-logging.js` script:
```bash
node toggle-live-logging.js on        # Enable live logging
node toggle-live-logging.js off       # Disable live logging
node toggle-live-logging.js exclude <discordId>  # Toggle user exclusion
```

## Usage

### Viewing Server Stats
1. Access via Production Menu → Reece Stuff → Server Usage Stats
2. Restricted to specific user IDs for security
3. Displays top 10 servers with detailed metrics

### Analytics Output Features
- **Top Server Rankings**: Medal emojis (🥇🥈🥉) for top 3
- **Interaction Breakdown**: Commands vs buttons percentages
- **User Engagement**: Unique user counts per server
- **Smart Insights**: Identifies usage patterns

### Example Output
```
🥇 **Reality Lounge** (973372584331358308)
   📊 Total: 1,234 | 👥 Users: 45
   ⚡ Commands: 523 (42%) | 🔘 Buttons: 711 (58%)
   💡 Button-heavy server with high engagement
```

## Integration Points

### Adding Analytics to New Features
```javascript
// Import the logger
const { logInteraction } = require('./analyticsLogger.js');

// Log interactions
await logInteraction(guildId, userId, 'BUTTON', 'my_new_button');
```

### Excluding Admin Actions
Admin user IDs can be excluded from logs to focus on real user activity:
- Use the exclude command to toggle users
- Excluded users' interactions won't appear in logs or Discord

## Performance Considerations

- **Async Logging**: All logging is asynchronous to prevent blocking
- **Error Isolation**: Logging errors don't affect main bot functionality
- **Rate Limiting**: Discord posts are queued with 1.2s delays
- **File I/O**: Append-only operations for efficiency

## Security & Privacy

- No message content is logged
- Only interaction metadata is stored
- User IDs are included but can be excluded
- Guild-specific data stays within guild context

## Future Enhancements

### Phase 2: Visual Analytics
- Chart generation for usage trends
- Time-based activity heatmaps
- User journey visualization
- Export capabilities for external analysis

### Phase 3: Advanced Analytics
- Predictive analytics for server growth
- Feature adoption tracking
- A/B testing framework
- Custom analytics dashboards

## Troubleshooting

### Common Issues
1. **Logs not appearing**: Check if live logging is enabled
2. **Missing interactions**: Verify user isn't excluded
3. **Permission errors**: Ensure bot has file write permissions
4. **Discord rate limits**: Check for rate limit messages in console

### Debug Mode
Enable debug logging in analyticsLogger.js:
```javascript
const DEBUG = true; // Set to true for verbose logging
```

## Maintenance

### Log Rotation
- Logs should be rotated periodically to manage disk space
- Archive old logs before deletion for historical analysis
- Consider implementing automatic rotation based on file size

### Data Retention
- Current: Unlimited retention
- Recommended: 90-day rolling window
- Archive important metrics separately