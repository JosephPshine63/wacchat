import {
  ApplicationConfig,
  ErrorHandler,
  inject,
  provideAppInitializer,
  provideZoneChangeDetection
} from '@angular/core';
import { provideRouter } from '@angular/router';

import { routes } from './app.routes';
import {provideHttpClient, withInterceptors} from '@angular/common/http';
import {keycloakHttpInterceptor} from './utils/http/keycloak-http.interceptor';
import {errorLogInterceptor} from './utils/http/error-log.interceptor';
import {GlobalErrorHandler} from './utils/error-log/global-error-handler';
import {KeycloakService} from './utils/keycloak/keycloak.service';
import { environment } from '../environments/environment';
import { ApiConfiguration } from './services/api-configuration';
import { provideTransloco } from '@jsverse/transloco';
import { TranslocoHttpLoader } from './utils/i18n/transloco-loader';
import { LanguageService, SUPPORTED_LANGS, DEFAULT_LANG, detectInitialLang } from './utils/i18n/language.service';

export function kcFactory(kcService: KeycloakService) {
  return () => kcService.init();
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([keycloakHttpInterceptor, errorLogInterceptor])
    ),
    provideTransloco({
      config: {
        availableLangs: [...SUPPORTED_LANGS],
        defaultLang: DEFAULT_LANG,
        fallbackLang: DEFAULT_LANG,
        missingHandler: { useFallbackTranslation: true },
        reRenderOnLangChange: true,
        prodMode: environment.production,
      },
      loader: TranslocoHttpLoader,
    }),
    // Load the JSON dictionary before first render so no raw keys ever flash on screen.
    provideAppInitializer(() => inject(LanguageService).setLanguage(detectInitialLang())),
    { provide: ErrorHandler, useClass: GlobalErrorHandler },
    { provide: ApiConfiguration, useValue: { rootUrl: environment.apiRootUrl } },
    provideAppInitializer(() => {
      const initFn = ((key: KeycloakService) => {
        return () => key.init()
      })(inject(KeycloakService));
      return initFn();
    })
  ]
};
