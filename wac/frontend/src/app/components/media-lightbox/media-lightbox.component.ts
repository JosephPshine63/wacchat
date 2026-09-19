import { Component, EventEmitter, HostListener, Input, Output } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
const MIN_ZOOM = 1;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

@Component({
  selector: 'app-media-lightbox',
  templateUrl: './media-lightbox.component.html',
  imports: [TranslocoPipe],
  styleUrl: './media-lightbox.component.scss'
})
export class MediaLightboxComponent {

  @Input() mediaUrl: string | null = null;
  @Input() mediaType: 'IMAGE' | 'VIDEO' = 'IMAGE';
  @Output() closed = new EventEmitter<void>();

  zoomLevel = MIN_ZOOM;
  panX = 0;
  panY = 0;
  private dragging = false;
  private dragStartX = 0;
  private dragStartY = 0;
  private panStartX = 0;
  private panStartY = 0;

  @HostListener('document:keydown.escape')
  onEscape(): void {
    this.close();
  }

  close(): void {
    this.zoomLevel = MIN_ZOOM;
    this.panX = 0;
    this.panY = 0;
    this.closed.emit();
  }

  zoomIn(): void {
    this.zoomLevel = Math.min(MAX_ZOOM, this.zoomLevel + ZOOM_STEP);
  }

  zoomOut(): void {
    this.zoomLevel = Math.max(MIN_ZOOM, this.zoomLevel - ZOOM_STEP);
    if (this.zoomLevel === MIN_ZOOM) {
      this.panX = 0;
      this.panY = 0;
    }
  }

  onWheel(event: WheelEvent): void {
    if (this.mediaType !== 'IMAGE') return;
    event.preventDefault();
    if (event.deltaY < 0) {
      this.zoomIn();
    } else {
      this.zoomOut();
    }
  }

  onDragStart(event: MouseEvent): void {
    if (this.mediaType !== 'IMAGE' || this.zoomLevel === MIN_ZOOM) return;
    this.dragging = true;
    this.dragStartX = event.clientX;
    this.dragStartY = event.clientY;
    this.panStartX = this.panX;
    this.panStartY = this.panY;
  }

  @HostListener('document:mousemove', ['$event'])
  onDragMove(event: MouseEvent): void {
    if (!this.dragging) return;
    this.panX = this.panStartX + (event.clientX - this.dragStartX);
    this.panY = this.panStartY + (event.clientY - this.dragStartY);
  }

  @HostListener('document:mouseup')
  onDragEnd(): void {
    this.dragging = false;
  }

  imageTransform(): string {
    return `translate(${this.panX}px, ${this.panY}px) scale(${this.zoomLevel})`;
  }
}
