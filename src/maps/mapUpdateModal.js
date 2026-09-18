/**
 * Map create/update modal (map_update button → map_update_modal submit).
 *
 * One modal covers both flows: executeMapBuild() (mapExplorer.js) branches to
 * create-vs-update internally. This module is the Image Uploads "download-source"
 * archetype (see docs/03-features/ImageUploads.md): the image is DOWNLOADED and
 * sharp-processed by the build pipeline, which durably re-hosts its own artifacts
 * (original + gridded output + fog maps → #🗺️castbot-images). So upload mode just
 * swaps the input — the resolved attachment URL feeds the pipeline exactly like a
 * pasted URL, with NO resolveUploadedImageField-style pre-hosting.
 *
 * Pure module (no heavy imports) so tests can import it directly. Both modes use
 * the modern Label (type 18) pattern — this modal was the last ActionRow+TextInput
 * holdout in the map flow; the submit handler parses by custom_id, both shapes.
 */

import { IMAGE_UPLOAD_COMPONENT_ID } from '../images/modalImageUpload.js';

/**
 * Build the map create/update modal.
 * @param {boolean} hasActiveMap - true = update (dimensions immutable, no emoji field)
 * @param {Object|null} existingMap - active map data (prefills grid dimensions)
 * @param {string} [imageUploadMode='textUrl'] - guild Image Uploads mode
 * @returns {Object} modal data for { type: InteractionResponseType.MODAL, data: ... }
 */
export function buildMapUpdateModal(hasActiveMap, existingMap, imageUploadMode = 'textUrl', sectionOverride = null) {
    // Per-section update (RaP 0894 Phase 3): same modal, but scoped to one section —
    // custom_id carries the index (map_update_modal_s2) and dims prefill from the
    // section's rectangle instead of the map bounding box.
    const rows = sectionOverride ? String(sectionOverride.height)
        : (existingMap?.gridHeight?.toString() || existingMap?.gridSize?.toString() || '7');
    const cols = sectionOverride ? String(sectionOverride.width)
        : (existingMap?.gridWidth?.toString() || existingMap?.gridSize?.toString() || '7');

    const imageField = imageUploadMode === 'uploadComponent'
        ? {
            type: 18, // Label
            label: 'Map Image',
            description: hasActiveMap
                ? 'Replaces the current map image (grid size stays the same).'
                : 'The image your map grid will be drawn on.',
            component: {
                type: 19, // File Upload — a build REQUIRES an image (no keep-current here)
                custom_id: IMAGE_UPLOAD_COMPONENT_ID,
                min_values: 1,
                max_values: 1,
                required: true
            }
        }
        : {
            type: 18, // Label
            label: 'Discord Image URL',
            description: 'Upload to Discord first, then paste the CDN link.',
            component: {
                type: 4, // Text Input
                custom_id: 'map_url',
                style: 2, // Paragraph
                required: true,
                min_length: 20,
                max_length: 500,
                placeholder: 'https://cdn.discordapp.com/attachments/...'
            }
        };

    const components = [
        imageField,
        {
            type: 18,
            label: 'Number of Map Rows',
            component: { type: 4, custom_id: 'map_rows', style: 1, required: true, value: rows, min_length: 1, max_length: 3 }
        },
        {
            type: 18,
            label: 'Number of Map Columns',
            component: { type: 4, custom_id: 'map_columns', style: 1, required: true, value: cols, min_length: 1, max_length: 3 }
        }
    ];

    // Default emoji field only on new map creation (updates keep existing emojis)
    if (!hasActiveMap) {
        components.push({
            type: 18,
            label: 'Default Location Emoji',
            component: { type: 4, custom_id: 'map_emoji', style: 1, required: false, value: '📍', max_length: 8 }
        });
    }

    return {
        custom_id: sectionOverride ? `map_update_modal_s${sectionOverride.idx}` : 'map_update_modal',
        title: sectionOverride
            ? `Update ${sectionOverride.name} Image`.slice(0, 45)
            : (hasActiveMap ? 'Update Map Image' : 'Upload New Safari Map'),
        components
    };
}

/**
 * Build the Add Map Section modal (RaP 0894 Phase 2). Exactly 5 top-level Labels —
 * the modal cap — which is why the section name auto-assigns ("Section N") instead
 * of being a field. Placement uses a Radio Group (type 21): plain-text labels, ONE
 * default via spread, no emoji on options (ComponentsV2.md Radio Group gotchas).
 *
 * @param {number} anchorIdx - index of the section the placement anchors to
 * @param {Object} anchorSection - the anchor section (labels the placement guidance)
 * @param {string} [imageUploadMode='textUrl'] - guild Image Uploads mode
 */
export function buildSectionAddModal(anchorIdx, anchorSection, imageUploadMode = 'textUrl') {
    const anchorLabel = anchorSection?.name || `Section ${anchorIdx + 1}`;

    const imageField = imageUploadMode === 'uploadComponent'
        ? {
            type: 18, // Label
            label: 'Section Map Image',
            description: 'This section gets its OWN image — the existing map is untouched.',
            component: {
                type: 19, // File Upload
                custom_id: IMAGE_UPLOAD_COMPONENT_ID,
                min_values: 1,
                max_values: 1,
                required: true
            }
        }
        : {
            type: 18, // Label
            label: 'Discord Image URL',
            description: 'Upload to Discord first, then paste the CDN link.',
            component: {
                type: 4, // Text Input
                custom_id: 'section_url',
                style: 2, // Paragraph
                required: true,
                min_length: 20,
                max_length: 500,
                placeholder: 'https://cdn.discordapp.com/attachments/...'
            }
        };

    return {
        custom_id: `map_section_add_modal_${anchorIdx}`,
        title: 'Add Map Section',
        components: [
            imageField,
            {
                type: 18,
                label: 'Number of Section Rows',
                component: { type: 4, custom_id: 'section_rows', style: 1, required: true, value: '7', min_length: 1, max_length: 3 }
            },
            {
                type: 18,
                label: 'Number of Section Columns',
                component: { type: 4, custom_id: 'section_columns', style: 1, required: true, value: '7', min_length: 1, max_length: 3 }
            },
            {
                type: 18,
                label: 'Placement',
                description: `Coordinates continue from ${anchorLabel}'s edge - no skipped rows or columns.`,
                component: {
                    type: 21, // Radio Group
                    custom_id: 'section_direction',
                    required: true,
                    options: [
                        { label: `Right of ${anchorLabel}`, value: 'right', description: 'New columns continue east (e.g. E1, F1...)', default: true },
                        { label: `Below ${anchorLabel}`, value: 'below', description: 'New rows continue south (e.g. A6, B6...)' }
                    ]
                }
            },
            {
                type: 18,
                label: 'Location Emoji',
                component: { type: 4, custom_id: 'section_emoji', style: 1, required: false, value: '📍', max_length: 8 }
            }
        ]
    };
}
