import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../services/services/user.service';
import { UserResponse } from '../../services/models/user-response';
import { ChatService } from '../../services/services/chat.service';
import { ChatResponse } from '../../services/models/chat-response';
import { MessageResponse } from '../../services/models/message-response';
import { ModerationService } from '../../services/services/moderation.service';
import { UserReportRequest } from '../../services/models/user-report-request';
import { KeycloakService } from '../../utils/keycloak/keycloak.service';
import { MuteService } from '../../utils/mute/mute.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalDatePipe } from '../../utils/i18n/local-date.pipe';
import { LanguageService } from '../../utils/i18n/language.service';

@Component({
  selector: 'app-user-card',
  templateUrl: './user-card.component.html',
  styleUrl: './user-card.component.scss',
  imports: [TranslocoPipe, LocalDatePipe, FormsModule]
})
export class UserCardComponent implements OnChanges {
  protected readonly i18n = inject(LanguageService);

  @Input() userId: string | null = null;
  @Input() chatId?: string;
  @Input() chatMessages?: MessageResponse[];
  @Output() closed = new EventEmitter<void>();
  @Output() chatRequested = new EventEmitter<ChatResponse>();
  @Output() userBlocked = new EventEmitter<string>();
  @Output() mediaRequested = new EventEmitter<MessageResponse>();

  user: UserResponse | null = null;
  loading = false;
  requestSent = false;
  blocked = false;

  confirmBlock = false;
  confirmReport = false;
  reportSent = false;
  reportReason: UserReportRequest['reason'] = 'SPAM';
  reportDetails = '';

  activeTab: 'info' | 'media' | 'starred' = 'info';
  usernameCopied = false;

  constructor(
    private userService: UserService,
    private chatService: ChatService,
    private moderationService: ModerationService,
    private keycloakService: KeycloakService,
    private muteService: MuteService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['userId'] && this.userId) {
      this.loading = true;
      this.user = null;
      this.requestSent = false;
      this.blocked = false;
      this.confirmBlock = false;
      this.confirmReport = false;
      this.reportSent = false;
      this.reportReason = 'SPAM';
      this.reportDetails = '';
      this.activeTab = 'info';
      this.usernameCopied = false;
      this.userService.getUserById({ id: this.userId }).subscribe({
        next: user => { this.user = user; this.loading = false; },
        error: () => { this.loading = false; }
      });
      this.moderationService.isBlockedByMe({ id: this.userId }).subscribe({
        next: res => { this.blocked = !!res['blocked']; }
      });
    }
  }

  mediaMessages(): MessageResponse[] {
    return (this.chatMessages ?? []).filter(m => (m.type === 'IMAGE' || m.type === 'VIDEO') && !m.deleted);
  }

  starredMessages(): MessageResponse[] {
    return (this.chatMessages ?? []).filter(m => m.starred && !m.deleted);
  }

  openMedia(message: MessageResponse): void {
    this.mediaRequested.emit(message);
  }

  copyUsername(): void {
    if (!this.user?.username) return;
    navigator.clipboard?.writeText(this.user.username).then(() => {
      this.usernameCopied = true;
      setTimeout(() => { this.usernameCopied = false; }, 1500);
    }).catch(() => undefined);
  }

  isMuted(): boolean {
    return this.muteService.isMuted(this.chatId);
  }

  toggleMute(): void {
    if (!this.chatId) return;
    this.muteService.toggleMute(this.chatId);
  }

  close(): void {
    this.closed.emit();
  }

  sendChatRequest(): void {
    if (!this.user?.id || this.requestSent) return;
    this.chatService.createChat({ 'receiver-id': this.user.id }).subscribe({
      next: (res) => {
        this.requestSent = true;
        const chat: ChatResponse = {
          id: res.response,
          name: this.user!.username ? '@' + this.user!.username : this.displayName(),
          senderId: this.keycloakService.userId,
          receiverId: this.user!.id,
          avatarUrl: this.user!.avatarUrl,
          status: 'PENDING',
          pendingMessageCount: 0
        };
        this.chatRequested.emit(chat);
      }
    });
  }

  displayName(): string {
    if (!this.user) return '';
    return [this.user.firstName, this.user.lastName].filter(Boolean).join(' ');
  }

  initial(): string {
    const source = this.user?.username || this.user?.firstName || '?';
    return source.charAt(0).toUpperCase();
  }

  openBlockConfirm(): void {
    this.confirmBlock = true;
  }

  cancelBlock(): void {
    this.confirmBlock = false;
  }

  blockUser(): void {
    if (!this.user?.id) return;
    this.moderationService.blockUser({ id: this.user.id }).subscribe({
      next: () => {
        this.confirmBlock = false;
        this.blocked = true;
        this.userBlocked.emit(this.user!.id);
      }
    });
  }

  unblockUser(): void {
    if (!this.user?.id) return;
    this.moderationService.unblockUser({ id: this.user.id }).subscribe({
      next: () => { this.blocked = false; }
    });
  }

  openReportConfirm(): void {
    this.confirmReport = true;
  }

  cancelReport(): void {
    this.confirmReport = false;
  }

  submitReport(): void {
    if (!this.user?.id) return;
    this.moderationService.reportUser({
      id: this.user.id,
      body: {
        reason: this.reportReason,
        details: this.reportDetails || undefined
      }
    }).subscribe({
      next: () => {
        this.confirmReport = false;
        this.reportSent = true;
      }
    });
  }
}
