import { Component, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslocoPipe } from '@jsverse/transloco';
import { LANG_LABELS, LangId, LanguageService, SUPPORTED_LANGS } from '../../utils/i18n/language.service';

/**
 * Compact language picker for places where the settings dialog is out of reach
 * (chat list header, first-login username setup, blocked-session overlay).
 * Switching is instant — no reload, so the STOMP connection and any call stay up.
 */
@Component({
  selector: 'app-language-switcher',
  imports: [FormsModule, TranslocoPipe],
  template: `
    <select
      class="lang-switcher"
      [ngModel]="language.lang()"
      (ngModelChange)="onChange($event)"
      [attr.aria-label]="'settings.language' | transloco"
    >
      @for (lang of languages; track lang.id) {
        <option [value]="lang.id">{{ lang.label }}</option>
      }
    </select>
  `,
  styles: [`
    .lang-switcher {
      padding: 4px 8px;
      border: 1px solid var(--border);
      border-radius: 10px;
      background: var(--bg-glass);
      color: var(--text-primary);
      font-size: 0.8rem;
      outline: none;
      cursor: pointer;
      max-width: 120px;
    }
    .lang-switcher:focus {
      border-color: rgba(var(--accent-rgb), 0.6);
    }
  `],
})
export class LanguageSwitcherComponent {
  protected readonly language = inject(LanguageService);
  readonly languages = SUPPORTED_LANGS.map(id => ({ id, label: LANG_LABELS[id] }));

  onChange(lang: LangId): void {
    void this.language.setLanguage(lang);
  }
}
