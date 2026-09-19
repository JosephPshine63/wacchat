import { TestBed } from '@angular/core/testing';
import { TranslocoService } from '@jsverse/transloco';
import { LanguageService, detectInitialLang, isSupportedLang } from './language.service';

describe('language detection', () => {
  afterEach(() => localStorage.removeItem('appLang'));

  it('accepts only the five supported languages', () => {
    for (const lang of ['it', 'en', 'fr', 'de', 'es']) {
      expect(isSupportedLang(lang)).toBeTrue();
    }
    expect(isSupportedLang('pt')).toBeFalse();
    expect(isSupportedLang(undefined)).toBeFalse();
  });

  it('prefers the saved choice over the browser language', () => {
    localStorage.setItem('appLang', 'de');
    expect(detectInitialLang()).toBe('de');
  });

  it('ignores an unsupported saved value', () => {
    localStorage.setItem('appLang', 'xx');
    expect(isSupportedLang(detectInitialLang())).toBeTrue();
  });
});

describe('LanguageService.renderContent', () => {
  let service: LanguageService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{
        provide: TranslocoService,
        useValue: { translate: (key: string, params: Record<string, unknown>) => `${key}:${JSON.stringify(params)}` },
      }],
    });
    service = TestBed.inject(LanguageService);
  });

  it('renders call summary tokens with their positional args', () => {
    expect(service.renderContent('i18n:call.summary.ended|03:12')).toBe('call.summary.ended:{"duration":"03:12"}');
    expect(service.renderContent('i18n:call.summary.groupEndedDuration|03:12|4'))
      .toBe('call.summary.groupEndedDuration:{"duration":"03:12","count":"4"}');
    expect(service.renderContent('i18n:call.summary.missed')).toBe('call.summary.missed:{}');
  });

  it('leaves plain text and non-summary keys untouched', () => {
    expect(service.renderContent('ciao')).toBe('ciao');
    expect(service.renderContent('i18n:settings.title')).toBe('i18n:settings.title');
    expect(service.renderContent(undefined)).toBe('');
  });
});
