# Whisper System Documentation

## Overview

The Whisper System allows players at the same Safari Map location to send private messages to each other. It includes whisper detection for nearby players and full transcript logging for production/spectators.

## Architecture

### Core Components

1. **whisperManager.js** - Main whisper functionality module
2. **app.js handlers** - Button and modal interaction handlers
3. **playerLocationManager.js** - Location validation
4. **Pending whisper storage** - Global in-memory queue

### Data Flow

```
Player A → Whisper Button → Player Select → Modal → Send Whisper → Store in Queue
                                                                         ↓
Player B → Any Interaction → Check Queue → Deliver Whisper → Reply Option
```

## Implementation Status

### ✅ Completed Features

1. **Whisper Button** (safari_whisper_{coordinate})
   - Added to Player Location Actions
   - Grey secondary button with 💬 emoji
   - Position: far right of action row

2. **Player Selection** (whisper_player_select_{coordinate})
   - String select menu showing players at same location
   - Filters out the sender
   - Shows player display names with descriptions

3. **Whisper Modal** (whisper_send_modal_{targetUserId}_{coordinate})
   - Paragraph text input (1-1000 chars)
   - Title shows recipient name
   - Validates on submission

4. **Whisper Delivery System**
   - Location verification before sending
   - Stores whispers in global.pendingWhispers Map
   - Delivers on recipient's next interaction
   - Shows remaining whisper count

5. **Reply Functionality** (whisper_reply_{senderId}_{coordinate})
   - Reply button on received whispers
   - Reuses same modal system
   - Maintains conversation context

### ⏳ Pending Features

6. **Whisper Detection** (30s auto-delete)
   - Posts "👀 Players are whispering at {coordinate}"
   - In map channel (coordinate's channel)
   - Auto-deletes after configurable time

7. **Whisper Log Channel**
   - Full transcript for production/spectators
   - Dedicated channel configuration
   - Purple accent color for whisper posts

8. **Configuration Management**
   - Guild-specific settings in safariContent.json
   - Toggle detection on/off
   - Set log channel ID
   - Configure auto-delete duration

## User Experience

### Sending a Whisper

1. Player clicks "Player Location Actions" at their location
2. Clicks "Whisper" button (💬)
3. Selects target player from dropdown
4. Types message in modal (up to 1000 chars)
5. Receives ephemeral confirmation

### Receiving a Whisper

1. Player performs ANY interaction (button click, command, etc.)
2. Whisper appears as ephemeral message:
   ```
   ## 💬 {SenderName} whispers to you
   
   > **@{SenderName} is whispering to you**
   {Message}
   
   [Separator]
   [Reply Button]
   ```
3. Can click Reply to respond

### Reply Flow

1. Click Reply button
2. Modal appears with "Reply to {SenderName}"
3. Type reply message
4. Same delivery mechanism

## Technical Details

### Handler IDs

- `safari_whisper_{coordinate}` - Initial whisper button
- `whisper_player_select_{coordinate}` - Player selection dropdown
- `whisper_send_modal_{targetUserId}_{coordinate}` - Send/reply modal
- `whisper_reply_{senderId}_{coordinate}` - Reply button

### Validation Checks

1. **Player Eligibility**
   - Must be initialized in Safari (have mapProgress)
   - Must be at valid coordinate

2. **Location Verification**
   - On player selection (initial check)
   - On modal submission (re-check)
   - Uses arePlayersAtSameLocation()

3. **Error Handling**
   - No players at location
   - Player moved away
   - Player not in game
   - Modal/delivery failures

### Ephemeral Responses

All whisper-related UI is ephemeral:
- Player selection
- Whisper modals
- Confirmation messages
- Error messages
- Received whispers

## Configuration Structure

```javascript
// In safariContent.json
{
  "guildId": {
    "whisperSettings": {
      "detectionEnabled": true,           // Show activity in channels
      "detectionDuration": 30000,         // 30 seconds
      "logEnabled": true,                 // Full transcripts
      "logChannelId": "1234567890",      // Log channel
      "productionRoleId": "0987654321"   // Who can view logs
    }
  }
}
```

## Known Limitations

1. **Asynchronous Delivery**
   - Whispers only deliver on interaction
   - Not real-time like DMs
   - Multiple whispers queue up

2. **In-Memory Storage**
   - Whispers lost on server restart
   - No persistence currently
   - Consider Redis for production

3. **No Whisper History**
   - Only latest whisper shown
   - No conversation threading
   - Log channel provides history

## Security Considerations

1. **Location-Based**
   - Must be at same coordinate
   - Prevents cross-map whispers
   - Adds realism to game

2. **Player-Only**
   - Must be initialized player
   - Not available to spectators
   - Maintains game integrity

3. **Ephemeral Nature**
   - All UI is private
   - No channel spam
   - Maintains secrecy

## Testing Checklist

- [ ] Whisper button appears in location actions
- [ ] Can select other players at location
- [ ] Modal appears and accepts text
- [ ] Confirmation is ephemeral
- [ ] Recipient receives on next interaction
- [ ] Reply button works
- [ ] Location checks prevent invalid whispers
- [ ] Error messages are helpful and ephemeral

## Future Enhancements

1. **Persistence Layer**
   - Redis or database storage
   - Survive server restarts
   - Message history

2. **Real-Time Delivery**
   - WebSocket notifications
   - Push to active players
   - Instant messaging feel

3. **Rich Features**
   - Whisper cooldowns
   - Block/ignore lists
   - Whisper statistics
   - Admin monitoring

4. **UI Improvements**
   - Conversation threading
   - Message preview in list
   - Typing indicators
   - Read receipts

## Implementation Notes

### Why Pending Whispers?

Discord doesn't allow sending ephemeral messages to other users directly. We can only send ephemeral responses to the user who triggered an interaction. The pending whisper system works around this limitation by:

1. Storing whispers when sent
2. Checking for whispers on every interaction
3. Delivering as follow-up ephemeral messages

### Performance Considerations

- Check whispers early in interaction flow
- Use Map for O(1) lookups
- Clean up delivered whispers
- Consider max queue size

### Error Recovery

- Re-queue failed deliveries
- Log delivery failures
- Notify sender of issues
- Graceful degradation