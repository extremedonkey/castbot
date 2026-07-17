/**
 * fileImportHandler.js — Modal-based file import using File Upload (Type 19)
 *
 * Replaces legacy createMessageCollector pattern with Discord's native
 * File Upload component, eliminating the need for MessageContent privileged intent.
 *
 * Currently supports: Safari import, Season App Questions import
 * Designed to be extended for: PlayerData import, any JSON import
 *
 * See: RaP 0917 — Privileged Intents (canonical reference; supersedes RaP 0940)
 */

/**
 * Build the file import modal
 * @param {string} importType - Import type identifier (e.g. 'safari', 'playerdata')
 * @param {string} guildId - Guild ID (embedded in custom_id for modal submit)
 * @returns {Object} Modal interaction response (type 9)
 */
export function buildFileImportModal(importType, guildId, configId = null) {
  const configs = {
    safari: {
      title: 'Import Safari Data',
      label: 'Safari Export File',
      description: 'Upload a Safari export (.json) or full package (.zip)',
    },
    playerdata: {
      title: 'Import Player Data',
      label: 'Player Data File',
      description: 'Upload the playerData JSON backup file',
    },
    seasonquestions: {
      title: 'Import Season Questions',
      label: 'Questions Export File',
      description: 'Upload a season questions JSON file exported from another season',
    },
    sq_single: {
      title: 'Import Questions',
      label: 'Questions File',
      description: 'Upload a questions JSON file to load into this season',
    }
  };

  const config = configs[importType];
  if (!config) throw new Error(`Unknown import type: ${importType}`);

  return {
    type: 9, // MODAL
    data: {
      custom_id: `file_import_submit:${importType}:${guildId}${configId ? `:${configId}` : ''}`,
      title: config.title,
      components: [
        {
          type: 18, // Label
          label: config.label,
          description: config.description,
          component: {
            type: 19, // File Upload
            custom_id: 'import_file',
            min_values: 1,
            max_values: 1,
            required: true
          }
        }
      ]
    }
  };
}

/**
 * Process a file import modal submission
 * @param {Object} params
 * @param {string} params.importType - 'safari' or 'playerdata'
 * @param {string} params.guildId - Guild ID
 * @param {string} params.userId - User who submitted
 * @param {Object} params.resolved - Interaction resolved data (contains attachments)
 * @param {Array} params.components - Modal components (contains file upload values)
 * @param {Object} params.client - Discord client
 * @returns {Object} Components V2 response
 */
export async function processFileImport({ importType, guildId, userId, resolved, components, client, configId }) {
  // Extract attachment ID from file upload component
  const fileComponent = findFileUploadComponent(components);
  if (!fileComponent || !fileComponent.values?.length) {
    return buildErrorResponse('No file was uploaded. Please try again.', importType);
  }

  const attachmentId = fileComponent.values[0];
  const attachment = resolved?.attachments?.[attachmentId];
  if (!attachment) {
    return buildErrorResponse('Could not resolve uploaded file. Please try again.', importType);
  }

  console.log(`📥 [FileImport] Processing ${importType} import — file: ${attachment.filename}, size: ${attachment.size}`);

  // Validate extension + size (safari also accepts .zip packages; format is
  // verified content-first downstream — the extension check is just fast feedback)
  const isZip = attachment.filename.endsWith('.zip');
  if (importType === 'safari') {
    if (!attachment.filename.endsWith('.json') && !isZip) {
      return buildErrorResponse(`Expected a .json or .zip file, got: ${attachment.filename}`, importType);
    }
    const maxBytes = (isZip ? 25 : 5) * 1024 * 1024;
    if (attachment.size > maxBytes) {
      return buildErrorResponse(
        `File too large (${(attachment.size / 1024 / 1024).toFixed(1)}MB — max ${isZip ? 25 : 5}MB for ${isZip ? 'packages' : 'JSON exports'}).`,
        importType
      );
    }
  } else if (!attachment.filename.endsWith('.json')) {
    return buildErrorResponse(`Expected a .json file, got: ${attachment.filename}`, importType);
  }

  // Download file content
  const response = await fetch(attachment.url);
  if (!response.ok) {
    return buildErrorResponse(`Failed to download file: HTTP ${response.status}`, importType);
  }

  // Safari imports are parsed from raw bytes (zip or JSON) via the preview/confirm flow
  if (importType === 'safari') {
    const fileBuffer = Buffer.from(await response.arrayBuffer());
    console.log(`📥 [FileImport] Downloaded ${fileBuffer.length} bytes from ${attachment.filename}`);
    return await processSafariImport(guildId, fileBuffer, attachment.filename, userId, client);
  }

  const jsonContent = await response.text();
  console.log(`📥 [FileImport] Downloaded ${jsonContent.length} characters from ${attachment.filename}`);

  // Route to the appropriate import handler
  if (importType === 'playerdata') {
    return await processPlayerDataImport(guildId, jsonContent);
  } else if (importType === 'seasonquestions') {
    return await processSeasonQuestionsImport(guildId, jsonContent);
  } else if (importType === 'sq_single') {
    return await processSingleSeasonQuestionsImport(guildId, jsonContent, configId);
  }

  return buildErrorResponse(`Unknown import type: ${importType}`);
}

