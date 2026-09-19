import { Injectable } from '@angular/core';
import Keycloak from 'keycloak-js';
import {Router} from '@angular/router';
import {HttpClient} from '@angular/common/http';
import {firstValueFrom} from 'rxjs';
import { environment } from '../../../environments/environment';
import {PushSubscriptionService} from '../push/push-subscription.service';
import {detectInitialLang} from '../i18n/language.service';

const TAB_ID_STORAGE_KEY = 'wacchat_tab_id';

@Injectable({
  providedIn: 'root'
})
export class KeycloakService {

  private _keycloak: Keycloak | undefined;
  private _tabId: string | undefined;

  constructor(
    private router: Router,
    private http: HttpClient,
    private pushSubscriptionService: PushSubscriptionService
  ) {
  }

  get keycloak() {
    if (!this._keycloak) {
      this._keycloak = new Keycloak({
        url: environment.keycloakUrl,
        realm: 'wacchat',
        clientId: 'wacchat-app'
      });
    }
    return this._keycloak;
  }

  async init() {
    const authenticated = await this.keycloak.init({
      onLoad: 'login-required',
      checkLoginIframe: false,
      // Sent as ui_locales so the Keycloak login theme opens in the language the user chose in the app.
      locale: detectInitialLang(),
    });
  }

  async login() {
    await this.keycloak.login({ locale: detectInitialLang() });
  }

  get userId(): string {
    return this.keycloak?.tokenParsed?.sub as string;
  }

  get isTokenValid(): boolean {
    return !this.keycloak.isTokenExpired();
  }

  get fullName(): string {
    return this.keycloak.tokenParsed?.['name'] as string;
  }

  /**
   * Identifies this browser tab, unlike Keycloak's `sid` which is shared by every tab of the
   * same browser via the SSO cookie. sessionStorage is per-tab, so each tab gets its own id.
   */
  get tabId(): string {
    if (!this._tabId) {
      this._tabId = sessionStorage.getItem(TAB_ID_STORAGE_KEY) ?? crypto.randomUUID();
      sessionStorage.setItem(TAB_ID_STORAGE_KEY, this._tabId);
    }
    return this._tabId;
  }

  async logout() {
    await this.pushSubscriptionService.unsubscribe();
    try {
      await firstValueFrom(this.http.delete<void>('/api/v1/users/me/session'));
    } catch {
      // best-effort: proceed with logout even if the backend call fails
    }
    return this.keycloak.logout({redirectUri: environment.appUrl});
  }

  accountManagement() {
    return this.keycloak.accountManagement();
  }
}
