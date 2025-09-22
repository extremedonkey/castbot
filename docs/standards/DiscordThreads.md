# Discord Thread Management

## Overview

Threads are **planned future features** for CastBot, already outlined in `discordMessenger.js` as "FUTURE FEATURE". Understanding Discord's thread system is essential for implementing application discussion threads, Safari event threads, and voting discussion threads.

While not currently implemented, thread support will enhance CastBot's organizational capabilities and user experience for complex discussions.

**Source**: [Discord Developer Documentation - Threads](https://discord.com/developers/docs/topics/threads)

## 🚨 CRITICAL: CastBot Thread Vision

### Planned Thread Features (from discordMessenger.js)

1. **Application Discussion Threads**: Dedicated spaces for cast application discussions
2. **Safari Event Threads**: Round-by-round Safari discussion and analysis
3. **Voting Discussion Threads**: Organized voting and elimination discussions
4. **Administrative Threads**: Private staff coordination spaces

```javascript
// From discordMessenger.js - FUTURE FEATURE comment block
/**
 * FUTURE FEATURE: Thread Support
 * - createThread(channelId, name, message)
 * - replyInThread(threadId, message)
 * - archiveThread(threadId)
 * - Application discussion threads
 * - Safari event threads
 * - Voting discussion threads
 */
```

## Thread Fundamentals

### Thread Types in Discord

| Type | Value | Description | CastBot Usage Plan |
|------|-------|-------------|-------------------|
| **GUILD_PUBLIC_THREAD** | 11 | Public thread in text channel | ✅ Safari discussions, voting |
| **GUILD_PRIVATE_THREAD** | 12 | Private thread (invite only) | ✅ Staff coordination |
| **GUILD_NEWS_THREAD** | 10 | Thread in announcement channel | ⚪ Future consideration |

### Thread Properties

```javascript
// Discord thread object structure
{
  id: "snowflake",                    // Thread ID
  type: 11,                          // Thread type
  guild_id: "snowflake",             // Guild ID
  parent_id: "snowflake",            // Parent channel ID
  name: "string",                    // Thread name
  message_count: 0,                  // Approximate message count
  member_count: 0,                   // Approximate member count
  rate_limit_per_user: 0,            // Slowmode delay
  thread_metadata: {
    archived: false,                 // Whether thread is archived
    auto_archive_duration: 60,       // Auto archive after (minutes)
    archive_timestamp: "ISO8601",    // When archived
    locked: false,                   // Whether thread is locked
    invitable: true,                 // Whether non-moderators can invite others
    create_timestamp: "ISO8601"      // When thread was created
  },
  member: {                          // Current user's thread member object
    id: "snowflake",
    user_id: "snowflake",
    join_timestamp: "ISO8601",
    flags: 0
  }
}
```

## CastBot Thread Implementation Plan

### Core Thread Management System

```javascript
// CastBot thread management framework (planned implementation)
export class CastBotThreadManager {
  constructor() {
    this.activeThreads = new Map();
    this.threadTemplates = new Map();
    this.threadPolicies = new Map();
  }

  // Initialize thread templates for different use cases
  initializeThreadTemplates() {
    // Application discussion thread template
    this.threadTemplates.set('application', {
      namePattern: 'Application: {applicantName}',
      autoArchiveDuration: 4320, // 3 days
      slowmodeDelay: 5, // 5 seconds
      permissions: {
        applicant: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY'],
        staff: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'MANAGE_THREADS', 'MANAGE_MESSAGES'],
        public: [] // Private thread
      }
    });

    // Safari event thread template
    this.threadTemplates.set('safari', {
      namePattern: 'Safari Round {round} Discussion',
      autoArchiveDuration: 1440, // 1 day
      slowmodeDelay: 10, // 10 seconds
      permissions: {
        participants: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY'],
        public: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY']
      }
    });

    // Voting discussion thread template
    this.threadTemplates.set('voting', {
      namePattern: 'Voting: {votingTopic}',
      autoArchiveDuration: 1440, // 1 day
      slowmodeDelay: 30, // 30 seconds for thoughtful discussion
      permissions: {
        voters: ['VIEW_CHANNEL', 'SEND_MESSAGES', 'READ_MESSAGE_HISTORY'],
        observers: ['VIEW_CHANNEL', 'READ_MESSAGE_HISTORY']
      }
    });

    console.log('✅ Thread templates initialized');
  }

  // Create thread with CastBot standards
  async createCastBotThread(channelId, type, context = {}) {
    try {
      const template = this.threadTemplates.get(type);
      if (!template) {
        throw new Error(`Unknown thread type: ${type}`);
      }

      // Generate thread name from template
      const threadName = this.generateThreadName(template.namePattern, context);

      // Create thread
      const thread = await this.createThread(channelId, {
        name: threadName,
        auto_archive_duration: template.autoArchiveDuration,
        rate_limit_per_user: template.slowmodeDelay,
        type: template.permissions.public.length > 0 ? 11 : 12 // Public or private
      });

      // Store thread info
      this.activeThreads.set(thread.id, {
        type,
        template,
        context,
        createdAt: Date.now(),
        parentChannelId: channelId
      });

      // Apply permissions if private thread
      if (template.permissions.public.length === 0) {
        await this.applyThreadPermissions(thread.id, template.permissions, context);
      }

      console.log(`✅ Created ${type} thread: ${threadName} (${thread.id})`);
      return thread;
    } catch (error) {
      console.error(`Failed to create ${type} thread:`, error);
      throw error;
    }
  }

  // Generate thread name from pattern and context
  generateThreadName(pattern, context) {
    return pattern.replace(/\{(\w+)\}/g, (match, key) => {
      return context[key] || match;
    });
  }

  // Low-level thread creation
  async createThread(channelId, options) {
    const response = await fetch(`https://discord.com/api/v10/channels/${channelId}/threads`, {
      method: 'POST',
      headers: {
        'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: options.name,
        auto_archive_duration: options.auto_archive_duration || 1440,
        type: options.type || 11, // Public thread
        rate_limit_per_user: options.rate_limit_per_user || 0
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }

    return await response.json();
  }

  // Apply permissions to private thread
  async applyThreadPermissions(threadId, permissions, context) {
    // Add specific users to private thread
    for (const [role, perms] of Object.entries(permissions)) {
      if (role === 'public') continue;

      const userIds = this.resolveUsersForRole(role, context);
      for (const userId of userIds) {
        await this.addThreadMember(threadId, userId);
      }
    }
  }

  // Resolve user IDs based on role and context
  resolveUsersForRole(role, context) {
    switch (role) {
      case 'applicant':
        return context.applicantId ? [context.applicantId] : [];
      case 'staff':
        return context.staffIds || [];
      case 'participants':
        return context.participantIds || [];
      case 'voters':
        return context.voterIds || [];
      default:
        return [];
    }
  }

  // Add member to thread
  async addThreadMember(threadId, userId) {
    try {
      await fetch(`https://discord.com/api/v10/channels/${threadId}/thread-members/${userId}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
        }
      });

      console.log(`✅ Added user ${userId} to thread ${threadId}`);
    } catch (error) {
      console.error(`Failed to add user ${userId} to thread ${threadId}:`, error);
    }
  }

  // Remove member from thread
  async removeThreadMember(threadId, userId) {
    try {
      await fetch(`https://discord.com/api/v10/channels/${threadId}/thread-members/${userId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
        }
      });

      console.log(`✅ Removed user ${userId} from thread ${threadId}`);
    } catch (error) {
      console.error(`Failed to remove user ${userId} from thread ${threadId}:`, error);
    }
  }
}

