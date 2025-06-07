# CastBot Development Startup Script
# Handles ngrok tunnel management, git operations, and app startup

Write-Output "=== CastBot Dev Startup ==="

# Configuration
$sensitivePatterns = @('.env*', '*.env')
$currentBranch = git rev-parse --abbrev-ref HEAD
$ngrokPort = 3000

# Get commit message from arguments
$commitMessage = if ($args.Count -gt 0) {
    $args -join " "
} else {
    "Auto-commit"
}

# Function to check if ngrok is running on the specified port
function Test-NgrokRunning {
    param($Port)
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:4040/api/tunnels" -ErrorAction Stop
        $tunnel = $response.tunnels | Where-Object { $_.config.addr -eq "http://localhost:$Port" }
        return $tunnel
    } catch {
        return $null
    }
}

# Function to start ngrok
function Start-Ngrok {
    param($Port)
    Write-Output "Starting ngrok tunnel on port $Port..."
    Start-Process -FilePath "ngrok" -ArgumentList "http", $Port -WindowStyle Minimized
    
    # Wait for ngrok to start
    $maxAttempts = 30
    $attempt = 0
    do {
        Start-Sleep -Seconds 1
        $tunnel = Test-NgrokRunning -Port $Port
        $attempt++
    } while (!$tunnel -and $attempt -lt $maxAttempts)
    
    if (!$tunnel) {
        Write-Output "Failed to start ngrok after $maxAttempts seconds"
        exit 1
    }
    
    return $tunnel
}

# Function to get ngrok URL
function Get-NgrokUrl {
    param($Port)
    $tunnel = Test-NgrokRunning -Port $Port
    if ($tunnel) {
        return $tunnel.public_url
    }
    return $null
}

# Function to kill existing node processes
function Stop-ExistingApp {
    Write-Output "Checking for existing node processes..."
    $nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowTitle -eq "" -or $_.ProcessName -eq "node" }
    if ($nodeProcesses) {
        Write-Output "Stopping existing node processes..."
        $nodeProcesses | Stop-Process -Force
        Start-Sleep -Seconds 2
    }
}

# Check if ngrok is already running
Write-Output "Checking ngrok status..."
$existingTunnel = Test-NgrokRunning -Port $ngrokPort

if ($existingTunnel) {
    Write-Output "✅ ngrok already running"
    $ngrokUrl = $existingTunnel.public_url
} else {
    Write-Output "🚀 Starting ngrok..."
    $tunnel = Start-Ngrok -Port $ngrokPort
    $ngrokUrl = $tunnel.public_url
}

# Check for sensitive files
$sensitiveFound = $false
foreach ($pattern in $sensitivePatterns) {
    $trackedFiles = git ls-files $pattern 2>$null
    if ($trackedFiles) {
        Write-Output "Warning: Found sensitive files matching $pattern"
        Write-Output $trackedFiles
        $sensitiveFound = $true
    }
}

if ($sensitiveFound) {
    Write-Output "Please remove sensitive files before continuing"
    Write-Output "Use: git rm --cached <filename>"
    exit 1
}

# Git operations
Write-Output "Adding changes..."
git add .

# Get current status
$status = git status --porcelain
if ($status) {
    Write-Output "Committing changes with message: $commitMessage"
    git commit -m "$commitMessage"
    
    # Try pushing
    Write-Output "Pushing to $currentBranch..."
    $pushResult = git push origin $currentBranch 2>&1
    if ($LASTEXITCODE -ne 0) {
        # If push fails, try setting upstream
        Write-Output "Setting upstream and pushing..."
        git push --set-upstream origin $currentBranch
        if ($LASTEXITCODE -ne 0) {
            Write-Output "Push failed. Please check your git configuration."
            exit $LASTEXITCODE
        }
    }
} else {
    Write-Output "No changes to commit"
}

# Display ngrok information
Write-Output ""
Write-Output "=== NGROK TUNNEL READY ==="
Write-Output "Tunnel URL: $ngrokUrl"
Write-Output ""
Write-Output ">>> DISCORD WEBHOOK URL (copy this):"
Write-Output "$ngrokUrl/interactions"
Write-Output ""
Write-Output ">>> Update Discord webhook at:"
Write-Output "https://discord.com/developers/applications/1328366050848411658/information"
Write-Output ""
Write-Output "=== Starting CastBot Application ==="

# Stop any existing node processes first
Stop-ExistingApp

# Start the application
npm run start