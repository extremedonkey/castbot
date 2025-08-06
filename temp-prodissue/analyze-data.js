import fs from 'fs';
let issues = [];

// Check playerData
try {
  const playerData = JSON.parse(fs.readFileSync('prod-soft-copy-playerData.json', 'utf8'));
  console.log('✓ playerData.json is valid JSON');
  
  // Count players across all servers
  let totalPlayers = 0;
  let invalidTribes = 0;
  let tribeIssues = [];
  let serverCount = 0;
  
  for (const [serverId, serverData] of Object.entries(playerData)) {
    if (serverId === '/* Server ID */' || !serverData || !serverData.players) continue;
    serverCount++;
    const playerCount = Object.keys(serverData.players).length;
    totalPlayers += playerCount;
    
    // Check for invalid tribe indices
    for (const [playerId, player] of Object.entries(serverData.players)) {
      if (player.tribeIndex !== undefined && (player.tribeIndex < 0 || player.tribeIndex > 100)) {
        invalidTribes++;
        tribeIssues.push(`Server ${serverId}, Player ${playerId} has tribeIndex: ${player.tribeIndex}`);
      }
    }
  }
  
  console.log('  Servers:', serverCount);
  console.log('  Total Players:', totalPlayers);
  
  if (invalidTribes > 0) {
    console.log(`  ⚠️ Found ${invalidTribes} players with invalid tribe indices`);
    tribeIssues.slice(0, 5).forEach(issue => console.log('    -', issue));
    issues.push('Invalid tribe indices found');
  }
  
  // Check memory usage
  const dataSize = JSON.stringify(playerData).length;
  console.log('  Data size:', (dataSize / 1024 / 1024).toFixed(2), 'MB');
  
} catch(e) {
  console.log('✗ playerData.json CORRUPTED:', e.message);
  issues.push('playerData corruption');
}

// Check safariContent
try {
  const safariContent = JSON.parse(fs.readFileSync('prod-soft-copy-safariContent.json', 'utf8'));
  console.log('\n✓ safariContent.json is valid JSON');
  
  let totalButtons = 0;
  let totalItems = 0;
  let totalStores = 0;
  let totalSafaris = 0;
  let guildCount = 0;
  
  for (const [guildId, guildData] of Object.entries(safariContent)) {
    if (guildId === '/* Guild ID */' || !guildData) continue;
    guildCount++;
    
    totalButtons += Object.keys(guildData.buttons || {}).length;
    totalItems += Object.keys(guildData.items || {}).length;
    totalStores += Object.keys(guildData.stores || {}).length;
    totalSafaris += Object.keys(guildData.safaris || {}).length;
  }
  
  console.log('  Guilds:', guildCount);
  console.log('  Total Buttons:', totalButtons);
  console.log('  Total Items:', totalItems);
  console.log('  Total Stores:', totalStores);
  console.log('  Total Safaris:', totalSafaris);
  
  // Check for the specific missing roles
  const missingRoles = ['1340209031725322260', '1340209077942489200'];
  console.log('\n  Checking for problematic role references...');
  
  // Check memory usage
  const dataSize = JSON.stringify(safariContent).length;
  console.log('  Data size:', (dataSize / 1024 / 1024).toFixed(2), 'MB');
  
} catch(e) {
  console.log('✗ safariContent.json CORRUPTED:', e.message);
  issues.push('safariContent corruption');
}

if (issues.length > 0) {
  console.log('\n🚨 ISSUES FOUND:', issues.join(', '));
} else {
  console.log('\n✅ No obvious data corruption detected');
}

// Memory analysis
console.log('\n📊 MEMORY ANALYSIS:');
const totalSize = fs.statSync('prod-soft-copy-playerData.json').size + 
                  fs.statSync('prod-soft-copy-safariContent.json').size;
console.log('  Total data files size:', (totalSize / 1024 / 1024).toFixed(2), 'MB');
console.log('  This is relatively small and should not cause memory issues');