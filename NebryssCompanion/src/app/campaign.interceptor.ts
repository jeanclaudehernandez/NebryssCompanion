import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { CampaignService } from './campaign.service';

export const campaignInterceptor: HttpInterceptorFn = (req, next) => {
  const campaignService = inject(CampaignService);
  const activeCampaign = campaignService.getSelectedCampaign();
  const adminPin = localStorage.getItem('nebryss_admin_pin') || '849201';

  let headers = req.headers
    .set('ngrok-skip-browser-warning', 'true')
    .set('X-Admin-PIN', adminPin);

  if (req.url.includes('/api/')) {
    headers = headers.set('ngsw-bypass', 'true');
  }

  if (!activeCampaign) {
    return next(req.clone({ headers }));
  }

  // Intercept outgoing API requests
  if (req.url.includes('/api/')) {
    if (req.method === 'POST' || req.method === 'PUT') {
      const wrappedBody = {
        payload: req.body,
        campaign: activeCampaign
      };
      return next(req.clone({
        body: wrappedBody,
        headers
      }));
    } else {
      // GET, DELETE, etc.
      headers = headers.set('X-Campaign', JSON.stringify(activeCampaign));
      return next(req.clone({
        setParams: {
          campaign: JSON.stringify(activeCampaign)
        },
        headers
      }));
    }
  }

  return next(req.clone({ headers }));
};
