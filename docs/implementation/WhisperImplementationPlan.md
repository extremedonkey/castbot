# Whisper System Implementation Plan

## Phase 1: Core Functionality ✅ COMPLETED

### 1.1 Button Integration
- **Status**: ✅ Complete
- **Location**: Player Location Actions (map location interface)
- **Implementation**: Added grey Whisper button with 💬 emoji to action row
- **Handler**: `safari_whisper_{coordinate}`

### 1.2 Player Selection
- **Status**: ✅ Complete  
- **Implementation**: String select menu showing players at same location
- **Features**:
  - Filters out sender
  - Shows display names
  - Location-based filtering via PlayerLocationManager
- **Handler**: `whisper_player_select_{coordinate}`

### 1.3 Message Modal
- **Status**: ✅ Complete
- **Implementation**: Discord modal with paragraph text input
- **Features**:
  - 1-1000 character limit
  - Shows recipient name in title
  - Reusable for replies
- **Handler**: `whisper_send_modal_{targetUserId}_{coordinate}`

### 1.4 Delivery System
- **Status**: ✅ Complete
- **Implementation**: Pending whisper queue with interaction-based delivery
- **Features**:
  - Location verification before send
  - Global Map storage (in-memory)
  - Delivery on next interaction
  - Whisper count notifications

### 1.5 Reply Functionality
- **Status**: ✅ Complete
- **Implementation**: Reply button on received whispers
- **Features**:
  - Same modal system as sending
  - Maintains conversation context
  - Same delivery mechanism
- **Handler**: `whisper_reply_{senderId}_{coordinate}`

### 1.6 Documentation
- **Status**: ✅ Complete
- **Created**:
  - `/docs/features/WhisperSystem.md` - User guide
  - `/docs/implementation/WhisperImplementationPlan.md` - This document
  - Updated CLAUDE.md with reference

## Phase 2: Detection & Monitoring ⏳ PENDING

### 2.1 Whisper Detection Posts
- **Status**: ⏳ Not Started
- **Description**: Activity indicators in map channels
- **Implementation Plan**:
  ```javascript
  // In postWhisperDetection() function
  1. Check whisperSettings.detectionEnabled
  2. Get coordinate's channelId from safari data
  3. Post non-ephemeral message: "👀 Players are whispering at {coord}"
  4. Schedule deletion after detectionDuration (30s default)
  ```
- **Requirements**:
  - Configuration in safariContent.json
  - Channel permissions for bot
  - Deletion scheduling

### 2.2 Whisper Log Channel
- **Status**: ⏳ Not Started
- **Description**: Full transcript logging for production/spectators
- **Implementation Plan**:
  ```javascript
  // In postWhisperLog() function
  1. Check whisperSettings.logEnabled
  2. Verify logChannelId exists
  3. Post formatted transcript with:
     - Sender/recipient names
     - Location
     - Timestamp
     - Full message content
  4. Use purple accent color (0x9B59B6)
  ```
- **Requirements**:
  - Dedicated log channel
  - Production role permissions
  - Channel write access

### 2.3 Configuration Management
- **Status**: ⏳ Not Started
- **Description**: Guild-specific whisper settings
- **Implementation Plan**:
  ```javascript
  // Add to safariContent.json structure
  {
    "guildId": {
      "whisperSettings": {
        "detectionEnabled": true,
        "detectionDuration": 30000,
        "logEnabled": true,
        "logChannelId": "channelId",
        "productionRoleId": "roleId"
      }
    }
  }
  ```
- **UI Requirements**:
  - Admin configuration interface
  - Toggle buttons for features
  - Channel/role selectors
  - Duration input

## Phase 3: Enhancements 🔮 FUTURE

### 3.1 Persistence Layer
- **Status**: 🔮 Future
- **Options**:
  - Redis for fast access
  - Database for history
  - Hybrid approach
- **Benefits**:
  - Survive restarts
  - Message history
  - Analytics

