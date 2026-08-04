import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { CampaignService } from './campaign.service';

export const campaignInterceptor: HttpInterceptorFn = (req, next) => {
  const campaignService = inject(CampaignService);
  const activeCampaign = campaignService.getSelectedCampaign();

  if (!activeCampaign) {
    return next(req);
  }

  // Intercept outgoing API requests
  if (req.url.includes('/api/')) {
    if (req.method === 'POST' || req.method === 'PUT') {
      const wrappedBody = {
        payload: req.body,
        campaign: activeCampaign
      };
      return next(req.clone({
        body: wrappedBody
      }));
    } else {
      // GET, DELETE, etc.
      return next(req.clone({
        setParams: {
          campaign: JSON.stringify(activeCampaign)
        },
        setHeaders: {
          'X-Campaign': JSON.stringify(activeCampaign)
        }
      }));
    }
  }

  return next(req);
};
