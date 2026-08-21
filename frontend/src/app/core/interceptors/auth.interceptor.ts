import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { getApiBaseUrl } from '../config/api.config';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  const apiBaseUrl = getApiBaseUrl();

  const isApiRequest = req.url.startsWith(apiBaseUrl);
  const isLoginRequest = isApiRequest && req.url.endsWith('/auth/login');

  let outgoingReq = req;

  if (isApiRequest && !isLoginRequest) {
    const token = authService.getToken();
    if (token) {
      outgoingReq = req.clone({
        setHeaders: { Authorization: `Bearer ${token}` }
      });
    }
  }

  return next(outgoingReq).pipe(
    catchError((error: HttpErrorResponse) => {
      if (error.status === 401 && isApiRequest && !isLoginRequest) {
        authService.clearSession();
        router.navigate(['/login']);
      }
      return throwError(() => error);
    })
  );
};
