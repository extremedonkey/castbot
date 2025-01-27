$jsonPath = "./playerData.json"
$json = Get-Content $jsonPath -Raw | ConvertFrom-Json

# Used this site to fix formatting https://jsonformatter.org/

# Process each guild
$json.PSObject.Properties | ForEach-Object {
    if ($_.Name -ne "/* Server ID */") {
        $guildData = $_.Value
        $newTribes = @{}
        
        # Convert existing tribe structure
        1..4 | ForEach-Object {
            $tribeKey = "tribe$_"
            $emojiKey = "tribe$_emoji"
            
            if ($guildData.tribes.$tribeKey) {
                $tribeId = $guildData.tribes.$tribeKey
                $newTribes[$tribeId] = @{
                    emoji = $guildData.tribes.$emojiKey
                    castlist = "default"
                }
            }
        }
        $guildData.tribes = $newTribes
    }
}

# Save updated data with consistent formatting
$jsonString = $json | ConvertTo-Json -Depth 10
$jsonString = $jsonString -replace '    ', '  ' # Replace 4 spaces with 2
Set-Content -Path $jsonPath -Value $jsonString
Write-Host "Migration complete"
