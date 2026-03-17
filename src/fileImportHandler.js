/**
 * fileImportHandler.js — Modal-based file import using File Upload (Type 19)
 *
 * Replaces legacy createMessageCollector pattern with Discord's native
 * File Upload component, eliminating the need for MessageContent privileged intent.
 *
 * Currently supports: Safari import
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
    return buildErrorResponse('No file was uploaded. Please try again.');
  }

  const attachmentId = fileComponent.values[0];
  const attachment = resolved?.attachments?.[attachmentId];
  if (!attachment) {
    return buildErrorResponse('Could not resolve uploaded file. Please try again.');
  }

  console.log(`📥 [FileImport] Processing ${importType} import — file: ${attachment.filename}, size: ${attachment.size}`);

  // Validate JSON extension
  if (!attachment.filename.endsWith('.json')) {
    return buildErrorResponse(`Expected a .json file, got: ${attachment.filename}`);
  }

  // Download file content
  const response = await fetch(attachment.url);
  if (!response.ok) {
    return buildErrorResponse(`Failed to download file: HTTP ${response.status}`);
  }
  const jsonContent = await response.text();

  console.log(`📥 [FileImport] Downloaded ${jsonContent.length} characters from ${attachment.filename}`);

  // Route to the appropriate import handler
  if (importType === 'safari') {
    return await processSafariImport(guildId, jsonContent, userId, client);
  } else if (importType === 'playerdata') {
    return buildErrorResponse('PlayerData import not yet implemented via File Upload.');
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

function buildErrorResponse(message) {
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
          { type: 2, custom_id: 'file_import_safari', label: 'Try Again', style: 1, emoji: { name: '🔄' } },
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
