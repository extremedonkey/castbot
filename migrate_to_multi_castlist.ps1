$jsonPath = ".\playerData.json"
$backupPath = ".\playerData_backup.json"

# Read and parse the JSON file
$jsonContent = Get-Content $jsonPath -Raw
$data = $jsonContent | ConvertFrom-Json

# Create backup
Copy-Item $jsonPath $backupPath

# Process each server
$data.PSObject.Properties | Where-Object { $_.Name -ne "/* Server ID */" } | ForEach-Object {
    $server = $_.Value
    
    if ($server.tribes) {
        $newTribes = @{}
        
        # Process tribe1 through tribe4
        1..4 | ForEach-Object {
            $tribeId = $server.tribes."tribe$_"
            $emoji = $server.tribes."tribe$_emoji"
            
            if ($tribeId) {
                $newTribes[$tribeId] = @{
                    emoji = $emoji
                    castlist = "default"
                }
            }
        }
        
        # Replace old tribes structure with new one
        $server.tribes = $newTribes
    }
}

# Save the updated JSON
$data | ConvertTo-Json -Depth 10 | Set-Content $jsonPath
Write-Host "Migration complete. Backup saved to $backupPath"
