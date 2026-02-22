@echo off
setlocal EnableDelayedExpansion

if "%GCLOUD_PROJECT%"=="" set "GCLOUD_PROJECT=nebrysscompanion"
if "%CLOUD_RUN_SERVICE%"=="" set "CLOUD_RUN_SERVICE=nebrysscompanion-api"
if "%GCLOUD_REGION%"=="" set "GCLOUD_REGION=us-east1"
if "%IMAGE_NAME%"=="" set "IMAGE_NAME=gcr.io/%GCLOUD_PROJECT%/%CLOUD_RUN_SERVICE%"

echo Using configuration:
echo   GCLOUD_PROJECT   = %GCLOUD_PROJECT%
echo   CLOUD_RUN_SERVICE= %CLOUD_RUN_SERVICE%
echo   GCLOUD_REGION    = %GCLOUD_REGION%
echo   IMAGE_NAME       = %IMAGE_NAME%
echo.

echo Step 1/3: Building Docker image with Cloud Build...
gcloud builds submit --project "%GCLOUD_PROJECT%" --tag "%IMAGE_NAME%"
if errorlevel 1 goto :error

echo.
echo Step 2/3: Deploying container to Cloud Run (preserving existing revision settings)...
gcloud run deploy "%CLOUD_RUN_SERVICE%" --project "%GCLOUD_PROJECT%" --image "%IMAGE_NAME%" --region "%GCLOUD_REGION%" --platform managed --quiet
if errorlevel 1 goto :error

echo.
echo Step 3/3: Building Angular frontend and deploying to Firebase Hosting...
npm run build
if errorlevel 1 goto :error

firebase deploy
if errorlevel 1 goto :error

echo.
echo Deployment completed successfully.
goto :eof

:error
echo Deployment failed with exit code %ERRORLEVEL%.
exit /b %ERRORLEVEL%
