# Tips Gallery - attachment:// Protocol Implementation Analysis

**Created:** 2025-11-15
**Status:** 🔴 BLOCKED - Error 50006 "Cannot send an empty message"
**Context:** Implementing local filesystem image display in Discord tips gallery
**Goal:** Display 10 PNG screenshots using `attachment://` protocol without HTTP URLs or Discord CDN uploads

---

## 🤔 Original Context: User's Problem Statement

**User reported:** Tips gallery images not displaying (broken image icons).

**Original implementation:** Used Express static file serving with HTTP URLs:
```javascript
const baseUrl = isDev
  ? 'https://adapted-deeply-stag.ngrok-free.app/img/tips'
  : 'https://castbotaws.reecewagner.com/img/tips';
url: `${baseUrl}/1.png`
```

**User's insight:** "We don't need to use HTTP URLs - the bot runs from app.js and can access files locally two directories away at `/home/reece/castbot/img/tips/`"

**User reference:** Previous Safari Map implementation used local file paths successfully (though documentation shows Safari Maps NOW uses Discord CDN).

---

## 🏛️ Historical Context: The Journey of Failed Approaches

### APPROACH 1: Express Static File Serving ❌

**Attempted:** Use `https://adapted-deeply-stag.ngrok-free.app/img/tips/1.png` in Media Gallery

**Result:** Images didn't display (broken image icons)

**Why it failed:** Unknown - Express was serving files correctly (curl test returned HTTP 200), but Discord wasn't loading them.

### APPROACH 2: Interaction Response with Files ❌

**Attempted:** Use `CHANNEL_MESSAGE_WITH_SOURCE` (type 4) with `files` array in interaction response

**Implementation:**
```javascript
return {
  type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
  data: {
    files: attachments,  // Array of {attachment: buffer, name: 'file.png'}
    components: [...]
  }
};
```

**Result:** "This interaction failed" - Discord rejected response immediately

**Why it failed:** **CRITICAL DISCOVERY** - Discord interaction responses (types 4, 5, 7, etc.) **CANNOT include file attachments**. Only webhook messages support files.

**Evidence:** Discord API limitation documented in [DiscordInteractionAPI.md](../docs/standards/DiscordInteractionAPI.md)

### APPROACH 3: Webhook Followup with client.fetchWebhook() ❌

**Attempted:** Use `client.fetchWebhook()` to create followup message with files

**Implementation:**
```javascript
const webhook = await client.fetchWebhook(interaction.application_id, interaction.token);
await webhook.send({ files: attachments, components: [...] });
```

**Result:** Error 50001 "Missing Access"

**Why it failed:** `client.fetchWebhook()` requires bot-level permissions. Interaction tokens have different permission scopes.

### APPROACH 4: WebhookClient ❌

**Attempted:** Use `WebhookClient` class instead of fetching webhook

**Implementation:**
```javascript
const { WebhookClient } = await import('discord.js');
const webhook = new WebhookClient({
  id: interaction.application_id,
  token: interaction.token
});
await webhook.send({ files: attachments, components: [...] });
```

**Result:** Error 50001 "Missing Access" (same as Approach 3)

**Why it failed:** `WebhookClient.send()` still tries to use bot permissions instead of interaction token permissions.

### APPROACH 5: Direct REST API with FormData ⏸️ CURRENT

**Attempted:** Use Discord REST API directly with multipart/form-data upload

