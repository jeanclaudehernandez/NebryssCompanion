---
name: deploy
description: Deploy the frontend or backend of Nebryss Companion by checking deploy.bat for deployment instructions and execution steps.
---

# Deployment Instructions

When asked to deploy the frontend, backend, or the full application:

1. **Check `deploy.bat`**: Always view `deploy.bat` in the repository root first to verify the latest environment variables (`GCLOUD_PROJECT`, `CLOUD_RUN_SERVICE`, `GCLOUD_REGION`, `IMAGE_NAME`) and script commands.

2. **Frontend Deployment**:
   - Run `npm run build` to build the Angular frontend distribution files.
   - Run `firebase deploy` (or `firebase deploy --only hosting`) to publish the built frontend.

3. **Backend Deployment**:
   - Submit the Docker container build via Cloud Build:
     `gcloud builds submit --project "%GCLOUD_PROJECT%" --tag "%IMAGE_NAME%"`
   - Deploy the container to Google Cloud Run:
     `gcloud run deploy "%CLOUD_RUN_SERVICE%" --project "%GCLOUD_PROJECT%" --image "%IMAGE_NAME%" --region "%GCLOUD_REGION%" --platform managed --quiet`

4. **Full Stack Deployment**:
   - Follow the steps sequentially as listed in `deploy.bat`.
