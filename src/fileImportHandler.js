/**
 * fileImportHandler.js — Modal-based file import using File Upload (Type 19)
 *
 * Replaces legacy createMessageCollector pattern with Discord's native
 * File Upload component, eliminating the need for MessageContent privileged intent.
 *
 * Currently supports: Safari import, Season App Questions import
 * Designed to be extended for: PlayerData import, any JSON import
 *
 * See: RaP 0940 — Privileged Intents Analysis
 */

/**
 * Build the file import modal
 * @param {string} importType - Import type identifier (e.g. 'safari', 'playerdata')
 * @param {string} guildId - Guild ID (embedded in custom_id for modal submit)
 * @returns {Object} Modal interaction response (type 9)
 */
export function buildFileImportModal(importType, guildId) {
  const configs = {
    safari: {
      title: 'Import Safari Data',
      label: 'Safari Export File',
      description: 'Upload the JSON file exported from Safari Export',
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
    }
  };

  const config = configs[importType];
  if (!config) throw new Error(`Unknown import type: ${importType}`);

  return {
    type: 9, // MODAL
    data: {
      custom_id: `file_import_submit:${importType}:${guildId}`,
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
export async function processFileImport({ importType, guildId, userId, resolved, components, client }) {
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

  // Validate JSON extension
  if (!attachment.filename.endsWith('.json')) {
    return buildErrorResponse(`Expected a .json file, got: ${attachment.filename}`, importType);
  }

  // Download file content
  const response = await fetch(attachment.url);
  if (!response.ok) {
    return buildErrorResponse(`Failed to download file: HTTP ${response.status}`, importType);
  }
  const jsonContent = await response.text();

  console.log(`📥 [FileImport] Downloaded ${jsonContent.length} characters from ${attachment.filename}`);

  // Route to the appropriate import handler
  if (importType === 'safari') {
    return await processSafariImport(guildId, jsonContent, userId, client);
  } else if (importType === 'playerdata') {
    return buildErrorResponse('PlayerData import not yet implemented via File Upload.');
  } else if (importType === 'seasonquestions') {
    return await processSeasonQuestionsImport(guildId, jsonContent);
  }

  return buildErrorResponse(`Unknown import type: ${importType}`);
}

// --- Safari Import ---

async function processSafariImport(guildId, jsonContent, userId, client) {
  const { importSafariData, formatImportSummary } = await import('../safariImportExport.js');

  const summary = await importSafariData(guildId, jsonContent, { userId, client });
  console.log(`✅ [FileImport] Safari import completed for guild ${guildId}:`, JSON.stringify(summary));

  const summaryText = formatImportSummary(summary);

  // Auto-refresh anchor messages so custom action buttons appear immediately
  let refreshNote = '';
  try {
    const { updateAllAnchorMessages } = await import('../mapCellUpdater.js');
    const refreshResult = await updateAllAnchorMessages(guildId, client);
    console.log(`🔄 [FileImport] Post-import anchor refresh: ${refreshResult.success} succeeded, ${refreshResult.failed} failed`);
    refreshNote = `\n🔄 Anchor messages refreshed (${refreshResult.success} updated)`;
  } catch (refreshErr) {
    console.log(`⚠️ [FileImport] Post-import anchor refresh failed: ${refreshErr.message}`);
    refreshNote = '\n⚠️ Anchor refresh failed — run manually from Map Explorer';
  }

  return buildSuccessResponse(
    'Safari Import Complete',
    `${summaryText}${refreshNote}`
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
      questions: cfg.questions.map(q => ({
        questionTitle: q.questionTitle,
        questionText: q.questionText,
        questionStyle: q.questionStyle || 2,
        imageURL: q.imageURL || '',
        order: q.order
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

// --- UI Builders ---

function buildSuccessResponse(title, details) {
  return {
    components: [{
      type: 17, // Container
      accent_color: 0x2ecc71, // Green
      components: [
        { type: 10, content: `## ✅ ${title}` },
        { type: 14 },
        { type: 10, content: details },
        { type: 14 },
        { type: 1, components: [{ type: 2, custom_id: 'reeces_stuff', label: '← Back', style: 2 }] }
      ]
    }],
    flags: 1 << 15 // IS_COMPONENTS_V2
  };
}

function buildErrorResponse(message, importType = 'safari') {
  const retryId = importType === 'seasonquestions' ? 'file_import_seasonquestions' : 'file_import_safari';
  return {
    components: [{
      type: 17, // Container
      accent_color: 0xe74c3c, // Red
      components: [
        { type: 10, content: '## ❌ Import Failed' },
        { type: 14 },
        { type: 10, content: message },
        { type: 14 },
        { type: 1, components: [
          { type: 2, custom_id: retryId, label: 'Try Again', style: 1, emoji: { name: '🔄' } },
          { type: 2, custom_id: 'reeces_stuff', label: '← Back', style: 2 }
        ]}
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
