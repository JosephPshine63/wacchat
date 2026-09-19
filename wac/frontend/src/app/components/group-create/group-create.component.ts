import { Component, EventEmitter, OnInit, Output, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { UserService } from '../../services/services/user.service';
import { UserResponse } from '../../services/models/user-response';
import { GroupChatService } from '../../services/services/group-chat.service';
import { ChatResponse } from '../../services/models/chat-response';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../utils/i18n/language.service';

@Component({
  selector: 'app-group-create',
  templateUrl: './group-create.component.html',
  styleUrl: './group-create.component.scss',
  imports: [TranslocoPipe, FormsModule]
})
export class GroupCreateComponent implements OnInit {
  protected readonly i18n = inject(LanguageService);
  @Output() closed = new EventEmitter<void>();
  @Output() groupCreated = new EventEmitter<ChatResponse>();

  contacts: UserResponse[] = [];
  selectedIds = new Set<string>();
  groupName = '';
  creating = false;
  error = '';

  constructor(
    private userService: UserService,
    private groupChatService: GroupChatService
  ) {}

  ngOnInit(): void {
    this.userService.getAllUsers().subscribe({
      next: (users) => this.contacts = users
    });
  }

  toggleSelected(contact: UserResponse): void {
    if (!contact.id) return;
    if (this.selectedIds.has(contact.id)) {
      this.selectedIds.delete(contact.id);
    } else {
      this.selectedIds.add(contact.id);
    }
  }

  isSelected(contact: UserResponse): boolean {
    return !!contact.id && this.selectedIds.has(contact.id);
  }

  canCreate(): boolean {
    return this.groupName.trim().length > 0 && this.selectedIds.size > 0 && !this.creating;
  }

  create(): void {
    if (!this.canCreate()) return;
    this.creating = true;
    this.error = '';
    this.groupChatService.createGroup({
      body: {
        name: this.groupName.trim(),
        memberIds: Array.from(this.selectedIds)
      }
    }).subscribe({
      next: (chat) => {
        this.creating = false;
        this.groupCreated.emit(chat);
      },
      error: () => {
        this.creating = false;
        this.error = this.i18n.translate('groupCreate.errors.create');
      }
    });
  }

  close(): void {
    this.closed.emit();
  }
}