// --- Safari Import (parse → plan → preview → confirm → execute) ---

/**
 * Stage 1: parse + validate the uploaded file, build a read-only import plan,
 * stash the payload, and return the preview/confirm screen. NOTHING is written here.
 */
async function processSafariImport(guildId, fileBuffer, filename, userId, client) {
  const { parseImportPayload, planSafariImport } = await import('../safariImportExport.js');

  let parsed;
  try {
    parsed = await parseImportPayload(fileBuffer);
  } catch (err) {
    return buildErrorResponse(err.message, 'safari');
  }

  const plan = await planSafariImport(guildId, parsed);

  // Map guard: map content with no active map AND no usable packaged image →
  // same "create the map first" refusal as before (prevents orphan coordinates).
  // With a packaged image + grid size, the confirm screen offers auto-creation instead.
  if (plan.needsMapCreate && !plan.canCreateMap) {
    const gridNote = plan.importGrid ? ` (**${plan.importGrid.width}x${plan.importGrid.height}** to match this export)` : '';
    return buildErrorResponse(
      'This export contains map data, but your server has no active map yet' +
      (parsed.imageBuffer ? ' and the packaged image could not be used.' : ' and no map image is included.') + '\n\n' +
      '**1.** Go to **Map Explorer** → **Create / Upload Map**\n' +
      '**2.** Upload the **same map image** used in the export\n' +
      `**3.** Set the correct **grid size**${gridNote}\n` +
      '**4.** Wait for all **location channels** to be created\n\n' +
      'Then try importing again.\n' +
      '-# Tip: a full **package (.zip)** export includes the map image, letting CastBot create the map for you.',
      'safari'
    );
  }
  if (plan.channelCapExceeded) {
    return buildErrorResponse(
      `This package's map is ${plan.importGrid.width}x${plan.importGrid.height} = ${plan.channelCount} channels, which exceeds the 400 channel limit.`,
      'safari'
    );
  }

  const crypto = await import('crypto');
  const pending = {
    key: crypto.randomBytes(6).toString('hex'),
    guildId,
    userId,
    filename,
    data: parsed.data,
    imageBuffer: parsed.imageBuffer,
    imageExt: parsed.imageExt,
    manifest: parsed.manifest,
    formatVersion: parsed.formatVersion,
    exportType: parsed.exportType,
    includedComponents: parsed.includedComponents,
    plan,
    mode: 'merge',
    createdAt: Date.now()
  };
  stashPendingImport(pending);

  console.log(`📥 [FileImport] Safari import staged for guild ${guildId} (key ${pending.key}, format v${pending.formatVersion}, components: ${pending.includedComponents.join(',')})`);
  return buildImportPreview(pending);
}

// --- Pending import store (in-memory, TTL'd; one staged import per guild) ---

const PENDING_TTL_MS = 15 * 60 * 1000;
const PENDING_MAX = 5;

function getPendingStore() {
  if (!global.pendingSafariImports) global.pendingSafariImports = new Map();
  return global.pendingSafariImports;
}

export function stashPendingImport(entry) {
  const store = getPendingStore();
  const now = Date.now();
  for (const [k, v] of store) {
    if (now - v.createdAt > PENDING_TTL_MS || v.guildId === entry.guildId) store.delete(k);
  }
  while (store.size >= PENDING_MAX) {
    store.delete(store.keys().next().value); // Maps iterate in insertion order → oldest first
  }
  store.set(entry.key, entry);
}

/** Look up a staged import without consuming it (mode toggles, back navigation). */
export function peekPendingImport(key) {
  const store = getPendingStore();
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() - entry.createdAt > PENDING_TTL_MS) {
    store.delete(key);
    return null;
  }
  return entry;
}

/** Consume a staged import (confirm handlers — delete-before-execute is the double-click guard). */
export function takePendingImport(key) {
  const entry = peekPendingImport(key);
  if (entry) getPendingStore().delete(key);
  return entry;
}

export function deletePendingImport(key) {
  getPendingStore().delete(key);
}

