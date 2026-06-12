@echo off
setlocal EnableDelayedExpansion

set "GCLOUD_PROJECT=nebrysscompanion"
set "CLOUD_RUN_SERVICE=nebryss-companion-api"
set "GCLOUD_REGION=us-east4"
set "IMAGE_NAME=gcr.io/%GCLOUD_PROJECT%/%CLOUD_RUN_SERVICE%"

echo Using configuration:
echo   GCLOUD_PROJECT   = %GCLOUD_PROJECT%
echo   CLOUD_RUN_SERVICE= %CLOUD_RUN_SERVICE%
echo   GCLOUD_REGION    = %GCLOUD_REGION%
echo   IMAGE_NAME       = %IMAGE_NAME%
echo.

echo Step 1/3: Building Docker image with Cloud Build...
call gcloud builds submit --project "%GCLOUD_PROJECT%" --tag "%IMAGE_NAME%"
if errorlevel 1 goto :error

echo.
echo Step 2/3: Deploying container to Cloud Run (preserving existing revision settings)...
call gcloud run deploy "%CLOUD_RUN_SERVICE%" --project "%GCLOUD_PROJECT%" --image "%IMAGE_NAME%" --region "%GCLOUD_REGION%" --platform managed --quiet
if errorlevel 1 goto :error

echo.
echo Step 3/3: Building Angular frontend and deploying to Firebase Hosting...
call npm run build
if errorlevel 1 goto :error

call firebase deploy
if errorlevel 1 goto :error

echo.
echo Deployment completed successfully.
goto :eof

:error
echo Deployment failed with exit code %ERRORLEVEL%.
exit /b %ERRORLEVEL%
