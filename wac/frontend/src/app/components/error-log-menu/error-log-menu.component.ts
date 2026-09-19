import { Component, HostListener } from '@angular/core';
import { AppErrorEntry, ErrorLogService } from '../../utils/error-log/error-log.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalDatePipe } from '../../utils/i18n/local-date.pipe';

@Component({
  selector: 'app-error-log-menu',
  imports: [TranslocoPipe, LocalDatePipe],
  templateUrl: './error-log-menu.component.html',
  styleUrl: './error-log-menu.component.scss'
})
export class ErrorLogMenuComponent {

  open = false;

  constructor(readonly errorLog: ErrorLogService) {}

  toggle(event: Event): void {
    event.stopPropagation();
    this.open = !this.open;
    if (this.open) {
      this.errorLog.markSeen();
    }
  }

  clear(event: Event): void {
    event.stopPropagation();
    this.errorLog.clear();
  }

  sourceLabel(entry: AppErrorEntry): string {
    return entry.source === 'http' ? `HTTP ${entry.status ?? ''}`.trim() : 'Client';
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    this.open = false;
  }
}
