/**
 * 📜 CastBot Policy screen — merged Terms of Service + Privacy Policy (2026-08-08).
 * Rendered by the castbot_policy handler (aliases: prod_terms_of_service,
 * prod_privacy_policy — kept for stale messages). Lives in Settings → bottom row.
 *
 * ⚠️ Text is condensed to fit the 4000-char per-message displayable-text cap
 * (currently ~3540; the test guard fails above 3900) — measure before adding
 * content here. The FULL authoritative policy lives in /PRIVACY.md (public
 * GitHub URL, linked at the bottom of this screen) — keep the two in sync.
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
        content: `# 🔒 Privacy Policy\n-# Last Updated: August 2026\n\n## What We Collect\n\n**Server & User Identifiers:**\n• Discord Server IDs, User IDs, Role IDs, Channel IDs\n• Used for: Role assignments, castlist management, server configuration\n\n**Game Data:**\n• Castlists, tribes, season information, player placements\n• Used for: Displaying game rosters and managing ORG seasons\n\n**User Preferences:**\n• Pronouns, timezones, availability times, vanity role selections\n• Used for: Personalized player profiles and scheduling\n\n**Message Content** — read only in two admin-controlled cases:\n• Application channels: responses typed in channels created via the "Apply" button\n• Channel Archives: when a server admin runs Archive, that channel's history is read once and rendered into an HTML file posted back into the same server — processed in memory, never stored on our servers\n• No passive monitoring — regular channels and DMs are never read otherwise`
      },
      { type: 14 }, // Separator
      {
        type: 10, // Text Display
        content: `## Data Retention\n\n• Server configurations: while the bot is in the server — removing the bot deletes all server data\n• Player preferences: while you're in the server — leaving removes your user data\n• Application responses: application period + 90 days after season start, then auto-deleted\n• Channel archives: live only as attachments in your own server — your admins can delete them anytime\n• Anything deleted on request via the support server`
      },
      { type: 14 }, // Separator
      {
        type: 10, // Text Display
        content: `## How We Use Your Data\n\nYour data is ONLY used for bot functionality. We do not:\n• ❌ Sell or monetize your data\n• ❌ Share data beyond the service providers listed below (or as required by law)\n• ❌ Use for advertising or marketing\n• ❌ Train AI/ML models\n• ❌ Track you outside Discord`
      },
      { type: 14 }, // Separator
      {
        type: 10, // Text Display
        content: `## Your Rights\n\n• **Access**: request a copy of your data anytime — JSON format, within 7 days\n• **Deletion**: request via the support server — within 48 hours, cannot be recovered\n• **Opt-out**: don't click "Apply" (applications); ask your admin not to archive channels with your messages (archives); or leave the server / remove the bot\n• **Security**: stored on access-restricted AWS infrastructure, security-patched and monitored`
      },
      { type: 14 }, // Separator
      {
        type: 10, // Text Display
        content: `## Third-Party Services\n\n**Discord:** https://discord.com/privacy\n**AWS:** Bot data lives on access-restricted AWS infrastructure — https://aws.amazon.com/privacy\n**Anthropic (Claude API):** Powers Ask CastBot admin Q&A — API data is not used to train models\n**htmlpreview.github.io:** Renders archive HTML in your browser only when you click View Archive\n**Ko-fi:** Processes premium payments; we receive transaction confirmations to activate premium\n**No analytics or advertising services.**\n\n## Contact & Data Requests\n\n**Support Server**: https://discord.gg/H7MpJEjkwT\n**For**: Data access, deletion requests, privacy questions\n**Response Time**: 48 hours for deletion, 7 days for data export\n\n-# Full policy: https://github.com/extremedonkey/castbot/blob/main/PRIVACY.md — updates are posted with a new "Last Updated" date and take effect immediately.`
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
