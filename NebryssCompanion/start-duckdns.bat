@echo off
setlocal EnableDelayedExpansion

echo ====================================================
echo   NebryssCompanion - DuckDNS Launcher & Builder
echo ====================================================
echo.

if not exist ".env.duckdns" (
    echo [.env.duckdns] file not found! Creating default .env.duckdns...
    (
      echo # DuckDNS ^& Ngrok Configuration
      echo DUCKDNS_DOMAIN=nebryss
      echo DUCKDNS_TOKEN=a9ceb518-2584-413d-a6b6-b2c9b4f9f764
      echo NGROK_DOMAIN=chitchat-statistic-shuffle.ngrok-free.dev
      echo NGROK_AUTHTOKEN=3HSVF5v6pBlOznOGXphintNjp3O_6SPMpBMFJGJw5yfKUxXxA
      echo PORT=8080
      echo ADMIN_PIN=849201
      echo MONGODB_URI=mongodb://127.0.0.1:27017/NebryssCompanion
      echo MONGODB_DB_MAIN=Nebryss-assets
      echo MONGODB_DB_PLAYERS=NebryssCampaignAssets
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
