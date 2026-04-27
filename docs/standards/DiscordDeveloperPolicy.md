# Discord Developer Policy

## Overview

Discord's official policy governing what bots, apps, and developers may and may not do on the platform. **All CastBot features must comply with this policy** — violations can result in app termination, API access revocation, or developer account suspension.

This is the authoritative legal/operational rulebook for any code that touches Discord's API.

**Source**: [Discord Developer Policy](https://support-dev.discord.com/hc/en-us/articles/8563934450327-Discord-Developer-Policy)

**Last Fetched**: <!-- YYYY-MM-DD when policy text below was retrieved -->
**Effective Date**: <!-- as stated in the policy -->

## 🚨 CRITICAL: CastBot Compliance Touchpoints

When working on CastBot, double-check the policy against these high-risk areas:

- **Data collection / storage** — `playerData.json`, `safariContent.json`, what we keep about users
- **DMs to users** — `discordMessenger.js`, opt-in requirements, content rules
- **Mass messaging / pings** — Safari announcements, bulk DMs, role pings
- **Scraping or caching Discord data** — member lists, message history, channel content
- **Resale / commercial use** — selling features, paid tiers, third-party integrations
- **AI / ML training** — using Discord content to train models
- **Privacy / deletion** — handling user data deletion requests, GDPR/CCPA

## Policy Text (Verbatim)

> **TODO**: Paste the full Discord Developer Policy article body below this heading.
> Preserve all numbered sections, sub-sections, definitions, and lists.
> Use `## 1. Section Name`, `### 1.1 Sub-section`, etc.

<!-- BEGIN VERBATIM POLICY -->

<!-- END VERBATIM POLICY -->

## CastBot-Specific Notes

### Areas of Active Compliance Concern

<!-- Fill in once policy is loaded — flag any sections that affect current CastBot behavior -->

### Open Questions

<!-- Fill in once policy is loaded — flag any sections needing legal/product review -->

## Related Documents

- [Discord Permissions Reference](DiscordPermissions.md) — what we ask for and why
- [Discord Rate Limits Reference](DiscordRateLimits.md) — abuse-prevention compliance
- [Discord User Resource](DiscordUserResource.md) — user data handling
- Discord Terms of Service: https://discord.com/terms
- Discord Privacy Policy: https://discord.com/privacy