/** Shown when a confirm/mode interaction references an expired or consumed staged import. */
export function buildExpiredResponse() {
  return buildErrorResponse(
    '⏰ This import session has expired (or was already run). Please upload the file again.',
    'safari'
  );
}

// --- Preview / confirm screens ---

/**
 * The preview/confirm screen: what the import contains, what it would do to THIS
 * server, mode selection (Merge/Replace), and explicit confirm. Pure UI — no writes.
 */
export function buildImportPreview(pending) {
  const { plan, mode, formatVersion, exportType, manifest, key } = pending;
  const isReplace = mode === 'replace';

  const formatLabel = exportType === 'legacy' ? 'legacy JSON (v1)'
    : exportType === 'package' ? `ZIP package (v${formatVersion})`
    : `JSON export (v${formatVersion})`;
  const metaBits = [`Format: ${formatLabel}`];
  if (manifest?.sourceGuildId) metaBits.push(`source server ${manifest.sourceGuildId}`);
  if (manifest?.exportedAt) metaBits.push(`exported ${manifest.exportedAt.split('T')[0]}`);

  const lines = [];
  const secLine = (emoji, label, s) => {
    if (!s || s.incoming === 0) return;
    const bits = [];
    if (s.create) bits.push(`${s.create} new`);
    if (s.update) bits.push(isReplace ? `${s.update} replace existing` : `${s.update} update existing`);
    lines.push(`${emoji} **${label}:** ${s.incoming} (${bits.join(', ')})`);
  };
  secLine('🏪', 'Stores', plan.stores);
  secLine('📦', 'Items', plan.items);
  secLine('⚡', 'Actions', plan.actions);
  if (plan.configFields.length) {
    lines.push(`⚙️ **Settings:** ${plan.configFields.length} field${plan.configFields.length === 1 ? '' : 's'} will be applied`);
  }
  if (plan.mapCells) {
    lines.push(plan.hasActiveMap
      ? `🗺️ **Map Data:** ${plan.mapCells} cell${plan.mapCells === 1 ? '' : 's'} merged into your active map`
      : `🗺️ **Map Data:** ${plan.mapCells} cell${plan.mapCells === 1 ? '' : 's'}`);
  }
  if (plan.hasImage) {
    if (plan.hasActiveMap) {
      lines.push('🖼️ **Map Image:** will replace your current map image and regenerate fog of war (takes a few minutes)');
    } else if (plan.canCreateMap) {
      lines.push(`🖼️ **Map Creation:** a new **${plan.importGrid.width}x${plan.importGrid.height}** map (${plan.channelCount} channels) will be created from the packaged image — takes several minutes`);
    }
  }

  const components = [
    { type: 10, content: `## 📥 Safari Import Ready` },
    { type: 10, content: `-# ${metaBits.join(' · ')}` },
    { type: 14 },
    { type: 10, content: '### ```📦 Contents```' },
    { type: 10, content: lines.join('\n') || '_Nothing importable found_' }
  ];

  if (plan.warnings.length) {
    components.push({ type: 10, content: '⚠️ **Warnings:**\n' + plan.warnings.map(w => `• ${typeof w === 'string' ? w : w.message}`).join('\n') });
  }

  components.push(
    { type: 14 },
    { type: 10, content: '### ```🔀 Import Mode```' },
    { type: 1, components: [{
      type: 3,
      custom_id: `safari_import_mode_${key}`,
      options: [
        { label: 'Merge (recommended)', value: 'merge', description: 'Update matching IDs, create the rest. Nothing is deleted.', emoji: { name: '🔀' }, default: !isReplace },
        { label: 'Replace', value: 'replace', description: 'Clear the imported sections first, then import fresh.', emoji: { name: '♻️' }, default: isReplace }
      ]
    }] },
    { type: 14 },
    { type: 10, content: isReplace
      ? '-# ♻️ Replace clears existing stores/items/actions/settings/map-cell content in the sections being imported, then imports fresh. You will confirm once more before anything is deleted.'
      : '-# Nothing is written until you confirm. Merge updates entities with matching IDs and creates the rest.' },
    { type: 1, components: [
      { type: 2, custom_id: `safari_import_abort_${key}`, label: 'Cancel', style: 2 },
      isReplace
        ? { type: 2, custom_id: `safari_import_confirm_${key}`, label: 'Continue → Replace', style: 4, emoji: { name: '♻️' } }
        : { type: 2, custom_id: `safari_import_confirm_${key}`, label: 'Import (Merge)', style: 3, emoji: { name: '📥' } }
    ] }
  );

  return {
    components: [{
      type: 17,
      accent_color: isReplace ? 0xe74c3c : 0x9b59b6,
      components
    }],
    flags: 1 << 15
  };
}

