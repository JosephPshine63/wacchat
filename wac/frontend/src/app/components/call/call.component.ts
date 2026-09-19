import { Component, EventEmitter, Input, OnChanges, OnDestroy, Output, SimpleChanges, inject } from '@angular/core';
import { Subscription } from 'rxjs';
import { WebRtcCallService } from '../../utils/webrtc/webrtc-call.service';
import { CallTileComponent } from '../call-tile/call-tile.component';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../utils/i18n/language.service';
export interface CallParticipantView {
  userId: string;
  name: string | null;
  avatarUrl: string | null;
  status: 'ringing' | 'joined';
}

@Component({
  selector: 'app-call',
  templateUrl: './call.component.html',
  styleUrl: './call.component.scss',
  imports: [TranslocoPipe, CallTileComponent]
})
export class CallComponent implements OnChanges, OnDestroy {
  protected readonly i18n = inject(LanguageService);

  // Includes 'idle' purely so the type matches MainComponent's broader field as-is —
  // the parent only renders <app-call> at all once callState !== 'idle' (see
  // main.component.html), so none of this component's template branches ever match it.
  @Input() callState!: 'idle' | 'incoming' | 'outgoing' | 'in-call';
  @Input() callType: 'AUDIO' | 'VIDEO' = 'AUDIO';
  // Excludes self. For an incoming 1:1 call this has exactly one entry (the caller); for
  // an outgoing/in-call it's every other invitee/participant (mesh topology — a 1:1 call
  // is simply the size-1 case).
  @Input() participants: CallParticipantView[] = [];
  @Output() accepted = new EventEmitter<void>();
  @Output() rejected = new EventEmitter<void>();
  @Output() hungUp = new EventEmitter<void>();

  muted = false;
  elapsedLabel = '00:00';
  remoteStreams = new Map<string, MediaStream>();
  private elapsedSeconds = 0;
  private timerHandle: ReturnType<typeof setInterval> | null = null;
  private readonly remoteStreamsSub: Subscription;

  constructor(private webRtcCallService: WebRtcCallService) {
    this.remoteStreamsSub = this.webRtcCallService.remoteStreams$.subscribe(streams => {
      this.remoteStreams = streams;
    });
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['callState']) {
      if (this.callState === 'in-call') {
        this.startTimer();
      } else {
        this.stopTimer();
      }
    }
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.remoteStreamsSub.unsubscribe();
  }

  get localStream(): MediaStream | null {
    return this.webRtcCallService.localStream;
  }

  get incomingCaller(): CallParticipantView | null {
    return this.participants[0] ?? null;
  }

  statusLabelFor(participant: CallParticipantView): string | null {
    if (this.callState === 'outgoing' && participant.status === 'ringing') {
      return this.i18n.translate('call.ringing');
    }
    return null;
  }

  toggleMute(): void {
    this.muted = !this.muted;
    this.webRtcCallService.setMuted(this.muted);
  }

  private startTimer(): void {
    if (this.timerHandle !== null) return;
    this.elapsedSeconds = 0;
    this.elapsedLabel = '00:00';
    this.timerHandle = setInterval(() => {
      this.elapsedSeconds++;
      const mins = Math.floor(this.elapsedSeconds / 60);
      const secs = this.elapsedSeconds % 60;
      this.elapsedLabel = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerHandle !== null) {
      clearInterval(this.timerHandle);
      this.timerHandle = null;
    }
  }
}
