# CastBot — Terms of Service & Privacy Policy

**Last Updated: 8 August 2026**

This is the authoritative copy of CastBot's Terms of Service and Privacy Policy. A condensed version is available inside the bot at **Settings → 📜 Policy**.

---

## 📜 Terms of Service

**In plain English:**

CastBot is a free Discord bot for running online reality games (ORGs). By using it, you agree to:

- **Use it responsibly** — don't try to break it or abuse it
- **No warranties** — CastBot is provided "as is" and might have bugs
- **We can make changes** — features and these terms may be updated
- **Your responsibility** — how you use CastBot in your games is up to you

Some features are offered as paid premium upgrades; payments are handled by Ko-fi (see Third-Party Services). Premium is a voluntary contribution model — see the in-bot Premium screen for current terms.

If you have questions or concerns, reach out on our support server (link at the bottom).

---

## 🔒 Privacy Policy

### What We Collect

**Server & user identifiers**
- Discord server IDs, user IDs, role IDs, channel IDs
- Used for: role assignments, castlist management, server configuration

**Game data**
- Castlists, tribes, season information, player placements, Safari game state
- Used for: displaying game rosters and running ORG seasons

**User preferences**
- Pronouns, timezones, availability, vanity role selections
- Used for: personalized player profiles and scheduling

**Message content** — read only in two explicit, admin-controlled situations:
1. **Application channels**: responses typed in private application channels created via the "Apply" button, used for season application review.
2. **Channel Archives**: when a **server administrator** explicitly runs the Archive feature on a channel, CastBot reads that channel's message history **once** via Discord's API and renders it into a self-contained HTML file, which is posted **back into the same Discord server** as a file attachment. The content is processed in memory only — it is **never written to our servers' disks, databases, or logs**. The resulting archive file lives inside your own Discord server, under your admins' control: deleting the archive message deletes the archive.

CastBot performs **no passive monitoring** of message content. Regular channels and DMs are never read outside the two situations above.

### Data Retention

- **Server configurations**: retained while the bot is in the server; removing the bot deletes all server data
- **Player preferences**: retained while you are in the server; leaving removes your user-specific data
- **Application responses**: retained during the application period plus 90 days after season start, then auto-deleted; deleted immediately if an application is withdrawn
- **Channel archives**: stored only as attachments inside your own Discord server — we retain nothing; your admins can delete them at any time
- **On request**: any of your data deleted via the support server, within 48 hours

### How We Use Your Data

Your data is used **only** for bot functionality. We do **not**:
- ❌ Sell or monetize your data
- ❌ Share data with anyone beyond the service providers listed below (or as required by law)
- ❌ Use it for advertising or marketing
- ❌ Use it to train AI or machine-learning models
- ❌ Track you outside Discord

### Third-Party Services

| Service | Role | Notes |
|---|---|---|
| **Discord** | The platform CastBot runs on | [Discord Privacy Policy](https://discord.com/privacy) |
| **AWS** | Hosting — bot data lives on access-restricted AWS infrastructure | [AWS Privacy Policy](https://aws.amazon.com/privacy) |
| **Anthropic (Claude API)** | Powers the "Ask CastBot" admin Q&A feature — admin questions and relevant game data are processed via the API | Anthropic does not train models on API data |
| **htmlpreview.github.io** | Renders a channel archive's HTML in your browser, **only** when a viewer clicks the archive's "View Archive" link | Viewer-initiated; nothing is sent there otherwise |
| **Ko-fi** | Processes premium payments on Ko-fi's own site | We receive transaction confirmations (supporter name, email, amount) solely to activate premium on your server |

No analytics platforms, advertising networks, or other external services are used.

### Your Rights

- **Access & portability**: request a copy of your data anytime — provided as JSON within 7 days
- **Deletion**: request via the support server — actioned within 48 hours; deletion is irreversible
- **Opt-out**: don't click the "Apply" button (application content); ask your server admin not to archive channels containing your messages (archives); or leave the server / remove the bot (everything)

### Security

Data is stored on access-restricted AWS infrastructure, with access limited to bot operations, and regular security updates and monitoring.

### Updates

This policy may be updated to reflect feature changes. Updates are posted here (and summarized in-bot) with a new "Last Updated" date and take effect immediately.

### Contact & Data Requests

- **Support server**: https://discord.gg/H7MpJEjkwT
- **Email**: extremedonkey@gmail.com
- **For**: data access, deletion requests, privacy questions
- **Response time**: 48 hours for deletion, 7 days for data export
