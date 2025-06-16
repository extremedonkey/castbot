# CastBot Development Backlog

This is a living requirements backlog for CastBot features and improvements, ordered by priority.

## IMMEDIATE Priority

### Fix SSH Key Path for Automated Deployment
**Description:** Fix SSH key path issue preventing automated remote deployment commands from working
**Acceptance Criteria:**
- `npm run status-remote` works without manual SSH
- `npm run deploy-remote` works without manual SSH
- `npm run logs-remote` works without manual SSH
- SSH key path correctly configured in deployment scripts

### Investigate Full Automated Production Deployment
**Description:** Research and implement the complete automated `npm run deploy-remote` script for production deployments instead of manual SSH process
**Acceptance Criteria:**
- Single command deploys code and restarts production bot
- Includes rollback capability if deployment fails
- Maintains current safety checks and dry-run functionality

### Setup GitHub Authentication for WSL Development Environment
**Description:** Configure proper GitHub authentication for WSL environment to enable automated git push operations
**Acceptance Criteria:**
- Set up Personal Access Token authentication for GitHub in WSL
- `./dev-restart.sh` can push changes without manual authentication prompts
- Follow GitHub's recommended authentication methods (no username/password)
- Test automated git operations work seamlessly

### Consider PM2 WSL Networking Investigation
**Description:** Investigate why pm2 has networking binding issues in WSL while direct node works fine
**Acceptance Criteria:**
- Research pm2 WSL networking limitations
- Determine if pm2 can be configured to work properly in WSL
- If fixable, update development scripts to use pm2 for consistency with production
- If not fixable, document the limitation and keep current node-based approach

### Evaluate Development Script Consolidation
**Description:** Consider merging multiple development scripts into a single unified script or tool
**Current Scripts:** dev-start.sh, dev-restart.sh, dev-status.sh, dev-stop.sh
**Acceptance Criteria:**
- Analyze pros/cons of script consolidation vs. separate focused scripts
- Consider user experience and simplicity
- If consolidation beneficial, design unified interface (e.g., `./dev.sh start|restart|status|stop`)
- Maintain backward compatibility during transition

## HIGH Priority

### Tech Debt - Legacy Code Cleanup
**castlist2 References Cleanup:**
- Remove all `castlist2_` custom IDs, function names, and comments since /castlist2 became /castlist
- Update navigation handlers to use `castlist_` prefixes for consistency

**Post React Button Code Duplication:**
- Refactor prod_timezone_react and prod_pronoun_react handlers in app.js 
- Replace duplicated legacy player_set_timezone/player_set_pronouns code with calls to modern playerManagement.js system

### Remove Legacy /castlist2 Command  
**Description:** Clean up retired commands like /castlist2 now that Components V2 is the default castlist system
**Acceptance Criteria:**
- Remove /castlist2 command definition from commands.js
- Remove any references to castlist2 in help text
- Ensure all castlist functionality uses the modern Components V2 system
- Update any documentation references

### Timezone React Webhook Token Fix Validation
**Description:** Verify the timezone react webhook token expiration fix is working correctly in production
**Acceptance Criteria:**
- Users can successfully use timezone react buttons without "Unknown Webhook" errors
- No "headers already sent" errors in production logs
- Timezone role assignment works reliably

## MEDIUM Priority

### Emoji Handling Separation (DONE)
**Description:** Remove emoji generation from /add_tribe command and create dedicated emoji management system
**Acceptance Criteria:**
- Remove automatic emoji creation from /add_tribe workflow
- Tribes can be created without emojis initially
- Existing emoji functionality preserved for backward compatibility
- Update documentation to reflect new emoji workflow

### Emoji Generation Button
**Description:** Add dedicated button to /prod_menu that generates emojis for a given Role (tribe)
**Acceptance Criteria:**
- New "Generate Emojis" button in /prod_menu tribe management section
- Reuse existing emoji handling code from /add_tribe
- Support role/tribe selection for emoji generation
- Provide feedback on emoji creation success/failure
- Handle Discord emoji limits gracefully

### Emoji Deletion Management
**Description:** Automated emoji cleanup when tribes are removed
**Acceptance Criteria:**
- Automatic emoji deletion when using "Remove Tribe" button
- Manual emoji deletion option in tribe management
- Confirmation dialog before emoji deletion
- Cleanup of orphaned emojis (emojis without corresponding tribes)
- Preserve custom emojis not created by CastBot

