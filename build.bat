@echo off
echo ========================================================
echo   WoodStream Photo Gallery - Static Builder
echo ========================================================
echo.

node build-static.js

if %ERRORLEVEL% EQU 0 (
    echo.
    echo --------------------------------------------------------
    echo [SUCCESS] Build completed successfully!
    echo Please upload the contents of the 'dist' folder to Sakura Server.
    echo --------------------------------------------------------
) else (
    echo.
    echo [ERROR] Build failed. Please check the error message above.
)

echo.
pause
