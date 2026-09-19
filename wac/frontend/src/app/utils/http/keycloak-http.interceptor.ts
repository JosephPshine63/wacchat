import {HttpErrorResponse, HttpInterceptorFn} from '@angular/common/http';
import {inject} from '@angular/core';
import {from, throwError} from 'rxjs';
import {catchError, switchMap, tap} from 'rxjs/operators';
import {KeycloakService} from '../keycloak/keycloak.service';
import {SessionGuardService} from '../session/session-guard.service';
import {LanguageService} from '../i18n/language.service';

export const keycloakHttpInterceptor: HttpInterceptorFn = (req, next) => {
  const keycloakService = inject(KeycloakService);
  const sessionGuard = inject(SessionGuardService);
  const i18n = inject(LanguageService);

  // Refresh the token if it expires within 30 seconds before attaching it
  return from(keycloakService.keycloak.updateToken(30).catch(() => false)).pipe(
    switchMap(() => {
      const token = keycloakService.keycloak.token;
      // Accept-Language carries the UI language the user picked: backend localizes its own
      // texts from it and keeps it on the user row for out-of-request work (push, Arno, mail).
      const authReq = token
        ? req.clone({
            headers: req.headers
              .set('Authorization', `Bearer ${token}`)
              .set('X-Tab-Id', keycloakService.tabId)
              .set('Accept-Language', i18n.lang())
          })
        : req;
      return next(authReq).pipe(
        tap({
          next: () => sessionGuard.markUnblocked(),
        }),
        catchError((err: unknown) => {
          if (err instanceof HttpErrorResponse && err.status === 409 && err.error?.code === 'SESSION_CONFLICT') {
            sessionGuard.markBlocked();
          }
          return throwError(() => err);
        })
      );
    })
  );
};
