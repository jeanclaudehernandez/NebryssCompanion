@echo off
setlocal EnableDelayedExpansion

:: ---------------------------------------------------------
:: NebryssCompanion - DuckDNS Universal Launcher
:: Resolves the target directory regardless of where this .bat is placed
:: ---------------------------------------------------------

set "TARGET_DIR="

:: 1. Check if batch file is placed in the project folder itself
if exist "%~dp0package.json" (
    set "TARGET_DIR=%~dp0"
)

:: 2. Check if batch file is placed in the parent workspace root folder
if not defined TARGET_DIR (
    if exist "%~dp0NebryssCompanion\package.json" (
        set "TARGET_DIR=%~dp0NebryssCompanion"
    )
)

:: 3. Check if batch file is placed in a sibling/sub folder
if not defined TARGET_DIR (
    if exist "%~dp0..\NebryssCompanion\package.json" (
        set "TARGET_DIR=%~dp0..\NebryssCompanion"
    )
)

:: 4. Check user profile Desktop path
if not defined TARGET_DIR (
    if exist "%USERPROFILE%\Desktop\Nebryss Killteam Campaign\NebryssCompanion\package.json" (
        set "TARGET_DIR=%USERPROFILE%\Desktop\Nebryss Killteam Campaign\NebryssCompanion"
    )
)

:: 5. Check absolute workspace path
if not defined TARGET_DIR (
    if exist "C:\Users\jeanh\Desktop\Nebryss Killteam Campaign\NebryssCompanion\package.json" (
        set "TARGET_DIR=C:\Users\jeanh\Desktop\Nebryss Killteam Campaign\NebryssCompanion"
    )
)

:: Fallback / Error handling if directory cannot be resolved
if not defined TARGET_DIR (
    echo ====================================================
    echo [ERROR] Could not locate the NebryssCompanion directory!
    echo ====================================================
    echo Checked locations:
    echo  - %~dp0
    echo  - %~dp0NebryssCompanion
    echo  - %USERPROFILE%\Desktop\Nebryss Killteam Campaign\NebryssCompanion
    echo  - C:\Users\jeanh\Desktop\Nebryss Killteam Campaign\NebryssCompanion
    echo.
    echo Please make sure the folder 'Nebryss Killteam Campaign\NebryssCompanion' exists.
    echo.
    pause
    exit /b 1
)

:: Navigate to project directory (using /d to handle any drive letter)
cd /d "%TARGET_DIR%"

echo ====================================================
echo   NebryssCompanion - DuckDNS Launcher
echo ====================================================
echo Target Directory : %CD%
echo Running Command  : npm run start:duckdns
echo ====================================================
echo.

:: Start Colibri in a separate independent window if port 8000 is not already listening
netstat -ano | findstr ":8000 " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    if exist "C:\Users\Jean\Desktop\colibri-2.1.0\coli.cmd" (
        echo Starting Colibri server in a separate window...
        start "Colibri Server" /D "C:\Users\Jean\Desktop\colibri-2.1.0" cmd /k "coli.cmd serve --model .\colibri-models\qwen36-35b\ --ctx 10000 --vram 14 --ngen 4096"
    ) else (
        echo [WARNING] Colibri not found at C:\Users\Jean\Desktop\colibri-2.1.0\coli.cmd
    )
) else (
    echo Colibri server is already running on port 8000.
)

call npm run start:duckdns

if %ERRORLEVEL% neq 0 (
    echo.
    echo ====================================================
    echo [ERROR] Process ended with error code %ERRORLEVEL%.
    echo ====================================================
    pause
)

