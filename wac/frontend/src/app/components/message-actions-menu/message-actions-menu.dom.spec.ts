import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTransloco } from '@jsverse/transloco';
import { MessageActionsMenuComponent } from './message-actions-menu.component';

// Same bindings as pages/main/main.component.html, so a real click on each entry exercises
// the full open -> click -> closeRequested -> parent state -> [open] round trip.
@Component({
  imports: [MessageActionsMenuComponent],
  template: `
    <div (click)="outside = outside + 1">
      <app-message-actions-menu
        [open]="activeMessageMenuId === 1"
        [canEdit]="true"
        [canDelete]="true"
        (toggle)="activeMessageMenuId = activeMessageMenuId === 1 ? null : 1"
        (closeRequested)="activeMessageMenuId = null"
        (replyRequested)="calls.push('reply')"
        (forwardRequested)="calls.push('forward')"
        (copyRequested)="calls.push('copy')"
        (editRequested)="calls.push('edit')"
        (deleteRequested)="calls.push('delete')"
        (reactRequested)="calls.push('react')"
        (starRequested)="calls.push('star')"
      ></app-message-actions-menu>
    </div>
  `
})
class HostComponent {
  activeMessageMenuId: number | null = null;
  outside = 0;
  calls: string[] = [];
}

describe('MessageActionsMenuComponent (DOM)', () => {
  let fixture: ComponentFixture<HostComponent>;
  let host: HostComponent;
  let el: HTMLElement;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HostComponent],
      providers: [provideTransloco({ config: { availableLangs: ['it'], defaultLang: 'it' } })]
    });
    fixture = TestBed.createComponent(HostComponent);
    host = fixture.componentInstance;
    el = fixture.nativeElement;
    fixture.detectChanges();
  });

  const dropdown = () => el.querySelector('.message-actions-dropdown');
  const openMenu = () => {
    (el.querySelector('.message-actions-btn') as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  it('opens on the ⋮ button', () => {
    expect(dropdown()).toBeNull();
    openMenu();
    expect(dropdown()).not.toBeNull();
  });

  ['reply', 'star', 'react', 'edit', 'delete', 'forward', 'copy'].forEach(action => {
    it(`closes the dropdown after clicking an entry (${action})`, () => {
      openMenu();
      const buttons = Array.from(el.querySelectorAll<HTMLButtonElement>('.message-actions-dropdown button'));
      // Entry order in the template: react, star, reply, edit, delete, forward, copy
      const order = ['react', 'star', 'reply', 'edit', 'delete', 'forward', 'copy'];
      buttons[order.indexOf(action)].click();
      fixture.detectChanges();

      expect(host.calls).toEqual([action]);
      expect(dropdown()).toBeNull();
    });
  });
});