### 3.2 Real-Time Delivery
- **Status**: 🔮 Future
- **Options**:
  - WebSocket notifications
  - Push to active sessions
  - Instant messaging feel
- **Challenges**:
  - Discord API limitations
  - Ephemeral message constraints

### 3.3 Advanced Features
- **Status**: 🔮 Future
- **Ideas**:
  - Whisper cooldowns
  - Block/ignore lists
  - Statistics tracking
  - Admin monitoring tools
  - Group whispers
  - Whisper range (nearby vs same location)

## Technical Debt & Improvements

### Current Limitations
1. **In-Memory Storage**
   - Lost on restart
   - No persistence
   - Memory usage scales with whispers

2. **Delivery Mechanism**
   - Not real-time
   - Requires interaction
   - Can feel delayed

3. **No History**
   - Only latest whisper
   - No conversation view
   - Limited context

### Proposed Solutions
1. **Add Redis Cache**
   - Fast lookups
   - Persistence
   - TTL support

2. **Webhook Delivery**
   - Explore follow-up messages
   - Better timing
   - Multiple whisper delivery

3. **Conversation Threading**
   - Link related whispers
   - Show context
   - Better UX

## Testing Strategy

### Manual Testing Checklist
- [x] Whisper button appears correctly
- [x] Player selection filters properly
- [x] Modal accepts and validates input
- [x] Confirmation is ephemeral
- [x] Recipient receives whisper
- [x] Reply functionality works
- [x] Location checks prevent invalid whispers
- [ ] Detection posts appear and auto-delete
- [ ] Log channel receives transcripts
- [ ] Configuration saves and loads

### Edge Cases to Test
- [x] No other players at location
- [x] Player moves before send completes
- [x] Multiple whispers queued
- [x] Very long messages (1000 chars)
- [ ] Rapid whisper sending
- [ ] Server restart with pending whispers
- [ ] Channel permission issues

### Load Testing
- [ ] Many players whispering simultaneously
- [ ] Large whisper queues
- [ ] Memory usage monitoring
- [ ] Performance metrics

## Deployment Checklist

### Pre-Deployment
- [x] Core functionality tested
- [x] Error handling in place
- [x] Logging implemented
- [x] Documentation complete
- [ ] Configuration interface ready
- [ ] Production channels configured

### Deployment Steps
1. Deploy core whisper system ✅
2. Test in development ✅
3. Add detection/logging features
4. Configure production settings
5. Deploy to production
6. Monitor for issues

### Post-Deployment
- [ ] Monitor error logs
- [ ] Check performance metrics
- [ ] Gather user feedback
- [ ] Plan enhancements

## Risk Assessment

### Technical Risks
1. **Memory Usage**
   - Risk: High with many whispers
   - Mitigation: Add max queue size
   - Monitor: Memory metrics

2. **API Rate Limits**
   - Risk: Medium with detection posts
   - Mitigation: Batch operations
   - Monitor: Discord API usage

3. **Data Loss**
   - Risk: High without persistence
   - Mitigation: Add Redis/database
   - Monitor: Restart frequency

### User Experience Risks
1. **Confusion about Delivery**
   - Risk: High - not intuitive
   - Mitigation: Clear messaging
   - Monitor: User feedback

2. **Missed Whispers**
   - Risk: Medium - if not interacting
   - Mitigation: Whisper count alerts
   - Monitor: Delivery rates

3. **Privacy Concerns**
   - Risk: Low with ephemeral design
   - Mitigation: All UI private
   - Monitor: Log access

## Success Metrics

### Usage Metrics
- Whispers sent per day
- Active whisper users
- Reply rate
- Average message length

### Performance Metrics
- Delivery success rate
- Average delivery time
- Memory usage
- Error rate

### User Satisfaction
- Feature adoption rate
- User feedback scores
- Support ticket volume
- Feature request patterns