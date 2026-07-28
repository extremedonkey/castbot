# Prod Box Migration — Node-js-1 (512MB nano) → castbot-prod-2 (bigger bundle)

**Status**: ✅ **CUTOVER COMPLETE 2026-07-28 17:45 AWST (09:45 UTC)** — prod is now castbot-prod-2 (2GB). **Actual downtime: <2 minutes** (bot stopped ~09:44Z → "Discord client is ready!" 09:45:36Z). Soak period until ~Aug 4.

**Phase 2 execution log (2026-07-28)**: Reece cancelled the 18:00-AWST 🌙 fire (scheduler verified advanced to 22:00Z) · blue auto-remediation muted → restored after · pre-stop off-box backups of playerData (4,372,738B) + safariContent (2,520,439B) to the Windows machine · old bot stopped → final sizes byte-identical to backups (no writes in between) · zero img/ changes since snapshot (sync skipped) · rehearsed data sync + prod dump.pm2 → sizes verified on new box · IP flip detach/attach both `Succeeded`, `13.238.148.170 → castbot-prod-2` confirmed · pm2-bitnami enabled+started, castbot-pm + pm2-logrotate resurrected · domain 200 externally, clean boot, no env errors · **NODE_OPTIONS raised 320→1024MB** + `pm2 save` · smoke test verified in analytics log: pre-freeze events (Jun's safari cluster 16:32, sicnarf's full application flow 17:06) survived the sync AND Reece's post-cutover clicks (17:48–17:49) logged by the new box — zero event gap.

**Soak checklist**: old Node-js-1 running-with-bot-stopped at ephemeral `16.176.216.85` (fast ~90s rollback; consider stopping the instance after a day or two — Lightsail bills either way) · 🌙 restart fires 22:00Z tonight on the new box · watch swap stays ~0 (`sar -S`) · after soak (separate authorizations): deploy pending main commits, enable AutoSnapshot on castbot-prod-2, delete stale June-2025 auto-snapshots, delete Node-js-1, ship incident-08 code mitigations, investigate blue's climbing restart counter (422→428 in ~a day).

