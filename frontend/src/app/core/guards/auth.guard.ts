import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    return true;
  }

  return router.createUrlTree(['/login']);
};

export const guestGuard: CanActivateFn = () => {
  const authService = inject(AuthService);
  const router = inject(Router);

  if (authService.isAuthenticated()) {
    const role = authService.currentRole();
    if (role) {
      return router.createUrlTree([authService.getPortalRouteForRole(role)]);
    }
  }

  return true;
};

export const portalGuard: CanActivateFn = (route) => {
 const auth=inject(AuthService), router=inject(Router), role=auth.currentRole();
 const path=route.routeConfig?.path || '';
 if (!role) return router.createUrlTree(['/login']);
 if ((path === 'cases' || path.startsWith('cases/')) || !path) return true;
 const portal=path.split('/')[0];
 if ((role==='super_admin' && portal==='admin') || portal===role || (role==='admin' && portal==='doctor') || (role==='receptionist' && path==='admin/appointments')) return true;
 return router.createUrlTree([auth.getPortalRouteForRole(role)]);
};
