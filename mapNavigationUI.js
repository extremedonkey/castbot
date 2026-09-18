/**
 * mapNavigationUI.js - Pure UI builders for Safari map navigation panel interactions
 *
 * Covers the three non-owner outcomes of clicking a `safari_navigate_{userId}_{coord}` button
 * (the "Navigate" button on public arrival panels — "<@user> has arrived at **C2**"):
 *   - buildNavigateDenialUI: non-admin clicked another player's panel → redirect them to Explore
 *   - buildAdminNavPanelWarningUI: Production (ManageRoles) clicked → offer stale-panel deletion
 *   - buildNavPanelDeleteResultUI: result screen after the admin's Delete Panel click
 *
 * Kept import-free so unit tests can consume the real builders directly (TestingStandards.md).
 * Response shapes follow ComponentsV2.md: Container (17) + Text Display (10), never a top-level
 * `content` field alongside the IS_COMPONENTS_V2 flag.
 */

export const NAV_DELETE_PANEL_PREFIX = 'safari_nav_delete_panel_';

/**
 * Generalized "card + Navigate button" pane — the ONE builder behind the three
 * public navigate panes (arrival card, init welcome card, admin-move card), which
 * were previously three hand-rolled copies (app.js safari_move_*, safariMapAdmin
 * init + admin-move). The Navigate button is owner-gated by custom_id.
 *
 * @param {Object} p
 * @param {string} p.userId - panel owner (Navigate button only works for them)
 * @param {string} p.coordinate - the cell this pane navigates from
 * @param {string} p.content - Text Display markdown
 * @param {number} [p.accentColor=0x2ecc71] - container accent (green = movement)
 * @param {boolean} [p.withNavigate=true] - false drops the button row (silent modes)
 */
export function buildNavigatePanelUI({ userId, coordinate, content, accentColor = 0x2ecc71, withNavigate = true }) {
    return {
        flags: 1 << 15, // IS_COMPONENTS_V2
        components: [{
            type: 17, // Container
            accent_color: accentColor,
            components: [
                { type: 10, content },
                ...(withNavigate ? [{
                    type: 1, // Action Row
                    components: [{
                        type: 2, // Button
                        custom_id: `safari_navigate_${userId}_${coordinate}`,
                        label: 'Navigate',
                        style: 1, // Primary
                        emoji: { name: '🗺️' }
                    }]
                }] : [])
            ]
        }]
    };
}

/**
 * The public arrival card posted to a cell's channel when a player moves in
 * ("<@user> has arrived at **C2**" + Navigate button). Posted by compass moves
 * (safari_move_*) AND the teleport outcome via mapMovement.announceArrival.
 */
export function buildArrivalPanelUI(userId, coordinate) {
    return buildNavigatePanelUI({
        userId,
        coordinate,
        content: `<@${userId}> has arrived at **${coordinate}**`
    });
}

/**
 * Shown when a non-admin player clicks another player's Navigate button.
 * Points them at the anchor message's Explore button — the always-available movement path.
 */
export function buildNavigateDenialUI() {
    return {
        components: [{
            type: 17, // Container
            components: [{
                type: 10, // Text Display
                content: '❌ This navigation panel is for another player. If you are trying to move to another location, click **Explore** underneath the map image at the top of the channel, then click **Navigate**.'
            }]
        }],
        flags: 1 << 15, // IS_COMPONENTS_V2
        ephemeral: true
    };
}

/**
 * Shown when a Production member (ManageRoles) clicks another player's Navigate button.
 * Arrival panels become undeletable by players once their owner leaves the cell (the owner
 * loses channel visibility), so admins get a manual cleanup path here.
 *
 * @param {string} targetUserId - The panel owner's user ID (from the button's custom_id)
 * @param {string} messageId - The message ID of the clicked panel (deletion target)
 * @param {string|null} ownerCurrentCoordinate - Owner's live location, or null if not on the map
 */
export function buildAdminNavPanelWarningUI(targetUserId, messageId, ownerCurrentCoordinate) {
    const ownerStatus = ownerCurrentCoordinate
        ? `currently at **${ownerCurrentCoordinate}**`
        : 'not currently on the map';
    return {
        components: [{
            type: 17, // Container
            accent_color: 0xf39c12, // Orange — warning tier (LeanUserInterfaceDesign.md)
            components: [
                {
                    type: 10, // Text Display
                    content: `⚠️ This navigation panel is for a player to change locations. Do not remove this unless the player has clearly left this channel and moved to another location.\n-# Panel owner: <@${targetUserId}> — ${ownerStatus}`
                },
                { type: 14 }, // Separator above action row (mandatory per LeanUI)
                {
                    type: 1, // Action Row
                    components: [{
                        type: 2, // Button
                        custom_id: `${NAV_DELETE_PANEL_PREFIX}${messageId}`,
                        label: 'Delete Panel',
                        style: 4, // Danger (red)
                        emoji: { name: '🗑️' }
                    }]
                }
            ]
        }],
        flags: 1 << 15, // IS_COMPONENTS_V2
        ephemeral: true
    };
}

/**
 * Replaces the admin warning (UPDATE_MESSAGE) after Delete Panel is clicked.
 * No flags field — UPDATE_MESSAGE responses must not carry flags (ComponentsV2.md).
 *
 * @param {boolean} deleted - Whether the DELETE actually removed the panel
 */
export function buildNavPanelDeleteResultUI(deleted) {
    return {
        components: [{
            type: 17, // Container
            accent_color: deleted ? 0x27ae60 : 0xe74c3c,
            components: [{
                type: 10, // Text Display
                content: deleted
                    ? '✅ Navigation panel deleted.'
                    : '❌ Could not delete the panel — it may have already been removed.'
            }]
        }]
    };
}
