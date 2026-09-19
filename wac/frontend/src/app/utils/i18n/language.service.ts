import { Injectable, inject, signal } from '@angular/core';
import { TranslocoService } from '@jsverse/transloco';

export const SUPPORTED_LANGS = ['it', 'en', 'fr', 'de', 'es'] as const;
export type LangId = typeof SUPPORTED_LANGS[number];
export const DEFAULT_LANG: LangId = 'it';

const LANG_STORAGE_KEY = 'appLang';

const TOKEN_PREFIX = 'i18n:';
/** Allowed summary tokens (written by call-service) and the names of their positional args. */
const SUMMARY_PARAMS: Record<string, string[]> = {
  'call.summary.missed': [],
  'call.summary.ended': ['duration'],
  'call.summary.groupEnded': [],
  'call.summary.groupEndedDuration': ['duration', 'count'],
};

/** Native names shown in the language picker (never translated). */
export const LANG_LABELS: Record<LangId, string> = {
  it: 'Italiano',
  en: 'English',
  fr: 'Français',
  de: 'Deutsch',
  es: 'Español',
};

/** BCP 47 tags handed to Intl for date/time formatting. */
const INTL_LOCALES: Record<LangId, string> = {
  it: 'it-IT',
  en: 'en-GB',
  fr: 'fr-FR',
  de: 'de-DE',
  es: 'es-ES',
};

export function isSupportedLang(value: unknown): value is LangId {
  return typeof value === 'string' && (SUPPORTED_LANGS as readonly string[]).includes(value);
}

/** Resolves the initial UI language: saved choice, then browser language, then Italian. */
export function detectInitialLang(): LangId {
  try {
    const stored = localStorage.getItem(LANG_STORAGE_KEY);
    if (isSupportedLang(stored)) {
      return stored;
    }
  } catch {
    // storage blocked: fall through to browser language
  }
  for (const candidate of navigator.languages ?? [navigator.language]) {
    const base = candidate?.toLowerCase().split('-')[0];
    if (isSupportedLang(base)) {
      return base;
    }
  }
  return DEFAULT_LANG;
}

@Injectable({ providedIn: 'root' })
export class LanguageService {
  private readonly transloco = inject(TranslocoService);

  readonly lang = signal<LangId>(DEFAULT_LANG);

  /** Called once at startup (before first render) and whenever the user picks a language. */
  async setLanguage(lang: LangId): Promise<void> {
    this.transloco.setActiveLang(lang);
    // Wait for the JSON to be fetched so the switch never flashes raw keys.
    await new Promise<void>(resolve => {
      const sub = this.transloco.load(lang).subscribe({
        next: () => { sub?.unsubscribe(); resolve(); },
        error: () => resolve(),
      });
    });
    this.lang.set(lang);
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // ignore: preference just won't persist
    }
  }

  /** Locale tag for `Intl.*` APIs, following the active UI language. */
  get intlLocale(): string {
    return INTL_LOCALES[this.lang()];
  }

  translate(key: string, params?: Record<string, unknown>): string {
    return this.transloco.translate(key, params);
  }

  /**
   * Call summaries are stored as language-neutral tokens ("i18n:call.summary.ended|03:12") because
   * one chat row is read by several people in different languages. Anything else — including a
   * user typing "i18n:..." by hand — comes back unchanged; only call.summary.* keys are honoured.
   */
  renderContent(content: string | null | undefined): string {
    if (!content?.startsWith(TOKEN_PREFIX)) {
      return content ?? '';
    }
    const [key, ...args] = content.slice(TOKEN_PREFIX.length).split('|');
    const paramNames = SUMMARY_PARAMS[key];
    if (!paramNames) {
      return content;
    }
    return this.translate(key, Object.fromEntries(paramNames.map((name, i) => [name, args[i] ?? ''])));
  }
}