**Post-cutover events (2026-07-28 evening)**:
- **#error replay artifact (expected, one-time)**: PM2 Error Logger posted yesterday's incident-08 error tail (~17:48 AWST) — the synced `pm2-positions.json` didn't match the snapshot-era log file, so the first 60s check treated the old tail as unread. Position now caught up to EOF (verified); no real post-cutover errors exist. **Runbook lesson for future migrations: don't sync `logs/pm2-positions.json`, or reset it to EOF before first boot.**
- **🌙 cadence 12h → 24h** (Reece's call, executed via safe stop-edit-start, ~10s blip): with the 1024MB heap cap, worst-case drift consumes ~312MB/24h vs ~700MB headroom — the 12h cadence was sized for the old 320MB ceiling (incident 06 action #1) and is no longer needed. Tonight's 22:00Z fire preserved; 24h cadence from tomorrow.
**Driver**: [Incident 08](../incidents/08-SwapThrashFrozenLoop.md) — 94-min outage from swap-thrash on the 447MB-usable box; incident 06 already called the box "genuinely under-provisioned"
**Verified pre-flight**: 2026-07-27 via read-only AWS CLI + SSH forensics on both boxes (3-agent sweep; no blockers)
**Executor**: Claude drives every step via AWS CLI + SSH from the Windows machine; Reece authorizes each mutation phase and smoke-tests in Discord

## Decisions needed from Reece

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Bundle**: `micro_3_2` 1GB/40GB/$7-mo (+$2) vs `small_3_2` 2GB/60GB/$12-mo (+$7) | **small_3_2 (2GB)** — matches castbot-blue, 4× current RAM, $5/mo more than the minimum step; incident 06/08 showed 1GB is only ~2× a ceiling we already hit |
| 2 | **Pre-build tonight?** Phase 0 (snapshot + build + park the new box) can run the evening before — cutover day then contains only the 4-step flip (~5 min downtime) | **Yes** — shrinks the risky window and battle-tests the snapshot boot with a full day of slack |
| 3 | **temp/ cleanup before snapshot** — prod repo carries **1.1GB of orphaned overlay images** (631 files, zero value; failure paths never unlink — see incident 08 addendum). Deleting first slims the snapshot | **Yes** — one `rm` of `temp/activity_overlay_*` + `*_compressed.jpg` (write op, needs the word) |

## The DNS/registrar chain (verified live 2026-07-27 — nothing in it is touched by this migration)

Reece flagged "IP complexity with Hover and DigitalOcean." Mapped and confirmed:

```
Hover (registrar only)          — delegates reecewagner.com NS → ns1/ns2/ns3.digitalocean.com  [verified]
DigitalOcean (DNS host only)    — zone for reecewagner.com; A castbotaws → 13.238.148.170 (TTL 300)  [verified]
AWS Lightsail                   — owns static IP 13.238.148.170 (resource `lightsailstaticIP`)  [verified]
Discord Developer Portal        — knows only the URL castbotaws.reecewagner.com/interactions
```

- **CastBot runs no DigitalOcean compute.** DO only hosts the DNS zone. (The apex `reecewagner.com → 128.199.240.140` *is* a DO droplet — Reece's personal site — which is where the "DO in the mix" complexity memory comes from. Untouched and irrelevant here.)
- Because the cutover moves the **IP between instances**, every layer above it — Hover, the DO zone, the A record, the Discord endpoint URL, the TLS cert — stays exactly as-is. No propagation, no TTL risk, no portal edits.
- This is precisely [RaP 0919's (Apr 2026)](../01-RaP/0919_20260420_ProdCutoverStrategy_Analysis.md) conclusion — written when Reece first raised this fear: *"moving the static IP between instances is invisible to Discord... The Lightsail static IP is the magic atomic switch."* The DNS-cutover alternative it warned about (resolver caching, 5+ min lag observed on low TTLs) is exactly what we are NOT doing.

## Verified facts (all checked 2026-07-27, not assumed)

- ✅ `13.238.148.170` is static-IP resource `lightsailstaticIP` → reattach cutover, **no DNS involvement**; DNS has **no AAAA record** (IPv6 trap n/a), A record → static IP
- ✅ Firewall on Node-js-1: tcp 22/80/443 open to `0.0.0.0/0` + `::/0` — must be **explicitly replicated** (new instances open only 22+80 by default; **forgotten 443 = "migration done but every interaction fails"**)
- ⚠️ **Node-js-1's key pair `LightsailDefaultKeyPair` no longer exists in the account** — `create-instances-from-snapshot` MUST pass `--key-pair-name castbot-blue-key` (the only pair). SSH via `castbot-key.pem` still works regardless: its pubkey is in on-disk `authorized_keys`, which the snapshot carries (along with the blue forced-command + full-shell keys)
- ⚠️ **No valid backup exists today**: AutoSnapshot add-on disabled, zero manual snapshots; only 7 auto-snapshots from **June 2025** (13 months stale, still billing). The Phase-0 snapshot is the first real backup of prod in a year
- ✅ Everything critical rides the snapshot: `.env` (dotenv-loaded, not in git), `dump.pm2` (incl. `NODE_OPTIONS=--max-old-space-size=320`), systemd `pm2-bitnami.service` + `50-no-coredump.conf` drop-in (enabled; nginx disabled), bitnami-user crontab (lego cert renewal daily 19:39, HTTP-01 → needs port 80), `/home/bitnami/remediate-castbot.sh` (incident-08 fixed version) + forced-command `authorized_keys`, gonit
- ✅ TLS cert renewed Jun 27 → valid ~late Sep; no renewal due in the window
- ✅ sharp/libvips identical prod↔blue (0.33.5 / vips 8.15.3) — zero native-lib risk
- ✅ castbot-blue healthy for monitor duty (CPU <1.3% avg, burst 100% flat, disk 12%)
- ℹ️ Snapshot restore into a bigger bundle auto-expands the filesystem on first boot (verify `df -h`); snapshot bills ~$0.05/GB-mo (≤$1/mo)
- ℹ️ Prod git is behind origin/main (88acdd27) — **code freeze until after migration**; close the gap afterwards via normal `npm run deploy-remote-wsl`

## Phase 0 — Build & park (evening before; ~zero prod risk; needs one authorization)

Downtime: none. Prod runs untouched throughout.

1. *(If approved — decision #3)* Clean prod `temp/`: `rm /opt/bitnami/projects/castbot/temp/activity_overlay_*.png /opt/bitnami/projects/castbot/temp/*_compressed.jpg` (1.1GB junk)
2. **Snapshot** (also the first valid backup): `create-instance-snapshot --instance-name Node-js-1 --instance-snapshot-name castbot-prod-pre-migration-20260728` → poll `get-instance-snapshot` until `available` (box is memory-tight; snapshot of a live box is safe but may be slow)
3. **Create parked instance**: `create-instances-from-snapshot --instance-snapshot-name castbot-prod-pre-migration-20260728 --instance-names castbot-prod-2 --availability-zone ap-southeast-2a --bundle-id <decision #1> --key-pair-name castbot-blue-key --ip-address-type dualstack --user-data 'systemctl stop pm2-bitnami; systemctl disable pm2-bitnami'`
   - The user-data guard stops/disables the cloned bot at first boot. **A brief duplicate-gateway window (seconds–minutes) is possible** before it lands: the clone's bot connects to Discord's gateway with the real token (it cannot receive interactions — those are IP-routed — but gateway listeners like CastDock reposts could double-fire). SSH in immediately as belt-and-braces: `pm2 stop castbot-pm 2>/dev/null; pm2 save`
4. **Firewall**: `put-instance-public-ports --instance-name castbot-prod-2 --port-infos` tcp 22 + 80 + 443, all `0.0.0.0/0` + `::/0` → verify with `get-instance-port-states` (must match Node-js-1's three rules)
5. **Park-verify** over SSH (`castbot-key.pem` @ ephemeral IP): `df -h` (fs expanded to new disk); Apache listening 80+443 and nginx absent/disabled; `curl -kI https://localhost/interactions`; gonit running; data files present with sane sizes; `.env` present; remediate script + 3-line `authorized_keys` intact; bot **stopped** and pm2-bitnami **disabled**

Parked cost while waiting: bundle price pro-rata (~40¢/day for small_3_2). Rollback of Phase 0 alone = `delete-instance castbot-prod-2` (keep the snapshot).

## Phase 0 — Execution log (2026-07-27, all steps on Reece's "approved, go!")

| Step | Result |
|---|---|
| temp/ cleanup | ✅ 566 `activity_overlay_*` files deleted (1.1GB), 65 legit files kept; disk 52%→47% |
| Snapshot `castbot-prod-pre-migration-20260728` | ✅ available after ~18 min (20GB) — **prod's first valid backup in 13 months** |
| castbot-prod-2 created | ✅ small_3_2 (2GB/60GB), ap-southeast-2a, running in ~20s, **ephemeral IP 13.211.61.198** |
| Bot-stop guard | ✅ user-data disabled pm2-bitnami; stray boot PM2 daemon killed by hand; `app.js`/PM2 fully dead; pm2-bitnami `inactive`+`disabled` |
| Firewall | ✅ 22/80/443 tcp open to 0.0.0.0/0 + ::/0 — verified matches Node-js-1 |
| Park-verify | ✅ fs auto-expanded 20→59GB (15% used); data files exact sizes (playerData 4,331,164B, safariContent 2,492,005B); img/ 138M, logs/ 23M; `.env` present; remediate script 2924B mode 751; gonit up; nginx disabled; 2GB RAM with 247MB used, zero swap pressure |
| **Swap decision (finalized)** | Keep the landed config as-is: **1GB `/swapfile2` (fstab), 0B used**; the Bitnami 635MB swap did not reappear (it wasn't in fstab — good riddance). Deliberately **NOT** increasing swap: oversized swap is what converted fast self-healing crashes into incident 08's 94-min hang (RaP 0896's "honest trade"). Swap returns to emergency-net duty; sustained usage >~100MB on this box = early-warning signal, visible in the new `sar -S` history |
| **Gotcha found & fixed: Apache down at first boot** | Snapshot carried old box's stale `httpd.pid` ("713"); pid 713 exists on the new box (kernel thread) so **gonit believed Apache was Running and wouldn't start it** (`ctlscript` delegates to gonit → lying "Started apache"). Fix: `rm httpd.pid` + `gonit restart apache` → 4 workers, **local 443 → 503 = correct parked signature** (TLS up, backend intentionally dead) |
| Gotcha noted: clone's `dump.pm2` rewritten by boot race | Slimmer than prod's reference (NODE_OPTIONS intact). Mitigation: **`/home/bitnami/.pm2/dump.pm2` added to the cutover sync list** — copy prod's battle-tested dump before enabling pm2-bitnami |
| Note: `authorized_keys` now 4 lines | Expected — Lightsail appended `castbot-blue-key` at create; original 3 keys intact |
| **Dry run A — data sync (the real cutover command)** | ✅ Full core-list tar pipe prod→parked via blue: **1.04 seconds** (in-region). `dump.pm2` synced (7,905B, prod's exact reference). Cutover data-gap window is seconds, not minutes |
| **Dry run B — invalid-token boot test** | ✅ Full app.js init on the parked box: `.env`/dotenv loaded, node_modules good, `Listening on port 3000` logged, then discord.js exited on the planted invalid token (by design — zero Discord contact). Logger mode matches real prod exactly (both say `development mode, debug=true` — **pre-existing prod quirk**, explains the 6–17MB/day debug log spam; backlog item, not migration-related) |
| Not rehearsable | Only the movement of prod's actual static IP — its exact mechanics (attach/detach on this very instance) are rehearsable via a throwaway static IP (proposed as dry run C, needs authorization) |

## Phase 1 — Pre-window checks (cutover day, before 17:00 AWST; read-only + one blue toggle)

1. Re-verify: prod healthy, castbot-prod-2 still parked (bot stopped), snapshot `available`, blue healthy
2. **Mute blue's auto-remediation for the window** (it would SSH-restart whatever box holds the static IP after 15 min of sustained downtime — we don't want it mid-cutover even though the plan is ~5 min): set `PROD_WATCHDOG_AUTO_REMEDIATE=0` in blue's `.env` + `pm2 restart castbot-pm` on blue. Watchdog DOWN alerts during the window are **expected and informational**
3. Confirm no 🌙 conflict: prod's scheduled restart is 22:00 UTC — clear of the window

## Phase 2 — Cutover (17:00–18:00 AWST; target ≤10 min downtime; needs live authorization)

| Step | Action | Where | Downtime clock |
|---|---|---|---|
| 1 | `pm2 stop castbot-pm` | OLD box | ⏱️ starts |
| 2 | **Data sync OLD → NEW** (snapshot is a day stale; every write since lives only on OLD): core data ~40MB via box-to-box pipe from blue (holds the full-shell `castbot-prod` key, accepted by BOTH boxes since `authorized_keys` is cloned): `tar` over SSH of the file list below; `img/<guildId>/` map dirs (~134MB) only if mtimes changed since snapshot | blue orchestrates | ~1–2 min |
| 3 | IP flip: `detach-static-ip --static-ip-name lightsailstaticIP` → `attach-static-ip --static-ip-name lightsailstaticIP --instance-name castbot-prod-2` | AWS CLI | seconds |
| 4 | `systemctl enable pm2-bitnami && pm2 restart castbot-pm && pm2 save` | NEW box | — |
| 5 | Verify (below); if healthy: ⏱️ stops | — | total ~4–6 min |

**Cutover data file list** (from `BACKUP_FILES` + on-disk survey): `playerData.json` (~4.3MB), `safariContent.json` (~2.5MB), `scheduledJobs.json`, `dstState.json`, `data_whispers.json`, `challengeLibrary.json`, `messageHistory.json`, `restartHistory.json`, `safariData-CastBotGuild.json`, `img/guides/guides.json`, `img/tips/tips.json`, `logs/user-analytics.log` (~24MB), `logs/pm2-positions.json`, **`/home/bitnami/.pm2/dump.pm2`** (clone's copy was rewritten by the boot race — sync prod's). Exclude: `temp/`, `node_modules/`.

**Phase 1 addition (from Phase 0 gotchas): re-verify Apache on the parked box before the window** — `curl -sk https://13.211.61.198/interactions` from anywhere should give 503 (or via SSH locally). If the box rebooted overnight the stale-pidfile issue is gone (Apache wrote a fresh pidfile), but verify anyway.

**Immediate verification (Claude, ~2 min):**
- `curl -I https://castbotaws.reecewagner.com/interactions` → 200
- `pm2 logs castbot-pm` on NEW: clean boot, **no "Discord client public key" error** (proves .env), pm2-logrotate online
- Data sizes on NEW match OLD's final sizes; `get-static-ips` shows IP → castbot-prod-2
- Blue watchdog posts 🟢 Prod Recovered
- **Reece smoke-test in Discord**: `/menu`, `/castlist`, one safari move in the live game, one activity-log view (exercises the Sharp overlay path)

**Post-verify (same session):**
- Raise heap cap for the new RAM: `NODE_OPTIONS='--max-old-space-size=1024' pm2 restart castbot-pm --update-env && pm2 save` (2GB box; use 640 for 1GB). This is the **one deliberate env change** — verify `pm2 logs` clean immediately after; rollback is the same command with `320`. (Plain restarts everywhere else stay `--update-env`-free per CLAUDE.md.)
- Re-enable blue auto-remediation: `PROD_WATCHDOG_AUTO_REMEDIATE` back on + `pm2 restart castbot-pm` on blue

## Rollback plan (decision gates, not vibes)

**The static IP is the only pointer. Node-js-1 stays untouched, stopped-in-place, data intact — rollback is repointing.**

| Gate | Condition | Action | Time |
|---|---|---|---|
| G1 — during cutover | Any step fails before NEW serves 200 | `detach-static-ip` → `attach-static-ip ... --instance-name Node-js-1` → `pm2 restart castbot-pm` on OLD. OLD's data is current (it took the last write before stop) — **zero data loss** | ~90s |
| G2 — first 30 min | NEW misbehaves (errors, memory, Discord failures) | Same as G1 + reverse-sync any writes made on NEW during those minutes (same tar pipe, reversed) — or accept losing ≤30 min if NEW's data is suspect | ~5 min |
| G3 — soak week | Late-appearing problem | Same as G2 with a bigger reverse-sync; snapshot `castbot-prod-pre-migration-20260728` is the disaster floor | ~10 min |

- Keep **Node-js-1 stopped but not deleted for 7 days** (still bills $5/mo — cheap insurance). Deletion afterwards is a separate authorization.
- Keep the pre-migration snapshot indefinitely (≤$1/mo) — it's also prod's only historical backup.
- `ROLLBACK_TARGET.txt` on the box (2d826a7d) covers **code** rollback — unrelated to this infra rollback; don't confuse them.

## castbot-blue validation plan

**Pre-window (blue's fitness for monitor duty)** — ✅ done 2026-07-27: CPU <1.3%, burst 100%, disk 12%, watchdog running with escalation config, forced-command status probes working (7/7 during incident 08), self-announce working.

**During window**: blue is the out-of-band announcer — its DOWN alert at cutover start and 🟢 Recovered at the end are the external confirmation loop. Auto-remediation muted (Phase 1).

**Post-cutover (blue↔new-prod tooling still works)**:
1. Forced-command status probe from blue → new box (`authorized_keys` cloned → should pass): watchdog's next DOWN/diag cycle or manual `ssh castbot-prod 'echo ok'` + status
2. Watchdog steady-state green for 24h (no flap alerts — also validates the new box isn't thrashing)
3. `npm run logs-prod` from the laptop/Windows (castbot-key path)
4. Next `#💎deploy`-triggering change deploys clean via `npm run deploy-remote-wsl` — which also closes prod's behind-origin git gap (**separate, permissioned, post-soak**)
5. Prod's 22:00 UTC 🌙 restart fires cleanly on the new box (restartHistory.json gains a planned entry)

## Post-migration follow-ups (separate authorizations)

| Item | Why |
|---|---|
| Enable AutoSnapshot add-on on castbot-prod-2 | Prod currently has NO ongoing backup |
| Delete the 7 June-2025 stale auto-snapshots of Node-js-1 | Dead cost since June 2025 |
| Delete Node-js-1 after soak | $5/mo |
| Deploy pending main commits to prod | Code freeze ends; brings incident-08 watchdog code etc. |
| Incident-08 memory mitigations (overlay pre-flight/single-flight/downscale, safariContent write-coalescing, temp-file unlink) | The 2GB box treats the symptom; these treat the cause — see incident 08 addendum |
| Consider `max_memory_restart` aligned to new heap (e.g. 1536M) | Currently 1G configured, unreachable below V8 cap |

## Related

- [RaP 0919 — Prod Cutover Strategy](../01-RaP/0919_20260420_ProdCutoverStrategy_Analysis.md) — the April 2026 analysis that chose the static-IP-reattach approach this doc executes
- [Incident 08 — SwapThrashFrozenLoop](../incidents/08-SwapThrashFrozenLoop.md) (incl. memory killing-blow addendum)
- [Incident 06 — HeapDriftGCDeathSpiral](../incidents/06-HeapDriftGCDeathSpiral.md) · [RaP 0896 §F](../01-RaP/0896_20260718_MapCreationMemoryResilience_Analysis.md)
- [TestInstanceBlueGreen.md](../03-features/TestInstanceBlueGreen.md) · [InfrastructureArchitecture.md](../infrastructure-security/InfrastructureArchitecture.md) (Hover/DO/Lightsail diagram)

---
**Last Updated**: 2026-07-27 · Pre-flight complete, awaiting Reece's decisions (bundle / pre-build tonight / temp cleanup)
