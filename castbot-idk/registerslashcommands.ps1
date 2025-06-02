# Run npm run register
Write-Output "Running npm run register..."
npm run register

# Check if npm run register was successful
if ($LASTEXITCODE -ne 0) {
    Write-Output "npm run register failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# Run npm run registerguild
Write-Output "Running npm run registerguild..."
npm run registerguild

# Check if npm run registerguild was successful
if ($LASTEXITCODE -ne 0) {
    Write-Output "npm run registerguild failed with exit code $LASTEXITCODE"
    exit $LASTEXITCODE
}

# remove or comment out any registrations for game or tutorial commands

# Logging
Write-Output "Both npm run register and npm run registerguild have been executed successfully."
