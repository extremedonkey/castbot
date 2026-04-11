/**
 * Command UI — shared builder for the Enter Command modal.
 *
 * Single source of truth for the modal shown when players (or admins) type
 * text commands. All entry points call buildCommandModal() so the UI stays
 * consistent and future changes (e.g., command prefixes) only need updating
 * in one place.
 *
 * Entry points:
 *   - Anchor message "Command" button  (player_enter_command_{coord})
 *   - Explore > Enter Command button   (player_enter_command_{coord})
 *   - /menu > Commands button           (player_enter_command_global)
 *   - Admin > Test Command button       (admin_test_command_{coord})
 */

/**
 * Build the Enter Command modal.
 *
 * @param {Object} options
 * @param {string}  options.coord        - Map coordinate or 'global'
 * @param {boolean} [options.isAdmin]    - Admin test mode (changes title)
 * @param {string[]} [options.prefixes]  - Guild command prefixes (future — Phase 3)
 * @returns {Object} Modal interaction response (type 9)
 */
export function buildCommandModal({ coord, isAdmin = false, prefixes = [] }) {
  const customId = isAdmin
    ? `admin_command_modal_${coord}`
    : `player_command_modal_${coord}`;

  const title = isAdmin ? 'Test Command (Admin)' : 'Enter Command';

  const components = [];

  // Future: when prefixes are configured, add a String Select above the text input
  // Phase 3 will add:
  //   if (prefixes.length > 0) { components.push(prefixSelect); }

  // Command text input (Label wrapper — Components V2 modal standard)
  components.push({
    type: 18, // Label
    label: 'Command',
    description: 'Type a command to interact with this location',
    component: {
      type: 4, // Text Input
      custom_id: 'command',
      style: 1, // Short
      required: true,
      placeholder: 'e.g., climb tree, inspect rock, open chest',
      min_length: 1,
      max_length: 100
    }
  });

  return {
    type: 9, // MODAL
    data: {
      custom_id: customId,
      title,
      components
    }
  };
}
