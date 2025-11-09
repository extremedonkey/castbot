 So with respect to @docs/architecture/CastlistArchitecture.md and our transition off the legacy version of castlists, when we create a new tribe and castlist under the tribes{} structure in the legacy method we get;
  JSON:       "1323402779271889059": {
          "emoji": "👮",
          "castlist": "S9 - Brooklyn 99",
          "showPlayerEmojis": false,
          "color": "#1abc9c",
          "analyticsName": "👮 S9 - Brooklyn 99 👮",
          "analyticsAdded": 1762675357036
        }
  Logs: [Pasted text #1 +682 lines]

  Contrast with natively creating a new Castlist under our new architecture:
  JSON:

  Logs:
  Create Season (Optional): [Pasted text #2 +181 lines]
  Create Castlist: [Pasted text #3 +347 lines]
  Create / Add Tribe: [Pasted text #4 +59 lines]
  Edit Tribe Information:
  JSON - Castlist:
        "castlist_1762675587960_974318870057848842": {
          "id": "castlist_1762675587960_974318870057848842",
          "name": "S10 - Drive In",
          "type": "custom",
          "createdAt": 1762675587960,
          "createdBy": "391415444084490240",
          "settings": {
            "sortStrategy": "alphabetical",
            "showRankings": false,
            "maxDisplay": 25,
            "visibility": "public",
            "seasonId": "season_3fa254c4eda94dbd"
          },
          "metadata": {
            "emoji": "🎥",
            "description": "Massive monster double-org season.",
            "lastModified": 1762675587960
          }
        }

  JSON - Tribe:
        "1385243081447837887": {
          "castlistIds": [
            "castlist_1762675587960_974318870057848842"
          ],
          "castlist": "S10 - Drive In"
        }

  My initial concern is getting 'data parity' with the legacy version; I need you to do the following for our new castlist - please refer to logs:
  Given tribe(s) are added / edited from the castlist_tribe_select_* string select:
  * In playerData.json under tribes { color }, fetch the Discord Role Color (https://discord.com/developers/docs/topics/permissions#role-object-role-colors-object - primary role color - or if not available in our payload the legacy 'color' integer
  https://discord.com/developers/docs/topics/permissions#role-object), set the tribe color to the discord role color of the tribe (there should be sample code for the legacy castlist / tribe creation that shows how to do this), store it in the format #123456 representing the 6-digit color hex (whatever
  it is called). Do not update this if there is an existing value (as user may have manually set a color)
  * Set analyticsName to the Role-Object string name (players will typically create these via the Discord Interface in the guild and name it something like "Season 15 - Hogwarts". Create / Update this each time, in case the user has changed the discord-role name.
  * Set the analyticsAdded as per the legacy method
  * Set tribe { emoji } to the default value of 🏕️

  Given a tribe is removed from castlist_tribe_select_*:

  Given the user is creating a new castlist (castlist_select [ 'create_new' ]) or editing an existing castlist (castlist_edit_info_ * isModal: true (e.g., castlist_edit_info_castlist_1762675587960_974318870057848842))
  * Move the Sort Strategy label and wrapped string select (label value "Sort Strategy" label description "choose the ordering method for players") below the "Castlist Name" label / text input. Change the value to "Castlist Sorting Method" and description to "Choose how players are ordered on their
  tribe page."
  * On submission of the modal, ensure the sortStrategy is created / updated as it was done upon castlist_order_castlist_* modal submission
  * Remove the "Order" button (castlist_order_castlist_) from the castlist_hub_main user interface, remove the associated modal UI code, including the additional redundant label ("Choose Sort Strategy" "Select how players should be ordered in this castlist:")



* Make the Sort Strategy "Placements" string select option the first option in the string select (the default). Change the label from "Placements" to "Alphabetical (A-Z), then Placement" and change description to "Any eliminated players shown last"
@@@@@@@@@@@@@@@@@@

* Currently, if the 'default' (Active Castlist) is chosen in castlist_select, the Edit button (castlist_edit_info_*) and modal is made inactive. Change the behavior so it becomes active when the default castlist is selected. When the button is clicked and the modal is launched, implement the following logic: If NOT default castlist, show all components (as per current), else if default castlist, hide the "Castlist Name", "Castlist Emoji" and "Castlist Description" labels / associated text inputs. Ensure the user is able to select and assign a season to the default castlist upon modal submission.
* Change the label of Alphabetical (A-Z) to "Alphabetical (A-Z), no placements" and description "Sort players by name, don't show elims"
* Add a new Sort Strategy called "Placements, then Alphabetical (A-Z)" with description "Players with placements shown first". Pseudocode for the sort strategy is "For all players in tribeRole, show all players with placement value first (1 = highest), else if no placement show alphabetically"
* Remove the Age, Timezone and Join Date Sort Strategies from the string select and any associated handlers (I don't believe these were ever implemented)
* Above the Tribe Section components and below the divider, add a new Display Text with text per below. Ensure this text is refreshed when edits are made such as in the castlist_edit_info_ modal:
(start of Display Text content)
### :camping: Tribes on Castlist
* Tribes sorted by <SortingStrategyName>
* Castlist is associated with <SeasonName / No Season>
(end of Display Text content)
* Move the  castlist_tribe_select_* to directly below the Display Text
* For the Section component that is repeated for each tribe, replace 'No custom settings' with <X players: <player1PerServerName>, <p2..>, capped to 38 characters for the entire line, and add 2 trailing dots if there are additional players (..). For example: 5 players: Allison, Ben, Kiera, Reece..
* Remove the divider component below the Section components repeated for each tribe
* Move the "Swap/Merge" button into the same actionRow as the Placements (castlist_placements_*) button, to the right of it
* Make the Swap/Merge button always active and implement the logic: On click, if currently selected castlist is NOT 'default' (aka Active Castlist), create a new ephemeral container per our UI/UX standards (do not change or remove the castlist_hub_main message) with the text "You can only conduct a Tribe Swap / Merge using the "Active Castlist", please change to this Castlist and try again. You will then be able to select the tribe roles for the new phase of the game, and a castlist will be created for the past phase of the game).

Given the Swap/Merge button is clicked and opens the Tribe Swap Modal (castlist_swap_merge isModal: true)
* Change the New Tribe Roles label description to "Select the role(s) your players will swap or merge into. " Remove any 'hard requirement' for 2+ roles in either the string select or any validation, merge only has one tribe so actual rule/validation should be for one tribe only.
* Change 'Archive Castlist Name' to 'Last Phase Castlist Name' and change description to "Archive castlist will be made for the last phase; suggest to keep old tribe roles on players." and change the string select placeholder text from "Pre-Swap Tribes" to e.g., OG Tribes, Swap 1 Tribes
* Under Vanity Roles, change "Keep old tribe roles visible on new castlist" to "Shows past tribes under player's name on Castlist"
* Change the vanity roles Yes string select option value to "Yes - show past tribes on castlists" and description to "Assigns a vanity role in Castbot"
* Change the No string select option value to "No - don't show past tribes" and description "Won't show past tribes on new castlist"
* Under the "Have Castbot Randomize Swap?" label, change the description from "Automatic Random assignment with dramatic reveal" to "EXPERIMENTAL - CastBot will randomise swap and automatically assign new tribe roles"
* Change the "Yes - Automate via CastBot: string select description to "CastBot will conduct live swap in the channel you are in right now"


@@@@@@@@@@@@
  Given the Edit Tribe button is clicked, launching the Edit Tribe Modal (tribe_edit_button|* e.g. tribe_edit_button|1385243081447837887|castlist_1762675587960_974318870057848842);
  * Please remove the "Analytics Name" Text Input, it should be automatically created as per above.
  * Please remove the "Display Name" from the Modal, do a scan of usage of Display Name in our code, and replace it with analyticsName if it exists, or castlist: as a first fallback; or tribe ID as a second fallback.
  * Modify the "Accent Color" field, currently it does not support color codes without the hash (e.g., ffffff), ensure it can within the hexadecimal range - we should have a reference implementation of this in our legacy code

  Please convert tribe_edit_button| to @docs/enablers/ButtonHandlerFactory.md, be mindful of possible issue due to @RaP/0992_20251005_ButtonIdParsing_TechnicalDebt.md