/** Second, explicit red confirmation for Replace mode — lists exactly what gets cleared. */
export function buildReplaceConfirmScreen(pending) {
  const { plan, key, data } = pending;
  const clearing = [];
  if (data.stores) clearing.push(`• All **${plan.destTotals?.stores ?? '?'}** existing stores`);
  if (data.items) clearing.push(`• All **${plan.destTotals?.items ?? '?'}** existing items`);
  if (data.customActions) clearing.push(`• All **${plan.destTotals?.actions ?? '?'}** existing actions (attack queue reset)`);
  if (data.safariConfig) clearing.push('• Safari settings (round state is kept)');
  if (data.maps && plan.hasActiveMap) clearing.push('• Map cell content (channels, anchors and the map image itself are kept)');

  return {
    components: [{
      type: 17,
      accent_color: 0xe74c3c,
      components: [
        { type: 10, content: '## ⚠️ Replace Existing Safari?' },
        { type: 14 },
        { type: 10, content: 'This will **permanently clear** the following before importing:\n' + clearing.join('\n') },
        { type: 10, content: '-# Player inventories and currency are NOT changed — items removed by the replace become inert if players still hold them. Not cleared: enemies, attributes, round history, player stats.' },
        { type: 14 },
        { type: 1, components: [
          { type: 2, custom_id: `safari_import_back_${key}`, label: '← Back', style: 2 },
          { type: 2, custom_id: `safari_import_replace_confirm_${key}`, label: 'Yes, Replace & Import', style: 4, emoji: { name: '🗑️' } }
        ] }
      ]
    }],
    flags: 1 << 15
  };
}

// --- Import executor (runs only after explicit confirmation) ---

/**
 * Stage 2: execute a confirmed staged import.
 * Order matters: (1) auto-create the map when needed (importSafariData re-loads
 * fresh data afterwards, folding cell content into the new active map), (2) merge/
 * replace structured data, (3) apply the packaged image to a pre-existing map via
 * the full update pipeline (which regenerates fog + PATCHes every anchor itself),
 * (4) otherwise refresh anchors so imported buttons appear.
 */
export async function executeSafariImport(pending, client) {
  const { guildId, userId, data, imageBuffer, imageExt, plan, mode } = pending;
  const notes = [];
  let skipAnchorRefresh = false;

  try {
    const { importSafariData, formatImportSummary } = await import('../safariImportExport.js');
    const hasDataSections = ['stores', 'items', 'safariConfig', 'maps', 'customActions']
      .some(k => data?.[k] && Object.keys(data[k]).length > 0);

    let guild = null;
    if (imageBuffer) guild = await client.guilds.fetch(guildId);

    // Re-host the packaged image to the guild's map-storage channel so the existing
    // URL-based mapExplorer pipelines can consume it unchanged.
    const rehostImage = async () => {
      const fs = await import('fs/promises');
      const path = (await import('path')).default;
      const { fileURLToPath } = await import('url');
      const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // src/ → repo root
      const dir = path.join(repoRoot, 'img', guildId);
      await fs.mkdir(dir, { recursive: true });
      const tempPath = path.join(dir, `import_${Date.now()}.${imageExt || 'png'}`);
      await fs.writeFile(tempPath, imageBuffer);
      try {
        const { uploadImageToDiscord } = await import('../mapExplorer.js');
        return await uploadImageToDiscord(guild, tempPath, `imported_map_${Date.now()}.${imageExt || 'png'}`);
      } finally {
        fs.unlink(tempPath).catch(() => {});
      }
    };

    // (1) Auto-create the map when the destination has none
    if (plan.needsMapCreate && plan.canCreateMap) {
      console.log(`🗺️ [FileImport] Auto-creating ${plan.importGrid.width}x${plan.importGrid.height} map for guild ${guildId} from packaged image`);
      const upload = await rehostImage();
      const { createMapGridWithCustomImage } = await import('../mapExplorer.js');
      const result = await createMapGridWithCustomImage(guild, userId, upload.url, plan.importGrid.width, plan.importGrid.height);
      if (!result.success) {
        return buildErrorResponse(`Map creation failed — nothing was imported.\n\n${result.message}`, 'safari');
      }
      notes.push(`🗺️ Created a new ${plan.importGrid.width}x${plan.importGrid.height} map (${plan.channelCount} channels)`);
    }

    // (2) Merge/replace the structured data
    let summaryText;
    if (hasDataSections) {
      const summary = await importSafariData(guildId, JSON.stringify(data), { userId, client }, { mode });
      console.log(`✅ [FileImport] Safari import (${mode}) completed for guild ${guildId}:`, JSON.stringify(summary));
      summaryText = formatImportSummary(summary);
    } else {
      summaryText = 'ℹ️ No structured data in this package — only the map image was applied.';
    }

    // (3) Pre-existing map + packaged image → full image-update pipeline
    if (imageBuffer && plan.hasActiveMap) {
      try {
        const upload = await rehostImage();
        const { updateMapImage } = await import('../mapExplorer.js');
        const result = await updateMapImage(guild, userId, upload.url);
        if (result.success) {
          notes.push('🖼️ Map image replaced — fog of war and anchors regenerated');
          skipAnchorRefresh = true;
        } else {
          notes.push(`⚠️ Map image update failed: ${result.message}`);
        }
      } catch (imgErr) {
        console.log(`⚠️ [FileImport] Map image update failed: ${imgErr.message}`);
        notes.push(`⚠️ Map image update failed: ${imgErr.message}`);
      }
    }

    // (4) Refresh anchors so imported custom action buttons appear immediately
    if (hasDataSections && !skipAnchorRefresh) {
      try {
        const { updateAllAnchorMessages } = await import('../mapCellUpdater.js');
        const refreshResult = await updateAllAnchorMessages(guildId, client);
        console.log(`🔄 [FileImport] Post-import anchor refresh: ${refreshResult.successful} succeeded, ${refreshResult.failed} failed`);
        if (refreshResult.failed > 0) {
          const failedList = refreshResult.errors?.length ? ` (${refreshResult.errors.join(', ')})` : '';
          notes.push(`🔄 Anchor messages refreshed (${refreshResult.successful} updated, ${refreshResult.failed} failed${failedList})`);
        } else {
          notes.push(`🔄 Anchor messages refreshed (${refreshResult.successful} updated)`);
        }
      } catch (refreshErr) {
        console.log(`⚠️ [FileImport] Post-import anchor refresh failed: ${refreshErr.message}`);
        notes.push('⚠️ Anchor refresh failed — run manually from Map Explorer');
      }
    }

    return buildSuccessResponse(
      'Safari Import Complete',
      `${summaryText}${notes.length ? '\n\n' + notes.join('\n') : ''}`
    );
  } catch (err) {
    console.error(`❌ [FileImport] executeSafariImport failed for guild ${guildId}:`, err);
    return buildErrorResponse(`Import failed: ${err.message}`, 'safari');
  }
}

