import { Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild, inject } from '@angular/core';
import { UserService } from '../../services/services/user.service';
import { TranslocoPipe } from '@jsverse/transloco';
import { LanguageService } from '../../utils/i18n/language.service';
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

@Component({
  selector: 'app-avatar-upload',
  templateUrl: './avatar-upload.component.html',
  styleUrl: './avatar-upload.component.scss',
  imports: [TranslocoPipe]
})
export class AvatarUploadComponent implements OnDestroy {
  protected readonly i18n = inject(LanguageService);

  @Input() currentAvatarUrl?: string;
  @Output() avatarChanged = new EventEmitter<string | undefined>();
  @Output() closed = new EventEmitter<void>();

  @ViewChild('fileInput') fileInput?: ElementRef<HTMLInputElement>;

  uploading = false;
  errorMessage = '';

  mode: 'view' | 'preview' = 'view';
  previewUrl: string | null = null;
  private pendingFile: File | null = null;

  constructor(private userService: UserService) {}

  ngOnDestroy(): void {
    this.revokePreview();
  }

  close(): void {
    this.closed.emit();
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      this.errorMessage = this.i18n.translate('avatarUpload.errors.format');
      input.value = '';
      return;
    }
    if (file.size > MAX_SIZE_BYTES) {
      this.errorMessage = this.i18n.translate('avatarUpload.errors.size');
      input.value = '';
      return;
    }

    this.errorMessage = '';
    this.pendingFile = file;
    this.previewUrl = URL.createObjectURL(file);
    this.mode = 'preview';
  }

  confirmUpload(): void {
    if (!this.pendingFile) return;
    const file = this.pendingFile;
    this.uploading = true;
    this.userService.uploadAvatar({ body: { file } }).subscribe({
      next: user => {
        this.uploading = false;
        this.revokePreview();
        this.mode = 'view';
        this.avatarChanged.emit(user.avatarUrl);
      },
      error: () => {
        this.uploading = false;
        this.errorMessage = this.i18n.translate('avatarUpload.errors.upload');
      }
    });
  }

  cancelPreview(): void {
    this.revokePreview();
    this.mode = 'view';
    this.errorMessage = '';
    if (this.fileInput) {
      this.fileInput.nativeElement.value = '';
    }
  }

  private revokePreview(): void {
    if (this.previewUrl) {
      URL.revokeObjectURL(this.previewUrl);
    }
    this.previewUrl = null;
    this.pendingFile = null;
  }

  removeAvatar(): void {
    this.uploading = true;
    this.userService.deleteAvatar().subscribe({
      next: () => {
        this.uploading = false;
        this.avatarChanged.emit(undefined);
      },
      error: () => {
        this.uploading = false;
        this.errorMessage = this.i18n.translate('avatarUpload.errors.remove');
      }
    });
  }
}
