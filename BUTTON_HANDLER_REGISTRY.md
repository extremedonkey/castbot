# CastBot Button Handler Registry

This file maintains a comprehensive list of all button handlers, their custom_ids, labels, and locations in the codebase. This prevents the recurring issue of undefined function references and missing handlers.

## 🎯 **Current Active Buttons** (Updated: 2025-06-19)

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
| `safari_manage_shops` | 🏪 Manage Shops | app.js:~5067 | Direct handler | ✅ Active |
| `safari_manage_items` | 📦 Manage Items | app.js:~5195 | Direct handler | ✅ Active |
| `safari_shop_create` | ➕ Create New Shop | app.js:~5325 | Direct handler | ✅ Active |
| `safari_item_create` | ➕ Create New Item | app.js:~5402 | Direct handler | ✅ Active |
| `safari_shop_list` | 📋 View All Shops | app.js:~5488 | Direct handler | ✅ Active |
| `safari_item_list` | 📋 View All Items | app.js:~5599 | Direct handler | ✅ Active |
| `safari_currency_view_all` | 👥 View All Currency | app.js:~5710 | Direct handler | ✅ Active |
| `safari_currency_set_player` | 💰 Set Player Currency | app.js:~5760 | Direct handler | ✅ Active |
| `safari_currency_reset_all` | 🗑️ Reset All Currency | app.js:~5832 | Direct handler | ✅ Active |
| `safari_add_action_*` | Add Action buttons | app.js:~5927 | Pattern handler | ✅ Active |
| `safari_finish_button_*` | Finish & Save | app.js:~6117 | Pattern handler | ✅ Active |
| `safari_currency_*` | Currency actions | app.js:~7963+ | Pattern handlers | ✅ Active |
| `safari_{guildId}_{buttonId}_{timestamp}` | Dynamic Safari buttons | app.js:~2661 | Dynamic handler | ✅ Active |

### **Safari System Modal Handlers**
| Custom ID | Modal Title | Location | Handler Function | Status |
|-----------|-------------|----------|------------------|--------|
| `safari_button_modal` | Create Custom Button | app.js:~9070 | Modal handler | ✅ Active |
| `safari_action_modal_*` | Add Action Modals | app.js:~9229 | Pattern handler | ✅ Active |
| `safari_currency_modal_*` | Set Currency Modal | app.js:~9631 | Pattern handler | ✅ Active |
| `safari_shop_modal` | Create New Shop | app.js:~9747 | Modal handler | ✅ Active |
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