**Implementation:** See [Current Implementation](#current-implementation-details) section below

**Result:** Error 50006 "Cannot send an empty message"

**Status:** 🔴 **BLOCKED** - Payload contains content, components, and attachments, but Discord still rejects as "empty"

---

## 📊 Critical Technical Discoveries

### Discovery 1: Discord Interaction Response Limitations

**Finding:** Interaction response types (4, 5, 6, 7, 9) **cannot attach files**.

**Implication:** Must use **two-step pattern**:
1. Return `DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE` (type 5) to acknowledge interaction
2. Use webhook API to send followup message with files

**Documentation:** [DiscordInteractionAPI.md](../docs/standards/DiscordInteractionAPI.md) lines 119-136

### Discovery 2: attachment:// Protocol Requirements

**Finding:** The `attachment://filename.png` protocol requires:
1. Files uploaded via `multipart/form-data` as `files[N]` form fields
2. `attachments` array in `payload_json` describing each file:
   ```json
   {
     "attachments": [
       { "id": 0, "filename": "1.png" },
       { "id": 1, "filename": "2.png" }
     ]
   }
   ```
3. Media Gallery references files: `{ media: { url: "attachment://1.png" } }`

**Mapping:** `attachment://1.png` → looks up `attachments` array → finds entry with `filename: "1.png"` → maps to `files[N]` form field

**Implementation:** Lines 2097-2119 in app.js

### Discovery 3: Webhook Endpoint Pattern

**Finding:** Interaction followups use specific endpoint:
```
POST https://discord.com/api/v10/webhooks/{application_id}/{interaction_token}
```

**NOT:** Regular webhook endpoints or Discord.js client methods

**Headers:** `Content-Type: multipart/form-data; boundary=...` (set by FormData)

### Discovery 4: Permission Context Differences

**Finding:** Three different permission contexts failed:
- `client.fetchWebhook()` - Requires bot permissions (50001)
- `WebhookClient` - Also requires bot permissions (50001)
- Direct REST API - Should work with interaction token... but getting 50006 🤔

---

## 🔧 Current Implementation Details

### File Locations

**Handler:** `/home/reece/castbot/app.js:7897-7908`
```javascript
} else if (custom_id === 'dm_view_tips') {
  return ButtonHandlerFactory.create({
    id: 'dm_view_tips',
    deferred: true,  // Uses DEFERRED response pattern
    handler: async (context) => {
      console.log('🎯 Loading tips gallery - reading all 10 images from filesystem...');
      const interaction = req.body;  // Full Discord interaction object
      return await generateInitialTipsScreen(interaction, context.client);
    }
  })(req, res, client);
}
```

**Main Function:** `/home/reece/castbot/app.js:2042-2207` - `generateInitialTipsScreen()`

**Image Files:** `/home/reece/castbot/img/tips/1.png` through `10.png` (total ~2.5MB)

### Current Flow

1. **User clicks "View Tips" button**
   - Button ID: `dm_view_tips`
   - Location: Production Menu → Feature announcement ticker accessory

2. **Immediate Response (< 3s):**
   ```javascript
   return {
     type: InteractionResponseType.DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE, // Type 5
     data: { flags: (1 << 6) }  // EPHEMERAL flag
   };
   ```
   - Discord shows: "CastBot is thinking..."

3. **Background Process (setTimeout):**
   - Loads all 10 PNG files from filesystem using `fs.readFile()`
   - Creates FormData with:
     - `files[0]` through `files[9]` - Binary file buffers
     - `payload_json` - JSON string containing:
       ```json
       {
         "content": "💡 **CastBot Features Tour**",
         "flags": 64,
         "attachments": [
           { "id": 0, "filename": "1.png" },
           { "id": 1, "filename": "2.png" },
           ... 10 total
         ],
         "components": [
           {
             "type": 17,  // Container
             "accent_color": 10181046,
             "components": [
               { "type": 10, "content": "## 💡 CastBot Features Tour..." },
               { "type": 14 },  // Separator
               {
                 "type": 12,  // Media Gallery
                 "items": [{
                   "media": { "url": "attachment://1.png" },
                   "description": "🦁 Safari System"
                 }]
               },
               ... more components
             ]
           }
         ]
       }
       ```

4. **POST to Discord:**
   ```javascript
   const webhookUrl = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}`;
   const response = await fetch(webhookUrl, {
     method: 'POST',
     body: form,  // FormData object
     headers: form.getHeaders()  // multipart/form-data with boundary
   });
   ```

5. **Error Received:**
   ```json
   {
     "message": "Cannot send an empty message",
     "code": 50006
   }
   ```

### Debug Output (Current Logs)

```
🎯 Loading tips gallery - reading all 10 images from filesystem...
✅ Loaded tip image 1.png (70301 bytes)
✅ Loaded tip image 2.png (438809 bytes)
... (all 10 loaded successfully)
📤 Creating webhook followup message with 10 attached files...
📋 Payload structure: {
  "hasContent": true,
  "hasComponents": true,
  "hasAttachments": true,
  "attachmentCount": 10,
  "componentCount": 1
}
📡 Sending to: https://discord.com/api/v10/webhooks/1328366050848411658/aW50ZXJhY3Rpb246...
Error: {"message": "Cannot send an empty message", "code": 50006}
```

**Critical Observation:** Payload HAS content, components, AND attachments, but Discord still rejects as "empty"! 🚨

---

## 🔍 ULTRATHINKING: Why Error 50006 Persists

### Possibilities to Investigate

1. **FormData Serialization Issue**
   - Maybe `form.append('payload_json', JSON.stringify(payload))` isn't sending correctly
   - FormData might be corrupting the JSON
   - **Test:** Try logging `form.get('payload_json')` before sending

2. **Components V2 Not Recognized as Content**
   - Discord might not count Components V2 Container as "content"
   - Even though we added `content: "💡 **CastBot Features Tour**"`, maybe it's being stripped?
   - **Test:** Try sending ONLY content field without components

3. **Attachments Array Format Wrong**
   - Current format: `{ id: 0, filename: "1.png" }`
   - Maybe Discord expects: `{ id: "0", filename: "1.png" }` (string ID)?
   - Maybe Discord expects additional fields like `description`?
   - **Test:** Check Discord API docs for exact attachments array schema

4. **Files Not Actually Attached**
   - Maybe FormData isn't attaching the files correctly?
   - **Test:** Log FormData entries to verify files are attached

5. **Wrong Endpoint or Method**
   - Maybe interaction webhooks require different endpoint?
   - Maybe need to use `/webhooks/{app_id}/{token}/messages` instead?
   - **Test:** Try different webhook endpoint variations

6. **Token Expiration**
   - Maybe interaction token expired by the time we send? (15-minute limit)
   - **Test:** Log timestamp difference between interaction and send

7. **Missing Required Field**
   - Maybe Discord requires `embeds: []` or other field to not consider message "empty"?
   - **Test:** Try adding `embeds: []` to payload

---

## 📁 Related Documentation

### Internal CastBot Docs
- **[ComponentsV2.md](../docs/standards/ComponentsV2.md)** - Media Gallery (type 12) component structure
- **[DiscordInteractionAPI.md](../docs/standards/DiscordInteractionAPI.md)** - Interaction response patterns, webhook followups
- **[ComponentsV2Issues.md](../docs/troubleshooting/ComponentsV2Issues.md)** - "This interaction failed" error patterns
- **[LoggingStandards.md](../docs/standards/LoggingStandards.md)** - Static imports requirement (performance)
- **[SafariMapExplorer.md](../docs/features/SafariMapExplorer.md)** - Historical context on map image handling
- **[ImageHandling RaP](0980_20251106_ImageHandling_TechnicalAnalysis.md)** - Comprehensive image techniques analysis

### Discord API References
- **Interaction Followups:** https://discord.com/developers/docs/interactions/receiving-and-responding#followup-messages
- **Webhook Endpoints:** https://discord.com/developers/docs/resources/webhook#execute-webhook
- **Multipart Form Data:** https://discord.com/developers/docs/reference#uploading-files
- **attachment:// Protocol:** (Implied in docs, not explicitly documented)

---

## 🎯 Next Steps to Try (Priority Order)

### 1. **Verify FormData is Sending Correctly** (5 min)

Add logging BEFORE sending:
```javascript
// Log FormData contents
console.log('🔍 FormData keys:', Array.from(form.keys()));
console.log('🔍 payload_json:', form.get('payload_json'));
```

Expected: Should see `['files[0]', 'files[1]', ..., 'files[9]', 'payload_json']`

### 2. **Test Minimal Payload** (10 min)

Strip down to absolute minimum to isolate issue:
```javascript
const minimalPayload = {
  content: "Test message",
  flags: 64
};
// NO components, NO attachments, NO files
```

If this works → Issue is with components or attachments structure
If this fails → Issue is with endpoint or token

### 3. **Try Alternative Endpoint** (5 min)

Instead of `/webhooks/{app_id}/{token}`, try:
```javascript
const webhookUrl = `https://discord.com/api/v10/webhooks/${interaction.application_id}/${interaction.token}/messages`;
```

Or use existing utils pattern:
```javascript
const { DiscordRequest } = await import('./utils.js');
await DiscordRequest(`/webhooks/${interaction.application_id}/${interaction.token}`, {
  method: 'POST',
  body: form
});
```

### 4. **Test Without attachment:// Protocol** (15 min)

Fall back to Discord CDN upload pattern:
```javascript
// Upload to storage channel first (like Safari Maps)
const { uploadImageToDiscord } = await import('./mapExplorer.js');
const guild = await client.guilds.fetch(guildId);
const cdnUrls = [];
for (let i = 1; i <= 10; i++) {
  const { url } = await uploadImageToDiscord(guild, `/home/reece/castbot/img/tips/${i}.png`, `tip_${i}.png`);
  cdnUrls.push(url);
}

// Use CDN URLs in Media Gallery
media: { url: cdnUrls[0] }  // Regular HTTPS URL
```

**Trade-off:** Creates storage channel overhead, but PROVEN to work

### 5. **Inspect Network Traffic** (Advanced - 30 min)

Add raw request logging:
```javascript
const https = await import('https');
const agent = new https.Agent({ keepAlive: false });

// Log raw request
form.pipe(process.stdout);  // See actual multipart data

const response = await fetch(webhookUrl, {
  method: 'POST',
  body: form,
  headers: form.getHeaders(),
  agent: agent
});
```

### 6. **Try Discord.js REST Manager** (15 min)

Use Discord.js built-in REST client instead of node-fetch:
```javascript
const { REST } = await import('@discordjs/rest');
const rest = new REST({ version: '10', authPrefix: 'Bot' }).setToken(process.env.DISCORD_TOKEN);

// Or use interaction-specific REST
await rest.post(`/webhooks/${interaction.application_id}/${interaction.token}`, {
  files: attachments,  // AttachmentBuilder objects
  body: {
    flags: 64,
    components: [...]
  }
});
```

---

## 🚀 RECOMMENDED IMMEDIATE ACTION

**Start with Test #2 (Minimal Payload)** to isolate the issue:

```javascript
// Replace entire payload with this temporarily:
const testPayload = {
  content: "🧪 Testing minimal payload - does Discord see this?"
};
form.append('payload_json', JSON.stringify(testPayload));

// Send with NO files attached
// If this works → Issue is with components/attachments
// If this fails → Issue is with endpoint/token/FormData
```

**If minimal payload works:** Add components back incrementally to find breaking point
**If minimal payload fails:** Problem is fundamental - try alternative endpoints or Discord.js REST

---

## 📝 Code References for Next Claude

### Button Handler Entry Point
```
/home/reece/castbot/app.js:7897-7908
Handler: dm_view_tips
Pattern: ButtonHandlerFactory with deferred: true
```

### Main Implementation
```
/home/reece/castbot/app.js:2042-2207
Function: generateInitialTipsScreen(interaction, client)
Pattern: DEFERRED response + setTimeout webhook followup
```

### Image Files
```
Location: /home/reece/castbot/img/tips/
Files: 1.png through 10.png
Total: ~2.5MB (10 files)
Format: PNG screenshots of CastBot features
```

### Navigation Handlers (Not Yet Implemented)
```
/home/reece/castbot/app.js:7910-7933
Handlers: tips_next_*, tips_prev_*
Function: generateTipsScreenNavigation(index)
Status: Ready for testing after gallery works
```

---

## 🔗 Cross-References

**Related RaPs:**
- [0980 - Image Handling Technical Analysis](0980_20251106_ImageHandling_TechnicalAnalysis.md) - All 5 image techniques in CastBot

**Related Features:**
- [SafariMapExplorer.md](../docs/features/SafariMapExplorer.md) - Similar image handling patterns
- Production Menu feature ticker (app.js:878-893) - Where "View Tips" button lives

**Related Patterns:**
- [ButtonHandlerFactory.md](../docs/enablers/ButtonHandlerFactory.md) - Deferred response pattern
- [DiscordMessenger.md](../docs/enablers/DiscordMessenger.md) - DM and REST API patterns

---

## 🎭 Conclusion: The Paradox of the "Empty" Message

> **We send content, components, and attachments. Discord sees nothing. Why?**

The central mystery of this RaP:
- ✅ Payload HAS `content` field
- ✅ Payload HAS `components` array with valid Container
- ✅ Payload HAS `attachments` array with 10 descriptors
- ✅ FormData HAS 10 files attached as `files[0-9]`
- ❌ Discord returns: "Cannot send an empty message" (50006)

**Hypothesis:** Something in the transmission layer is stripping or corrupting the payload. FormData serialization, headers, endpoint, or Discord's interpretation of the structure.

**Validation Strategy:** Binary search via minimal payloads (Test #2) to isolate the breaking component.

**Fallback Strategy:** Revert to Discord CDN upload pattern (Test #4) if attachment:// protocol proves unfeasible.

---

**Document Status:** ✅ Complete Technical Analysis
**Next Action:** Run Test #2 (Minimal Payload) to isolate root cause
**Success Criteria:** Images display in tips gallery without HTTP URLs or storage channel overhead

**Session Token Usage:** ~135K of 200K (need to compact or create new session after next test)

---

*The user was right: the bot CAN access local files. Discord just needs to accept them.* 🔧
