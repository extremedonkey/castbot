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
export function buildFileImportModal(importType, guildId, configId = null) {
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
  } else if (importType === 'sq_single') {
    return await processSingleSeasonQuestionsImport(guildId, jsonContent, configId);
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

  // Filter out special question types (completion, DNC) — these are auto-generated
  const questions = rawQuestions.filter(q => !q.questionType || q.questionType === 'text');

  if (questions.length === 0) {
    return buildErrorResponse('No importable questions found (special types like completion/DNC are skipped).', 'sq_single');
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

  for (const q of questions) {
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

  config.lastUpdated = Date.now();
  await savePlayerData(playerData);

  const seasonName = config.buttonText || config.seasonName || configId;
  console.log(`✅ [FileImport] Single-season import: ${questions.length} questions → "${seasonName}" (${configId})`);

  return buildSuccessResponse(
    'Questions Imported',
    `📋 **${questions.length} questions** imported into **${seasonName}**\n` +
    `📊 Total questions now: ${config.questions.length} (was ${existingCount})\n\n` +
    `-# Questions were appended — reorder from the Question Management screen if needed.`,
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
        .filter(q => !q.questionType || q.questionType === 'text')
        .map(q => ({
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

  // Only export regular text questions (skip completion, DNC, and other special types)
  const regularQuestions = config.questions.filter(q => !q.questionType || q.questionType === 'text');
  if (regularQuestions.length === 0) return { error: 'No exportable questions found.' };

  const exportData = {
    exportedAt: new Date().toISOString(),
    questions: regularQuestions.map(q => ({
      questionTitle: q.questionTitle,
      questionText: q.questionText,
      questionStyle: q.questionStyle || 2,
      imageURL: q.imageURL || '',
      order: q.order
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
    safari: 'file_import_safari'
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
