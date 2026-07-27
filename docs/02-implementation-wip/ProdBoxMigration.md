# Prod Box Migration — Node-js-1 (512MB nano) → castbot-prod-2 (bigger bundle)

**Status**: 🟡 Planned — cutover window **Mon 2026-07-28 17:00–18:00 AWST (09:00–10:00 UTC / 5–6am US Eastern)**
**Driver**: [Incident 08](../incidents/08-SwapThrashFrozenLoop.md) — 94-min outage from swap-thrash on the 447MB-usable box; incident 06 already called the box "genuinely under-provisioned"
**Verified pre-flight**: 2026-07-27 via read-only AWS CLI + SSH forensics on both boxes (3-agent sweep; no blockers)
**Executor**: Claude drives every step via AWS CLI + SSH from the Windows machine; Reece authorizes each mutation phase and smoke-tests in Discord

## Decisions needed from Reece

| # | Decision | Recommendation |
|---|---|---|
| 1 | **Bundle**: `micro_3_2` 1GB/40GB/$7-mo (+$2) vs `small_3_2` 2GB/60GB/$12-mo (+$7) | **small_3_2 (2GB)** — matches castbot-blue, 4× current RAM, $5/mo more than the minimum step; incident 06/08 showed 1GB is only ~2× a ceiling we already hit |
| 2 | **Pre-build tonight?** Phase 0 (snapshot + build + park the new box) can run the evening before — cutover day then contains only the 4-step flip (~5 min downtime) | **Yes** — shrinks the risky window and battle-tests the snapshot boot with a full day of slack |
| 3 | **temp/ cleanup before snapshot** — prod repo carries **1.1GB of orphaned overlay images** (631 files, zero value; failure paths never unlink — see incident 08 addendum). Deleting first slims the snapshot | **Yes** — one `rm` of `temp/activity_overlay_*` + `*_compressed.jpg` (write op, needs the word) |

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

**Cutover data file list** (from `BACKUP_FILES` + on-disk survey): `playerData.json` (~4.3MB), `safariContent.json` (~2.5MB), `scheduledJobs.json`, `dstState.json`, `data_whispers.json`, `challengeLibrary.json`, `messageHistory.json`, `restartHistory.json`, `safariData-CastBotGuild.json`, `img/guides/guides.json`, `img/tips/tips.json`, `logs/user-analytics.log` (~24MB), `logs/pm2-positions.json`. Exclude: `temp/`, `node_modules/`.

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

- [Incident 08 — SwapThrashFrozenLoop](../incidents/08-SwapThrashFrozenLoop.md) (incl. memory killing-blow addendum)
- [Incident 06 — HeapDriftGCDeathSpiral](../incidents/06-HeapDriftGCDeathSpiral.md) · [RaP 0896 §F](../01-RaP/0896_20260718_MapCreationMemoryResilience_Analysis.md)
- [TestInstanceBlueGreen.md](../03-features/TestInstanceBlueGreen.md)

---
**Last Updated**: 2026-07-27 · Pre-flight complete, awaiting Reece's decisions (bundle / pre-build tonight / temp cleanup)