// Global thread manager (for future implementation)
export const threadManager = new CastBotThreadManager();
```

### Application Discussion Threads

```javascript
// CastBot application thread implementation
export async function createApplicationThread(channelId, applicantId, applicationData) {
  try {
    const context = {
      applicantName: applicationData.applicantName,
      applicantId: applicantId,
      staffIds: applicationData.reviewerIds || [],
      season: applicationData.season
    };

    const thread = await threadManager.createCastBotThread(channelId, 'application', context);

    // Send initial message to thread
    const welcomeMessage = createCastBotMessage(
      `## 🎭 Application Discussion\n\n` +
      `**Applicant**: <@${applicantId}>\n` +
      `**Season**: ${applicationData.season}\n\n` +
      `This is a private discussion space for this application. ` +
      `Please keep all discussion respectful and constructive.`,
      {
        accentColor: 0x9b59b6,
        components: [{
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              custom_id: `app_view_${applicationData.id}`,
              label: "View Application",
              style: 2,
              emoji: { name: "📋" }
            },
            {
              type: 2, // Button
              custom_id: `app_schedule_interview_${applicationData.id}`,
              label: "Schedule Interview",
              style: 1,
              emoji: { name: "📅" }
            }
          ]
        }]
      }
    );

    await sendToChannel(thread.id, welcomeMessage);

    return thread;
  } catch (error) {
    console.error('Failed to create application thread:', error);
    throw error;
  }
}
```

### Safari Event Threads

```javascript
// CastBot Safari thread implementation
export async function createSafariEventThread(channelId, roundData) {
  try {
    const context = {
      round: roundData.round,
      participantIds: roundData.participantIds || [],
      eventType: roundData.eventType || 'general'
    };

    const thread = await threadManager.createCastBotThread(channelId, 'safari', context);

    // Send initial Safari message
    const safariMessage = createCastBotMessage(
      `## 🦁 Safari Round ${roundData.round} Discussion\n\n` +
      `**Event**: ${roundData.eventType}\n` +
      `**Participants**: ${roundData.participantIds.length} players\n\n` +
      `Discuss the round results, strategies, and analysis here!`,
      {
        accentColor: 0xf39c12,
        components: [{
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              custom_id: `safari_results_${roundData.round}`,
              label: "View Results",
              style: 1,
              emoji: { name: "📊" }
            },
            {
              type: 2, // Button
              custom_id: `safari_leaderboard_${roundData.round}`,
              label: "Leaderboard",
              style: 2,
              emoji: { name: "🏆" }
            }
          ]
        }]
      }
    );

    await sendToChannel(thread.id, safariMessage);

    return thread;
  } catch (error) {
    console.error('Failed to create Safari event thread:', error);
    throw error;
  }
}
```

### Voting Discussion Threads

```javascript
// CastBot voting thread implementation
export async function createVotingThread(channelId, votingData) {
  try {
    const context = {
      votingTopic: votingData.topic,
      voterIds: votingData.eligibleVoters || [],
      deadline: votingData.deadline
    };

    const thread = await threadManager.createCastBotThread(channelId, 'voting', context);

    // Send voting information
    const votingMessage = createCastBotMessage(
      `## 🗳️ Voting Discussion: ${votingData.topic}\n\n` +
      `**Deadline**: <t:${Math.floor(votingData.deadline / 1000)}:R>\n` +
      `**Eligible Voters**: ${votingData.eligibleVoters.length} members\n\n` +
      `Use this thread to discuss the voting topic. Remember to keep discussions respectful!`,
      {
        accentColor: 0x3498db,
        components: [{
          type: 1, // Action Row
          components: [
            {
              type: 2, // Button
              custom_id: `vote_cast_${votingData.id}`,
              label: "Cast Vote",
              style: 1,
              emoji: { name: "🗳️" }
            },
            {
              type: 2, // Button
              custom_id: `vote_results_${votingData.id}`,
              label: "View Results",
              style: 2,
              emoji: { name: "📊" }
            }
          ]
        }]
      }
    );

    await sendToChannel(thread.id, votingMessage);

    return thread;
  } catch (error) {
    console.error('Failed to create voting thread:', error);
    throw error;
  }
}
```

## Thread Lifecycle Management

### Thread Archiving and Cleanup

```javascript
// CastBot thread lifecycle management
export class ThreadLifecycleManager {
  constructor() {
    this.archiveScheduler = new Map();
  }

