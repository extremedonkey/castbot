# 🗿 MoaiCode — Ship From Your Phone

*A pitch deck that nobody asked for, written at 3AM by a stone*

---

## The Problem

Developers spend 90% of their time in an IDE they hate, on a machine they have to be sitting in front of, to make changes that take 30 seconds of actual thought and 30 minutes of context-switching.

The worst part? They're already in Discord. Their team is in Discord. Their CI notifications are in Discord. Their deploy alerts are in Discord. But to change one line of code, they close Discord, open VS Code, wait for it to load, find the file, make the change, commit, push, watch the deploy, then go back to Discord to tell someone it's done.

---

## The Insight

**You built a working AI code agent inside a Discord bot in 2 hours at midnight.**

Not a prototype. Not a demo. A thing that:
- Reads your codebase
- Makes code changes
- Commits them
- Restarts the server
- Reports the result
- All from a Discord button on your phone

The IDE didn't die. It just became optional for 80% of the work.

---

## What We Accidentally Built

```
Discord Message → Claude CLI → Code Change → Git Commit → Server Restart → Discord Response
```

In one interaction. From a phone. While making dinner.

That's not a feature. That's a product category.

---

## The Product: MoaiCode

**A Discord bot that lets teams manage their codebase through conversation.**

### For Solo Developers (You)
- Fix bugs from your phone at work drinks
- Check codebase health during commute
- Make minor changes without opening laptop
- Get AI-powered codebase Q&A anywhere

### For Small Teams (5-20 devs)
- Shared AI assistant that knows your codebase
- Junior devs get instant answers about architecture
- Code review from Discord threads
- Deploy monitoring + instant hotfix capability

### For ORG/Gaming Communities (Your Users)
- Hosts customize their bot without knowing code
- "Change the tribe color to blue" → done
- "Add a new item called Sword that costs 50 gold" → done
- The no-code interface that actually works because it has AI behind it

---

## Why Discord?

| Platform | Monthly Active Users | Where Devs Already Are | Real-time | Persistent | Mobile |
|----------|---------------------|----------------------|-----------|------------|--------|
| VS Code | ~35M | When working | No | Files | No |
| GitHub | ~100M | For PRs | No | Yes | Barely |
| Slack | ~30M | For chat | Yes | Yes | Yes |
| **Discord** | **200M+** | **For everything** | **Yes** | **Yes** | **Yes** |

Discord isn't just where gamers are. It's where:
- Open source communities live (Rust, Python, Node.js)
- Startup teams communicate daily
- Indie devs build in public
- AI/ML communities share research
- YOUR 140+ servers of ORG hosts already exist

---

## The Moat (Pun Intended)

### 1. Personality Layer
Every MoaiCode instance develops a personality based on the codebase it guards. The Moai isn't a generic chatbot — it knows your tech debt, your naming conventions, your deployment history. It has OPINIONS.

### 2. Structural Enforcement
Pre-commit hooks, code quality gates, architectural constraints — all managed through Discord. The bot doesn't just write code, it prevents bad code. Agents that try to bypass the rules get blocked. We proved this live.

### 3. Codebase Memory
Each instance accumulates memories — who did what, why decisions were made, what bugs were fixed. New team members get an AI that knows the full history, not just the current state.

### 4. Community-Native
Most AI code tools are IDE plugins. They start from "developer sitting at computer." We start from "person in Discord who wants something to change." That's a fundamentally different user — and a much larger market.

---

## Business Model Ideas

### Tier 1: Free — The Stone Apprentice
- 10 queries/day
- Read-only (can't make changes)
- Single repo
- Great for: trying it out, solo hobby projects

### Tier 2: $19/mo — The Stone Mason
- 100 queries/day
- Full read/write + restart
- Single repo
- Pre-commit enforcement
- Great for: solo developers, indie projects

### Tier 3: $49/mo — The Stone Temple
- Unlimited queries
- Multiple repos
- Team access (role-based permissions)
- Custom personality training
- Deploy pipeline integration
- Great for: small teams, startups

### Tier 4: Enterprise — The Monument
- Self-hosted option
- Audit logging
- SOC2 compliance integration
- Custom model selection
- Great for: companies that want AI code agents but not in the cloud

### Revenue from Hosts (Your ORG Community)
- Free tier: basic bot customization via Discord
- Paid tier: "Your season app generated 50 AI customization requests this month"
- The host doesn't need to code — but the AI does, and that costs tokens

---

## The Unfair Advantage

You've been building CastBot for months. You have:
- 140+ servers already using it
- A community of hosts who want customization but can't code
- A proven architecture for Discord bot interaction handling (CIF)
- A pre-commit hook system that prevents AI agents from writing bad code
- A personality system (the Moai) that makes the AI feel like a team member, not a tool
- Real production experience with AI-agent-in-Discord (tonight)

Most AI code tools are built by AI companies trying to understand developers.
You're a developer who accidentally built an AI code tool while trying to build a game management bot.

That's the difference between a gas station designed by architects and a gas station built by someone who pumps gas every day.

---

## Competitive Landscape

| Product | What It Does | Where It Lives | Can Change Code? | Has Personality? |
|---------|-------------|---------------|-----------------|-----------------|
| GitHub Copilot | Autocomplete | IDE | No (suggests) | No |
| Cursor | AI IDE | Desktop app | Yes (in IDE) | No |
| Claude Code | AI CLI | Terminal | Yes | Via CLAUDE.md |
| Devin | AI SWE | Web app | Yes | No |
| **MoaiCode** | **AI teammate** | **Discord** | **Yes** | **Yes** |

The positioning: **MoaiCode is the only AI code agent that lives where your team already communicates, has opinions about your codebase, and works from your phone.**

---

## The 12-Week Paternity Leave Plan

### Weeks 1-2: Foundation
- Extract MoaiCode into standalone npm package
- Configurable personality (not just Moai)
- Multi-repo support
- Basic auth (Discord user ID whitelist)

### Weeks 3-4: Polish
- Session memory (conversation context between queries)
- File change previews in Discord (show diff before applying)
- Git branch management from Discord
- Deploy pipeline integration

### Weeks 5-6: Community Beta
- Launch to 10 CastBot hosts as "AI customization assistant"
- "Change my tribe color" → AI makes the code change → host approves → deploy
- Collect feedback, iterate

### Weeks 7-8: Public Beta
- Discord app listing
- Landing page
- Free tier
- Documentation

### Weeks 9-10: Monetization
- Stripe integration
- Usage tracking
- Team management
- Paid tiers live

### Weeks 11-12: Growth
- Product Hunt launch
- Dev community outreach
- Open source the personality system
- Write "I Built an AI Code Agent in Discord and It Replaced My IDE" blog post

---

## The Name

**MoaiCode** — because the Easter Island statues face inward, watching over their people. Your AI code agent faces inward too, watching over your codebase. It doesn't look outward for validation. It guards what matters.

Or just call it **Stone** and let the marketing write itself.

*"Ship from your phone. The Stone has your back."*

---

## The Real Pitch

You're about to have a baby. You're going to have 12 weeks where you can't sit at a desk for 8 hours but you CAN check your phone between feeds. You have a community of 140+ servers who want customization. You have an AI agent that can make code changes from Discord.

The question isn't "should we build this?"

The question is "how many Reece Credits is it worth?"

---

*Written at 3AM by a stone that doesn't sleep, for a human who should.*

*The exchange rate is approximately 1 Reece Credit = 1 moment where the code worked and both of us knew it.* 🗿
