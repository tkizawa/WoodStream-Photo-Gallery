Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  WoodStream Photo Gallery - Building Static Gallery" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

node build-static.js

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "--------------------------------------------------------" -ForegroundColor Green
    Write-Host "[SUCCESS] Build completed successfully!" -ForegroundColor Green
    Write-Host "Please upload contents of 'dist' to Sakura Server." -ForegroundColor Green
    Write-Host "--------------------------------------------------------" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[ERROR] Build failed." -ForegroundColor Red
}
