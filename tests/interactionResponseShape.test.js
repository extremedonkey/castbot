/**
 * Interaction Response Shape — declare-or-fix ratchet
 *
 * Blocks NEW response shapes that Discord silently rejects ("This interaction
 * failed" with no server-side log — interaction responses are HTTP replies, so
 * Discord never reports the rejection). Born from the 2026-07-12 give_item
 * incident. Scanner: scripts/scan-interaction-shapes.js. RaP: InteractionShapeFailures.
 *
 * Classes:
 *   A content_only_update  — updateMessage:true handler returns { content } only.
 *     Runtime-mitigated by the sendResponse SHAPE-GUARD (auto-wraps when the parent
 *     message is V2), but new code must return proper V2 containers. Baseline is
 *     grandfathered debt — SHRINK it (fix a handler, delete its key), never grow it.
 *   B content_with_v2_flag — content alongside IS_COMPONENTS_V2. Eradicated; must stay 0.
 *   C/D legacy res.send(UPDATE_MESSAGE) with content-only data / flags in data.
 *     Count-ratcheted downward.
 *
 * If this test fails on your new handler: return a V2 container —
 *   { flags: (1 << 15), components: [{ type: 17, components: [{ type: 10, content: '…' }] }] }
 * Do NOT add your handler to the baseline.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { scanAll, violationKey } from '../scripts/scan-interaction-shapes.js';

// Grandfathered class-A handlers (unique file::handlerId::A keys) as of 2026-07-12.
// NOTE: anonymous@L<line> keys are line-anchored — if one shifts, give the handler
// an id (preferred) or re-anchor the key.
const FROZEN_A_BASELINE = [
  'app.js::action_phrase_remove::A',
  'app.js::action_post_channel::A',
  'app.js::activity_log_back::A',
  // Re-anchored 2026-07-15: dead-code sweep in app.js shifted these four line-keyed
  // handlers (safari_navigate_refresh, restart_status_*, tips_next/prev, tips_shared_*).
  // Same four grandfathered handlers, new lines — baseline count unchanged.
  'app.js::anonymous@L12214::A',
  'app.js::anonymous@L12415::A',
  'app.js::anonymous@L4725::A',
  'app.js::anonymous@L6576::A',
  'app.js::app_config_selection::A',
  'app.js::app_dnc_edit::A',
  'app.js::apps_planner::A',
  'app.js::attr_edit_select::A',
  'app.js::attr_preset_select::A',
  'app.js::ca_link_item_select::A',
  'app.js::ca_schedule_cancel::A',
  'app.js::ca_schedule_channel::A',
  'app.js::ca_schedule_delay_modal::A',
  'app.js::ca_schedule_retrigger::A',
  'app.js::ca_unlink_item::A',
  'app.js::casting_decide::A',
  'app.js::casting_invites_confirm::A',
  'app.js::casting_status::A',
  'app.js::challenge_delete::A',
  'app.js::challenge_post::A',
  'app.js::challenge_post_send::A',
  'app.js::challenge_round_link::A',
  'app.js::challenge_status_select::A',
  'app.js::challenge_timer_stop::A',
  'app.js::command_prefix_remove::A',
  'app.js::condition_delete::A',
  'app.js::condition_qty_select::A',
  'app.js::custom_action_button_style::A',
  'app.js::custom_action_trigger_type::A',
  'app.js::custom_action_up::A',
  'app.js::d20_dc_submit::A',
  'app.js::d20_display_mode::A',
  'app.js::d20_mod_submit::A',
  'app.js::d20_result_submit::A',
  'app.js::delete_application_confirm::A',
  'app.js::emoji_delete::A',
  'app.js::emoji_picker::A',
  'app.js::entity_action_post_channel::A',
  'app.js::entity_clone_source_list::A',
  'app.js::entity_delete_mode::A',
  'app.js::entity_field_group::A',
  'app.js::library_import::A',
  'app.js::map_admin_add_item::A',
  'app.js::map_admin_blacklist_modal::A',
  'app.js::map_admin_edit_quantities::A',
  'app.js::map_drop_style::A',
  'app.js::menu_visibility_select::A',
  'app.js::nuke_cat_confirm::A',
  'app.js::nuke_cat_select::A',
  'app.js::outcome_select::A',
  'app.js::placement_response::A',
  'app.js::planner_apps::A',
  'app.js::planner_calendar::A',
  'app.js::planner_challenge_edit::A',
  'app.js::planner_ideas_save::A',
  'app.js::planner_page::A',
  'app.js::planner_round_edit_submit::A',
  'app.js::planner_schedule::A',
  'app.js::player_menu_sel_map::A',
  'app.js::prob_display_mode::A',
  'app.js::prob_modal_submit::A',
  'app.js::question_add_dnc::A',
  'app.js::question_completion_select::A',
  'app.js::question_select::A',
  'app.js::rank_applicant::A',
  'app.js::ranking_public_cancel::A',
  'app.js::ranking_select::A',
  'app.js::remove_coord::A',
  'app.js::restart_bot::A',
  'app.js::safari_action_type_select::A',
  'app.js::safari_currency_save::A',
  'app.js::safari_deinit_confirm::A',
  'app.js::safari_deinit_player::A',
  'app.js::safari_edit_action::A',
  'app.js::safari_fight_enemy_execute_on::A',
  'app.js::safari_fight_enemy_limit::A',
  'app.js::safari_fight_enemy_select::A',
  'app.js::safari_follow_up_select::A',
  'app.js::safari_followup_execute_on::A',
  'app.js::safari_followup_save::A',
  'app.js::safari_give_item_select::A',
  'app.js::safari_give_role_select::A',
  'app.js::safari_item_execute_on::A',
  'app.js::safari_item_limit::A',
  'app.js::safari_item_operation::A',
  'app.js::safari_item_quantity::A',
  'app.js::safari_item_reset::A',
  'app.js::safari_map_admin_player::A',
  'app.js::safari_modify_attr_display::A',
  'app.js::safari_modify_attr_execute_on::A',
  'app.js::safari_modify_attr_limit::A',
  'app.js::safari_modify_attr_operation::A',
  'app.js::safari_modify_attr_reset::A',
  'app.js::safari_modify_attr_select::A',
  'app.js::safari_player_state_coord_clear::A',
  'app.js::safari_player_state_coord_submit::A',
  'app.js::safari_player_state_execute_on::A',
  'app.js::safari_player_state_mode::A',
  'app.js::safari_progress_back_to_rows::A',
  'app.js::safari_progress_global_items::A',
  'app.js::safari_progress_jump::A',
  'app.js::safari_progress_next::A',
  'app.js::safari_progress_prev::A',
  'app.js::safari_remove_action::A',
  'app.js::safari_remove_role_select::A',
  'app.js::safari_role_update::A',
  'app.js::safari_store_items_select_back::A',
  'app.js::save_player_notes::A',
  'app.js::season_app_ranking::A',
  'app.js::season_delete::A',
  'app.js::season_delete_cancel::A',
  'app.js::season_delete_confirm::A',
  'app.js::season_marooning::A',
  'app.js::season_nav_next::A',
  'app.js::season_nav_prev::A',
  'app.js::season_question_delete::A',
  'app.js::season_question_down::A',
  'app.js::season_question_up::A',
  'app.js::server_stats_page::A',
  'app.js::untrack_channel::A'
];
// Structural tamper guard — the baseline can only SHRINK. If you legitimately fixed
// handlers, delete their keys AND decrement this number.
const FROZEN_A_MAX = 123;

// Legacy res.send(UPDATE_MESSAGE) count ratchets (migrate handlers to the factory).
const FROZEN_C_MAX = 6;   // content-only data
const FROZEN_D_MAX = 34;  // flags/ephemeral in data

describe('Interaction shapes — silent-rejection ratchet', () => {
  const violations = scanAll();

  it('no NEW content-only updateMessage handler ships (class A)', () => {
    const baseline = new Set(FROZEN_A_BASELINE);
    const current = [...new Set(violations.filter(v => v.class === 'A').map(violationKey))];
    const fresh = current.filter(k => !baseline.has(k));
    assert.deepEqual(fresh, [], `\nNEW content-only UPDATE_MESSAGE handler(s):\n  ${fresh.join('\n  ')}\n\nReturn a V2 container instead:\n  { flags: (1 << 15), components: [{ type: 17, components: [{ type: 10, content: '…' }] }] }\nDo NOT add to the baseline. See scripts/scan-interaction-shapes.js and the InteractionShapeFailures RaP.`);
  });

  it('class-A baseline cannot grow (tamper guard)', () => {
    assert.equal(FROZEN_A_BASELINE.length, FROZEN_A_MAX,
      'Baseline size changed — only shrink it (fix handlers, delete keys, decrement FROZEN_A_MAX)');
  });

  it('content + IS_COMPONENTS_V2 flag stays eradicated (class B)', () => {
    const b = violations.filter(v => v.class === 'B');
    assert.deepEqual(b.map(v => `${v.file}:${v.line}`), [],
      'content is ILLEGAL alongside IS_COMPONENTS_V2 — put it in a container Text Display');
  });

  it('legacy UPDATE_MESSAGE res.send debt only shrinks (classes C/D)', () => {
    const c = violations.filter(v => v.class === 'C').length;
    const d = violations.filter(v => v.class === 'D').length;
    assert.ok(c <= FROZEN_C_MAX, `class C grew: ${c} > ${FROZEN_C_MAX} (content-only legacy UPDATE_MESSAGE)`);
    assert.ok(d <= FROZEN_D_MAX, `class D grew: ${d} > ${FROZEN_D_MAX} (flags in legacy UPDATE_MESSAGE data)`);
  });
});
