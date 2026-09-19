import { Component, ElementRef, Input, ViewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-audio-player',
  templateUrl: './audio-player.component.html',
  imports: [TranslocoPipe],
  styleUrl: './audio-player.component.scss'
})
export class AudioPlayerComponent {

  @Input({ required: true }) src!: string;

  @ViewChild('audioEl') private audioRef!: ElementRef<HTMLAudioElement>;
  @ViewChild('track') private trackRef!: ElementRef<HTMLDivElement>;

  playing = false;
  duration = 0;
  currentTime = 0;

  get progressPercent(): number {
    return this.duration > 0 ? (this.currentTime / this.duration) * 100 : 0;
  }

  get displayTime(): string {
    return this.formatTime(this.playing || this.currentTime > 0 ? this.currentTime : this.duration);
  }

  togglePlay(): void {
    const audio = this.audioRef.nativeElement;
    if (audio.paused) {
      // Only one voice note plays at a time across the whole chat.
      document.querySelectorAll('audio').forEach(other => {
        if (other !== audio && !other.paused) other.pause();
      });
      audio.play();
      this.playing = true;
    } else {
      audio.pause();
      this.playing = false;
    }
  }

  onLoadedMetadata(): void {
    this.duration = this.audioRef.nativeElement.duration || 0;
  }

  onTimeUpdate(): void {
    this.currentTime = this.audioRef.nativeElement.currentTime;
  }

  onEnded(): void {
    this.playing = false;
    this.currentTime = 0;
  }

  onPause(): void {
    this.playing = false;
  }

  onSeek(event: MouseEvent): void {
    if (this.duration <= 0) return;
    const rect = this.trackRef.nativeElement.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const audio = this.audioRef.nativeElement;
    audio.currentTime = ratio * this.duration;
    this.currentTime = audio.currentTime;
  }

  private formatTime(seconds: number): string {
    if (!isFinite(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }
}
