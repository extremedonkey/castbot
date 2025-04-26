# PowerShell script to launch VS Code with properly configured terminals

# Navigate to project directory
Set-Location "C:\Users\extre\OneDrive\ORG\01 Zeldavivor\Tagscript\Castbot\castbot"

# Launch VS Code in this directory
code . --goto "app.js" --new-window 

# Tell user what to do next
Write-Host ""
Write-Host "VS Code has been opened. You can now:" -ForegroundColor Green
Write-Host "1. Use the terminal dropdown to select your custom profiles:" -ForegroundColor Yellow
Write-Host "   - General Terminal (yellow)"
Write-Host "   - Ngrok Server (red)"
Write-Host "   - Start Script (green)"
Write-Host ""
Write-Host "2. Or run a task by pressing Ctrl+Shift+P and typing 'Run Task', then select:" -ForegroundColor Yellow
Write-Host "   - Start Ngrok"
Write-Host "   - Run Start Script"
Write-Host ""