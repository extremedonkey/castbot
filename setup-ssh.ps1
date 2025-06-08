# CastBot SSH Setup Script for VS Code
# This script helps configure SSH access to your AWS Lightsail instance

param(
    [Parameter(Mandatory=$true)]
    [string]$LightsailIP,
    
    [Parameter(Mandatory=$true)]
    [string]$SSHKeyPath,
    
    [Parameter(Mandatory=$false)]
    [string]$Username = "ubuntu",
    
    [Parameter(Mandatory=$false)]
    [string]$RemotePath = "/opt/bitnami/castbot"
)

Write-Host "🔧 Setting up SSH access to AWS Lightsail..." -ForegroundColor Cyan
Write-Host ""

# Validate SSH key exists
if (-not (Test-Path $SSHKeyPath)) {
    Write-Host "❌ SSH key not found at: $SSHKeyPath" -ForegroundColor Red
    Write-Host "Please download your Lightsail SSH key and provide the correct path." -ForegroundColor Yellow
    exit 1
}

# Check SSH key permissions (should be restrictive)
Write-Host "🔐 Checking SSH key permissions..." -ForegroundColor Yellow
try {
    # On Windows, we'll use icacls to set proper permissions
    $keyDir = Split-Path $SSHKeyPath -Parent
    $keyFile = Split-Path $SSHKeyPath -Leaf
    
    # Remove inheritance and set restrictive permissions
    icacls $SSHKeyPath /inheritance:r /grant:r "$env:USERNAME:(R)" | Out-Null
    Write-Host "✅ SSH key permissions configured" -ForegroundColor Green
} catch {
    Write-Host "⚠️  Could not set SSH key permissions automatically" -ForegroundColor Yellow
    Write-Host "Please ensure your SSH key has restrictive permissions" -ForegroundColor Yellow
}

# Test SSH connection
Write-Host "🔌 Testing SSH connection..." -ForegroundColor Yellow
$testCommand = "ssh -i `"$SSHKeyPath`" -o ConnectTimeout=10 -o StrictHostKeyChecking=no $Username@$LightsailIP `"echo 'SSH connection successful'`""

try {
    $result = Invoke-Expression $testCommand
    if ($result -match "SSH connection successful") {
        Write-Host "✅ SSH connection test successful!" -ForegroundColor Green
    } else {
        throw "Connection test failed"
    }
} catch {
    Write-Host "❌ SSH connection failed!" -ForegroundColor Red
    Write-Host "Troubleshooting steps:" -ForegroundColor Yellow
    Write-Host "1. Verify your Lightsail instance is running" -ForegroundColor White
    Write-Host "2. Check the IP address: $LightsailIP" -ForegroundColor White
    Write-Host "3. Verify SSH key path: $SSHKeyPath" -ForegroundColor White
    Write-Host "4. Check firewall rules allow SSH (port 22)" -ForegroundColor White
    exit 1
}

# Create SSH config entry
Write-Host "📝 Creating SSH config entry..." -ForegroundColor Yellow

$sshConfigPath = "$env:USERPROFILE\.ssh\config"
$sshConfigDir = Split-Path $sshConfigPath -Parent

# Create .ssh directory if it doesn't exist
if (-not (Test-Path $sshConfigDir)) {
    New-Item -ItemType Directory -Path $sshConfigDir -Force | Out-Null
}

# Create SSH config entry
$configEntry = @"

# CastBot AWS Lightsail Instance
Host castbot-lightsail
    HostName $LightsailIP
    User $Username
    IdentityFile $SSHKeyPath
    StrictHostKeyChecking no
    ServerAliveInterval 60
    ServerAliveCountMax 3

"@

# Check if entry already exists
if (Test-Path $sshConfigPath) {
    $existingConfig = Get-Content $sshConfigPath -Raw
    if ($existingConfig -match "Host castbot-lightsail") {
        Write-Host "⚠️  SSH config entry already exists, backing up..." -ForegroundColor Yellow
        Copy-Item $sshConfigPath "$sshConfigPath.backup.$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        
        # Remove existing entry and add new one
        $lines = Get-Content $sshConfigPath
        $newLines = @()
        $skipLines = $false
        
        foreach ($line in $lines) {
            if ($line -match "# CastBot AWS Lightsail Instance" -or $line -match "Host castbot-lightsail") {
                $skipLines = $true
            } elseif ($skipLines -and $line -match "^Host " -and $line -notmatch "castbot-lightsail") {
                $skipLines = $false
                $newLines += $line
            } elseif (-not $skipLines) {
                $newLines += $line
            }
        }
        
        $newLines -join "`n" | Set-Content $sshConfigPath
    }
}

# Add new config entry
Add-Content -Path $sshConfigPath -Value $configEntry
Write-Host "✅ SSH config entry created" -ForegroundColor Green

# Create environment file for remote deployment
Write-Host "🌍 Setting up environment variables..." -ForegroundColor Yellow

$envContent = @"
# AWS Lightsail Configuration for Remote Deployment
LIGHTSAIL_HOST=$LightsailIP
LIGHTSAIL_USER=$Username
LIGHTSAIL_PATH=$RemotePath
SSH_KEY_PATH=$SSHKeyPath
"@

# Add to .env file if it exists, otherwise create .env.lightsail
$envPath = ".env"
if (Test-Path $envPath) {
    # Check if Lightsail config already exists in .env
    $existingEnv = Get-Content $envPath -Raw
    if ($existingEnv -match "LIGHTSAIL_HOST") {
        Write-Host "⚠️  Lightsail config already exists in .env" -ForegroundColor Yellow
    } else {
        Add-Content -Path $envPath -Value "`n$envContent"
        Write-Host "✅ Added Lightsail config to .env" -ForegroundColor Green
    }
} else {
    $envContent | Set-Content ".env.lightsail"
    Write-Host "✅ Created .env.lightsail with configuration" -ForegroundColor Green
    Write-Host "💡 Copy these settings to your .env file when ready" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎉 SSH Setup Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "You can now use these commands:" -ForegroundColor Cyan
Write-Host "  ssh castbot-lightsail                    # Connect to server" -ForegroundColor White
Write-Host "  npm run deploy-remote                    # Deploy from VS Code" -ForegroundColor White
Write-Host "  npm run logs-remote                      # View remote logs" -ForegroundColor White
Write-Host "  npm run status-remote                    # Check remote status" -ForegroundColor White
Write-Host ""
Write-Host "VS Code Integration:" -ForegroundColor Cyan
Write-Host "1. Open VS Code terminal (Ctrl+``)" -ForegroundColor White
Write-Host "2. Run: ssh castbot-lightsail" -ForegroundColor White
Write-Host "3. Navigate to: cd $RemotePath" -ForegroundColor White
Write-Host ""

# Test the new SSH alias
Write-Host "🔍 Testing SSH alias..." -ForegroundColor Yellow
try {
    $aliasTest = ssh castbot-lightsail "echo 'SSH alias working!'"
    if ($aliasTest -match "SSH alias working") {
        Write-Host "✅ SSH alias test successful!" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠️  SSH alias test failed, but manual connection should work" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🚀 Ready for remote deployment!" -ForegroundColor Green