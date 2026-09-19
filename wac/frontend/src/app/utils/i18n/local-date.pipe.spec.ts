import { LocalDatePipe } from './local-date.pipe';
import { TestBed } from '@angular/core/testing';
import { LanguageService } from './language.service';

describe('LocalDatePipe', () => {
  let locale = 'it-IT';
  let pipe: LocalDatePipe;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: LanguageService, useValue: { get intlLocale() { return locale; } } }],
    });
    pipe = TestBed.runInInjectionContext(() => new LocalDatePipe());
  });

  it('returns an empty string for missing or invalid dates', () => {
    expect(pipe.transform(null)).toBe('');
    expect(pipe.transform('not a date')).toBe('');
  });

  it('formats the same date differently as the language changes', () => {
    const date = new Date(2026, 8, 20, 14, 5);
    locale = 'it-IT';
    expect(pipe.transform(date, 'monthYear')).toBe('settembre 2026');
    locale = 'fr-FR';
    expect(pipe.transform(date, 'monthYear')).toBe('septembre 2026');
    locale = 'de-DE';
    expect(pipe.transform(date, 'monthYear')).toBe('September 2026');
  });

  it('uses 24h time', () => {
    locale = 'en-GB';
    expect(pipe.transform(new Date(2026, 8, 20, 14, 5), 'time')).toBe('14:05');
  });
});
