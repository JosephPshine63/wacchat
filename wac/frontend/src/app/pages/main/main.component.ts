import {AfterViewChecked, Component, ElementRef, HostListener, NgZone, OnDestroy, OnInit, ViewChild} from '@angular/core';
import {HttpContext} from '@angular/common/http';
import {SILENT_ERROR} from '../../utils/http/error-log.interceptor';
import {SupportService} from '../../services/services/support.service';
import {ChatListComponent} from '../../components/chat-list/chat-list.component';
import {KeycloakService} from '../../utils/keycloak/keycloak.service';
import {ChatResponse} from '../../services/models/chat-response';
import {MessageService} from '../../services/services/message.service';
import {MessageResponse} from '../../services/models/message-response';
import {UserResponse} from '../../services/models/user-response';
import { Client, IMessage, StompSubscription } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import {FormsModule} from '@angular/forms';
import {MessageRequest} from '../../services/models/message-request';
import {Notification} from './models/notification';
import {CallSignal} from './models/call-signal';
import {ChatService} from '../../services/services/chat.service';
import {CallApiService} from '../../utils/call/call-api.service';
import {LocalIceCandidate, WebRtcCallService} from '../../utils/webrtc/webrtc-call.service';
import {CallComponent, CallParticipantView} from '../../components/call/call.component';
import {CallInviteePickerComponent} from '../../components/call-invitee-picker/call-invitee-picker.component';
import {GroupMemberResponse} from '../../services/models/group-member-response';
import {PickerComponent} from '@ctrl/ngx-emoji-mart';
import {EmojiData} from '@ctrl/ngx-emoji-mart/ngx-emoji';
import {UsernameSetupComponent} from '../../components/username-setup/username-setup.component';
import {UsernameService} from '../../utils/username/username.service';
import {UserCardComponent} from '../../components/user-card/user-card.component';
import {AvatarUploadComponent} from '../../components/avatar-upload/avatar-upload.component';
import {SessionBlockedComponent} from '../../components/session-blocked/session-blocked.component';
import {SessionGuardService} from '../../utils/session/session-guard.service';
import {BuildInfoService} from '../../utils/version/build-info.service';
import {BrowserNotificationService} from '../../utils/notifications/browser-notification.service';
import {SettingsComponent} from '../../components/settings/settings.component';
import {MediaLightboxComponent} from '../../components/media-lightbox/media-lightbox.component';
import {DraftService} from '../../utils/draft/draft.service';
import {MuteService} from '../../utils/mute/mute.service';
import {MessageActionsMenuComponent} from '../../components/message-actions-menu/message-actions-menu.component';
import {ReplyPreviewBarComponent} from '../../components/reply-preview-bar/reply-preview-bar.component';
import {ForwardPickerComponent} from '../../components/forward-picker/forward-picker.component';
import {ErrorLogMenuComponent} from '../../components/error-log-menu/error-log-menu.component';
import {ErrorLogService} from '../../utils/error-log/error-log.service';
import {AudioPlayerComponent} from '../../components/audio-player/audio-player.component';
import {GroupCreateComponent} from '../../components/group-create/group-create.component';
import {GroupMembersComponent} from '../../components/group-members/group-members.component';
import {PushSubscriptionService} from '../../utils/push/push-subscription.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalDatePipe } from '../../utils/i18n/local-date.pipe';
import { MessageTextPipe } from '../../utils/i18n/message-text.pipe';
import { LanguageService } from '../../utils/i18n/language.service';
const HEARTBEAT_INTERVAL_MS = 60000;
const ARNO_USER_ID = '00000000-0000-0000-0000-000000000001';
const ARNO_TYPING_TIMEOUT_MS = 20000;
const PEER_TYPING_SAFETY_TIMEOUT_MS = 8000;
const TYPING_STOP_DEBOUNCE_MS = 2000;
const TYPING_SEND_THROTTLE_MS = 3000;
const SCROLL_THRESHOLD_PX = 100;
// Must match ChatConstants.MAX_PENDING_MESSAGES in the backend.
const MAX_PENDING_MESSAGES = 3;

@Component({
  selector: 'app-main',
  imports: [TranslocoPipe, LocalDatePipe, MessageTextPipe, 
    ChatListComponent,
    FormsModule,
    PickerComponent,
    UsernameSetupComponent,
    UserCardComponent,
    AvatarUploadComponent,
    SessionBlockedComponent,
    SettingsComponent,
    CallComponent,
    CallInviteePickerComponent,
    MediaLightboxComponent,
    MessageActionsMenuComponent,
    ReplyPreviewBarComponent,
    ForwardPickerComponent,
    ErrorLogMenuComponent,
    AudioPlayerComponent,
    GroupCreateComponent,
    GroupMembersComponent
  ],
  templateUrl: './main.component.html',
  styleUrl: './main.component.scss'
})
export class MainComponent implements OnInit, OnDestroy, AfterViewChecked {

  selectedChat: ChatResponse = {};
  chats: Array<ChatResponse> = [];
  chatMessages: Array<MessageResponse> = [];
  socketClient: Client | null = null;
  messageContent: string = '';
  showEmojis = false;
  showDemoBanner = !sessionStorage.getItem('demoBannerDismissed');
  ageVerified = !!localStorage.getItem('ageVerified');
  ageDenied = false;
  currentUser: UserResponse | null = null;
  showUsernameModal = false;
  selectedCardUserId: string | null = null;
  showAvatarUpload = false;
  showSettings = false;
  showGroupCreate = false;
  showGroupMembers = false;
  @ViewChild('scrollableDiv') scrollableDiv!: ElementRef<HTMLDivElement>;
  private notificationSubscription: StompSubscription | null = null;
  private heartbeatHandle: ReturnType<typeof setInterval> | null = null;
  peerTypingChatId: string | null = null;
  private peerTypingTimeout: ReturnType<typeof setTimeout> | null = null;
  private typingStopTimeout: ReturnType<typeof setTimeout> | null = null;
  private typingActive = false;
  private lastTypingSentAt = 0;

  recordingState: 'idle' | 'recording' | 'preview' | 'sending' = 'idle';
  recordingElapsedSeconds = 0;
  recordedPreviewUrl: string | null = null;
  private static readonly MAX_RECORDING_SECONDS = 300;
  private mediaRecorder: MediaRecorder | null = null;
  private recordedChunks: Blob[] = [];
  private recordedBlob: Blob | null = null;
  private recordingTimerHandle: ReturnType<typeof setInterval> | null = null;

  lightboxMedia: { url: string; type: 'IMAGE' | 'VIDEO' } | null = null;

  activeMessageMenuId: number | null = null;
  replyingToMessage: MessageResponse | null = null;
  forwardingMessage: MessageResponse | null = null;
  editingMessage: MessageResponse | null = null;
  editContent = '';
  reactingToMessageId: number | null = null;

  showMessageSearch = false;
  messageSearchQuery = '';
  searchMatchIndices: number[] = [];
  currentSearchMatchIndex = -1;

  isScrolledUp = false;
  private forceScrollOnNextCheck = false;

  callState: 'idle' | 'incoming' | 'outgoing' | 'in-call' = 'idle';
  activeCallChatId: string | null = null;
  activeCallType: 'AUDIO' | 'VIDEO' = 'AUDIO';
  // Excludes self — mesh topology, so a 1:1 call is simply the size-1 case. On an
  // incoming call this starts as just the caller; other participants (group calls) are
  // only discovered later via PARTICIPANT_JOINED/PEER_OFFER bootstrap signals, since the
  // initial INVITE we receive only ever comes directly from the caller.
  callParticipants: CallParticipantView[] = [];
  showCallInviteePicker = false;
  pendingGroupCallType: 'AUDIO' | 'VIDEO' = 'AUDIO';
  private pendingOfferSdp: string | null = null;
  private callSignalSubscription: StompSubscription | null = null;
  // The caller starts local ICE gathering (setLocalDescription, inside createOfferFor())
  // before invite() has confirmed the session exists in call-service's CallSessionStore —
  // candidates generated in that window get queued here and flushed once invite() (or,
  // for the callee, the incoming INVITE signal itself) confirms the session is live.
  private callSessionConfirmed = false;
  private pendingLocalIceCandidates: LocalIceCandidate[] = [];

