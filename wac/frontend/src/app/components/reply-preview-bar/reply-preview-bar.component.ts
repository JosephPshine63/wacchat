import { Component, EventEmitter, Input, Output } from '@angular/core';
import { MessageResponse } from '../../services/models/message-response';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../utils/i18n/language.service';

@Component({
  selector: 'app-reply-preview-bar',
  templateUrl: './reply-preview-bar.component.html',
  imports: [TranslocoPipe],
  styleUrl: './reply-preview-bar.component.scss'
})
export class ReplyPreviewBarComponent {

  constructor(private i18n: LanguageService) {}

  @Input() message: MessageResponse | null = null;
  @Output() cancelled = new EventEmitter<void>();

  previewText(): string {
    if (!this.message) return '';
    switch (this.message.type) {
      case 'VIDEO': return this.i18n.translate('media.video');
      case 'AUDIO': return this.i18n.translate('media.voice');
      case 'IMAGE': return this.i18n.translate('media.photo');
      default: return this.message.content ?? '';
    }
  }

  cancel(): void {
    this.cancelled.emit();
  }
}
