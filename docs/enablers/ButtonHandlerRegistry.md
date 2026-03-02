# CastBot Button Handler Registry

> **Open this file when** you need to find where a button's handler lives in the code. This is a best-effort index — line numbers drift as code changes. When in doubt, `grep app.js` for the `custom_id`. The authoritative source of truth is always the code itself.

This file maintains a list of button handlers, their custom_ids, labels, and approximate locations in the codebase.

## 🎯 **Current Active Buttons** (Updated: 2025-06-23)

### **Main Production Menu Buttons**
| Custom ID | Label | Location | Handler Function | Status |
|-----------|-------|----------|------------------|--------|
| `prod_setup` | 🪛 Tools | menuBuilder.js:~12 | MenuBuilder | ✅ Active |
| ~~`prod_manage_tribes`~~ | ~~🔥 Manage Tribes~~ | ~~app.js:~3400~~ | ~~Direct handler~~ | 🗑️ Removed — replaced by `reeces_stuff` (Reece's Stuff in Tools). See [CastlistV3.md](../features/CastlistV3.md) |
| `admin_manage_player` | 🧑‍🤝‍🧑 Manage Players | app.js:~3500 | Direct handler | ✅ Active |
| `prod_season_applications` | 📝 Season Applications | app.js:~3600 | Direct handler | ✅ Active |
| `prod_setup_tycoons` | 💰 Tycoons | app.js:~3700 | Direct handler | ✅ Active |
| `prod_player_menu` | 👤 My Profile | app.js:~4797 | Direct handler | ✅ Active |
| `analytics_admin` (was `reece_stuff_menu`) | 📊 Analytics Admin | app.js:~4022 | Direct handler | ✅ Active |

### **Tools Menu Buttons** (Accessed via prod_setup)
| Custom ID | Label | Location | Handler Function | Status |
|-----------|-------|----------|------------------|--------|
| `setup_castbot` | 🪛 Run Setup | app.js:TBD | Direct handler | ✅ Active |
| `prod_manage_pronouns_timezones` | 🎯 Reaction Roles | app.js:~6328 | ButtonHandlerFactory | ✅ Active |
| `prod_ban_react` | 🎯 Post React for Ban | app.js | ButtonHandlerFactory | ✅ Active |
| `prod_availability` | 🕐 Availability | app.js:~6425 | ButtonHandlerFactory | ✅ Active |

### **Analytics Admin Submenu Buttons** (was "Reece Stuff")
| Custom ID | Label | Location | Handler Function | Status |
|-----------|-------|----------|------------------|--------|
| `prod_analytics_dump` | 📊 Analytics | app.js:~4315 | Direct handler | ✅ Active |
| `prod_live_analytics` | 🔴 Live Analytics | app.js:~4400 | Direct handler | ✅ Active |
| `prod_server_usage_stats` | 📈 Server Usage Stats | app.js:~4750 | Direct handler | ✅ Active |
| `prod_toggle_live_analytics` | 🪵 Toggle Live Analytics | app.js:~4690 | Direct handler | ✅ Active |
| `prod_menu_back` | ⬅ Menu | app.js:~4064 | Direct handler | ✅ Active |

### **Safari System Buttons**
| Custom ID | Label | Location | Handler Function | Status |
|-----------|-------|----------|------------------|--------|
| `prod_safari_menu` | 🦁 Safari | app.js:~3814 | Direct handler | ✅ Active |
| `safari_create_button` | 📝 Create Custom Button | app.js:~4699 | Direct handler | ✅ Active |
| `safari_post_button` | 📤 Post Custom Button | app.js:~4771 | Direct handler | ✅ Active |
| `safari_manage_currency` | 💰 Manage Currency | app.js:~4858 | Direct handler | ✅ Active |
| `safari_view_buttons` | 📊 View All Buttons | app.js:~4983 | Direct handler | ✅ Active |
| `safari_my_inventory` | 🪺 My [Inventory] | app.js:~5390 | Direct handler | ✅ Active |
| `safari_player_inventory` | 🥚 My Nest | app.js:~5456 | Direct handler | ✅ Active |
| `safari_customize_terms` | ⚙️ Customize Terms | app.js:~5679 | Direct handler | ✅ Active (Components V2) |
| `safari_config_group_*` | Field Group Buttons | app.js:~5713 | Pattern handler | ✅ Active |
| `safari_config_reset_defaults` | 🔄 Reset to Defaults | app.js:~5750 | Direct handler | ✅ Active |
| `safari_config_confirm_reset` | ⚠️ Confirm Reset | app.js:~5779 | Direct handler | ✅ Active |
| `safari_round_results` | 🏅 Round Results | app.js:~5598 | Direct handler | ✅ Active (Complete Rewrite) |
| `safari_confirm_reset_game` | ⚠️ Reset to Round 1 | app.js:~5629 | Direct handler | ✅ Active |
| `safari_export_data` | ⚙️ Export | app.js:~5817 | Direct handler | ✅ Active |
| `safari_import_data` | ⚙️ Import | app.js:~5866 | Direct handler | ✅ Active |
| `safari_schedule_results` | 📅 Schedule Results | app.js:~6341 | Direct handler | ✅ Active |
| `safari_manage_safari_buttons` | 🎛️ Manage Safari Buttons | app.js:~3893 | Direct handler | ✅ Active |
| `safari_manage_items` | 📦 Manage Items | app.js:~5195 | Direct handler | ✅ Active |
| `safari_store_manage_items` | 📦 Manage Store Items | app.js:~5904 | Direct handler | ✅ Active |
| `safari_store_items_select` | Store Selection for Items | app.js:~6009 | Select handler | ✅ Active |
| `safari_store_add_item_*` | ➕ Add Item to Store | app.js:~6197 | Pattern handler (::delimiter) | ✅ Active |
| `safari_store_remove_item_*` | 🗑️ Remove Item from Store | app.js:~6288 | Pattern handler (::delimiter) | ✅ Active |
| `safari_store_edit_*` | ✏️ Edit Store Details | app.js:~7126 | Pattern handler | ✅ Active |
| `safari_store_open_*` | 🏪 Open Store (Post to Channel) | app.js:~7217 | Pattern handler | ✅ Active |
| `safari_store_delete_*` | 🗑️ Delete Store | app.js:~7420 | Pattern handler | ✅ Active |
| `safari_confirm_delete_store_*` | ⚠️ Confirm Delete Store | app.js:~7268 | Pattern handler | ✅ Active |
| `safari_store_post_channel_*` | Channel Selection for Store Posting | app.js:~7350 | Select handler | ✅ Active |
| `safari_store_browse_*` | 🏪 Browse Store (Player Interface) | app.js:~2437 | Pattern handler | ✅ Active |
| `safari_store_buy_*` | 🛒 Purchase Item from Store | app.js:~2562 | Pattern handler | ✅ Active |
| `safari_store_create` | ➕ Create New Store | app.js:~5325 | Direct handler | ✅ Active |
| `safari_item_create` | ➕ Create New Item | app.js:~5402 | Direct handler | ✅ Active |
| `safari_item_list` | 📋 View All Items | app.js:~5599 | Direct handler | ✅ Active |
| `safari_currency_view_all` | 👥 View All Currency | app.js:~5710 | Direct handler | ✅ Active |
| `safari_currency_set_player` | 💰 Set Player Currency | app.js:~5760 | Direct handler | ✅ Active |
| `safari_currency_reset_all` | 🗑️ Reset All Currency | app.js:~5832 | Direct handler | ✅ Active |
| `safari_view_player_inventory` | 👀 Player Inventory | app.js:~8396 | Direct handler | ✅ Active |
| `safari_inventory_user_select` | User Select for Inventory Viewing | app.js:~10660 | Direct handler | ✅ Active |
| `safari_item_player_qty_*` | 📦 Player Qty (Item Management) | app.js:~8461 | Pattern handler | ✅ Active |
| `safari_item_qty_user_select_*` | User Select for Item Quantity | app.js:~10580 | Pattern handler | ✅ Active |
| `safari_button_manage_existing` | ✏️ Edit Existing Button | app.js:~5983 | Direct handler | ✅ Active |
| `safari_button_edit_select` | Button Selection Dropdown | app.js:~6078 | Select handler | ✅ Active |
| `safari_edit_properties_*` | Edit Properties | app.js:~6329 | Pattern handler | ✅ Active |
| `safari_attack_player_*` | ⚔️ Attack Player | app.js:~5698 | Pattern handler | ✅ Active |
| `safari_attack_target_*` | User Select for Attack Target | app.js:~5725 | Pattern handler | ✅ Active |
| `safari_attack_quantity_*` | String Select for Attack Quantity | app.js:~5755 | Pattern handler | ✅ Active |
| `safari_schedule_attack_*` | ⚔️ Schedule Attack | app.js:~5785 | Pattern handler | ✅ Active |
| `safari_restock_players` | 🪣 Restock Players | app.js:~3893 | Direct handler | ✅ Active |
| `safari_map_explorer` | 🗺️ Map Explorer | app.js:~12967 | Direct handler | ✅ Active |
| `map_create` | 🏗️ Create Map | app.js:~13001 | Direct handler | ✅ Active |
| `map_delete` | 🗑️ Delete Map | app.js:~13061 | Direct handler | ✅ Active |
| `map_grid_edit_*` | ✏️ Edit Content | app.js:~13160 | Pattern handler | ✅ Active |
| `map_grid_view_*` | 👁️ View Content | app.js:~13256 | Pattern handler | ✅ Active |
| `map_stores_select_*` | Store Selection Dropdown | app.js:~13398 | Pattern handler | ✅ Active |
| `map_coord_store_*` | 🏪 Store Button (from map) | app.js:~13448 | Pattern handler | ✅ Active |
| `map_add_item_drop_*` | 🧰 Add Item Drop | app.js:~13588 | Pattern handler | ✅ Active |
| `map_add_currency_drop_*` | 🪙 Add Currency Drop | app.js:~13647 | Pattern handler | ✅ Active |
| `map_item_drop_select_*` | Item Drop Selection | app.js:~13703 | Pattern handler | ✅ Active |
| `map_item_drop_*` | 📦 Item Drop (Player) | app.js:~13840 | Pattern handler | ✅ Active |
| `map_currency_drop_*` | 🪙 Currency Drop (Player) | app.js:~13933 | Pattern handler | ✅ Active |
| `map_drop_style_*` | Drop Style Select | app.js:~14017 | Pattern handler | ✅ Active |
| `map_drop_type_*` | Drop Type Select | app.js:~14052 | Pattern handler | ✅ Active |
| `map_drop_text_*` | ✏️ Set Button Text | app.js:~14089 | Pattern handler | ✅ Active |
| `map_drop_save_*` | ✅ Save Drop | app.js:~14140 | Pattern handler | ✅ Active |
| `map_drop_remove_*` | 🗑️ Remove Drop | app.js:~14218 | Pattern handler | ✅ Active |
| `map_drop_reset_*` | 🔃 Reset Drop | app.js:~14260 | Pattern handler | ✅ Active |
| `map_currency_style_*` | Currency Style Select | app.js:~14297 | Pattern handler | ✅ Active |
| `map_currency_type_*` | Currency Type Select | app.js:~14328 | Pattern handler | ✅ Active |
| `map_currency_edit_*` | ✏️ Edit Currency | app.js:~14360 | Pattern handler | ✅ Active |
| `map_currency_remove_*` | 🗑️ Remove Currency | app.js:~14375 | Pattern handler | ✅ Active |
| `map_currency_reset_*` | 🔃 Reset Currency | app.js:~14415 | Pattern handler | ✅ Active |

### **Whisper System Buttons**
| Custom ID | Label | Location | Handler Function | Status |
|-----------|-------|----------|------------------|--------|
| `safari_whisper` | 💬 Whisper | app.js:~8620 | ButtonHandlerFactory | ✅ Active |
| `whisper_player_select_*` | Select Player (dropdown) | app.js:~17463 | ButtonHandlerFactory | ✅ Fixed (2025-08-06) |
| `whisper_read_*` | 💬 Read Message | app.js:~8670 | ButtonHandlerFactory | ✅ Active |
| `whisper_reply_*` | 💬 Reply | app.js:~8700 | ButtonHandlerFactory | ✅ Active |

### **Safari Custom Actions System Buttons**
| Custom ID | Label | Location | Handler Function | Status |
|-----------|-------|----------|------------------|--------|
| `entity_custom_action_select` | ⚡ Custom Actions | app.js:TBD | ButtonHandlerFactory | 🚧 Implementing |
| `entity_custom_action_list_*` | Custom Action Selection | app.js:TBD | ButtonHandlerFactory | 🚧 Implementing |
| `entity_custom_action_create` | ➕ Create New Action | app.js:TBD | ButtonHandlerFactory | 🚧 Implementing |
| `entity_action_trigger_*` | 🎯 Edit Trigger | app.js:TBD | ButtonHandlerFactory | 🚧 Implementing |
| `entity_action_conditions_*` | 🔧 Edit Conditions | app.js:TBD | ButtonHandlerFactory | 🚧 Implementing |
| `entity_action_coords_*` | 📍 Manage Coordinates | app.js:TBD | ButtonHandlerFactory | 🚧 Implementing |
| `custom_action_trigger_type_*` | Trigger Type Select | app.js:TBD | Select menu handler | 🚧 Implementing |
| `custom_action_condition_logic_*` | 🔀 Condition Logic | app.js:TBD | Select menu handler | 🚧 Implementing |
| `custom_action_add_condition_*` | ➕ Add Condition | app.js:TBD | ButtonHandlerFactory | 🚧 Implementing |
| `custom_action_remove_condition_*` | 🗑️ Remove Condition | app.js:TBD | ButtonHandlerFactory | 🚧 Implementing |
| `custom_action_test_*` | 🧪 Test Action | app.js:TBD | ButtonHandlerFactory | 🚧 Implementing |

### **Modal Submission Handlers**
| Custom ID | Purpose | Location | Handler Type | Status |
|-----------|---------|----------|--------------|--------|
| `safari_customize_terms_modal` | Custom Terms Modal | app.js:~12591 | Modal handler | ✅ Active |
| `safari_item_qty_modal_*` | Item Quantity Modal | app.js:~12976 | Modal handler | ✅ Active |
| `map_grid_edit_modal_*` | Map Grid Content Edit Modal | app.js:~15702 | Modal handler | ✅ Active |
| `safari_test_button_*` | Test Button | app.js:~6603 | Pattern handler | ✅ Active |
| `safari_action_edit_*` | Edit Individual Actions | app.js:~6384 | Pattern handler | ✅ Active |
| `safari_action_move_up_*` | Move Action Up | app.js:~6195 | Pattern handler | ✅ Active |
| `safari_action_move_down_*` | Move Action Down | app.js:~6258 | Pattern handler | ✅ Active |
| `safari_action_delete_*` | Delete Individual Action | app.js:~5000+ | Pattern handler | ✅ Active |
| `safari_delete_button_*` | Delete Button | app.js:~6666 | Pattern handler | ✅ Active |
| `safari_confirm_delete_button_*` | Delete Confirmation | app.js:~6721 | Pattern handler | ✅ Active |
| `safari_add_action_*` | Add Action buttons | app.js:~5927 | Pattern handler | ✅ Active |
| `safari_finish_button_*` | Finish & Save | app.js:~6117 | Pattern handler | ✅ Active |
| `safari_currency_*` | Currency actions | app.js:~7963+ | Pattern handlers | ✅ Active |
| `safari_{guildId}_{buttonId}_{timestamp}` | Dynamic Safari buttons | app.js:~2661 | Dynamic handler | ✅ Active |

### **🚨 Critical Pattern Exclusions** ⚠️
| Dynamic Handler | Required Exclusions | Status | Notes |
|-----------------|-------------------|--------|-------|
| `safari_` dynamic handler | `!custom_id.startsWith('safari_button_')` | ✅ Fixed | **CRITICAL**: Must exclude all `safari_button_` patterns to prevent interference |
| | `!custom_id.startsWith('safari_add_action_')` | ✅ Active | Required for action management handlers |
| | `!custom_id.startsWith('safari_currency_')` | ✅ Active | Required for currency management handlers |
| | `!custom_id.startsWith('safari_config_')` | ✅ Active | Required for Safari customization handlers |
| | `custom_id !== 'safari_post_select_button'` | ✅ Active | Required for post button select menu |

### **Recent Critical Fixes (2025-06-24)**
| Issue | Fix Applied | Impact | Status |
|-------|-------------|--------|--------|
| Store Item Add/Remove Parsing Error | Changed delimiter from `_` to `::` in custom_ids | Fixed store/item ID parsing when IDs contain underscores | ✅ Fixed |
| Post Custom Button "Interaction Failed" | Changed response from `CHANNEL_MESSAGE_WITH_SOURCE` to `UPDATE_MESSAGE` | Fixed select menu functionality | ✅ Resolved |
| Edit Existing Button "❌ Button not found" | Added `!custom_id.startsWith('safari_button_')` to dynamic handler exclusions | Fixed button management access | ✅ Resolved |
| Documentation Gap | Added comprehensive dynamic handler pattern exclusion guidelines to CLAUDE.md | Prevents future pattern matching issues | ✅ Complete |

### **Safari System Modal Handlers**
| Custom ID | Modal Title | Location | Handler Function | Status |
|-----------|-------------|----------|------------------|--------|
| `safari_button_modal` | Create Custom Button | app.js:~9070 | Modal handler | ✅ Active |
| `safari_properties_modal_*` | Edit Properties Modal | app.js:~9000+ | Pattern handler | ✅ Active |
| `safari_action_modal_*` | Add Action Modals | app.js:~9229 | Pattern handler | ✅ Active |
| `safari_edit_action_modal_*` | Edit Individual Action Modal | app.js:~9000+ | Pattern handler | ✅ Active |
| `safari_currency_modal_*` | Set Currency Modal | app.js:~9631 | Pattern handler | ✅ Active |
| `safari_store_modal` | Create New Store | app.js:~13467 | Modal handler | ✅ Active |
| `safari_store_edit_modal_*` | Edit Store Details | app.js:~13524 | Pattern modal handler | ✅ Active |
| `safari_item_modal` | Create New Item | app.js:~13609 | Modal handler | ✅ Active |
| `safari_customize_terms_modal` | Customize Currency Terms | app.js:~12867 | Modal handler | ❌ Deprecated (Components V2) |
| `safari_config_modal_*` | Field Group Modals | app.js:~13014 | Pattern handler | ✅ Active |
| `safari_export_modal` | Export Safari Data | app.js:~13277 | Modal handler | ✅ Active |
| `safari_import_modal` | Import Safari Data | app.js:~13287 | Modal handler | ✅ Active |
| `safari_schedule_modal_*` | Schedule Safari Results | app.js:~14610 | Modal handler | ✅ Active |
| `map_currency_drop_modal_*` | Configure Currency Drop | app.js:~16954 | Modal handler | ✅ Active |
| `map_drop_text_modal_*` | Configure Item Drop Button Text | app.js:~17128 | Modal handler | ✅ Active |

### **Castlist Navigation Buttons**
| Custom ID | Label | Location | Handler Function | Status |
|-----------|-------|----------|------------------|--------|
| `show_castlist2_*` | Show * Castlist | app.js:~3000 | Castlist handler | ✅ Active |
| `castlist2_nav_*` | Navigation buttons | castlistV2.js | Navigation handler | ✅ Active |
| `viral_menu` | 📋 Menu | app.js:~3000 | Menu handler | ✅ Active |

### **Helper Functions Registry**
| Function Name | Purpose | Location | Usage |
|---------------|---------|----------|-------|
| `shouldUpdateProductionMenuMessage` | Check if message should be updated | app.js | All submenu handlers |
| `sendProductionSubmenuResponse` | Send submenu response | app.js | Submenu handlers |
| `createProductionMenuInterface` | Create main menu | app.js:~130 | Menu creation |
| `createReeceStuffMenu` | Create Reece submenu | app.js:~283 | Reece menu |

### **Security Patterns**
| Pattern | Implementation | Usage |
|---------|----------------|-------|
| Admin Permission Check | `member.permissions.has(PermissionFlagsBits.ManageRoles/Channels/Guild)` | All admin handlers |
| User ID Restriction | `userId !== '391415444084490240'` | Reece-only features |
| Error Handling | `try/catch` with `InteractionResponseFlags.EPHEMERAL` | All handlers |

## 🚨 **Common Patterns to Prevent Errors**

### **Standard Submenu Handler Template**
```javascript
} else if (custom_id === 'your_button_id') {
  try {
    const userId = req.body.member.user.id;
    
    // Security check if needed
    if (userId !== '391415444084490240') {
      return res.send({
        type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
        data: {
          content: '❌ Access denied.',
          flags: InteractionResponseFlags.EPHEMERAL
        }
      });
    }

    const channelId = req.body.channel_id;
    const shouldUpdateMessage = await shouldUpdateProductionMenuMessage(channelId);
    
    // Create your menu data
    const menuData = await createYourMenu();
    
    const responseType = shouldUpdateMessage ? 
      InteractionResponseType.UPDATE_MESSAGE : 
      InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE;
    
    return res.send({
      type: responseType,
      data: menuData
    });
    
  } catch (error) {
    console.error('Error handling your_button_id:', error);
    return res.send({
      type: InteractionResponseType.CHANNEL_MESSAGE_WITH_SOURCE,
      data: {
        content: 'Error loading interface.',
        flags: InteractionResponseFlags.EPHEMERAL
      }
    });
  }
```

### **Required Function Checklist**
Before creating any new submenu handler, verify these functions exist:
- [ ] `shouldUpdateProductionMenuMessage(channelId)` - ✅ Exists
- [ ] `sendProductionSubmenuResponse(res, channelId, components, shouldUpdate)` - ⚠️ Check if exists
- [ ] Error handling pattern with ephemeral responses - ✅ Pattern established

## 📝 **Update Instructions**
1. **When adding new buttons**: Update this registry immediately
2. **When modifying handlers**: Update status and location
3. **When debugging**: Check this registry first for handler locations
4. **Before deploying**: Verify all referenced functions exist

## 🔧 **Function Validation Script** (Future Enhancement)
```bash
# Add to dev-restart.sh
echo "🔍 Validating button handlers..."
grep -n "custom_id.*===" app.js | while read line; do
  echo "  ✓ Found handler: $line"
done
```