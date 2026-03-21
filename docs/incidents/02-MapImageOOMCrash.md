# Incident 02: Production OOM Crash — Memory Exhaustion

**Date**: 2026-03-20 (Friday)
**Duration**: ~62 minutes (16:58 — 18:00 AWST)
**Severity**: P1 — Full production outage, all 140+ servers affected
**Detected by**: Reece (on phone, hosting work event)
**Root Cause**: Memory exhaustion on 447MB server (exact trigger unclear — see analysis)
**Recovery**: Manual SSH intervention from phone (AWS Console restart did NOT recover)
**Compounding Factor**: PM2 startup not configured — instance reboot didn't restart the bot

## Timeline (AWST = UTC+8)

| Time | Event |
|---|---|
| 15:20 | Oreo (oreo_stars) begins playing Safari in EmeraldORG test server |
| 15:20–15:39 | Rapid gameplay: 20+ movements, custom actions, map refreshes in 19 minutes |
| 15:39 | Last logged Oreo interaction |
| ~16:50 | Memory guard fires: `🚨 Low memory: 70MB free of 448MB — refusing map creation` |
| 16:58 | First crash — PM2 restarts process (PID 33692) |
| 17:13 | Second crash — PM2 restarts (PID 1388) |
| 17:15 | Third crash — PM2 restarts (PID 4001) |
| 17:22 | Fourth crash — PM2 restarts (PID 6280, 6837, 7064, 7303) |
| ~17:30 | Reece attempts AWS Console "Restart" — instance reboots |
| ~17:35 | Instance back up, Apache running, but PM2 NOT running (no systemd service) |
| ~17:45 | Reece SSHs from phone via AWS Console web terminal, manually starts PM2 |
| 18:00 | Bot recovered, fifth successful start (PID 7616) |

## Root Cause Analysis

### Primary: Memory Exhaustion (Exact Trigger Unknown)

The production server is an AWS Lightsail instance with **447MB total RAM**. The bot's baseline memory footprint (Node.js + Discord.js + playerData 2.9MB JSON) is ~250MB, leaving only ~200MB headroom.

**What we know**:
- `🚨 Low memory: 70MB free of 448MB — refusing map creation` — memory guard fired, server was critically low
- PM2 restart history shows 7+ restarts in rapid succession (crash loop)
- Each restart loads playerData (2.9MB JSON parse) + Discord.js client — consuming ~250MB before any user interaction
- A Safari player (Oreo) was actively playing around the crash time, but player navigation does NOT generate Sharp images (fog maps are pre-generated at map creation time)
- The 44 `map_update` log entries were from a different server (dev), not the crash path

**Possible causes (unconfirmed)**:
- Discord.js member/message cache accumulation over days of uptime (140+ guilds)
- Memory leak in a long-running operation
- Multiple concurrent heavy operations (castlist image gen + Safari + backup service)
- Node.js GC pressure from 2.9MB playerData being loaded/parsed repeatedly

**What we DON'T know**: The PM2 error log was rotated, so the actual fatal error that triggered the OOM kill is lost. Future incidents should be caught by PM2 max-memory-restart (see fixes below).

### Secondary: AWS Restart Didn't Recover

When Reece restarted the Lightsail instance from the AWS Console:
1. Apache auto-started (correctly — `systemctl enable bitnami` was configured)
2. PM2 did NOT auto-start — **`pm2 startup` was never configured**
3. No systemd service exists at `/etc/systemd/system/pm2-bitnami.service`
4. Bot was down even though the server was up

### Contributing Factors

1. **No request-level throttling on map generation** — concurrent Sharp renders are not queued
2. **No per-user rate limit on Safari interactions** — a single user can trigger unlimited concurrent operations
3. **Server undersized** — 447MB is marginal for a Node.js app with Sharp image processing
4. **`console.error` for expected conditions** — "Player not found for condition evaluation" floods stderr, making it harder to spot real errors

## What Already Existed (and Partially Helped)

- **Memory guard in mapExplorer.js** — refuses map creation when <80MB free. This caught the LAST request but not the ones already in-flight.
- **PM2 auto-restart** — correctly restarted the process after each crash. But with insufficient memory, each restart crashed again (OOM crash loop).

## Immediate Fixes Required

### Fix 1: PM2 Startup (CRITICAL — prevents AWS restart failure)

```bash
# Run on prod server (requires sudo):
sudo env PATH=$PATH:/opt/bitnami/node/bin /opt/bitnami/node/lib/node_modules/pm2/bin/pm2 startup systemd -u bitnami --hp /home/bitnami
pm2 save
```

This creates a systemd service that auto-starts PM2 on instance reboot.

### Fix 2: PM2 Memory Limit (prevents OOM crash loop)

```bash
# Set max memory restart threshold
pm2 restart castbot-pm --max-memory-restart 350M
pm2 save
```

When memory exceeds 350MB, PM2 gracefully restarts instead of waiting for OOM killer.

### Fix 3: Investigate Memory Profile

The root cause is unclear. Next steps:
- Monitor memory usage over time (`pm2 monit` or add periodic memory logging)
- Check if Discord.js cache grows unbounded across 140+ guilds
- Consider `--max-old-space-size=350` Node.js flag to cap heap

**NOTE**: Player Safari navigation does NOT trigger Sharp rendering. Fog maps are pre-generated at map creation time. The mutex approach was considered but is not the right fix for this incident.

## Future Resilience Improvements

| Improvement | Effort | Impact | Priority |
|---|---|---|---|
| PM2 startup systemd service | 5 min (prod SSH) | Prevents AWS restart failure | P0 — do NOW |
| PM2 max-memory-restart | 1 min (prod SSH) | Graceful restart before OOM | P0 — do NOW |
| Memory profiling / monitoring | 1 hour | Identify actual leak source | P1 — next session |
| Per-user interaction rate limit | 2 hours | Prevents rapid-fire abuse | P2 — future |
| Server RAM upgrade (1GB) | $5/mo | Doubles headroom | P2 — evaluate |
| Health check endpoint | 1 hour | Auto-detect unhealthy state | P3 — future |
| Discord alert on PM2 crash | 30 min | Immediate notification | P2 — next session |

## Lessons Learned

1. **A single enthusiastic user can crash the entire bot** — no rate limiting means no protection
2. **AWS Console restart ≠ bot restart** — PM2 startup configuration is a hard requirement, not a nice-to-have
3. **Memory guards that refuse new work don't help with work already in-flight** — need to limit concurrency, not just refuse at the door
4. **447MB is too tight for Sharp** — the baseline Node.js + Discord.js footprint is ~250MB, leaving only ~200MB for actual work. One large image or two concurrent renders can tip it over.

## Related Incidents

- [01-MapImageOversizeOOM.md](01-MapImageOversizeOOM.md) — Previous map image incident (16MB PNG, fixed with compression)
- CLAUDE.md "Production Infrastructure Troubleshooting" — Apache/nginx restart procedure

## Action Items

- [ ] Run `pm2 startup` on prod (requires Reece's sudo password)
- [ ] Set `--max-memory-restart 350M` on prod
- [ ] Add map render mutex to prevent concurrent Sharp operations
- [ ] Downgrade "Player not found for condition evaluation" from `console.error` to `console.log`
- [ ] Add per-user interaction cooldown (future)
