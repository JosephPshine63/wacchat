import { Injectable, inject, signal } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';

interface VersionFile {
  version?: string;
  builtAt?: string;
}

/**
 * Which build is this? `deploy-prod.sh` stamps `/version.json` (short commit + UTC build time)
 * into the frontend image, so the CD pipeline's result is visible in the running app.
 * Absent in dev (no file) — `label` then stays null and nothing is rendered.
 * Uses HttpBackend directly: a static file needs no Keycloak token.
 */
@Injectable({ providedIn: 'root' })
export class BuildInfoService {
  private readonly http = new HttpClient(inject(HttpBackend));

  /** e.g. "7fcc9e9 · 2026-09-20 01:58 UTC", or null when unknown. */
  readonly label = signal<string | null>(null);

  constructor() {
    this.http
      .get<VersionFile>('/version.json', { headers: { 'Cache-Control': 'no-cache' } })
      .subscribe({
        next: (v) => {
          if (!v?.version || v.version === 'dev') return;
          const built = v.builtAt ? ` · ${v.builtAt.slice(0, 16).replace('T', ' ')} UTC` : '';
          this.label.set(`${v.version}${built}`);
        },
        error: () => {},
      });
  }
}