// --- PlayerData Import ---

async function processPlayerDataImport(guildId, jsonContent) {
  const { loadPlayerData, savePlayerData } = await import('../storage.js');

  let importData;
  try {
    importData = JSON.parse(jsonContent);
  } catch {
    return buildErrorResponse('Invalid JSON file. Could not parse.', 'playerdata');
  }

  if (importData.dataType !== 'playerData' || !importData.data) {
    return buildErrorResponse(
      'This doesn\'t appear to be a playerData export file (missing `dataType: "playerData"` or `data` field).',
      'playerdata'
    );
  }

  const allPlayerData = await loadPlayerData();
  const oldDataSize = allPlayerData[guildId]
    ? Object.keys(allPlayerData[guildId].players || {}).length
    : 0;

  allPlayerData[guildId] = importData.data;
  await savePlayerData(allPlayerData);

  const newDataSize = Object.keys(importData.data.players || {}).length;
  console.log(`✅ [FileImport] PlayerData import completed for guild ${guildId}: ${oldDataSize} → ${newDataSize} players`);

  const exportDateLine = importData.exportDate
    ? `**Export Date:** ${new Date(importData.exportDate).toLocaleDateString()}\n`
    : '';

  return buildSuccessResponse(
    'PlayerData Import Complete',
    `**Server:** ${importData.guildName || 'Unknown'}\n` +
    `**Guild ID:** ${importData.guildId || guildId}\n` +
    exportDateLine +
    `**Players:** ${oldDataSize} → ${newDataSize}`,
    'playerdata'
  );
}

// --- Season Questions Import ---

