# Incident: Map Image Oversize — OOM Crash & Discord Upload Failure

**Date:** 2026-03-17 ~02:00 AWST
**Duration:** ~10 minutes (server unresponsive until Lightsail reboot)
**Severity:** High — production bot completely unresponsive
**Root cause:** Oversized PNG grid image (16MB) exceeding Discord upload limit, combined with Sharp memory pressure on a 448MB RAM server

---

## Timeline

1. **02:00** — Reece uploads a 3238x4532 JPEG (~5MB) to Discord as a map source image
2. **02:00** — Bot downloads the image, processes it through Sharp grid overlay
3. **02:00** — Sharp generates a 16MB PNG (`.png()` with no compression options)
4. **02:00** — Original image uploaded to #map-storage as PNG (format conversion from JPEG → PNG inflates size)
5. **02:00** — Grid image upload to Discord fails: `DiscordAPIError[40005]: Request entity too large`
6. **02:01** — User retries with 5x5 and 7x7 grids — both fail (16MB each)
7. **02:03** — 4 failed 16MB map images sitting on disk (64MB total)
8. **02:05** — Server becomes unresponsive — Sharp processing + 4 large files in memory exhausts 448MB RAM
9. **02:08** — SSH connections timeout (server OOM or swap thrashing)
10. **02:10** — Reece reboots Lightsail instance from AWS console
11. **02:11** — PM2 fails to auto-restart (`pm2 resurrect` needed manually)
12. **02:12** — `pm2 resurrect` restores castbot-pm, bot is back online
13. **02:13** — 64MB of failed map images cleaned up from disk

## Why It Happened

### The image was too big — but the same feature worked before

Previous map images were ~1-2MB at lower resolution. The 3238x4532 image (14.6 megapixels) was the largest ever used. The grid overlay generation produces output proportional to input size:

| Previous map | This map |
|---|---|
| ~2000x2000 (4MP) | 3238x4532 (14.6MP) |
| Grid output: ~1.3MB PNG | Grid output: **16MB PNG** |

### Three compounding failures

1. **No input size validation** — Bot accepts any image URL without checking dimensions or file size
2. **No output compression** — `.png()` with default settings. No `compressionLevel`, no JPEG fallback
3. **No upload pre-check** — `uploadImageToDiscord()` sends the file without checking size against Discord's limit
4. **Original image format conversion** — JPEG → PNG for the "original pre-map image" archive inflated a 5MB JPEG into a much larger PNG

### Why the server crashed

- 448MB total RAM (AWS Lightsail $5 tier)
- Sharp loads the full image into memory for processing
- 4 retry attempts = 4 × 16MB images buffered
- Process exceeded available memory → swap thrashing → SSH unresponsive

### Why PM2 didn't auto-restart

**PM2 startup was NEVER configured.** Investigation confirmed:
- `pm2 startup` output says "To setup the Startup Script, copy/paste the following command" — it was never run
- No `/etc/systemd/system/pm2-bitnami.service` exists
- No `@reboot` crontab entry
- The dump file (`/home/bitnami/.pm2/dump.pm2`) exists and is valid — `pm2 resurrect` works — but nothing triggers it on boot

**Fix required (run on prod):**
```bash
sudo env PATH=$PATH:/opt/bitnami/node/bin /opt/bitnami/node/lib/node_modules/pm2/bin/pm2 startup systemd -u bitnami --hp /home/bitnami
pm2 save
```

### Additional: Fog map cascade (49 × 16MB)

The fog-of-war system generates one fog map per grid cell. For a 7×7 grid, that's 49 fog maps. Each was being generated as uncompressed PNG from the full 3398×4692 canvas — potentially 8-16MB each. 49 uploads at 16MB = 784MB attempted through Discord's API. This cascade likely exhausted both RAM and swap, causing the OOM condition.

---

## What Was Broken

- **Map creation** — all attempts to create/update maps with images >~4MP would fail
- **Server availability** — OOM condition made entire server unresponsive for ~5 minutes
- **PM2 auto-recovery** — bot didn't auto-start after Lightsail reboot

## What Was NOT Broken

- Player data (playerData.json, safariContent.json) — untouched
- All non-map features — working once server rebooted
- Discord channel backup service — posted backup before crash

---

## Fixes Applied

### 1. Input image size validation (mapExplorer.js)
- Reject source images >15MB at download
- Auto-downscale images >8 megapixels before grid processing
- Log dimensions and file size for debugging

### 2. Output compression (mapExplorer.js)
- Grid output uses `png({ compressionLevel: 9, palette: true })` — dramatically smaller PNGs
- If PNG output still >7MB, auto-re-encode as JPEG at 85% quality
- `uploadImageToDiscord()` now checks file size before uploading — compresses to JPEG if >7MB, rejects if >24MB

### 3. Original image format preservation
- Original image saved as JPEG (was being converted to PNG unnecessarily)
- If image was downscaled, uses the downscaled version for the archive

### 4. PM2 auto-restart (TODO)
- Verify `pm2 startup` is configured on prod
- Verify systemd service exists for pm2-bitnami
- Run `pm2 save` after confirming startup is configured

---

## Prevention

| What | How | Status |
|---|---|---|
| Input validation | Reject >15MB, downscale >8MP | ✅ Fixed |
| Output compression | PNG compression + JPEG fallback | ✅ Fixed |
| Upload pre-check | Size check before Discord upload | ✅ Fixed |
| Original image format | Keep as JPEG, don't convert to PNG | ✅ Fixed |
| PM2 auto-restart | Run `pm2 startup` + `pm2 save` on prod | **TODO — requires sudo on prod** |
| Memory monitoring | Health monitor alerts when memory >85% | Already exists |
| Disk cleanup | Clean up failed map images | ✅ Done (64MB freed) |

---

## Lessons

1. **Sharp on a 448MB server is a loaded gun** — any image processing must have hard limits on input size. The server has no headroom for large images.
2. **PNG is not a compression format** — `.png()` with no options on a large photo-like image produces enormous files. JPEG is appropriate for map images.
3. **Discord upload limits are silent** — the error doesn't crash the bot, but repeated retries with large buffers can exhaust memory.
4. **PM2 auto-restart is not "set and forget"** — needs verification after each Lightsail reboot or system change.
5. **The "post original image" feature request** (from the prompt that introduced these changes) had an unintended consequence: converting JPEG → PNG for the archive step inflated file sizes and added an extra large upload that could also fail.