### Player Profile Preview Component
**Description:** Reusable code component that shows players a preview of their castlist profile
**Acceptance Criteria:**
- Standalone player profile preview function
- Shows how player appears in castlists (name, pronouns, timezone, age, vanity roles)
- Reusable across application screens and profile editing
- Real-time preview updates when player makes changes
- Consistent formatting with actual castlist display

### Redesigned Menus Using Components V2
**Description:** Replace traditional Discord embeds with modern Components V2 alternatives
**Acceptance Criteria:**
- Convert all embed-based menus to Components V2
- Improved mobile experience and modern UI
- Consistent design language across all bot interactions
- Better accessibility and interaction patterns
- Maintain existing functionality while improving UX

### Enhanced Application Tracking System
**Description:** Proper season-to-application tracking with support for multiple applications across multiple seasons
**Acceptance Criteria:**
- Track multiple players with multiple applications per server
- Support applications across different seasons/castlists
- Historical application data preservation
- Application status tracking (pending, accepted, rejected, withdrawn)
- Cross-season applicant analytics and insights

### Application Management System
**Description:** Comprehensive application management tools including deletion capabilities
**Acceptance Criteria:**
- Delete application configuration buttons in /prod_menu
- Bulk application data cleanup tools
- Archive vs. delete options for historical data
- Confirmation workflows for destructive actions
- Audit logging for application management actions

### User Interaction Analytics System
**Description:** Simple, low-risk analytics system to track user interactions with CastBot's button-based interface
**Current CastBot Interface:** 2 slash commands (/castlist, /menu) + 25+ button categories (production menu, player management, castlist navigation, applications, ranking)

**Core Tracking Requirements:**
- Track which user (username) clicked which button in which server
- Monitor /castlist and /menu slash command usage
- Simple log format: `[ANALYTICS] timestamp | username in servername | action | details`

**Implementation Plan:**
1. **Phase 1: Simple File Logging (Low Risk)**
   - Create `analyticsLogger.js` module for user interaction tracking
   - Add logging to slash command handlers (/castlist, /menu)
   - Add logging to button interaction handlers in app.js
   - Log format: `[ANALYTICS] 2024-01-15T10:30:00Z | player1 in MyServer | BUTTON_CLICK | show_castlist2_default`

2. **Phase 2: Live Monitoring Script**
   - Create `npm run live-analytics` script using `tail -f analytics.log | grep '\[ANALYTICS\]'`
   - Real-time viewing of user interactions for development monitoring

3. **Phase 3: Optional Data Collection Enhancement**
   - Consider adding analytics section to existing playerData.json structure
   - Track usage frequency and user engagement patterns per server
   - Maintain low-risk, file-based approach

**Key Button Categories to Track:**
- Production menu system (prod_season_applications, prod_manage_*, admin_manage_player)
- Player management (player_set_*, admin_set_*)  
- Castlist navigation (show_castlist2*, castlist2_nav_*)
- Application & ranking system (application_button_*, rank_*)

**Benefits:**
- Understand actual user behavior patterns
- Identify most/least used features
- Monitor server activity and engagement
- Simple implementation with minimal production risk

### Auto-Generated Application Questions
**Description:** Expand the application system to automatically generate application questions based on server configuration
**Acceptance Criteria:**
- Admins can configure custom application questions
- Questions can include multiple choice, text input, and rating scales
- Questions are automatically included in application flow
- Responses are stored and retrievable by admins

### Admin Application Summary/Tabulation
**Description:** Provide admins with summary views and tabulation of applicant responses
**Acceptance Criteria:**
- Dashboard showing all applicants for a server
- Sortable/filterable applicant list
- Export functionality for applicant data
- Basic analytics on application completion rates

### Applicant Ranking and Casting Management
**Description:** Tools for admins to rank applicants and manage casting decisions
**Acceptance Criteria:**
- Drag-and-drop ranking interface
- Bulk accept/reject functionality
- Integration with role assignment for accepted applicants
- Notification system for applicant status updates

### Enhanced Tribe Ordering Features
**Description:** Implement advanced tribe ordering options beyond user-first display
**Acceptance Criteria:**
- Alphabetical tribe ordering option
- Size-based tribe ordering (largest/smallest first)
- Custom tribe ordering (admin-defined sequence)
- Per-castlist ordering preferences

