import {Component, input, InputSignal, output} from '@angular/core';
import {ChatService} from '../../services/services/chat.service';
import {ChatResponse} from '../../services/models/chat-response';
import {FormsModule} from '@angular/forms';
import {UserService} from '../../services/services/user.service';
import {UserResponse} from '../../services/models/user-response';
import {KeycloakService} from '../../utils/keycloak/keycloak.service';
import {MessageService} from '../../services/services/message.service';
import {ModerationService} from '../../services/services/moderation.service';
import {BlockedUserResponse} from '../../services/models/blocked-user-response';
import {ChatFilter, ChatFilterService} from '../../utils/chat-filter/chat-filter.service';
import {MuteService} from '../../utils/mute/mute.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { LocalDatePipe } from '../../utils/i18n/local-date.pipe';
import { MessageTextPipe } from '../../utils/i18n/message-text.pipe';

@Component({
  selector: 'app-chat-list',
  templateUrl: './chat-list.component.html',
  imports: [TranslocoPipe, LocalDatePipe, MessageTextPipe,
    FormsModule
  ],
  styleUrl: './chat-list.component.scss'
})
export class ChatListComponent {
  chats: InputSignal<ChatResponse[]> = input<ChatResponse[]>([]);
  searchNewContact = false;
  contacts: Array<UserResponse> = [];
  chatSelected = output<ChatResponse>();
  avatarClicked = output<string>();
  chatAccepted = output<ChatResponse>();
  chatRejected = output<ChatResponse>();
  createGroupRequested = output<void>();

  searchQuery = '';
  blockedUsers: Array<BlockedUserResponse> = [];

  constructor(
    private chatService: ChatService,
    private userService: UserService,
    private moderationService: ModerationService,
    private keycloakService: KeycloakService,
    private chatFilterService: ChatFilterService,
    private muteService: MuteService
  ) {
  }

  get activeFilter(): ChatFilter {
    return this.chatFilterService.filter();
  }

  searchContact() {
    this.userService.getAllUsers()
      .subscribe({
        next: (users) => {
          this.contacts = users;
          this.searchNewContact = true;
        }
      });
  }

  selectContact(contact: UserResponse) {
    this.chatService.createChat({
      'receiver-id': contact.id as string
    }).subscribe({
      next: (res) => {
        const chat: ChatResponse = {
          id: res.response,
          name: contact.username ? '@' + contact.username : contact.firstName + ' ' + contact.lastName,
          recipientOnline: contact.online,
          lastMessageTime: contact.lastSeen,
          senderId: this.keycloakService.userId,
          receiverId: contact.id,
          avatarUrl: contact.avatarUrl,
          status: 'PENDING',
          pendingMessageCount: 0
        };
        this.searchNewContact = false;
        this.chatSelected.emit(chat);
      }
    });

  }

  chatClicked(chat: ChatResponse) {
    this.chatSelected.emit(chat);
  }

  incomingRequests(): ChatResponse[] {
    const me = this.keycloakService.userId;
    return this.chats().filter(c => c.status === 'PENDING' && c.receiverId === me);
  }

  visibleChats(): ChatResponse[] {
    const me = this.keycloakService.userId;
    const base = this.chats().filter(c => !(c.status === 'PENDING' && c.receiverId === me));
    let filtered: ChatResponse[];
    switch (this.activeFilter) {
      case 'unread':
        filtered = base.filter(c => c.unreadCount && c.unreadCount > 0 && !c.archived);
        break;
      case 'favorites':
        filtered = base.filter(c => c.favorite && !c.archived);
        break;
      case 'archived':
        filtered = base.filter(c => c.archived);
        break;
      default:
        filtered = base.filter(c => !c.archived);
    }
    const query = this.searchQuery.trim().toLowerCase();
    if (!query) {
      return filtered;
    }
    return filtered.filter(c => c.name?.toLowerCase().includes(query));
  }

  setFilter(filter: ChatFilter): void {
    this.chatFilterService.setFilter(filter);
    if (filter === 'blocked') {
      this.moderationService.getBlockedUsers().subscribe({
        next: (users) => this.blockedUsers = users
      });
    }
  }

  unblockUser(blockedUser: BlockedUserResponse, event: Event): void {
    event.stopPropagation();
    if (!blockedUser.id) return;
    this.moderationService.unblockUser({ id: blockedUser.id }).subscribe({
      next: () => {
        this.blockedUsers = this.blockedUsers.filter(u => u.id !== blockedUser.id);
      }
    });
  }

  toggleFavorite(chat: ChatResponse, event: Event): void {
    event.stopPropagation();
    if (!chat.id) return;
    this.chatService.toggleFavorite({ chatId: chat.id }).subscribe({
      next: (res) => {
        chat.favorite = res['favorite'];
      }
    });
  }

  toggleArchive(chat: ChatResponse, event: Event): void {
    event.stopPropagation();
    if (!chat.id) return;
    this.chatService.toggleArchive({ chatId: chat.id }).subscribe({
      next: (res) => {
        chat.archived = res['archived'];
      }
    });
  }

  isMuted(chat: ChatResponse): boolean {
    return this.muteService.isMuted(chat.id);
  }

  toggleMute(chat: ChatResponse, event: Event): void {
    event.stopPropagation();
    if (!chat.id) return;
    this.muteService.toggleMute(chat.id);
  }

  isPendingOutgoing(chat: ChatResponse): boolean {
    return chat.status === 'PENDING' && chat.senderId === this.keycloakService.userId;
  }

  acceptRequest(chat: ChatResponse, event: Event): void {
    event.stopPropagation();
    this.chatService.acceptChat({ chatId: chat.id as string }).subscribe({
      next: () => {
        chat.status = 'ACCEPTED';
        this.chatAccepted.emit(chat);
      }
    });
  }

  rejectRequest(chat: ChatResponse, event: Event): void {
    event.stopPropagation();
    this.chatService.rejectChat({ chatId: chat.id as string }).subscribe({
      next: () => this.chatRejected.emit(chat)
    });
  }

  otherUserId(chat: ChatResponse): string | undefined {
    if (chat.type === 'GROUP') {
      return undefined;
    }
    return chat.senderId === this.keycloakService.userId ? chat.receiverId : chat.senderId;
  }

  requestCreateGroup(): void {
    this.searchNewContact = false;
    this.createGroupRequested.emit();
  }

  onAvatarClick(event: Event, userId: string | undefined): void {
    event.stopPropagation();
    if (userId) {
      this.avatarClicked.emit(userId);
    }
  }

  wrapMessage(lastMessage: string | undefined): string {
    if (lastMessage && lastMessage.length <= 20) {
      return lastMessage;
    }
    return lastMessage?.substring(0, 17) + '...';
  }
}
