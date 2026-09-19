import { Component, EventEmitter, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ThemeService, ThemeId } from '../../utils/theme/theme.service';
import { ChatBackgroundService, ChatBackgroundId } from '../../utils/chat-background/chat-background.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { LANG_LABELS, LanguageService, LangId, SUPPORTED_LANGS } from '../../utils/i18n/language.service';

@Component({
  selector: 'app-settings',
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  imports: [TranslocoPipe, FormsModule]
})
export class SettingsComponent {
  protected readonly language = inject(LanguageService);
  @Output() closed = new EventEmitter<void>();
  @Output() reportBug = new EventEmitter<void>();

  readonly themes: { id: ThemeId; labelKey: string }[] = [
    { id: 'pio-light', labelKey: 'settings.themes.pio-light' },
    { id: 'pio-dark', labelKey: 'settings.themes.pio-dark' },
    { id: 'blue', labelKey: 'settings.themes.blue' },
    { id: 'light', labelKey: 'settings.themes.light' },
    { id: 'dark', labelKey: 'settings.themes.dark' },
    { id: 'green', labelKey: 'settings.themes.green' },
    { id: 'indigo', labelKey: 'settings.themes.indigo' },
    { id: 'magenta', labelKey: 'settings.themes.magenta' },
    { id: 'crimson', labelKey: 'settings.themes.crimson' },
    { id: 'earth', labelKey: 'settings.themes.earth' },
  ];

  readonly chatBackgrounds: { id: ChatBackgroundId; labelKey: string }[] = [
    { id: 'none', labelKey: 'settings.backgrounds.none' },
    { id: 'birds-solid', labelKey: 'settings.backgrounds.birds-solid' },
    { id: 'birds-red', labelKey: 'settings.backgrounds.birds-red' },
    { id: 'birds-outline', labelKey: 'settings.backgrounds.birds-outline' },
  ];

  readonly languages = SUPPORTED_LANGS.map(id => ({ id, label: LANG_LABELS[id] }));

  constructor(
    protected themeService: ThemeService,
    protected chatBackgroundService: ChatBackgroundService,
  ) {}

  onLanguageChange(lang: LangId): void {
    void this.language.setLanguage(lang);
  }

  close(): void {
    this.closed.emit();
  }

  onReportBug(): void {
    this.reportBug.emit();
  }
}
