import { detectInitialLang, isSupportedLang } from './language.service';

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
