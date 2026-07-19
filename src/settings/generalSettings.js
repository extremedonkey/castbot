/**
 * General (guild-wide) CastBot settings — Settings menu → General button.
 *
 * Currently holds one setting: Image Uploads mode, controlling how image fields
 * across CastBot collect images:
 * - 'textUrl' (default): legacy paste-a-CDN-URL text inputs
 * - 'uploadComponent': native modal File Upload (type 19); files are re-hosted in
 *   the #🗺️castbot-images channel (see src/images/)
 *
 * Storage: playerData[guildId].settings.imageUploadMode — the guild-level
 * `settings` namespace is created lazily on first write (mirrors the
 * `permissions` namespace idiom); absence means default, no migration.
 *
 * Modal: uses Radio Group (type 21), NOT String Select — a select's option
 * `default: true` is silently ignored inside modals (documented gotcha in
 * docs/standards/ComponentsV2.md; pattern copied from src/analytics/logsConfigUI.js).
 *
 * storage.js is imported dynamically inside functions so the pure helpers
 * (normalize/build/parse) stay unit-testable without heavy imports.
 */

export const IMAGE_UPLOAD_MODES = {
    TEXT_URL: 'textUrl',
    UPLOAD_COMPONENT: 'uploadComponent'
};

/**
 * Pure — coerce any stored/submitted value to a valid mode ('textUrl' default).
 * @param {*} value
 * @returns {string}
 */
export function normalizeImageUploadMode(value) {
    return value === IMAGE_UPLOAD_MODES.UPLOAD_COMPONENT
        ? IMAGE_UPLOAD_MODES.UPLOAD_COMPONENT
        : IMAGE_UPLOAD_MODES.TEXT_URL;
}

/**
 * Read the guild's Image Uploads mode (read-time fallback — unset guilds are 'textUrl').
 * @param {string} guildId
 * @param {Object} [playerData] - full playerData if the caller already has it loaded
 * @returns {Promise<string>}
 */
export async function getImageUploadMode(guildId, playerData = null) {
    const { loadPlayerData } = await import('../../storage.js');
    const guildData = playerData ? playerData[guildId] : await loadPlayerData(guildId);
    return normalizeImageUploadMode(guildData?.settings?.imageUploadMode);
}

/**
 * Persist the guild's Image Uploads mode. Full load→mutate→save cycle, so it runs
 * under withStorageLock (CLAUDE.md rule) — do NOT call from inside another lock.
 * @param {string} guildId
 * @param {string} mode - normalized before write
 * @returns {Promise<string>} the mode actually stored
 */
export async function setImageUploadMode(guildId, mode) {
    const normalized = normalizeImageUploadMode(mode);
    const { withStorageLock, loadPlayerData, savePlayerData } = await import('../../storage.js');
    await withStorageLock(async () => {
        const playerData = await loadPlayerData();
        if (!playerData[guildId]) playerData[guildId] = {};
        (playerData[guildId].settings ||= {}).imageUploadMode = normalized;
        await savePlayerData(playerData);
    });
    console.log(`⚙️ General settings: imageUploadMode=${normalized} for guild ${guildId}`);
    return normalized;
}

/**
 * Pure — build the General settings modal (opened by the castbot_general button).
 * @param {string} currentMode - normalized current mode (pre-selects the Radio Group)
 * @returns {Object} modal data for { type: InteractionResponseType.MODAL, data: ... }
 */
export function buildGeneralSettingsModal(currentMode) {
    const isUpload = normalizeImageUploadMode(currentMode) === IMAGE_UPLOAD_MODES.UPLOAD_COMPONENT;
    return {
        custom_id: 'castbot_general_modal',
        title: 'CastBot | General Settings',
        components: [
            {
                type: 18, // Label
                label: 'Image Uploads',
                description: 'Controls how images are uploaded to CastBot',
                component: {
                    type: 21, // Radio Group — option `default` pre-selects in modals (String Select's doesn't)
                    custom_id: 'image_upload_mode',
                    required: true,
                    // Exactly ONE option may carry `default` — an explicit default:false on the
                    // sibling suppresses pre-selection for the whole group (see logsConfigUI.js).
                    options: [
                        {
                            label: '🔗 Paste URL',
                            value: IMAGE_UPLOAD_MODES.TEXT_URL,
                            description: 'Upload images to Discord yourself, copy and paste the URL',
                            ...(!isUpload ? { default: true } : {})
                        },
                        {
                            label: '🖼️ Upload Component',
                            value: IMAGE_UPLOAD_MODES.UPLOAD_COMPONENT,
                            description: 'Upload directly to CastBot — stored in #🗺️castbot-images',
                            ...(isUpload ? { default: true } : {})
                        }
                    ]
                }
            }
        ]
    };
}

/**
 * Pure — extract the submitted Image Uploads mode from modal-submit components
 * (Label-wrapped Radio Group delivers a single `value`).
 * @param {Array} components - modal submit data.components
 * @returns {string} normalized mode
 */
export function parseGeneralSettingsSubmit(components) {
    for (const row of components || []) {
        const comp = row?.component;
        if (comp?.custom_id === 'image_upload_mode') {
            return normalizeImageUploadMode(Array.isArray(comp.values) ? comp.values[0] : comp.value);
        }
    }
    return IMAGE_UPLOAD_MODES.TEXT_URL;
}

/**
 * Full castbot_general_modal submit: parse → save → re-render the Settings menu.
 * safariConfigUI/safariManager are imported dynamically to avoid a static import
 * cycle (safariConfigUI imports getImageUploadMode from this module for display).
 * @param {string} guildId
 * @param {Array} components - modal submit data.components
 * @returns {Promise<Object>} createSafariCustomizationUI data for UPDATE_MESSAGE
 */
export async function handleGeneralSettingsSubmit(guildId, components) {
    const mode = parseGeneralSettingsSubmit(components);
    await setImageUploadMode(guildId, mode);
    const { getCustomTerms } = await import('../../safariManager.js');
    const { createSafariCustomizationUI } = await import('../../safariConfigUI.js');
    return createSafariCustomizationUI(guildId, await getCustomTerms(guildId));
}
