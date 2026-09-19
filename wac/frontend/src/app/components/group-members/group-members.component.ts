import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { GroupChatService } from '../../services/services/group-chat.service';
import { UserService } from '../../services/services/user.service';
import { GroupMemberResponse } from '../../services/models/group-member-response';
import { UserResponse } from '../../services/models/user-response';
import { KeycloakService } from '../../utils/keycloak/keycloak.service';
import { TranslocoPipe } from '@jsverse/transloco';

@Component({
  selector: 'app-group-members',
  templateUrl: './group-members.component.html',
  styleUrl: './group-members.component.scss',
  imports: [TranslocoPipe]
})
export class GroupMembersComponent implements OnChanges {
  @Input({ required: true }) chatId!: string;
  @Output() closed = new EventEmitter<void>();
  @Output() left = new EventEmitter<void>();

  members: GroupMemberResponse[] = [];
  loading = false;
  addingMember = false;
  addableContacts: UserResponse[] = [];

  constructor(
    private groupChatService: GroupChatService,
    private userService: UserService,
    private keycloakService: KeycloakService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chatId'] && this.chatId) {
      this.loadMembers();
    }
  }

  private loadMembers(): void {
    this.loading = true;
    this.groupChatService.listMembers({ chatId: this.chatId }).subscribe({
      next: (members) => {
        this.members = members;
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  get isOwner(): boolean {
    return this.members.some(m => m.userId === this.keycloakService.userId && m.role === 'OWNER');
  }

  isSelf(member: GroupMemberResponse): boolean {
    return member.userId === this.keycloakService.userId;
  }

  removeMember(member: GroupMemberResponse): void {
    if (!member.userId) return;
    this.groupChatService.removeMember({ chatId: this.chatId, userId: member.userId }).subscribe({
      next: () => {
        this.members = this.members.filter(m => m.userId !== member.userId);
        if (this.isSelf(member)) {
          this.left.emit();
        }
      }
    });
  }

  openAddMember(): void {
    this.addingMember = true;
    this.userService.getAllUsers().subscribe({
      next: (users) => {
        const memberIds = new Set(this.members.map(m => m.userId));
        this.addableContacts = users.filter(u => u.id && !memberIds.has(u.id));
      }
    });
  }

  closeAddMember(): void {
    this.addingMember = false;
  }

  addMember(contact: UserResponse): void {
    if (!contact.id) return;
    this.groupChatService.addMember({ chatId: this.chatId, body: { userId: contact.id } }).subscribe({
      next: () => {
        this.addingMember = false;
        this.loadMembers();
      }
    });
  }

  close(): void {
    this.closed.emit();
  }
}
