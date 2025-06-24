# CastBot Button Handler Registry

This file maintains a comprehensive list of all button handlers, their custom_ids, labels, and locations in the codebase. This prevents the recurring issue of undefined function references and missing handlers.

## 🎯 **Current Active Buttons** (Updated: 2025-06-23)

### **Main Production Menu Buttons**
| Custom ID | Label | Location | Handler Function | Status |
|-----------|-------|----------|------------------|--------|
| `prod_setup` | 🪛 Setup | app.js:~3200 | Direct handler | ✅ Active |
| `prod_manage_pronouns_timezones` | 💜 Manage Pronouns/Timezones | app.js:~3300 | Direct handler | ✅ Active |
| `prod_manage_tribes` | 🔥 Manage Tribes | app.js:~3400 | Direct handler | ✅ Active |
| `admin_manage_player` | 🧑‍🤝‍🧑 Manage Players | app.js:~3500 | Direct handler | ✅ Active |
| `prod_season_applications` | 📝 Season Applications | app.js:~3600 | Direct handler | ✅ Active |
| `prod_setup_tycoons` | 💰 Tycoons | app.js:~3700 | Direct handler | ✅ Active |
| `prod_player_menu` | 👤 My Profile | app.js:~4797 | Direct handler | ✅ Active |
| `reece_stuff_menu` | 😌 Reece Stuff | app.js:~4022 | Direct handler | ✅ Active |

### **Reece Stuff Submenu Buttons**
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
| `safari_my_status` | 💎 My Status | app.js:~5036 | Direct handler | ✅ Active |
| `safari_manage_safari_buttons` | 🎛️ Manage Safari Buttons | app.js:~3893 | Direct handler | ✅ Active |
| `safari_manage_shops` | 🏪 Manage Stores | app.js:~5067 | Direct handler | ✅ Active |
| `safari_manage_items` | 📦 Manage Items | app.js:~5195 | Direct handler | ✅ Active |
| `safari_shop_manage_items` | 📦 Manage Shop Items | app.js:~5904 | Direct handler | ✅ Active |
| `safari_shop_items_select` | Store Selection for Items | app.js:~6009 | Select handler | ✅ Active |
| `safari_shop_add_item_*` | ➕ Add Item to Store | app.js:~6197 | Pattern handler (::delimiter) | ✅ Active |
| `safari_shop_remove_item_*` | 🗑️ Remove Item from Store | app.js:~6288 | Pattern handler (::delimiter) | ✅ Active |
| `safari_shop_open_*` | 🏪 Open Store (Post to Channel) | app.js:~6364 | Pattern handler | ✅ Active |
| `safari_shop_post_channel_*` | Channel Selection for Store Posting | app.js:~6460 | Select handler | ✅ Active |
| `safari_shop_browse_*` | 🏪 Browse Store (Player Interface) | app.js:~2437 | Pattern handler | ✅ Active |
| `safari_shop_buy_*` | 🛒 Purchase Item from Store | app.js:~2562 | Pattern handler | ✅ Active |
| `safari_shop_create` | ➕ Create New Store | app.js:~5325 | Direct handler | ✅ Active |
| `safari_item_create` | ➕ Create New Item | app.js:~5402 | Direct handler | ✅ Active |
| `safari_shop_list` | 📋 View All Stores | app.js:~5488 | Direct handler | ✅ Active |
| `safari_item_list` | 📋 View All Items | app.js:~5599 | Direct handler | ✅ Active |
| `safari_currency_view_all` | 👥 View All Currency | app.js:~5710 | Direct handler | ✅ Active |
| `safari_currency_set_player` | 💰 Set Player Currency | app.js:~5760 | Direct handler | ✅ Active |
| `safari_currency_reset_all` | 🗑️ Reset All Currency | app.js:~5832 | Direct handler | ✅ Active |
| `safari_button_manage_existing` | ✏️ Edit Existing Button | app.js:~5983 | Direct handler | ✅ Active |
| `safari_button_edit_select` | Button Selection Dropdown | app.js:~6078 | Select handler | ✅ Active |
| `safari_edit_properties_*` | Edit Properties | app.js:~6329 | Pattern handler | ✅ Active |
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
| | `custom_id !== 'safari_post_select_button'` | ✅ Active | Required for post button select menu |

### **Recent Critical Fixes (2025-06-24)**
| Issue | Fix Applied | Impact | Status |
|-------|-------------|--------|--------|
| Shop Item Add/Remove Parsing Error | Changed delimiter from `_` to `::` in custom_ids | Fixed shop/item ID parsing when IDs contain underscores | ✅ Fixed |
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
| `safari_shop_modal` | Create New Store | app.js:~9747 | Modal handler | ✅ Active |
| `safari_item_modal` | Create New Item | app.js:~9812 | Modal handler | ✅ Active |

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