import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from './language.service';

type Preset = 'time' | 'timeSeconds' | 'dateShort' | 'dateTimeShort' | 'monthYear' | 'date';

const PRESETS: Record<Preset, Intl.DateTimeFormatOptions> = {
  time: { hour: '2-digit', minute: '2-digit', hour12: false },
  timeSeconds: { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false },
  dateShort: { day: '2-digit', month: '2-digit', year: '2-digit' },
  dateTimeShort: { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false },
  monthYear: { month: 'long', year: 'numeric' },
  date: { day: 'numeric', month: 'long', year: 'numeric' },
};

/**
 * Locale-aware date formatting driven by the active UI language. Impure on purpose: the
 * language can change at runtime without a reload, and the pipe must re-format then.
 */
@Pipe({ name: 'localDate', pure: false })
export class LocalDatePipe implements PipeTransform {
  private readonly language = inject(LanguageService);

  transform(value: string | number | Date | null | undefined, preset: Preset | Intl.DateTimeFormatOptions = 'time'): string {
    if (value === null || value === undefined || value === '') {
      return '';
    }
    const date = value instanceof Date ? value : new Date(value);
    if (isNaN(date.getTime())) {
      return '';
    }
    const options = typeof preset === 'string' ? PRESETS[preset] : preset;
    return new Intl.DateTimeFormat(this.language.intlLocale, options).format(date);
  }
}