async function processSeasonQuestionsImport(guildId, jsonContent) {
  const { loadPlayerData, savePlayerData } = await import('../storage.js');

  let importData;
  try {
    importData = JSON.parse(jsonContent);
  } catch {
    return buildErrorResponse('Invalid JSON file. Could not parse.');
  }

  // Validate structure
  if (!importData.questions || !Array.isArray(importData.questions)) {
    return buildErrorResponse('Invalid format: expected `{ "questions": [...] }` structure.');
  }

  // Filter out special question types before validation
  importData.questions = importData.questions.filter(q => !q.questionType || q.questionType === 'text');

  if (importData.questions.length === 0) {
    return buildErrorResponse('No questions found in the file.');
  }

  // Validate each question has required fields
  for (let i = 0; i < importData.questions.length; i++) {
    const q = importData.questions[i];
    if (!q.questionTitle || !q.questionText) {
      return buildErrorResponse(`Question ${i + 1} is missing required fields (questionTitle, questionText).`);
    }
  }

  const playerData = await loadPlayerData();
  if (!playerData[guildId]) {
    playerData[guildId] = { players: {}, tribes: {}, timezones: {}, pronounRoleIDs: [] };
  }
  if (!playerData[guildId].applicationConfigs) {
    playerData[guildId].applicationConfigs = {};
  }

  const configs = playerData[guildId].applicationConfigs;
  const crypto = await import('crypto');
  const summaryLines = [];
  let totalImported = 0;

  // Determine import source: per-config grouping (from export) or flat questions array
  const configsToImport = importData.configs?.length > 0
    ? importData.configs
    : [{ seasonName: 'Imported Questions', questions: importData.questions }];

  for (const sourceConfig of configsToImport) {
    const seasonName = sourceConfig.seasonName || 'Imported Questions';
    const questions = sourceConfig.questions || [];
    if (questions.length === 0) continue;

    // Find existing config by season name, or create new one
    let targetConfigId = Object.keys(configs).find(id =>
      !id.startsWith('temp_') &&
      (configs[id].buttonText === seasonName || configs[id].seasonName === seasonName)
    );

    let action;
    if (targetConfigId) {
      action = 'updated';
    } else {
      // Create new application config
      targetConfigId = `config_${Date.now()}_imported`;
      configs[targetConfigId] = {
        buttonText: seasonName,
        seasonName: seasonName,
        questions: [],
        createdAt: Date.now(),
        lastUpdated: Date.now()
      };
      action = 'created';
    }

    const config = configs[targetConfigId];
    if (!config.questions) config.questions = [];
    const existingCount = config.questions.length;

    for (const q of questions) {
      const questionId = `question_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
      config.questions.push({
        id: questionId,
        order: config.questions.length + 1,
        questionTitle: q.questionTitle,
        questionText: q.questionText,
        questionStyle: q.questionStyle || 2,
        imageURL: q.imageURL || '',
        createdAt: Date.now()
      });
      totalImported++;
    }

    config.lastUpdated = Date.now();
    const countNote = existingCount > 0 ? ` (was ${existingCount}, now ${config.questions.length})` : '';
    summaryLines.push(`📝 **${seasonName}** — ${action}, ${questions.length} questions loaded${countNote}`);
    console.log(`✅ [FileImport] Season "${seasonName}" ${action}: ${questions.length} questions → ${targetConfigId}`);
  }

  await savePlayerData(playerData);

  return buildSuccessResponse(
    'Season Questions Imported',
    `📋 **${totalImported} questions** imported into **${configsToImport.length} season(s)**\n\n` +
    summaryLines.join('\n') +
    `\n\n-# Questions were appended — reorder from the Question Management screen if needed.`
  );
}

// --- Single Season Questions Import (per-config, flat questions) ---

async function processSingleSeasonQuestionsImport(guildId, jsonContent, configId) {
  if (!configId) {
    return buildErrorResponse('Missing config ID for single-season import.', 'sq_single');
  }

  const { loadPlayerData, savePlayerData } = await import('../storage.js');

  let importData;
  try {
    importData = JSON.parse(jsonContent);
  } catch {
    return buildErrorResponse('Invalid JSON file. Could not parse.', 'sq_single');
  }

  // Accept flat questions array or wrapped in { questions: [] }
  const rawQuestions = importData.questions || (Array.isArray(importData) ? importData : null);
  if (!rawQuestions || !Array.isArray(rawQuestions) || rawQuestions.length === 0) {
    return buildErrorResponse('No questions found. Expected `{ "questions": [...] }` or a questions array.', 'sq_single');
  }

  // Separate regular questions from completion message, skip placeholder Q1 from source
  const PLACEHOLDER_TITLE = 'Click here to set first question';
  const questions = rawQuestions.filter(q => {
    if (q.questionTitle === PLACEHOLDER_TITLE) return false; // Skip placeholder from old exports
    return !q.questionType || q.questionType === 'text';
  });
  const importedCompletion = rawQuestions.find(q => q.questionType === 'completion');

  if (questions.length === 0) {
    return buildErrorResponse('No importable questions found (special types like DNC are skipped).', 'sq_single');
  }

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    if (!q.questionTitle || !q.questionText) {
      return buildErrorResponse(`Question ${i + 1} is missing required fields (questionTitle, questionText).`, 'sq_single');
    }
  }

  const playerData = await loadPlayerData();
  const config = playerData[guildId]?.applicationConfigs?.[configId];
  if (!config) {
    return buildErrorResponse('Season configuration not found.', 'sq_single');
  }

  if (!config.questions) config.questions = [];
  const existingCount = config.questions.length;
  const crypto = await import('crypto');

  // Check if Q1 is the default placeholder — if so, replace it with the first imported question
  const PLACEHOLDER_TEXT = 'Edit this question or add more using the menu below.';
  let replacedPlaceholder = false;
  const firstExisting = config.questions[0];
  if (firstExisting && firstExisting.questionTitle === PLACEHOLDER_TITLE && firstExisting.questionText === PLACEHOLDER_TEXT) {
    // Replace placeholder with first imported question
    firstExisting.questionTitle = questions[0].questionTitle;
    firstExisting.questionText = questions[0].questionText;
    firstExisting.questionStyle = questions[0].questionStyle || 2;
    firstExisting.imageURL = questions[0].imageURL || '';
    firstExisting.lastUpdated = Date.now();
    replacedPlaceholder = true;
  }

  // Import questions (skip first if we already used it to replace placeholder)
  const questionsToAppend = replacedPlaceholder ? questions.slice(1) : questions;

  for (const q of questionsToAppend) {
    const questionId = `question_${crypto.randomUUID().replace(/-/g, '').substring(0, 16)}`;
    const newQ = {
      id: questionId,
      order: config.questions.length + 1,
      questionTitle: q.questionTitle,
      questionText: q.questionText,
      questionStyle: q.questionStyle || 2,
      imageURL: q.imageURL || '',
      createdAt: Date.now()
    };
    // Insert before completion question if one exists
    const completionIdx = config.questions.findIndex(qn => qn.questionType === 'completion');
    if (completionIdx >= 0) {
      config.questions.splice(completionIdx, 0, newQ);
    } else {
      config.questions.push(newQ);
    }
  }

  // If the export included a completion message, update the existing one
  if (importedCompletion) {
    const existingCompletion = config.questions.find(qn => qn.questionType === 'completion');
    if (existingCompletion) {
      existingCompletion.questionTitle = importedCompletion.questionTitle;
      existingCompletion.questionText = importedCompletion.questionText;
      existingCompletion.lastUpdated = Date.now();
    }
  }

  config.lastUpdated = Date.now();
  await savePlayerData(playerData);

  const seasonName = config.buttonText || config.seasonName || configId;
  const importedCount = questions.length;
  console.log(`✅ [FileImport] Single-season import: ${importedCount} questions → "${seasonName}" (${configId})${replacedPlaceholder ? ' (replaced placeholder Q1)' : ''}${importedCompletion ? ' (updated completion)' : ''}`);

  const notes = [];
  if (replacedPlaceholder) notes.push('Q1 placeholder was replaced');
  if (importedCompletion) notes.push('completion message was updated');
  if (!replacedPlaceholder && !importedCompletion) notes.push('questions were appended — reorder from the Question Management screen if needed');

  return buildSuccessResponse(
    'Questions Imported',
    `📋 **${importedCount} questions** imported into **${seasonName}**\n` +
    `📊 Total questions now: ${config.questions.length} (was ${existingCount})\n\n` +
    `-# ${notes.join(', ')}`,
    'sq_single'
  );
}

