# CastBot Deployment Quick Reference

## 🔒 Safe Commands (Ready to Use)

### Local Development
```bash
npm run deploy-commands        # Deploy commands (auto-detects dev/prod)
npm run analyze-commands       # Preview command changes (SAFE)
npm run verify-commands        # Check current command status
npm run clean-commands         # Clean up command issues
```

### Remote Access
```bash
ssh castbot-lightsail          # Connect to production server
npm run deploy-remote-dry-run  # Preview what deployment would do (SAFE)
```

## ⚠️ Production Commands (Use with Caution)

### Remote Deployment
```bash
npm run deploy-remote              # Full deployment (code + commands)
npm run deploy-commands-remote     # Commands only (faster)
npm run logs-remote                # View production logs
npm run status-remote              # Check production status
```

## 🎯 Recommended Workflow

### For Command Changes
1. `npm run analyze-commands` - Preview changes
2. `npm run deploy-commands` - Test in development
3. `npm run deploy-remote-dry-run` - Preview production changes
4. `npm run deploy-commands-remote` - Deploy to production

### For Code Changes
1. Commit and push changes to git
2. `npm run deploy-remote-dry-run` - Preview full deployment
3. `npm run deploy-remote` - Deploy to production

### For Troubleshooting
1. `ssh castbot-lightsail` - Direct server access
2. `npm run status-remote` - Check server status
3. `npm run logs-remote` - View recent logs

## 📍 Server Information
- **Host**: 13.238.148.170
- **User**: bitnami
- **Path**: /opt/bitnami/projects/castbot
- **SSH Alias**: castbot-lightsail

## 🚨 Important Notes
- Always test with dry-run first
- SSH connection is configured and working
- Manual access via SSH is always available as backup
- Remote deployment scripts need further testing before full production use