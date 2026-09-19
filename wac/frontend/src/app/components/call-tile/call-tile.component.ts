import { AfterViewChecked, Component, ElementRef, Input, ViewChild, inject } from '@angular/core';
import { ErrorLogService } from '../../utils/error-log/error-log.service';

import { LanguageService } from '../../utils/i18n/language.service';

@Component({
  selector: 'app-call-tile',
  templateUrl: './call-tile.component.html',
  styleUrl: './call-tile.component.scss',
  imports: []
})
export class CallTileComponent implements AfterViewChecked {
  protected readonly i18n = inject(LanguageService);
  @Input() name: string | null = null;
  @Input() avatarUrl: string | null = null;
  @Input() callType: 'AUDIO' | 'VIDEO' = 'AUDIO';
  @Input() stream: MediaStream | null = null;
  @Input() muted = false;
  @Input() statusLabel: string | null = null;
  @Input() isLocal = false;
  // Renders just the <audio> element (no avatar/label chrome) — used as a hidden
  // per-participant playback sink for audio-only calls, where the visual avatar UI is
  // already drawn separately by the parent template.
  @Input() audioOnly = false;

  @ViewChild('videoEl') videoRef?: ElementRef<HTMLVideoElement>;
  @ViewChild('audioEl') audioRef?: ElementRef<HTMLAudioElement>;

  private readonly errorLogService = inject(ErrorLogService);

  // Same "re-check every view check" approach the pre-mesh CallComponent used for its
  // single local/remote video: a plain ViewChild lookup right after this.stream changes
  // (e.g. a peer joining mid-call, or this tile only just entering the @for list) can
  // race the template's own re-render, so the srcObject assignment is redone on every
  // check instead of only reacting to an @Input change event.
  ngAfterViewChecked(): void {
    if (this.videoRef && this.videoRef.nativeElement.srcObject !== this.stream) {
      this.videoRef.nativeElement.srcObject = this.stream;
      this.playOrLog(this.videoRef.nativeElement);
    }
    if (this.audioRef && this.audioRef.nativeElement.srcObject !== this.stream) {
      this.audioRef.nativeElement.srcObject = this.stream;
      this.playOrLog(this.audioRef.nativeElement);
    }
  }

  // The `autoplay` attribute alone doesn't surface anything when a mobile browser's
  // playback policy silently blocks it — an explicit .play() call at least lets us log
  // the rejection where the error-log menu can show it (there's no devtools on a phone).
  private playOrLog(element: HTMLMediaElement): void {
    if (!this.stream) return;
    element.play().catch(err => {
      this.errorLogService.report({
        source: 'client',
        message: this.i18n.translate(this.callType === 'VIDEO' ? 'errors.videoPlaybackBlocked' : 'errors.audioPlaybackBlocked', { error: err?.message ?? String(err) })
      });
    });
  }

  get initial(): string {
    return (this.name || '?').charAt(0).toUpperCase();
  }
}