// --- Season Questions Export ---

/**
 * Export season application questions for a guild
 * @param {string} guildId - Guild ID
 * @returns {Object} { json: string, filename: string, seasonName: string, count: number } or { error: string }
 */
export async function exportSeasonQuestions(guildId) {
  const { loadPlayerData } = await import('../storage.js');
  const playerData = await loadPlayerData();

  if (!playerData[guildId]?.applicationConfigs) {
    return { error: 'No season application configs found for this server.' };
  }

  const configs = playerData[guildId].applicationConfigs;
  // Find configs with questions (skip temp configs)
  const configsWithQuestions = Object.entries(configs)
    .filter(([id, cfg]) => !id.startsWith('temp_') && cfg.questions?.length > 0);

  if (configsWithQuestions.length === 0) {
    return { error: 'No season configs with questions found.' };
  }

  // Export all configs' questions
  const exportData = {
    exportedAt: new Date().toISOString(),
    guildId,
    configs: configsWithQuestions.map(([id, cfg]) => ({
      configId: id,
      seasonName: cfg.buttonText || cfg.seasonName || id,
      questions: cfg.questions
        .filter(q => {
          if (q.questionTitle === 'Click here to set first question') return false;
          return !q.questionType || q.questionType === 'text' || q.questionType === 'completion';
        })
        .map(q => ({
          questionTitle: q.questionTitle,
          questionText: q.questionText,
          questionStyle: q.questionStyle || 2,
          imageURL: q.imageURL || '',
          order: q.order,
          ...(q.questionType === 'completion' ? { questionType: 'completion' } : {})
        }))
    }))
  };

  // Also provide a flat questions array (for single-config import convenience)
  const allQuestions = exportData.configs.flatMap(c => c.questions);
  exportData.questions = allQuestions;

  const totalCount = allQuestions.length;
  const seasonNames = exportData.configs.map(c => c.seasonName).join(', ');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  return {
    json: JSON.stringify(exportData, null, 2),
    filename: `season-questions-${guildId}-${timestamp}.json`,
    seasonName: seasonNames,
    count: totalCount
  };
}

