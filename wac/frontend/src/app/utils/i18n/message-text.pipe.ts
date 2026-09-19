import { Pipe, PipeTransform, inject } from '@angular/core';
import { LanguageService } from './language.service';

/** Renders stored message text, resolving call-summary tokens in the active language. */
@Pipe({ name: 'messageText', standalone: true, pure: false })
export class MessageTextPipe implements PipeTransform {
  private readonly i18n = inject(LanguageService);

  transform(content: string | null | undefined): string {
    return this.i18n.renderContent(content);
  }
}
