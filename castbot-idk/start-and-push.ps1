# Configuration
$sensitivePatterns = @('.env*', '*.env')
$currentBranch = git rev-parse --abbrev-ref HEAD

# Get commit message from arguments
$commitMessage = if ($args.Count -gt 0) {
    $args -join " "
} else {
    "Auto-commit"
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

# Start the application
Write-Output "Starting application..."
npm run start