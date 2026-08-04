@echo off
setlocal EnableDelayedExpansion

echo ====================================================
echo   NebryssCompanion - DuckDNS Launcher & Builder
echo ====================================================
echo.

if not exist ".env.duckdns" (
    echo [.env.duckdns] file not found! Creating default .env.duckdns...
    (
      echo DUCKDNS_DOMAIN=your-subdomain
      echo DUCKDNS_TOKEN=a9ceb518-2584-413d-a6b6-b2c9b4f9f764
      echo PORT=8080
      echo MONGODB_URI=mongodb+srv://jeanhernandezmeze_db_user:6hBfhByK45BGAxdy@cluster0.wjbet35.mongodb.net/
      echo MONGODB_DB_MAIN=Nebryss-assets
      echo MONGODB_DB_PLAYERS=Nebryss-players-local
    ) > .env.duckdns
)

echo Building Angular frontend for local deployment...
call npm run build
if errorlevel 1 (
    echo [ERROR] Angular build failed!
    exit /b 1
)

echo.
echo Starting DuckDNS IP Updater and Backend Server...
call node scripts/start-duckdns.js
