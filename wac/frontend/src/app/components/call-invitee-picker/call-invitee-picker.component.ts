import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { GroupChatService } from '../../services/services/group-chat.service';
import { GroupMemberResponse } from '../../services/models/group-member-response';
import { KeycloakService } from '../../utils/keycloak/keycloak.service';
import { TranslocoPipe } from '@jsverse/transloco';
// Must match application.call.max-participants (default 8, see call-service's
// application.yml) minus the caller themself.
const MAX_INVITEES = 7;

@Component({
  selector: 'app-call-invitee-picker',
  templateUrl: './call-invitee-picker.component.html',
  styleUrl: './call-invitee-picker.component.scss',
  imports: [TranslocoPipe]
})
export class CallInviteePickerComponent implements OnChanges {
  @Input({ required: true }) chatId!: string;
  @Input() callType: 'AUDIO' | 'VIDEO' = 'AUDIO';
  @Output() closed = new EventEmitter<void>();
  // Emits the full selected member objects (not just ids) so the caller can build the
  // outgoing call roster (name/avatarUrl) without a second lookup.
  @Output() confirmed = new EventEmitter<GroupMemberResponse[]>();

  members: GroupMemberResponse[] = [];
  selectedIds = new Set<string>();
  loading = false;

  readonly maxInvitees = MAX_INVITEES;

  constructor(
    private groupChatService: GroupChatService,
    private keycloakService: KeycloakService
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['chatId'] && this.chatId) {
      this.selectedIds.clear();
      this.loadMembers();
    }
  }

  private loadMembers(): void {
    this.loading = true;
    this.groupChatService.listMembers({ chatId: this.chatId }).subscribe({
      next: (members) => {
        this.members = members.filter(m => m.userId !== this.keycloakService.userId);
        this.loading = false;
      },
      error: () => this.loading = false
    });
  }

  isSelected(member: GroupMemberResponse): boolean {
    return !!member.userId && this.selectedIds.has(member.userId);
  }

  toggleSelected(member: GroupMemberResponse): void {
    if (!member.userId) return;
    if (this.selectedIds.has(member.userId)) {
      this.selectedIds.delete(member.userId);
      return;
    }
    if (this.selectedIds.size >= this.maxInvitees) return;
    this.selectedIds.add(member.userId);
  }

  canConfirm(): boolean {
    return this.selectedIds.size > 0 && !this.loading;
  }

  confirm(): void {
    if (!this.canConfirm()) return;
    this.confirmed.emit(this.members.filter(m => m.userId && this.selectedIds.has(m.userId)));
  }

  close(): void {
    this.closed.emit();
  }
}