  constructor(
    private chatService: ChatService,
    private messageService: MessageService,
    private keycloakService: KeycloakService,
    private usernameService: UsernameService,
    private ngZone: NgZone,
    protected sessionGuard: SessionGuardService,
    private browserNotifications: BrowserNotificationService,
    private callApiService: CallApiService,
    private webRtcCallService: WebRtcCallService,
    private draftService: DraftService,
    private muteService: MuteService,
    private supportService: SupportService,
    private errorLogService: ErrorLogService,
    private pushSubscriptionService: PushSubscriptionService,
    private i18n: LanguageService,
    protected buildInfo: BuildInfoService,
  ) {
  }

  ngAfterViewChecked(): void {
    this.scrollToBottom();
  }

  ngOnDestroy(): void {
    this.notificationSubscription?.unsubscribe();
    this.callSignalSubscription?.unsubscribe();
    this.webRtcCallService.close();
    if (this.socketClient !== null) {
      this.socketClient.deactivate();
      this.socketClient = null;
    }
    if (this.heartbeatHandle !== null) {
      clearInterval(this.heartbeatHandle);
    }
    if (this.peerTypingTimeout !== null) {
      clearTimeout(this.peerTypingTimeout);
    }
    if (this.typingStopTimeout !== null) {
      clearTimeout(this.typingStopTimeout);
    }
    if (this.recordingTimerHandle !== null) {
      clearInterval(this.recordingTimerHandle);
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.stream?.getTracks().forEach(t => t.stop());
    }
    window.removeEventListener('pagehide', this.releaseSessionOnUnload);
  }

  ngOnInit(): void {
    this.browserNotifications.requestPermission();
    void this.pushSubscriptionService.registerServiceWorkerAndSubscribe();
    this.initWebSocket();
    this.getAllChats();
    this.refreshCurrentUser();
    this.heartbeatHandle = setInterval(() => this.refreshCurrentUser(), HEARTBEAT_INTERVAL_MS);
    window.addEventListener('pagehide', this.releaseSessionOnUnload);
    // RTCPeerConnection's onicecandidate fires outside Angular's zone, same as STOMP
    // callbacks below — wrap in ngZone.run so any state it touches gets change-detected.
    this.webRtcCallService.localIceCandidate$.subscribe(candidate => {
      this.ngZone.run(() => {
        if (!this.activeCallChatId) return;
        if (!this.callSessionConfirmed) {
          this.pendingLocalIceCandidates.push(candidate);
          return;
        }
        this.sendIceCandidate(candidate);
      });
    });
  }

