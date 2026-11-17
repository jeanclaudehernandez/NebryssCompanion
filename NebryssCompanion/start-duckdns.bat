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

:: ---------------------------------------------------------
:: Database: make sure the Docker engine is running (start Docker Desktop if needed),
:: then bring up MongoDB from docker-compose.yml. Labels + goto instead of if-blocks,
:: because errorlevel checks inside parenthesized blocks are unreliable in batch.
:: ---------------------------------------------------------
set "COMPOSE_FILE_PATH=%CD%\docker-compose.yml"
set "DOCKER_DESKTOP_EXE=%LOCALAPPDATA%\Programs\DockerDesktop\Docker Desktop.exe"
if not exist "%DOCKER_DESKTOP_EXE%" set "DOCKER_DESKTOP_EXE=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set "DOCKER_WAIT_LIMIT=180"

where docker >nul 2>&1
if errorlevel 1 goto docker_missing

docker info >nul 2>&1
if not errorlevel 1 goto docker_ready

if not exist "%DOCKER_DESKTOP_EXE%" goto docker_desktop_missing
echo [DB] Docker engine is not running. Starting Docker Desktop...
start "" "%DOCKER_DESKTOP_EXE%"
set /a DOCKER_WAITED=0

:docker_wait
rem ping as a 3-second sleep: "timeout" fails when the window has no interactive input
ping -n 4 127.0.0.1 >nul
docker info >nul 2>&1
if not errorlevel 1 goto docker_ready
set /a DOCKER_WAITED+=3
if !DOCKER_WAITED! geq %DOCKER_WAIT_LIMIT% goto docker_timeout
echo [DB] Waiting for the Docker engine... !DOCKER_WAITED!s
goto docker_wait

:docker_ready
echo [DB] Docker engine is running.
if not exist "%COMPOSE_FILE_PATH%" goto compose_missing
rem Compose reads the .env next to the compose file; the app's .env is not Compose syntax
rem (and the compose file uses no variables), so hand it an empty one instead.
set "COMPOSE_EMPTY_ENV=%TEMP%\nebryss-compose-empty.env"
type nul > "%COMPOSE_EMPTY_ENV%"
docker container inspect nebryss-mongodb >nul 2>&1
if errorlevel 1 goto compose_up
docker inspect --format "{{json .Config.Labels}}" nebryss-mongodb | findstr /c:"com.docker.compose.project" >nul
if not errorlevel 1 goto compose_up
rem The container exists but was created with "docker run": Compose cannot take it over
rem (name conflict), so just make sure it is running. It uses the same data volume.
echo [DB] Starting the existing nebryss-mongodb container (created outside docker compose)...
docker start nebryss-mongodb >nul
if errorlevel 1 echo [WARNING] Could not start the nebryss-mongodb container.
goto docker_done

:compose_up
echo [DB] Starting the database: docker compose up -d mongodb
docker compose --env-file "%COMPOSE_EMPTY_ENV%" -f "%COMPOSE_FILE_PATH%" up -d mongodb
if errorlevel 1 echo [WARNING] docker compose could not start the database container.
goto docker_done

:docker_missing
echo [WARNING] The docker command was not found on PATH; skipping the database container.
goto docker_done

:docker_desktop_missing
echo [WARNING] The Docker engine is not running and Docker Desktop was not found at "%DOCKER_DESKTOP_EXE%".
goto docker_done

:docker_timeout
echo [WARNING] The Docker engine did not start within %DOCKER_WAIT_LIMIT% seconds; continuing without the database container.
goto docker_done

:compose_missing
echo [WARNING] %COMPOSE_FILE_PATH% not found; skipping the database container.
goto docker_done

:docker_done
echo.

:: Start Colibri in a separate independent window if port 8000 is not already listening
netstat -ano | findstr ":8000 " | findstr "LISTENING" >nul 2>&1
if %ERRORLEVEL% neq 0 (
    if exist "C:\Users\Jean\Desktop\colibri-2.1.0\coli.cmd" (
        echo Starting Colibri server in a separate window...
        rem Model: Qwen3.6-35B-A3B UD-IQ3_XXS GGUF, small enough that every expert sits in VRAM (GPU prompt reading).
        rem COLI_PARK=0: the newest conversation always keeps the KV cache (no parking of an older, longer one).
        rem --cap 32: small RAM expert cache; all experts are on the GPU, so a bigger cap only duplicates them in RAM.
        rem --ctx 65536: conversation limit; the bridge reads it from Colibri and trims history to fit.
        start "Colibri Server" /D "C:\Users\Jean\Desktop\colibri-2.1.0" cmd /k "set "COLI_PARK=0" && coli.cmd serve --model .\colibri-models\qwen36-35b-iq3xxs --ctx 65536 --vram 14 --ngen 8000 --cap 32"
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

