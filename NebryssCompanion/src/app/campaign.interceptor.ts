import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { CampaignService } from './campaign.service';

export const campaignInterceptor: HttpInterceptorFn = (req, next) => {
  const campaignService = inject(CampaignService);
  const activeCampaign = campaignService.getSelectedCampaign();
  const adminPin = localStorage.getItem('nebryss_admin_pin') || '849201';

  let headers = req.headers


  if (req.url.includes('/api/')) {
    headers = headers.set('ngsw-bypass', 'true');
  }

  let reqWithHeaders = req.clone({
    setHeaders: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'ngsw-bypass': 'true',
      'ngrok-skip-browser-warning': 'true',
      'X-Admin-PIN': adminPin
    }
  });

  if (!activeCampaign) {
    return next(reqWithHeaders);
  }

  // Intercept outgoing API requests
  if (reqWithHeaders.url.includes('/api/')) {
    if (reqWithHeaders.method === 'POST' || reqWithHeaders.method === 'PUT') {
      const wrappedBody = {
        payload: reqWithHeaders.body,
        campaign: activeCampaign
      };
      return next(reqWithHeaders.clone({
        body: wrappedBody
      }));
    } else {
      // GET, DELETE, etc.
      return next(reqWithHeaders.clone({
        setParams: {
          campaign: JSON.stringify(activeCampaign)
        },
        headers
      }));
    }
  }

  return next(reqWithHeaders);
};