// --- Single Season Questions Export (flat, no season association) ---

/**
 * Export questions from a single config as a flat, season-agnostic array
 * @param {string} guildId
 * @param {string} configId
 * @returns {Object} { json, filename, count } or { error }
 */
export async function exportSingleSeasonQuestions(guildId, configId) {
  const { loadPlayerData } = await import('../storage.js');
  const playerData = await loadPlayerData();

  const config = playerData[guildId]?.applicationConfigs?.[configId];
  if (!config) return { error: 'Season configuration not found.' };
  if (!config.questions?.length) return { error: 'No questions to export.' };

  // Export regular text questions + completion message (skip DNC, other special types, and placeholder Q1)
  const PLACEHOLDER_TITLE = 'Click here to set first question';
  const exportableQuestions = config.questions.filter(q => {
    if (q.questionTitle === PLACEHOLDER_TITLE) return false; // Skip placeholder
    if (q.questionType === 'completion' || q.questionType === 'text' || !q.questionType) return true;
    return false; // Skip DNC etc
  });
  if (exportableQuestions.length === 0) return { error: 'No exportable questions found.' };

  const exportData = {
    exportedAt: new Date().toISOString(),
    questions: exportableQuestions.map(q => ({
      questionTitle: q.questionTitle,
      questionText: q.questionText,
      questionStyle: q.questionStyle || 2,
      imageURL: q.imageURL || '',
      order: q.order,
      ...(q.questionType === 'completion' ? { questionType: 'completion' } : {})
    }))
  };

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return {
    json: JSON.stringify(exportData, null, 2),
    filename: `questions-${timestamp}.json`,
    count: exportData.questions.length
  };
}

// --- UI Builders ---

function getBackButton(importType) {
  // sq_single comes from season management, everything else from data_admin
  if (importType === 'sq_single') {
    return { type: 2, custom_id: 'season_management_menu', label: '← Seasons', style: 2 };
  }
  return { type: 2, custom_id: 'data_admin', label: '← Data', style: 2 };
}

function buildSuccessResponse(title, details, importType = 'safari') {
  return {
    components: [{
      type: 17, // Container
      accent_color: 0x2ecc71, // Green
      components: [
        { type: 10, content: `## ✅ ${title}` },
        { type: 14 },
        { type: 10, content: details },
        { type: 14 },
        { type: 1, components: [getBackButton(importType)] }
      ]
    }],
    flags: 1 << 15 // IS_COMPONENTS_V2
  };
}

function buildErrorResponse(message, importType = 'safari') {
  const retryIds = {
    seasonquestions: 'file_import_seasonquestions',
    sq_single: 'season_management_menu', // No retry for single — go back to pick config
    safari: 'file_import_safari',
    playerdata: 'file_import_playerdata'
  };
  const retryId = retryIds[importType] || 'file_import_safari';
  const showRetry = importType !== 'sq_single';
  const buttons = [];
  if (showRetry) {
    buttons.push({ type: 2, custom_id: retryId, label: 'Try Again', style: 1, emoji: { name: '🔄' } });
  }
  buttons.push(getBackButton(importType));

  return {
    components: [{
      type: 17, // Container
      accent_color: 0xe74c3c, // Red
      components: [
        { type: 10, content: '## ❌ Import Failed' },
        { type: 14 },
        { type: 10, content: message },
        { type: 14 },
        { type: 1, components: buttons }
      ]
    }],
    flags: 1 << 15 // IS_COMPONENTS_V2
  };
}

// --- Helpers ---

function findFileUploadComponent(components) {
  if (!components) return null;
  for (const comp of components) {
    if (comp.type === 19) return comp;
    if (comp.custom_id === 'import_file') return comp;
    // Check nested (Label wraps the file upload)
    if (comp.component?.type === 19) return comp.component;
    if (comp.component?.custom_id === 'import_file') return comp.component;
    if (comp.components) {
      const found = findFileUploadComponent(comp.components);
      if (found) return found;
    }
  }
  return null;
}
