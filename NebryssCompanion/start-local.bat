@echo off
setlocal EnableDelayedExpansion

echo ====================================================
echo   NebryssCompanion - Local Full-Stack Dev Launcher
echo ====================================================
echo Mode: Pure Local Dev (No DuckDNS / No Ngrok)
echo.

if not exist ".env" (
    if not exist ".env.duckdns" (
        echo [.env] file not found! Creating default .env...
        (
          echo # Local Development Environment
          echo PORT=8080
          echo ADMIN_PIN=849201
          echo MONGODB_URI=mongodb://127.0.0.1:27017/NebryssCompanion
          echo MONGODB_DB_MAIN=Nebryss-assets
          echo MONGODB_DB_PLAYERS=NebryssCampaignAssets
        ) > .env
    )
)

echo Starting DB, building Frontend, and launching API & WebSockets...
call node scripts/start-local.js %*