### Components V2 Advanced Features
**Description:** Leverage more Discord Components V2 capabilities for enhanced UX
**Acceptance Criteria:**
- Implement advanced component types (forms, advanced sections)
- Enhanced mobile optimization
- Better accessibility features
- Advanced theming options

## LOW Priority

### Local Development Infrastructure Migration
**Description:** Create plan for moving local development environment to Lightsail infrastructure for consistency
**Acceptance Criteria:**
- Development environment mirrors production setup
- Automated development environment provisioning
- Consistent testing environment across team
- Documentation for new development workflow

### Multi-Guild Analytics Dashboard
**Description:** Enhanced analytics with cross-guild insights and trends
**Acceptance Criteria:**
- Growth metrics across all guilds
- Usage pattern analysis
- Feature adoption tracking
- Performance benchmarking

### Advanced Permission System
**Description:** More granular permission controls beyond current role-based system
**Acceptance Criteria:**
- Custom permission roles (not just admin/manage roles)
- Per-feature permission controls
- Audit logging for admin actions
- Permission inheritance and delegation

### Backup and Recovery System
**Description:** Automated backup system for player data and configuration
**Acceptance Criteria:**
- Scheduled automatic backups
- Point-in-time recovery capability
- Cross-region backup storage
- Automated backup testing and validation

### Voice Channel Integration
**Description:** Integrate with Discord voice channels for ORG/Survivor game coordination
**Acceptance Criteria:**
- Tribe-based voice channel creation
- Automated voice channel permissions based on tribes
- Voice activity tracking and analytics
- Integration with existing castlist system

## Future Tech Debt Cleanup

### Remove Old Component Calculation Logic
**Description:** Clean up old component limit checking and separator-stripping logic that's been replaced by 8-player pagination
**Acceptance Criteria:**
- Remove commented-out calculation code in castlistV2.js
- Simplify component counting functions
- Update documentation to reflect new pagination-only approach
- Performance testing to ensure no regression

### Clean Up Disabled Slash Commands
**Description:** Remove underlying code for slash commands that have been moved to /prod_menu interface
**Acceptance Criteria:**
- Remove command handlers for: getting_started, pronouns_add, pronouns_remove, timezones_add, timezones_remove, setup_castbot, add_tribe, clear_tribe, apply_button, setup_tycoons
- Remove command definitions from commands.js (currently disabled)
- Clean up any references to these commands in documentation
- Ensure all functionality is properly available through /prod_menu buttons
- Update help text and documentation to reflect button-based workflow

---

## Claude Recommendations Section

### Performance & Scalability
1. **Database Migration**: Consider migrating from JSON file storage to a proper database (PostgreSQL/MongoDB) for better performance with 1000+ servers
2. **Caching Layer**: Implement Redis caching for frequently accessed data (guild info, member lists)
3. **API Rate Limiting**: Add intelligent rate limiting to prevent Discord API exhaustion during bulk operations
4. **Horizontal Scaling**: Design architecture to support multiple bot instances for high availability

### User Experience Enhancements
5. **Onboarding Flow**: Create guided setup wizard for new servers to configure pronouns, timezones, and first tribe
6. **Help System**: Interactive help system with contextual guidance and video tutorials
7. **Template System**: Pre-built server templates for common ORG formats (Survivor, Big Brother, etc.)
8. **Mobile App**: Companion mobile app for players to manage their profiles and view castlists

### Advanced Features
9. **Game Integration**: Direct integration with popular ORG platforms (Tengaged, etc.) for automatic data sync
10. **Live Game Features**: Real-time voting systems, challenge tracking, and elimination ceremonies
11. **Statistics & Analytics**: Player performance tracking across multiple seasons/games
12. **Social Features**: Player networking, season alumni connections, host networking

### Technical Improvements
13. **TypeScript Migration**: Convert codebase to TypeScript for better type safety and developer experience
14. **Testing Suite**: Comprehensive unit and integration tests with CI/CD pipeline
15. **Monitoring & Alerting**: Production monitoring with automated alerting for issues
16. **Docker Containerization**: Containerize application for easier deployment and scaling

### Business & Growth
17. **Premium Features**: Subscription tier with advanced features (custom themes, priority support, advanced analytics)
18. **Partner Program**: Integration partnerships with ORG hosting platforms and communities
19. **API Ecosystem**: Public API for third-party integrations and community-built tools
20. **Multi-Language Support**: Internationalization for global ORG community expansion

---

*Last Updated: June 11, 2025*
*This backlog is continuously updated based on user feedback and development priorities*