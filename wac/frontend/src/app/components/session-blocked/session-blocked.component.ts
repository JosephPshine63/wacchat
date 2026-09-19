import { Component, inject } from '@angular/core';
import { UsernameService } from '../../utils/username/username.service';
import { KeycloakService } from '../../utils/keycloak/keycloak.service';
import { SessionGuardService } from '../../utils/session/session-guard.service';
import { DraftService } from '../../utils/draft/draft.service';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-session-blocked',
  templateUrl: './session-blocked.component.html',
  styleUrl: './session-blocked.component.scss',
  imports: [TranslocoPipe]
})
export class SessionBlockedComponent {

  private usernameService = inject(UsernameService);
  private keycloakService = inject(KeycloakService);
  private sessionGuard = inject(SessionGuardService);
  private draftService = inject(DraftService);

  retrying = false;

  retry(): void {
    this.retrying = true;
    this.usernameService.getMe().subscribe({
      next: () => {
        this.retrying = false;
        this.sessionGuard.markUnblocked();
      },
      error: () => {
        this.retrying = false;
      }
    });
  }

  logout(): void {
    this.draftService.clearAll();
    this.keycloakService.logout();
  }
}
