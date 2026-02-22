#!/usr/bin/env bash

set -euo pipefail

# Configuration (override via environment variables if needed)
GCLOUD_PROJECT="${GCLOUD_PROJECT:-nebrysscompanion}"
CLOUD_RUN_SERVICE="${CLOUD_RUN_SERVICE:-nebrysscompanion-api}"
GCLOUD_REGION="${GCLOUD_REGION:-us-east1}"
IMAGE_NAME="${IMAGE_NAME:-gcr.io/${GCLOUD_PROJECT}/${CLOUD_RUN_SERVICE}}"

echo "Using configuration:"
echo "  GCLOUD_PROJECT   = ${GCLOUD_PROJECT}"
echo "  CLOUD_RUN_SERVICE= ${CLOUD_RUN_SERVICE}"
echo "  GCLOUD_REGION    = ${GCLOUD_REGION}"
echo "  IMAGE_NAME       = ${IMAGE_NAME}"
echo

echo "Step 1/3: Building Docker image with Cloud Build..."
gcloud builds submit \
  --project "${GCLOUD_PROJECT}" \
  --tag "${IMAGE_NAME}"

echo
echo "Step 2/3: Deploying container to Cloud Run (preserving existing revision settings)..."
gcloud run deploy "${CLOUD_RUN_SERVICE}" \
  --project "${GCLOUD_PROJECT}" \
  --image "${IMAGE_NAME}" \
  --region "${GCLOUD_REGION}" \
  --platform managed \
  --quiet

echo
echo "Step 3/3: Building Angular frontend and deploying to Firebase Hosting..."
npm run build

firebase deploy --only hosting

echo
echo "Deployment completed successfully."