  // Schedule thread archiving
  scheduleThreadArchive(threadId, delay) {
    // Clear existing schedule
    if (this.archiveScheduler.has(threadId)) {
      clearTimeout(this.archiveScheduler.get(threadId));
    }

    // Schedule new archive
    const timer = setTimeout(async () => {
      try {
        await this.archiveThread(threadId);
      } catch (error) {
        console.error(`Failed to archive thread ${threadId}:`, error);
      } finally {
        this.archiveScheduler.delete(threadId);
      }
    }, delay);

    this.archiveScheduler.set(threadId, timer);
  }

  // Archive thread manually
  async archiveThread(threadId) {
    try {
      await fetch(`https://discord.com/api/v10/channels/${threadId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          archived: true
        })
      });

      console.log(`✅ Archived thread ${threadId}`);

      // Remove from active threads
      threadManager.activeThreads.delete(threadId);
    } catch (error) {
      console.error(`Failed to archive thread ${threadId}:`, error);
      throw error;
    }
  }

  // Unarchive thread
  async unarchiveThread(threadId) {
    try {
      await fetch(`https://discord.com/api/v10/channels/${threadId}`, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          archived: false
        })
      });

      console.log(`✅ Unarchived thread ${threadId}`);
    } catch (error) {
      console.error(`Failed to unarchive thread ${threadId}:`, error);
      throw error;
    }
  }

  // Clean up old archived threads
  async cleanupOldThreads(parentChannelId, maxAge = 30 * 24 * 60 * 60 * 1000) { // 30 days
    try {
      // Get archived threads
      const response = await fetch(
        `https://discord.com/api/v10/channels/${parentChannelId}/threads/archived/public`,
        {
          headers: {
            'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
          }
        }
      );

      const { threads } = await response.json();
      const oldThreads = threads.filter(thread => {
        const archiveTime = new Date(thread.thread_metadata.archive_timestamp).getTime();
        return Date.now() - archiveTime > maxAge;
      });

      console.log(`🧹 Found ${oldThreads.length} old threads to clean up`);

      // Delete old threads (if permissions allow)
      for (const thread of oldThreads) {
        try {
          await this.deleteThread(thread.id);
          await sleep(1000); // Rate limit protection
        } catch (error) {
          console.error(`Failed to delete old thread ${thread.id}:`, error);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old threads:', error);
    }
  }

  // Delete thread permanently
  async deleteThread(threadId) {
    try {
      await fetch(`https://discord.com/api/v10/channels/${threadId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
        }
      });

      console.log(`🗑️ Deleted thread ${threadId}`);
    } catch (error) {
      console.error(`Failed to delete thread ${threadId}:`, error);
      throw error;
    }
  }
}

// Global lifecycle manager
export const threadLifecycle = new ThreadLifecycleManager();
```

## Thread Member Management

### Thread Membership Operations

```javascript
// CastBot thread member management
export class ThreadMemberManager {
  // Get thread members
  async getThreadMembers(threadId) {
    try {
      const response = await fetch(`https://discord.com/api/v10/channels/${threadId}/thread-members`, {
        headers: {
          'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${await response.text()}`);
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to get thread members for ${threadId}:`, error);
      throw error;
    }
  }

  // Bulk add members to thread
  async bulkAddThreadMembers(threadId, userIds) {
    const results = [];

    for (const userId of userIds) {
      try {
        await threadManager.addThreadMember(threadId, userId);
        results.push({ userId, success: true });
        await sleep(200); // Rate limit protection
      } catch (error) {
        results.push({ userId, success: false, error: error.message });
      }
    }

    return results;
  }

  // Check if user is in thread
  async isUserInThread(threadId, userId) {
    try {
      const response = await fetch(
        `https://discord.com/api/v10/channels/${threadId}/thread-members/${userId}`,
        {
          headers: {
            'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
          }
        }
      );

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  // Get thread member info
  async getThreadMember(threadId, userId) {
    try {
      const response = await fetch(
        `https://discord.com/api/v10/channels/${threadId}/thread-members/${userId}`,
        {
          headers: {
            'Authorization': `Bot ${process.env.DISCORD_TOKEN}`
          }
        }
      );

      if (!response.ok) {
        return null;
      }

      return await response.json();
    } catch (error) {
      console.error(`Failed to get thread member ${userId} in ${threadId}:`, error);
      return null;
    }
  }

  // Sync thread membership with CastBot roles
  async syncThreadMembership(threadId, requiredRoleIds) {
    try {
      const threadInfo = threadManager.activeThreads.get(threadId);
      if (!threadInfo) {
        console.log(`Thread ${threadId} not managed by CastBot`);
        return;
      }

      const currentMembers = await this.getThreadMembers(threadId);
      const currentMemberIds = new Set(currentMembers.map(m => m.user_id));

      // Get guild members with required roles
      const guild = await client.guilds.fetch(threadInfo.guildId);
      const requiredMembers = new Set();

      for (const roleId of requiredRoleIds) {
        const role = guild.roles.cache.get(roleId);
        if (role) {
          role.members.forEach(member => requiredMembers.add(member.id));
        }
      }

      // Add missing members
      const toAdd = [...requiredMembers].filter(id => !currentMemberIds.has(id));
      const toRemove = [...currentMemberIds].filter(id => !requiredMembers.has(id));

      console.log(`🔄 Syncing thread ${threadId}: +${toAdd.length}, -${toRemove.length}`);

      // Add required members
      await this.bulkAddThreadMembers(threadId, toAdd);

      // Remove members who no longer have required roles
      for (const userId of toRemove) {
        await threadManager.removeThreadMember(threadId, userId);
        await sleep(200);
      }

      console.log(`✅ Synced thread membership for ${threadId}`);
    } catch (error) {
      console.error(`Failed to sync thread membership for ${threadId}:`, error);
    }
  }
}

// Global member manager
export const threadMembers = new ThreadMemberManager();
```

## Thread Integration with CastBot Features

### Integration Points

```javascript
// CastBot thread integration points
export class ThreadIntegration {
  // Create application thread when application is submitted
  static async onApplicationSubmitted(applicationData) {
    try {
      const applicationChannelId = await getApplicationChannelId(applicationData.guildId);
      const thread = await createApplicationThread(
        applicationChannelId,
        applicationData.applicantId,
        applicationData
      );

      // Store thread reference in application data
      await updateApplicationData(applicationData.id, {
        discussionThreadId: thread.id
      });

      console.log(`✅ Created application thread for ${applicationData.applicantName}`);
    } catch (error) {
      console.error('Failed to create application thread:', error);
    }
  }

  // Create Safari thread when round completes
  static async onSafariRoundComplete(roundData) {
    try {
      const safariChannelId = await getSafariChannelId(roundData.guildId);
      const thread = await createSafariEventThread(safariChannelId, roundData);

      // Store thread reference
      await updateSafariRoundData(roundData.id, {
        discussionThreadId: thread.id
      });

      console.log(`✅ Created Safari discussion thread for round ${roundData.round}`);
    } catch (error) {
      console.error('Failed to create Safari thread:', error);
    }
  }

  // Create voting thread when vote is initiated
  static async onVotingInitiated(votingData) {
    try {
      const votingChannelId = await getVotingChannelId(votingData.guildId);
      const thread = await createVotingThread(votingChannelId, votingData);

      // Store thread reference
      await updateVotingData(votingData.id, {
        discussionThreadId: thread.id
      });

      console.log(`✅ Created voting thread for ${votingData.topic}`);
    } catch (error) {
      console.error('Failed to create voting thread:', error);
    }
  }

  // Archive threads when events complete
  static async onEventCompleted(eventType, eventId) {
    try {
      const threadId = await getEventThreadId(eventType, eventId);
      if (threadId) {
        // Schedule archive for 24 hours later
        threadLifecycle.scheduleThreadArchive(threadId, 24 * 60 * 60 * 1000);
        console.log(`📅 Scheduled archive for ${eventType} thread ${threadId}`);
      }
    } catch (error) {
      console.error(`Failed to schedule thread archive for ${eventType}:`, error);
    }
  }
}
```

## Thread Error Handling

### Thread-Specific Error Patterns

```javascript
// Thread error handling
export async function handleThreadError(error, operation, threadId = null) {
  const errorCode = error.status || error.code;

  switch (errorCode) {
    case 10003: // Unknown Channel
      console.error(`Thread ${threadId} not found or deleted`);
      if (threadId) {
        threadManager.activeThreads.delete(threadId);
      }
      break;

    case 50013: // Missing Permissions
      console.error(`Missing permissions for thread operation: ${operation}`);
      // May need MANAGE_THREADS permission
      break;

    case 30007: // Maximum Active Threads
      console.error('Guild has reached maximum active thread limit');
      // Consider archiving old threads first
      await threadLifecycle.cleanupOldThreads();
      break;

    case 50035: // Invalid Form Body
      console.error(`Invalid thread parameters for ${operation}:`, error.errors);
      break;

    case 50004: // Guild feature not available
      console.error('Threads not available in this guild (need boost level)');
      break;

    default:
      console.error(`Unknown thread error during ${operation}:`, {
        code: errorCode,
        message: error.message,
        threadId
      });
  }

  throw error;
}
```

## Best Practices for CastBot Thread Implementation

### 1. Use Appropriate Thread Types
```javascript
// ✅ Correct - Private threads for sensitive discussions
const appThread = await threadManager.createCastBotThread(channelId, 'application', context);

// ❌ Wrong - Public threads for private applications
const appThread = await createThread(channelId, { type: 11 }); // Public
```

### 2. Manage Thread Lifecycle
```javascript
// ✅ Correct - Schedule automatic archiving
threadLifecycle.scheduleThreadArchive(threadId, 24 * 60 * 60 * 1000);

// ❌ Wrong - Let threads accumulate indefinitely
// No lifecycle management
```

### 3. Sync Permissions Properly
```javascript
// ✅ Correct - Sync with roles
await threadMembers.syncThreadMembership(threadId, requiredRoleIds);

// ❌ Wrong - Manual permission management
await addThreadMember(threadId, userId);
```

### 4. Handle Thread Limits
```javascript
// ✅ Correct - Check and cleanup before creating
await threadLifecycle.cleanupOldThreads(channelId);
const thread = await createCastBotThread(channelId, type, context);

// ❌ Wrong - Create without checking limits
const thread = await createThread(channelId, options);
```

## Related Documentation

- **[Discord Channel Resource](DiscordChannelResource.md)** - Parent channel management
- **[Discord Permissions](DiscordPermissions.md)** - Thread permission requirements
- **[Discord Guild Resource](DiscordGuildResource.md)** - Guild-level thread limits
- **[Discord Message Resource](DiscordMessageResource.md)** - Thread messaging

## References

- [Discord Threads Documentation](https://discord.com/developers/docs/topics/threads)
- [Thread Channel Types](https://discord.com/developers/docs/resources/channel#channel-object-channel-types)
- [Thread Permissions](https://discord.com/developers/docs/topics/permissions#permissions-for-threads)