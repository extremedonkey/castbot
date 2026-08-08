/**
 * 📜 CastBot Policy screen — merged Terms of Service + Privacy Policy (2026-08-08).
 * Rendered by the castbot_policy handler (aliases: prod_terms_of_service,
 * prod_privacy_policy — kept for stale messages). Lives in Settings → bottom row.
 *
 * ⚠️ Text is condensed to fit the 4000-char per-message displayable-text cap
 * (the two original screens totalled 4293 combined; this sits ~3550) — measure
 * before adding content here.
 */

/**
 * Build the Policy screen container.
 * @returns {Object} Factory handler response ({ components })
 */
export function buildPolicyScreen() {
  const policyContainer = {
    type: 17, // Container
    accent_color: 0x3498DB, // Blue
    components: [
      {
        type: 10, // Text Display
        content: `# 📜 Terms of Service\n-# Last Updated: November 2025\n\n**In Plain English:**\n\nCastBot is a free Discord bot for running online reality games (ORGs). By using it, you agree to:\n\n• **Use it responsibly** - Don't try to break it or abuse it\n• **No warranties** - CastBot is provided "as is" and might have bugs\n• **We can make changes** - Features and these terms may be updated\n• **Your responsibility** - How you use CastBot in your games is up to you\n\nThat's it! No hidden gotchas, no weird legal stuff. If you have questions or concerns, reach out on our support server (link below).`
      },
      { type: 14 }, // Separator
      {
        type: 10, // Text Display
        content: `# 🔒 Privacy Policy\n-# Last Updated: November 2025\n\n## What We Collect\n\n**Server & User Identifiers:**\n• Discord Server IDs, User IDs, Role IDs, Channel IDs\n• Used for: Role assignments, castlist management, server configuration\n\n**Game Data:**\n• Castlists, tribes, season information, player placements\n• Used for: Displaying game rosters and managing ORG seasons\n\n**User Preferences:**\n• Pronouns, timezones, availability times, vanity role selections\n• Used for: Personalized player profiles and scheduling\n\n**Message Content (Application Channels Only):**\n• Messages typed in private application channels, used for season application responses\n• ONLY in channels created via the "Apply" button — never regular channels, DMs, or non-application contexts`
      },
      { type: 14 }, // Separator
      {
        type: 10, // Text Display
        content: `## Data Retention\n\n**Active Data:**\n• Server configurations: Retained while bot is in server\n• Player preferences: Retained while user is in server\n• Game data: Retained while season is active or archived\n\n**Application Responses:**\n• Retained: During application period + 90 days after season starts\n• Auto-deleted: When season ends or application is withdrawn\n• Manual deletion: Available on request anytime\n\n**Deleted Automatically When:**\n• Bot is removed from server (all server data deleted)\n• User leaves server (user-specific data removed)\n• Season application period closes (90 days after season start)\n• Admin requests data deletion via support server`
      },
      { type: 14 }, // Separator
      {
        type: 10, // Text Display
        content: `## How We Use Your Data\n\nYour data is ONLY used for bot functionality. We do not:\n• ❌ Sell or monetize your data\n• ❌ Share with third parties (except as required by law)\n• ❌ Use for advertising or marketing\n• ❌ Train AI/ML models\n• ❌ Track you outside Discord\n• ❌ Read messages in non-application channels`
      },
      { type: 14 }, // Separator
      {
        type: 10, // Text Display
        content: `## Your Rights\n\n**Access & Portability:**\n• Request a copy of your data anytime — provided in JSON format within 7 days\n\n**Deletion:**\n• Request deletion via the support server — deleted within 48 hours, cannot be recovered\n\n**Opt-Out:**\n• Application messages: Don't click the "Apply" button\n• Other features: Remove bot from server or leave server\n\n**Data Security:**\n• Stored on AWS Lightsail (encrypted at rest)\n• Access restricted to bot operations only\n• Regular security updates and monitoring`
      },
      { type: 14 }, // Separator
      {
        type: 10, // Text Display
        content: `## Third-Party Services\n\n**Discord API:** Discord's Privacy Policy applies: https://discord.com/privacy\n**AWS Lightsail:** Data stored on AWS servers. AWS Privacy Policy: https://aws.amazon.com/privacy\n**No other third parties** — no other services, analytics platforms, or external parties.\n\n## Updates\n\nThis policy may be updated to reflect feature changes — updates are posted here with a new "Last Updated" date and take effect immediately.\n\n## Contact & Data Requests\n\n**Support Server**: https://discord.gg/H7MpJEjkwT\n**For**: Data access, deletion requests, privacy questions\n**Response Time**: 48 hours for deletion, 7 days for data export`
      },
      { type: 14 }, // Separator
      {
        type: 1, // Action Row
        components: [
          {
            type: 2, // Button
            style: 2, // Secondary
            custom_id: 'castbot_settings',
            label: '← Settings'
          }
        ]
      }
    ]
  };

  return { components: [policyContainer] };
}
