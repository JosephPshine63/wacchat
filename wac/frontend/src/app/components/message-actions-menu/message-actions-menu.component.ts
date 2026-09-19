import { Component, ElementRef, EventEmitter, HostListener, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';
import { TranslocoPipe } from '@jsverse/transloco';
// Rough max height of the dropdown (5 items × ~36px + padding) — used as the
// threshold to decide whether there's enough room below the button to open
// downward, or whether it should flip upward instead.
const DROPDOWN_MAX_HEIGHT = 220;

// Matches the dropdown's CSS min-width (140px) plus a small margin — used as
// the threshold to decide whether there's enough room to the left of the
// button to open leftward, or whether it should flip rightward instead.
const DROPDOWN_MIN_WIDTH = 148;

@Component({
  selector: 'app-message-actions-menu',
  templateUrl: './message-actions-menu.component.html',
  imports: [TranslocoPipe],
  styleUrl: './message-actions-menu.component.scss'
})
export class MessageActionsMenuComponent implements OnChanges {

  @Input() open = false;
  @Input() canForward = true;
  @Input() canCopy = true;
  @Input() canEdit = false;
  @Input() canDelete = false;
  @Input() starred = false;
  @Output() toggle = new EventEmitter<void>();
  @Output() closeRequested = new EventEmitter<void>();
  @Output() replyRequested = new EventEmitter<void>();
  @Output() forwardRequested = new EventEmitter<void>();
  @Output() copyRequested = new EventEmitter<void>();
  @Output() editRequested = new EventEmitter<void>();
  @Output() deleteRequested = new EventEmitter<void>();
  @Output() reactRequested = new EventEmitter<void>();
  @Output() starRequested = new EventEmitter<void>();

  @ViewChild('toggleBtn') toggleBtn?: ElementRef<HTMLButtonElement>;

  opensUpward = false;
  opensRight = false;

  // Recomputed whenever the menu transitions to open — covers both the ⋮
  // button toggle and right-click, which sets `open` directly on the parent
  // without going through onToggleClick().
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['open'] && this.open) {
      this.opensUpward = this.computeOpensUpward();
      this.opensRight = this.computeOpensRight();
    }
  }

  onToggleClick(event: Event): void {
    event.stopPropagation();
    this.toggle.emit();
  }

  // The dropdown is clipped by the scrollable messages container if there
  // isn't enough room below the button — happens on short bubbles sitting
  // near the bottom of the chat. Flip it upward in that case.
  private computeOpensUpward(): boolean {
    const btn = this.toggleBtn?.nativeElement;
    if (!btn) return false;
    const rect = btn.getBoundingClientRect();
    const scrollContainer = btn.closest('.messages-area');
    const boundaryBottom = scrollContainer
      ? scrollContainer.getBoundingClientRect().bottom
      : window.innerHeight;
    return boundaryBottom - rect.bottom < DROPDOWN_MAX_HEIGHT;
  }

  // The dropdown is right-anchored and grows leftward by default, which
  // clips it against the scrollable messages container's left edge for
  // narrow, left-aligned (friend) bubbles. Flip it rightward in that case.
  private computeOpensRight(): boolean {
    const btn = this.toggleBtn?.nativeElement;
    if (!btn) return false;
    const rect = btn.getBoundingClientRect();
    const scrollContainer = btn.closest('.messages-area');
    const boundaryLeft = scrollContainer
      ? scrollContainer.getBoundingClientRect().left
      : 0;
    return rect.right - boundaryLeft < DROPDOWN_MIN_WIDTH;
  }

  onReply(event: Event): void {
    event.stopPropagation();
    this.replyRequested.emit();
    this.closeRequested.emit();
  }

  onForward(event: Event): void {
    event.stopPropagation();
    this.forwardRequested.emit();
    this.closeRequested.emit();
  }

  onCopy(event: Event): void {
    event.stopPropagation();
    this.copyRequested.emit();
    this.closeRequested.emit();
  }

  onEdit(event: Event): void {
    event.stopPropagation();
    this.editRequested.emit();
    this.closeRequested.emit();
  }

  onDelete(event: Event): void {
    event.stopPropagation();
    this.deleteRequested.emit();
    this.closeRequested.emit();
  }

  onReact(event: Event): void {
    event.stopPropagation();
    this.reactRequested.emit();
    this.closeRequested.emit();
  }

  onStar(event: Event): void {
    event.stopPropagation();
    this.starRequested.emit();
    this.closeRequested.emit();
  }

  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.open) {
      this.closeRequested.emit();
    }
  }
}
