import { Component, EventEmitter, OnDestroy, OnInit, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs/operators';
import { UsernameService } from '../../utils/username/username.service';
import { TranslocoPipe } from '@jsverse/transloco';
type CheckState = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

@Component({
  selector: 'app-username-setup',
  templateUrl: './username-setup.component.html',
  styleUrl: './username-setup.component.scss',
  imports: [TranslocoPipe, FormsModule]
})
export class UsernameSetupComponent implements OnInit, OnDestroy {

  @Output() usernameSet = new EventEmitter<string>();

  username = '';
  checkState: CheckState = 'idle';
  submitting = false;

  private inputSubject = new Subject<string>();
  private checkSub?: Subscription;
  private readonly usernamePattern = /^[a-z0-9_.-]{3,20}$/;

  constructor(private usernameService: UsernameService) {}

  ngOnInit(): void {
    this.checkSub = this.inputSubject.pipe(
      debounceTime(300),
      distinctUntilChanged(),
      switchMap(value => {
        this.checkState = 'checking';
        return this.usernameService.checkUsername(value);
      })
    ).subscribe({
      next: res => { this.checkState = res.available ? 'available' : 'taken'; },
      error: () => { this.checkState = 'idle'; }
    });
  }

  ngOnDestroy(): void {
    this.checkSub?.unsubscribe();
  }

  onInput(): void {
    const val = this.username.trim();
    if (!this.usernamePattern.test(val)) {
      this.checkState = val.length === 0 ? 'idle' : 'invalid';
      return;
    }
    this.inputSubject.next(val);
  }

  get canSubmit(): boolean {
    return this.checkState === 'available' && !this.submitting;
  }

  submit(): void {
    if (!this.canSubmit) return;
    this.submitting = true;
    this.usernameService.updateUsername(this.username.trim()).subscribe({
      next: () => { this.usernameSet.emit(this.username.trim()); },
      error: () => {
        this.submitting = false;
        this.checkState = 'taken';
      }
    });
  }
}