  // Releases the single-session lock when the tab closes/navigates away, so reopening the app
  // right after doesn't get falsely blocked as a "conflicting" session for the stale-after
  // window. Uses fetch+keepalive (not HttpClient) since regular requests can be aborted mid-flight
  // once the page starts unloading; keepalive lets this one survive that.
  private releaseSessionOnUnload = (): void => {
    const token = this.keycloakService.keycloak.token;
    if (!token) return;
    fetch('/api/v1/users/me/session', {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
        'X-Tab-Id': this.keycloakService.tabId
      },
      keepalive: true
    }).catch(() => {
      // best-effort: the tab is closing, nothing to recover from here
    });
  };

  private refreshCurrentUser(): void {
    this.usernameService.getMe().subscribe({
      next: user => {
        this.currentUser = user;
        if (!user.username) {
          this.showUsernameModal = true;
        }
      },
      error: err => console.error('Failed to refresh current user', err)
    });
  }

  onUsernameSet(username: string): void {
    this.showUsernameModal = false;
    if (this.currentUser) {
      this.currentUser = { ...this.currentUser, username };
    }
  }

  openUserCard(userId: string): void {
    this.selectedCardUserId = userId;
  }

  onChatHeaderAvatarClick(): void {
    if (this.selectedChat.type === 'GROUP') {
      this.showGroupMembers = true;
      return;
    }
    const otherId = this.getReceiverId();
    if (otherId) {
      this.openUserCard(otherId);
    }
  }

  openGroupCreate(): void {
    this.showGroupCreate = true;
  }

  closeGroupCreate(): void {
    this.showGroupCreate = false;
  }

  onGroupCreated(chat: ChatResponse): void {
    this.showGroupCreate = false;
    this.chatSelected(chat);
  }

  closeGroupMembers(): void {
    this.showGroupMembers = false;
  }

  onLeftGroup(): void {
    this.showGroupMembers = false;
    const leftChatId = this.selectedChat.id;
    this.chats = this.chats.filter(c => c.id !== leftChatId);
    this.selectedChat = {};
  }

  onChatAccepted(chat: ChatResponse): void {
    if (this.selectedChat.id === chat.id) {
      this.selectedChat.status = 'ACCEPTED';
    }
  }

  onChatRejected(chat: ChatResponse): void {
    this.chats = this.chats.filter(c => c.id !== chat.id);
    if (this.selectedChat.id === chat.id) {
      this.selectedChat = {};
    }
  }

  onChatRequested(chat: ChatResponse): void {
    if (!this.chats.find(c => c.id === chat.id)) {
      this.chats.unshift(chat);
    }
    this.closeUserCard();
  }

  closeUserCard(): void {
    this.selectedCardUserId = null;
  }

  onUserBlocked(blockedUserId: string): void {
    const blockedChat = this.chats.find(c => c.senderId === blockedUserId || c.receiverId === blockedUserId);
    this.chats = this.chats.filter(c => c.senderId !== blockedUserId && c.receiverId !== blockedUserId);
    if (blockedChat && this.selectedChat.id === blockedChat.id) {
      this.selectedChat = {};
    }
  }

  onAvatarChanged(avatarUrl: string | undefined): void {
    if (this.currentUser) {
      this.currentUser = { ...this.currentUser, avatarUrl };
    }
    this.showAvatarUpload = false;
  }

  chatSelected(chatResponse: ChatResponse) {
    this.sendTypingStop();
    this.stopPeerTyping();
    if (!this.chats.find(c => c.id === chatResponse.id)) {
      this.chats.unshift(chatResponse);
    }
    this.showMessageSearch = false;
    this.messageSearchQuery = '';
    this.searchMatchIndices = [];
    this.currentSearchMatchIndex = -1;
    this.activeMessageMenuId = null;
    this.replyingToMessage = null;
    this.editingMessage = null;
    this.reactingToMessageId = null;
    if (this.selectedChat.id) {
      this.draftService.setDraft(this.selectedChat.id, this.messageContent);
    }
    this.selectedChat = chatResponse;
    this.messageContent = this.draftService.getDraft(chatResponse.id as string);
    this.isScrolledUp = false;
    this.forceScrollOnNextCheck = true;
    this.getAllChatMessages(chatResponse.id as string);
    this.setMessagesToSeen();
    this.selectedChat.unreadCount = 0;
  }

  onReportBug(): void {
    const adminChat = this.chats.find(c => c.adminChat);
    if (adminChat) {
      this.openReportBugChat(adminChat);
      return;
    }
    // No admin chat locally yet — either this account onboarded before the
    // feature existed (lazily backfilled here) or it's genuinely disabled
    // (ADMIN_USER_ID unset backend-side), in which case this 404s.
    const context = new HttpContext().set(SILENT_ERROR, true);
    this.supportService.getOrCreateReportBugChat(undefined, context).subscribe({
      next: chat => {
        if (chat.id && !this.chats.some(c => c.id === chat.id)) {
          this.chats = [chat, ...this.chats];
        }
        this.openReportBugChat(chat);
      },
      error: () => {
        this.showSettings = false;
        alert(this.i18n.translate('main.bug.unavailable'));
      }
    });
  }

  private openReportBugChat(chat: ChatResponse): void {
    this.chatSelected(chat);
    this.messageContent = this.i18n.translate('main.bug.prefix');
    this.showSettings = false;
  }

  isSelfMessage(message: MessageResponse): boolean {
    return message.senderId === this.keycloakService.userId;
  }

  sendMessage() {
    if (this.messageContent) {
      const replyToId = this.replyingToMessage?.id;
      const messageRequest: MessageRequest = {
        chatId: this.selectedChat.id as string,
        content: this.messageContent,
        type: 'TEXT',
        replyToId
      };
      this.messageService.saveMessage({
        body: messageRequest
      }).subscribe({
        next: (response) => {
          const message: MessageResponse = {
            id: response.id,
            senderId: this.getSenderId(),
            receiverId: this.getReceiverId(),
            content: this.messageContent,
            type: 'TEXT',
            state: 'SENT',
            replyToId,
            createdAt: new Date().toString()
          };
          this.selectedChat.lastMessage = this.messageContent;
          this.chatMessages.push(message);
          this.isScrolledUp = false;
          this.forceScrollOnNextCheck = true;
          this.messageContent = '';
          this.replyingToMessage = null;
          if (this.selectedChat.id) {
            this.draftService.clearDraft(this.selectedChat.id);
          }
          this.showEmojis = false;
          if (this.isChatPending() && this.isRequester()) {
            this.selectedChat.pendingMessageCount = (this.selectedChat.pendingMessageCount ?? 0) + 1;
          }
          if (this.getReceiverId() === ARNO_USER_ID) {
            this.startArnoTyping(this.selectedChat.id as string);
          } else {
            this.sendTypingStop();
          }
        }
      });
    }
  }

  onMessageInput(): void {
    if (!this.selectedChat.id || this.getReceiverId() === ARNO_USER_ID) {
      return;
    }
    this.sendTypingStart();
    if (this.typingStopTimeout !== null) {
      clearTimeout(this.typingStopTimeout);
    }
    this.typingStopTimeout = setTimeout(() => this.sendTypingStop(), TYPING_STOP_DEBOUNCE_MS);
  }

  private sendTypingStart(): void {
    const now = Date.now();
    if (this.typingActive && now - this.lastTypingSentAt < TYPING_SEND_THROTTLE_MS) {
      return;
    }
    this.typingActive = true;
    this.lastTypingSentAt = now;
    this.publishTyping(true);
  }

  private sendTypingStop(): void {
    if (this.typingStopTimeout !== null) {
      clearTimeout(this.typingStopTimeout);
      this.typingStopTimeout = null;
    }
    if (!this.typingActive) {
      return;
    }
    this.typingActive = false;
    this.publishTyping(false);
  }

  private publishTyping(typing: boolean): void {
    if (!this.socketClient?.connected || !this.selectedChat.id) {
      return;
    }
    this.socketClient.publish({
      destination: '/app/chat.typing',
      body: JSON.stringify({
        chatId: this.selectedChat.id,
        receiverId: this.getReceiverId(),
        typing
      })
    });
  }

  private startArnoTyping(chatId: string): void {
    this.peerTypingChatId = chatId;
    if (this.peerTypingTimeout !== null) {
      clearTimeout(this.peerTypingTimeout);
    }
    this.peerTypingTimeout = setTimeout(() => {
      this.ngZone.run(() => this.stopPeerTyping());
    }, ARNO_TYPING_TIMEOUT_MS);
  }

  private handlePeerTyping(notification: Notification): void {
    if (this.selectedChat?.id !== notification.chatId) {
      return;
    }
    if (notification.type === 'TYPING_START') {
      this.peerTypingChatId = notification.chatId ?? null;
      if (this.peerTypingTimeout !== null) {
        clearTimeout(this.peerTypingTimeout);
      }
      this.peerTypingTimeout = setTimeout(() => {
        this.ngZone.run(() => this.stopPeerTyping());
      }, PEER_TYPING_SAFETY_TIMEOUT_MS);
    } else {
      this.stopPeerTyping();
    }
  }

  private stopPeerTyping(): void {
    this.peerTypingChatId = null;
    if (this.peerTypingTimeout !== null) {
      clearTimeout(this.peerTypingTimeout);
      this.peerTypingTimeout = null;
    }
  }

  keyDown(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      this.sendMessage();
    }
  }

  onSelectEmojis(emojiSelected: any) {
    const emoji: EmojiData = emojiSelected.emoji;
    this.messageContent += emoji.native;
  }

  // Blurring the text input dismisses the native mobile keyboard before the custom
  // picker opens — without this, the OS keyboard stays up behind the panel, doubling
  // the space needed at the bottom of the screen and squeezing/overlapping both.
  toggleEmojiPicker(messageInput: HTMLInputElement): void {
    const opening = !this.showEmojis;
    this.showEmojis = opening;
    if (opening) {
      messageInput.blur();
    }
  }

  onClick() {
    this.setMessagesToSeen();
  }

  // Legacy pre-R2-migration messages store the media as raw base64 with no mime info
  // (backend FileUtils.resolveMedia); mp3 was the only audio extension ever accepted back
  // then, so audio/mpeg is a well-grounded default rather than a guess.
  private static readonly LEGACY_BASE64_MIME_BY_TYPE: Record<string, string> = {
    IMAGE: 'image/jpeg',
    VIDEO: 'video/mp4',
    AUDIO: 'audio/mpeg',
  };

  mediaSrc(media: string, type?: MessageResponse['type']): string {
    if (media.startsWith('http') || media.startsWith('blob:')) return media;
    const mime = (type && MainComponent.LEGACY_BASE64_MIME_BY_TYPE[type]) || 'image/jpeg';
    return `data:${mime};base64,${media}`;
  }

  openLightbox(message: MessageResponse): void {
    if (!message.media?.[0] || (message.type !== 'IMAGE' && message.type !== 'VIDEO')) return;
    this.lightboxMedia = { url: this.mediaSrc(message.media[0], message.type), type: message.type };
  }

  closeLightbox(): void {
    this.lightboxMedia = null;
  }

  toggleMessageMenu(id: number | undefined): void {
    if (id === undefined) return;
    this.activeMessageMenuId = this.activeMessageMenuId === id ? null : id;
  }

  onMessageRightClick(event: MouseEvent, message: MessageResponse): void {
    event.preventDefault();
    if (message.deleted || message.id === undefined) return;
    this.activeMessageMenuId = message.id;
  }

  // The compose emoji-mart's wrapper stops its own clicks from bubbling here (so
  // picking multiple emoji in a row doesn't close it) — only a genuine outside click
  // reaches this handler, so it's safe to also close showEmojis unconditionally.
  @HostListener('document:click')
  closeReactionPickerOnOutsideClick(): void {
    this.reactingToMessageId = null;
    this.showEmojis = false;
  }

  findMessageById(id: number | undefined): MessageResponse | undefined {
    if (id === undefined) return undefined;
    return this.chatMessages.find(m => m.id === id);
  }

  startReply(message: MessageResponse): void {
    this.replyingToMessage = message;
  }

  cancelReply(): void {
    this.replyingToMessage = null;
  }

  startForward(message: MessageResponse): void {
    this.forwardingMessage = message;
  }

  cancelForward(): void {
    this.forwardingMessage = null;
  }

  confirmForward(targetChat: ChatResponse): void {
    const message = this.forwardingMessage;
    if (!message || !targetChat.id || message.type !== 'TEXT') {
      this.forwardingMessage = null;
      return;
    }
    const messageRequest: MessageRequest = {
      chatId: targetChat.id,
      content: message.content ?? '',
      type: 'TEXT',
      forwarded: true
    };
    this.messageService.saveMessage({ body: messageRequest }).subscribe({
      next: (response) => {
        targetChat.lastMessage = messageRequest.content;
        targetChat.lastMessageTime = new Date().toString();
        if (this.selectedChat.id === targetChat.id) {
          this.chatMessages.push({
            id: response.id,
            senderId: this.getSenderId(targetChat),
            receiverId: this.getReceiverId(targetChat),
            content: messageRequest.content,
            type: 'TEXT',
            state: 'SENT',
            forwarded: true,
            createdAt: new Date().toString()
          });
          this.isScrolledUp = false;
          this.forceScrollOnNextCheck = true;
        }
      }
    });
    this.forwardingMessage = null;
  }

  copyMessageText(message: MessageResponse): void {
    if (message.type !== 'TEXT' || !message.content) return;
    navigator.clipboard?.writeText(message.content).catch(() => undefined);
  }

  startEdit(message: MessageResponse): void {
    if (message.type !== 'TEXT') return;
    this.editingMessage = message;
    this.editContent = message.content ?? '';
  }

  cancelEdit(): void {
    this.editingMessage = null;
    this.editContent = '';
  }

  openReactionPicker(messageId: number | undefined): void {
    if (messageId === undefined) return;
    this.reactingToMessageId = this.reactingToMessageId === messageId ? null : messageId;
  }

  onReactionSelected(message: MessageResponse, emojiSelected: any): void {
    this.reactingToMessageId = null;
    if (!message.id) return;
    const emoji: EmojiData = emojiSelected.emoji;
    if (!emoji.native) return;
    const messageId = message.id;
    this.messageService.toggleReaction({
      messageId,
      body: { emoji: emoji.native }
    }).subscribe({
      next: (response) => {
        const target = this.findMessageById(messageId);
        if (target) {
          target.reactions = response.reactions;
        }
      }
    });
  }

  onToggleStar(message: MessageResponse): void {
    if (!message.id) return;
    const messageId = message.id;
    this.messageService.toggleStar({ messageId }).subscribe({
      next: (response) => {
        const target = this.findMessageById(messageId);
        if (target) {
          target.starred = response.starred;
        }
      }
    });
  }

  confirmDelete(message: MessageResponse): void {
    if (!message.id || message.deleted) return;
    if (!window.confirm(this.i18n.translate('main.confirmDelete'))) return;
    const messageId = message.id;
    message.deleted = true;
    message.content = undefined;
    message.media = undefined;
    this.messageService.deleteMessage({ messageId }).subscribe();
  }

  confirmEdit(): void {
    const messageId = this.editingMessage?.id;
    if (messageId === undefined || !this.editContent.trim()) return;
    this.messageService.editMessage({
      messageId,
      body: { content: this.editContent }
    }).subscribe({
      next: (response) => {
        const target = this.findMessageById(messageId);
        if (target) {
          target.content = response.content;
          target.editedAt = response.editedAt;
        }
        this.cancelEdit();
      }
    });
  }

  private mediaTypeFromFileName(fileName: string): 'IMAGE' | 'VIDEO' | 'AUDIO' {
    const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
    if (['mp4', 'mov'].includes(extension)) {
      return 'VIDEO';
    }
    if (['mp3', 'wav', 'ogg', 'm4a', 'webm'].includes(extension)) {
      return 'AUDIO';
    }
    return 'IMAGE';
  }

  private mediaSentBody(type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | undefined): string {
    switch (type) {
      case 'VIDEO': return this.i18n.translate('notifications.sentVideo');
      case 'AUDIO': return this.i18n.translate('notifications.sentVoice');
      default: return this.i18n.translate('notifications.sentPhoto');
    }
  }

  private mediaLabelForType(type: 'TEXT' | 'IMAGE' | 'VIDEO' | 'AUDIO' | undefined): string {
    switch (type) {
      case 'VIDEO': return this.i18n.translate('media.video');
      case 'AUDIO': return this.i18n.translate('media.voice');
      default: return this.i18n.translate('media.photo');
    }
  }

  private isMediaNotificationType(type: Notification['type']): boolean {
    return type === 'IMAGE' || type === 'VIDEO' || type === 'AUDIO';
  }

  uploadMedia(target: EventTarget | null) {
    const file = this.extractFileFromTarget(target);
    if (file === null) return;
    const mediaType = this.mediaTypeFromFileName(file.name);
    // A blob: URL just references the existing File in memory — unlike FileReader.readAsDataURL,
    // it doesn't duplicate a multi-MB video/image into a base64 string, which on mobile Safari's
    // tighter per-tab memory limits could silently crash the tab with no catchable JS error.
    const previewUrl = URL.createObjectURL(file);
    this.messageService.uploadMedia({
      'chat-id': this.selectedChat.id as string,
      body: {
        file: file
      }
    }).subscribe({
      next: (response) => {
        const message: MessageResponse = {
          id: response.id,
          senderId: this.getSenderId(),
          receiverId: this.getReceiverId(),
          content: this.mediaLabelForType(mediaType),
          type: mediaType,
          state: 'SENT',
          media: [previewUrl],
          createdAt: new Date().toString()
        };
        this.chatMessages.push(message);
        this.isScrolledUp = false;
        this.forceScrollOnNextCheck = true;
      },
      error: () => {
        URL.revokeObjectURL(previewUrl);
      }
    });
  }

  async startRecording(): Promise<void> {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({audio: true});
      const mimeType = MediaRecorder.isTypeSupported('audio/webm')
        ? 'audio/webm'
        : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
      this.mediaRecorder = mimeType ? new MediaRecorder(stream, {mimeType}) : new MediaRecorder(stream);
      this.recordedChunks = [];
      this.mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          this.recordedChunks.push(e.data);
        }
      };
      this.mediaRecorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        this.recordedBlob = new Blob(this.recordedChunks, {type: this.mediaRecorder!.mimeType});
        this.recordedPreviewUrl = URL.createObjectURL(this.recordedBlob);
        this.ngZone.run(() => this.recordingState = 'preview');
      };
      this.mediaRecorder.start();
      this.recordingState = 'recording';
      this.recordingElapsedSeconds = 0;
      this.recordingTimerHandle = setInterval(() => {
        this.ngZone.run(() => {
          this.recordingElapsedSeconds++;
          if (this.recordingElapsedSeconds >= MainComponent.MAX_RECORDING_SECONDS) {
            this.stopRecording();
          }
        });
      }, 1000);
    } catch (err) {
      // permesso negato o device non disponibile: resta in idle, nessun crash —
      // ma logga il motivo, altrimenti dal telefono (senza devtools) sembra solo rotto
      this.errorLogService.report({
        source: 'client',
        message: this.i18n.translate('errors.recordingNotStarted', { error: (err as Error)?.message ?? String(err) })
      });
    }
  }

  stopRecording(): void {
    if (this.recordingTimerHandle !== null) {
      clearInterval(this.recordingTimerHandle);
      this.recordingTimerHandle = null;
    }
    this.mediaRecorder?.stop();
  }

  cancelRecording(): void {
    if (this.recordingTimerHandle !== null) {
      clearInterval(this.recordingTimerHandle);
      this.recordingTimerHandle = null;
    }
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
      this.mediaRecorder.onstop = () => {
        this.mediaRecorder!.stream?.getTracks().forEach(t => t.stop());
      };
      this.mediaRecorder.stop();
    }
    this.recordedChunks = [];
    this.recordingState = 'idle';
  }

  discardRecording(): void {
    if (this.recordedPreviewUrl) {
      URL.revokeObjectURL(this.recordedPreviewUrl);
    }
    this.recordedBlob = null;
    this.recordedPreviewUrl = null;
    this.recordingState = 'idle';
  }

  recordingElapsedLabel(): string {
    const mins = Math.floor(this.recordingElapsedSeconds / 60);
    const secs = this.recordingElapsedSeconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }

  sendRecordedVoiceNote(): void {
    if (!this.recordedBlob) return;
    this.recordingState = 'sending';
    const extension = this.recordedBlob.type.includes('mp4') ? 'm4a' : 'webm';
    const file = new File([this.recordedBlob], `voice-note-${Date.now()}.${extension}`, {type: this.recordedBlob.type});
    this.messageService.uploadMedia({
      'chat-id': this.selectedChat.id as string,
      'media-type': 'AUDIO',
      body: {file}
    }).subscribe({
      next: (response) => {
        const message: MessageResponse = {
          id: response.id,
          senderId: this.getSenderId(),
          receiverId: this.getReceiverId(),
          content: this.mediaLabelForType('AUDIO'),
          type: 'AUDIO',
          state: 'SENT',
          media: [URL.createObjectURL(file)],
          createdAt: new Date().toString()
        };
        this.chatMessages.push(message);
        this.isScrolledUp = false;
        this.forceScrollOnNextCheck = true;
        this.discardRecording();
      },
      error: () => {
        this.recordingState = 'preview';
      }
    });
  }

  confirmAge() {
    localStorage.setItem('ageVerified', '1');
    this.ageVerified = true;
  }

  denyAge() {
    this.ageDenied = true;
  }

  dismissBanner() {
    sessionStorage.setItem('demoBannerDismissed', '1');
    this.showDemoBanner = false;
  }

  logout() {
    this.draftService.clearAll();
    this.keycloakService.logout();
  }

  userProfile() {
    this.keycloakService.accountManagement();
  }

  private setMessagesToSeen() {
    if (!this.selectedChat.id) return;
    this.messageService.setMessageToSeen({
      'chat-id': this.selectedChat.id as string
    }).subscribe({
      next: () => {
      }
    });
  }

  private getAllChats() {
    this.chatService.getChatsByReceiver()
      .subscribe({
        next: (res) => {
          this.chats = res;
        }
      });
  }

  private getAllChatMessages(chatId: string) {
    this.messageService.getAllMessages({
      'chat-id': chatId
    }).subscribe({
      next: (messages) => {
        this.chatMessages = messages;
      }
    });
  }

  private initWebSocket() {
    if (!this.keycloakService.keycloak.tokenParsed?.sub) return;
    // No userId in the path: Spring's DefaultUserDestinationResolver scopes "/user/**"
    // destinations to the current STOMP session's Principal automatically. Embedding the
    // userId here (as this used to do) breaks the SUBSCRIBE-side destination resolution —
    // it only strips the "/user" prefix for SUBSCRIBE frames, unlike the SEND side, so the
    // physical broker destination ends up different and no delivery ever happens.
    const subUrl = '/user/queue/chat';
    this.socketClient = new Client({
      webSocketFactory: () => new SockJS(`${window.location.origin}/ws`) as any,
      // connectHeaders is captured once at CONNECT time (including every automatic
      // reconnect), not just at Client construction — without refreshing the token here,
      // a STOMP reconnect after the access token expires (accessTokenLifespan, 5 min) keeps
      // resending the same stale JWT forever, so delivery silently dies until the page is
      // reloaded (which rebuilds the Client with a fresh token).
      beforeConnect: async () => {
        await this.keycloakService.keycloak.updateToken(30).catch(() => undefined);
        this.socketClient!.connectHeaders = {
          'Authorization': 'Bearer ' + this.keycloakService.keycloak.token,
          'X-Tab-Id': this.keycloakService.tabId
        };
      },
      reconnectDelay: 5000,
      onConnect: () => {
        this.notificationSubscription = this.socketClient!.subscribe(
          subUrl,
          (message: IMessage) => {
            const notification: Notification = JSON.parse(message.body);
            this.handleNotification(notification);
          }
        );
        this.callSignalSubscription = this.socketClient!.subscribe(
          '/user/queue/call',
          (message: IMessage) => {
            const signal: CallSignal = JSON.parse(message.body);
            this.ngZone.run(() => this.handleCallSignal(signal));
          }
        );
      },
      onStompError: (frame) => console.error('WebSocket error:', frame)
    });
    this.socketClient.activate();
  }

  private handleNotification(notification: Notification) {
    if (!notification) return;
    this.ngZone.run(() => {
      if (notification.type === 'AVATAR_UPDATED') {
        this.applyAvatarUpdate(notification);
        return;
      }
      if (notification.type === 'TYPING_START' || notification.type === 'TYPING_STOP') {
        this.handlePeerTyping(notification);
        return;
      }
      if (notification.type === 'CHAT_REQUEST') {
        this.handleChatRequest(notification);
        return;
      }
      if (notification.type === 'GROUP_ADDED') {
        this.handleGroupAdded(notification);
        return;
      }
      if (notification.type === 'CHAT_REQUEST_ACCEPTED') {
        this.handleChatRequestAccepted(notification);
        return;
      }
      if (notification.type === 'CHAT_REQUEST_REJECTED') {
        this.handleChatRequestRejected(notification);
        return;
      }
      if (notification.type === 'MESSAGE_EDITED') {
        this.handleMessageEdited(notification);
        return;
      }
      if (notification.type === 'MESSAGE_DELETED') {
        this.handleMessageDeleted(notification);
        return;
      }
      if (notification.type === 'REACTION_ADDED' || notification.type === 'REACTION_REMOVED') {
        this.handleReactionEvent(notification, notification.type === 'REACTION_ADDED');
        return;
      }
      if (notification.type === 'MESSAGE' || this.isMediaNotificationType(notification.type)) {
        this.maybeShowDesktopNotification(notification);
      }
      if (notification.chatId === this.peerTypingChatId) {
        this.stopPeerTyping();
      }
      if (this.selectedChat && this.selectedChat.id === notification.chatId) {
        if (notification.type === 'MESSAGE' || this.isMediaNotificationType(notification.type)) {
          const message: MessageResponse = {
            id: notification.messageId,
            senderId: notification.senderId,
            receiverId: notification.receiverId,
            content: notification.content,
            type: notification.messageType,
            media: notification.media,
            replyToId: notification.replyToId,
            forwarded: notification.forwarded,
            createdAt: new Date().toString()
          };
          if (this.isMediaNotificationType(notification.type)) {
            this.selectedChat.lastMessage = this.mediaLabelForType(notification.messageType);
          } else {
            this.selectedChat.lastMessage = notification.content;
          }
          this.chatMessages.push(message);
        } else if (notification.type === 'SEEN') {
          this.chatMessages.forEach(m => m.state = 'SEEN');
        }
      } else {
        const destChat = this.chats.find(c => c.id === notification.chatId);
        if (destChat && notification.type !== 'SEEN') {
          if (notification.type === 'MESSAGE') {
            destChat.lastMessage = notification.content;
          } else if (this.isMediaNotificationType(notification.type)) {
            destChat.lastMessage = this.mediaLabelForType(notification.messageType);
          }
          destChat.lastMessageTime = new Date().toString();
          destChat.unreadCount! += 1;
        } else if (notification.type === 'MESSAGE') {
          const newChat: ChatResponse = {
            id: notification.chatId,
            senderId: notification.senderId,
            receiverId: notification.receiverId,
            lastMessage: notification.content,
            name: notification.chatName,
            unreadCount: 1,
            lastMessageTime: new Date().toString()
          };
          this.chats.unshift(newChat);
        }
      }
    });
  }

  private maybeShowDesktopNotification(notification: Notification): void {
    if (this.muteService.isMuted(notification.chatId)) return;
    const chatIsOpenAndFocused = document.hasFocus() && this.selectedChat?.id === notification.chatId;
    if (chatIsOpenAndFocused) return;

    const title = notification.chatName || this.i18n.translate('notifications.newMessage');
    const body = this.isMediaNotificationType(notification.type)
      ? this.mediaSentBody(notification.messageType)
      : this.i18n.renderContent(notification.content);
    const chatId = notification.chatId;
    this.browserNotifications.notify(title, body, () => {
      this.ngZone.run(() => {
        const chat = this.chats.find(c => c.id === chatId);
        if (chat) {
          this.chatSelected(chat);
        }
      });
    });
  }

  private applyAvatarUpdate(notification: Notification): void {
    const partnerId = notification.senderId;
    if (!partnerId) return;
    if (this.selectedChat && (this.selectedChat.senderId === partnerId || this.selectedChat.receiverId === partnerId)) {
      this.selectedChat.avatarUrl = notification.avatarUrl;
    }
    const destChat = this.chats.find(c => c.senderId === partnerId || c.receiverId === partnerId);
    if (destChat) {
      destChat.avatarUrl = notification.avatarUrl;
    }
  }

  private handleChatRequest(notification: Notification): void {
    if (this.chats.find(c => c.id === notification.chatId)) return;
    const newChat: ChatResponse = {
      id: notification.chatId,
      senderId: notification.senderId,
      receiverId: notification.receiverId,
      name: notification.chatName,
      status: 'PENDING',
      pendingMessageCount: 0,
      unreadCount: 0
    };
    this.chats.unshift(newChat);
    this.browserNotifications.notify(
      notification.chatName || this.i18n.translate('notifications.newRequest'),
      this.i18n.translate('notifications.wantsToChat'),
      () => this.ngZone.run(() => {
        const chat = this.chats.find(c => c.id === notification.chatId);
        if (chat) this.chatSelected(chat);
      })
    );
  }

  // Refetches the whole chat list rather than synthesizing a ChatResponse locally —
  // group chats carry members/role/type fields a hand-built object would have to guess at,
  // and this notification is rare enough (group created/joined) that the extra round-trip
  // doesn't matter.
  private handleGroupAdded(notification: Notification): void {
    this.getAllChats();
    this.browserNotifications.notify(
      notification.chatName || this.i18n.translate('notifications.newGroup'),
      this.i18n.translate('notifications.addedToGroup'),
      () => this.ngZone.run(() => {
        const chat = this.chats.find(c => c.id === notification.chatId);
        if (chat) this.chatSelected(chat);
      })
    );
  }

  private handleChatRequestAccepted(notification: Notification): void {
    const chat = this.chats.find(c => c.id === notification.chatId);
    if (chat) chat.status = 'ACCEPTED';
    if (this.selectedChat?.id === notification.chatId) {
      this.selectedChat.status = 'ACCEPTED';
    }
  }

  private handleMessageEdited(notification: Notification): void {
    const target = this.chatMessages.find(m => m.id === notification.messageId);
    if (target) {
      target.content = notification.content;
      target.editedAt = new Date().toString();
    }
  }

  private handleMessageDeleted(notification: Notification): void {
    const target = this.chatMessages.find(m => m.id === notification.messageId);
    if (target) {
      target.deleted = true;
      target.content = undefined;
      target.media = undefined;
    }
  }

  // Delta-patches the aggregate reaction counts from a peer's WS event, without a full
  // reload. The pusher is always the *other* participant relative to whoever reacted, so
  // reactedByMe is never flipped here — only count. Known limitation: when the reactor
  // switches from one emoji to another, the backend sends a single REACTION_ADDED for the
  // new emoji only (no matching REMOVED for the old one, since aggregate summaries carry no
  // per-user breakdown to the peer) — the old emoji's count can look stale here until the
  // chat is reloaded (findChatMessages always recomputes reactions from the DB, so a reload
  // self-heals it).
  private handleReactionEvent(notification: Notification, added: boolean): void {
    const target = this.chatMessages.find(m => m.id === notification.messageId);
    if (!target || !notification.reactionEmoji) return;
    const reactions = target.reactions ? target.reactions.map(r => ({ ...r })) : [];
    const index = reactions.findIndex(r => r.emoji === notification.reactionEmoji);
    if (added) {
      if (index >= 0) {
        reactions[index].count = (reactions[index].count ?? 0) + 1;
      } else {
        reactions.push({ emoji: notification.reactionEmoji, count: 1, reactedByMe: false });
      }
    } else if (index >= 0) {
      const newCount = (reactions[index].count ?? 1) - 1;
      if (newCount <= 0) {
        reactions.splice(index, 1);
      } else {
        reactions[index].count = newCount;
      }
    }
    target.reactions = reactions;
  }

  private handleChatRequestRejected(notification: Notification): void {
    this.chats = this.chats.filter(c => c.id !== notification.chatId);
    if (this.selectedChat?.id === notification.chatId) {
      this.selectedChat = {};
    }
  }

  isChatPending(): boolean {
    return this.selectedChat.status === 'PENDING';
  }

  isChatRejected(): boolean {
    return this.selectedChat.status === 'REJECTED';
  }

  isRequester(): boolean {
    return this.selectedChat.senderId === this.keycloakService.userId;
  }

  pendingLimitReached(): boolean {
    return (this.selectedChat.pendingMessageCount ?? 0) >= MAX_PENDING_MESSAGES;
  }

  acceptSelectedChat(): void {
    this.chatService.acceptChat({ chatId: this.selectedChat.id as string }).subscribe({
      next: () => {
        this.selectedChat.status = 'ACCEPTED';
        const chat = this.chats.find(c => c.id === this.selectedChat.id);
        if (chat) chat.status = 'ACCEPTED';
      }
    });
  }

  goBack(): void {
    this.selectedChat = {};
  }

  rejectSelectedChat(): void {
    const chatId = this.selectedChat.id;
    this.chatService.rejectChat({ chatId: chatId as string }).subscribe({
      next: () => {
        this.chats = this.chats.filter(c => c.id !== chatId);
        this.selectedChat = {};
      }
    });
  }

  private getSenderId(chat: ChatResponse = this.selectedChat): string {
    if (chat.type === 'GROUP') {
      return this.keycloakService.userId as string;
    }
    if (chat.senderId === this.keycloakService.userId) {
      return chat.senderId as string;
    }
    return chat.receiverId as string;
  }

  /** A GROUP chat has no single "other participant" — returns undefined for those. */
  getReceiverId(chat: ChatResponse = this.selectedChat): string | undefined {
    if (chat.type === 'GROUP') {
      return undefined;
    }
    if (chat.senderId === this.keycloakService.userId) {
      return chat.receiverId;
    }
    return chat.senderId;
  }

  private scrollToBottom() {
    // Skip while an in-conversation search has an active match: a scroll-to-match
    // (see jumpToNextMatch/jumpToPreviousMatch) would otherwise be undone on the very
    // next change-detection cycle (e.g. the next keystroke), since this method runs
    // unconditionally on every ngAfterViewChecked.
    if (this.showMessageSearch && this.searchMatchIndices.length > 0) {
      return;
    }
    if (!this.scrollableDiv) return;
    // Once the user has scrolled up to read history, don't yank them back to the
    // bottom on every change-detection cycle (e.g. the typing-indicator animating) —
    // except right after their own message send, which forces the scroll regardless.
    if (this.isScrolledUp && !this.forceScrollOnNextCheck) {
      return;
    }
    const div = this.scrollableDiv.nativeElement;
    div.scrollTop = div.scrollHeight;
    this.forceScrollOnNextCheck = false;
  }

  onMessagesScroll(): void {
    if (!this.scrollableDiv) return;
    const div = this.scrollableDiv.nativeElement;
    const distanceFromBottom = div.scrollHeight - div.scrollTop - div.clientHeight;
    this.isScrolledUp = distanceFromBottom > SCROLL_THRESHOLD_PX;
  }

  jumpToLatest(): void {
    this.isScrolledUp = false;
    this.forceScrollOnNextCheck = true;
    this.scrollToBottom();
  }

  private isSameDay(a: Date, b: Date): boolean {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  shouldShowDateSeparator(index: number): boolean {
    if (index === 0) return true;
    const current = this.chatMessages[index]?.createdAt;
    const previous = this.chatMessages[index - 1]?.createdAt;
    if (!current || !previous) return false;
    return !this.isSameDay(new Date(current), new Date(previous));
  }

  dateSeparatorLabel(index: number): string {
    const dateStr = this.chatMessages[index]?.createdAt;
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const today = new Date();
    if (this.isSameDay(date, today)) return this.i18n.translate('main.dates.today');
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);
    if (this.isSameDay(date, yesterday)) return this.i18n.translate('main.dates.yesterday');
    return new Intl.DateTimeFormat(this.i18n.intlLocale, { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }

  toggleMessageSearch(): void {
    this.showMessageSearch = !this.showMessageSearch;
    if (!this.showMessageSearch) {
      this.messageSearchQuery = '';
      this.searchMatchIndices = [];
      this.currentSearchMatchIndex = -1;
    }
  }

  onMessageSearchInput(): void {
    const query = this.messageSearchQuery.trim().toLowerCase();
    if (!query) {
      this.searchMatchIndices = [];
      this.currentSearchMatchIndex = -1;
      return;
    }
    this.searchMatchIndices = this.chatMessages
      .map((message, index) => ({message, index}))
      .filter(({message}) => message.type === 'TEXT' && (message.content ?? '').toLowerCase().includes(query))
      .map(({index}) => index);
    this.currentSearchMatchIndex = this.searchMatchIndices.length > 0 ? 0 : -1;
    this.scrollToCurrentMatch();
  }

  jumpToNextMatch(): void {
    if (this.searchMatchIndices.length === 0) return;
    this.currentSearchMatchIndex = (this.currentSearchMatchIndex + 1) % this.searchMatchIndices.length;
    this.scrollToCurrentMatch();
  }

  jumpToPreviousMatch(): void {
    if (this.searchMatchIndices.length === 0) return;
    this.currentSearchMatchIndex =
      (this.currentSearchMatchIndex - 1 + this.searchMatchIndices.length) % this.searchMatchIndices.length;
    this.scrollToCurrentMatch();
  }

  isMessageSearchMatch(index: number): boolean {
    return this.searchMatchIndices.includes(index);
  }

  isCurrentSearchMatch(index: number): boolean {
    return this.searchMatchIndices[this.currentSearchMatchIndex] === index;
  }

  private scrollToCurrentMatch(): void {
    if (this.currentSearchMatchIndex < 0 || !this.scrollableDiv) return;
    const messageIndex = this.searchMatchIndices[this.currentSearchMatchIndex];
    const el = this.scrollableDiv.nativeElement.querySelector(`[data-msg-index="${messageIndex}"]`);
    el?.scrollIntoView({behavior: 'smooth', block: 'center'});
  }

  private extractFileFromTarget(target: EventTarget | null): File | null {
    const htmlInputTarget = target as HTMLInputElement;
    if (target === null || htmlInputTarget.files === null) {
      return null;
    }
    return htmlInputTarget.files[0];
  }

  canCall(): boolean {
    return this.callState === 'idle' && this.selectedChat.status === 'ACCEPTED';
  }

  // The call overlay (z-index 10001) sits above any per-message picker (menu/reply/
  // forward/edit/reaction, all z-index <= 200) without closing them — so if one was
  // left open when a call starts (especially an incoming call, which arrives over the
  // WebSocket with no click to close it), it stays open hidden underneath and pops
  // back into view once the overlay is removed at call end. Close them all up front.
  private closeMessageOverlays(): void {
    this.activeMessageMenuId = null;
    this.replyingToMessage = null;
    this.forwardingMessage = null;
    this.editingMessage = null;
    this.editContent = '';
    this.reactingToMessageId = null;
    this.showEmojis = false;
  }

  startCall(callType: 'AUDIO' | 'VIDEO'): void {
    if (!this.canCall() || !this.selectedChat.id) return;
    if (this.selectedChat.type === 'GROUP') {
      this.pendingGroupCallType = callType;
      this.showCallInviteePicker = true;
      return;
    }
    const peerId = this.getReceiverId() as string;
    void this.beginOutgoingCall(callType, [{
      userId: peerId,
      name: this.selectedChat.name ?? null,
      avatarUrl: this.selectedChat.avatarUrl ?? null
    }]);
  }

  closeCallInviteePicker(): void {
    this.showCallInviteePicker = false;
  }

  onGroupCallInviteesSelected(members: GroupMemberResponse[]): void {
    this.showCallInviteePicker = false;
    if (members.length === 0) return;
    void this.beginOutgoingCall(this.pendingGroupCallType, members.map(m => ({
      userId: m.userId as string,
      name: m.name ?? null,
      avatarUrl: m.avatarUrl ?? null
    })));
  }

  private async beginOutgoingCall(
    callType: 'AUDIO' | 'VIDEO',
    invitees: { userId: string; name: string | null; avatarUrl: string | null }[]
  ): Promise<void> {
    this.closeMessageOverlays();
    const chatId = this.selectedChat.id as string;
    this.activeCallChatId = chatId;
    this.activeCallType = callType;
    this.callParticipants = invitees.map(p => ({ ...p, status: 'ringing' }));
    this.callState = 'outgoing';
    try {
      const offers = await Promise.all(invitees.map(async p => ({
        peerId: p.userId,
        sdpOffer: await this.webRtcCallService.createOfferFor(p.userId, callType)
      })));
      const fromUserName = this.currentUser?.username ?? this.keycloakService.fullName;
      this.callApiService.invite(chatId, offers, callType, fromUserName).subscribe({
        next: () => this.ngZone.run(() => this.confirmCallSession()),
        error: (err) => {
          console.error('[call] invite request failed', err);
          this.endCallLocally();
        }
      });
    } catch (err) {
      // getUserMedia denied or unavailable: stay out of the call, no crash
      console.error('[call] getUserMedia/createOfferFor failed', err);
      this.endCallLocally();
    }
  }

  acceptCall(): void {
    if (this.callState !== 'incoming' || !this.activeCallChatId || !this.pendingOfferSdp || this.callParticipants.length !== 1) return;
    const chatId = this.activeCallChatId;
    const offerSdp = this.pendingOfferSdp;
    const callerId = this.callParticipants[0].userId;
    this.webRtcCallService.createAnswerFor(callerId, this.activeCallType, offerSdp).then(sdpAnswer => {
      this.callApiService.answer(chatId, sdpAnswer).subscribe({
        next: () => this.ngZone.run(() => {
          this.markParticipantJoined(callerId);
          this.callState = 'in-call';
        }),
        error: (err) => this.ngZone.run(() => {
          console.error('[call] answer request failed', err);
          this.endCallLocally();
        })
      });
    }).catch(err => this.ngZone.run(() => {
      console.error('[call] getUserMedia/createAnswerFor failed', err);
      this.endCallLocally();
    }));
  }

  rejectCall(): void {
    if (this.callState !== 'incoming' || !this.activeCallChatId) return;
    this.callApiService.end(this.activeCallChatId, 'REJECT').subscribe();
    this.endCallLocally();
  }

  hangUp(): void {
    if (!this.activeCallChatId) return;
    this.callApiService.end(this.activeCallChatId, 'HANGUP').subscribe();
    this.endCallLocally();
  }

  private markParticipantJoined(peerId: string): void {
    this.callParticipants = this.callParticipants.map(p => p.userId === peerId ? { ...p, status: 'joined' } : p);
  }

  private addOrJoinParticipant(peerId: string): void {
    if (this.callParticipants.some(p => p.userId === peerId)) {
      this.markParticipantJoined(peerId);
      return;
    }
    const { name, avatarUrl } = this.resolveCallParticipantIdentity(peerId);
    this.callParticipants = [...this.callParticipants, { userId: peerId, name, avatarUrl, status: 'joined' }];
  }

  // Best-effort: a group call's other participants are only ever learned about via
  // PARTICIPANT_JOINED/PEER_OFFER bootstrap signals (the initial INVITE only names the
  // caller), and this frontend has no per-member directory beyond existing direct chats —
  // falls back to no name/avatar (rendered as a bare '?' avatar) if there's no 1:1 chat
  // with that user already.
  private resolveCallParticipantIdentity(userId: string): { name: string | null; avatarUrl: string | null } {
    const directChat = this.chats.find(c => c.type !== 'GROUP' && (c.senderId === userId || c.receiverId === userId));
    return { name: directChat?.name ?? null, avatarUrl: directChat?.avatarUrl ?? null };
  }

  private handleCallSignal(signal: CallSignal): void {
    if (!signal?.chatId) return;
    switch (signal.type) {
      case 'INVITE':
        this.handleIncomingInvite(signal);
        break;
      case 'ANSWER':
        this.handleAnswerSignal(signal);
        break;
      case 'PARTICIPANT_JOINED':
        this.handleParticipantJoinedSignal(signal);
        break;
      case 'PEER_OFFER':
        this.handlePeerOfferSignal(signal);
        break;
      case 'PEER_ANSWER':
        this.handlePeerAnswerSignal(signal);
        break;
      case 'ICE_CANDIDATE':
        if (this.activeCallChatId === signal.chatId && signal.candidate && signal.fromUserId) {
          this.webRtcCallService.addRemoteIceCandidate(
            signal.fromUserId, signal.candidate, signal.candidateSdpMid ?? null, signal.candidateSdpMLineIndex ?? null
          );
        }
        break;
      case 'END':
      case 'REJECT':
      case 'BUSY':
      case 'MISSED':
        this.handleParticipantLeftSignal(signal);
        break;
    }
  }

  private handleIncomingInvite(signal: CallSignal): void {
    if (this.callState !== 'idle') {
      // Already on a call: decline immediately rather than leaving the caller ringing forever.
      this.callApiService.end(signal.chatId as string, 'REJECT').subscribe();
      return;
    }
    this.closeMessageOverlays();
    this.activeCallChatId = signal.chatId as string;
    this.activeCallType = signal.callType ?? 'AUDIO';
    this.pendingOfferSdp = signal.sdp ?? null;
    const callerId = signal.fromUserId ?? '';
    const { name, avatarUrl } = this.resolveCallParticipantIdentity(callerId);
    this.callParticipants = [{ userId: callerId, name, avatarUrl, status: 'ringing' }];
    this.callState = 'incoming';
    // The session already exists in call-service's CallSessionStore by the time this
    // signal arrives (invite() created it before publishing) — no queueing needed here.
    this.confirmCallSession();
    // The in-call banner overlay already covers the focused-tab case; a desktop
    // notification here is only useful when the tab isn't in front (background tab,
    // other app, phone locked) — same idea as maybeShowDesktopNotification, but calls
    // aren't scoped to "is this chat currently open" since the banner is global.
    if (!document.hasFocus()) {
      const chatId = this.activeCallChatId;
      this.browserNotifications.notify(
        name || this.i18n.translate('notifications.incomingCall'),
        this.i18n.translate(this.activeCallType === 'VIDEO' ? 'notifications.incomingVideoCall' : 'notifications.incomingCall'),
        () => this.ngZone.run(() => {
          const chat = this.chats.find(c => c.id === chatId);
          if (chat) this.chatSelected(chat);
        })
      );
    }
  }

  private handleAnswerSignal(signal: CallSignal): void {
    if (this.callState !== 'outgoing' || this.activeCallChatId !== signal.chatId || !signal.sdp || !signal.fromUserId) return;
    const peerId = signal.fromUserId;
    this.webRtcCallService.setRemoteAnswer(peerId, signal.sdp).then(() => {
      this.ngZone.run(() => {
        this.markParticipantJoined(peerId);
        this.callState = 'in-call';
      });
    });
  }

  // Sent to every already-joined participant when someone new (fromUserId) just joined —
  // mesh bootstrap: we proactively open a fresh peer connection straight to them.
  private handleParticipantJoinedSignal(signal: CallSignal): void {
    if (this.activeCallChatId !== signal.chatId || !signal.fromUserId) return;
    const newPeerId = signal.fromUserId;
    const chatId = this.activeCallChatId;
    this.addOrJoinParticipant(newPeerId);
    this.webRtcCallService.createOfferFor(newPeerId, this.activeCallType).then(sdpOffer => {
      this.callApiService.peerOffer(chatId, newPeerId, sdpOffer).subscribe();
    }).catch(err => console.error('[call] mesh peer-offer failed', err));
  }

  // The other side of the bootstrap above: someone else's client is offering us a direct
  // mesh link, so we answer it.
  private handlePeerOfferSignal(signal: CallSignal): void {
    if (this.activeCallChatId !== signal.chatId || !signal.fromUserId || !signal.sdp) return;
    const fromPeerId = signal.fromUserId;
    const chatId = this.activeCallChatId;
    this.addOrJoinParticipant(fromPeerId);
    this.webRtcCallService.createAnswerFor(fromPeerId, this.activeCallType, signal.sdp).then(sdpAnswer => {
      this.callApiService.peerAnswer(chatId, fromPeerId, sdpAnswer).subscribe();
    }).catch(err => console.error('[call] mesh peer-answer failed', err));
  }

  private handlePeerAnswerSignal(signal: CallSignal): void {
    if (this.activeCallChatId !== signal.chatId || !signal.fromUserId || !signal.sdp) return;
    this.webRtcCallService.setRemoteAnswer(signal.fromUserId, signal.sdp);
  }

  // END/REJECT/BUSY/MISSED are per-participant, not necessarily the whole call — a group
  // call continues locally as long as at least one other participant remains active.
  private handleParticipantLeftSignal(signal: CallSignal): void {
    if (this.activeCallChatId !== signal.chatId || !signal.fromUserId) return;
    const leftPeerId = signal.fromUserId;
    this.webRtcCallService.closePeer(leftPeerId);
    this.callParticipants = this.callParticipants.filter(p => p.userId !== leftPeerId);
    if (this.callParticipants.length === 0) {
      this.endCallLocally();
    }
  }

  private endCallLocally(): void {
    this.webRtcCallService.close();
    this.callState = 'idle';
    this.activeCallChatId = null;
    this.callParticipants = [];
    this.pendingOfferSdp = null;
    this.callSessionConfirmed = false;
    this.pendingLocalIceCandidates = [];
  }

  private confirmCallSession(): void {
    this.callSessionConfirmed = true;
    const queued = this.pendingLocalIceCandidates;
    this.pendingLocalIceCandidates = [];
    queued.forEach(candidate => this.sendIceCandidate(candidate));
  }

  private sendIceCandidate(candidate: LocalIceCandidate): void {
    if (!this.activeCallChatId) return;
    this.callApiService.iceCandidate(
      this.activeCallChatId, candidate.peerId, candidate.candidate, candidate.sdpMid, candidate.sdpMLineIndex
    ).subscribe();
  }
}
