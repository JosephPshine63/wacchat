import { ReplyPreviewBarComponent } from './reply-preview-bar.component';
import { MessageResponse } from '../../services/models/message-response';

describe('ReplyPreviewBarComponent', () => {
  let component: ReplyPreviewBarComponent;

  beforeEach(() => {
    const fakeLanguageService = { translate: (key: string) => key } as any;
    component = new ReplyPreviewBarComponent(fakeLanguageService);
  });

  function message(overrides: Partial<MessageResponse>): MessageResponse {
    return { id: 1, type: 'TEXT', content: 'hello', ...overrides };
  }

  it('returns empty string when no message is set', () => {
    component.message = null;
    expect(component.previewText()).toBe('');
  });

  it('returns the text content for TEXT messages', () => {
    component.message = message({ type: 'TEXT', content: 'Ciao!' });
    expect(component.previewText()).toBe('Ciao!');
  });

  it('returns a media label for VIDEO/AUDIO/IMAGE messages', () => {
    component.message = message({ type: 'VIDEO' });
    expect(component.previewText()).toBe('media.video');
    component.message = message({ type: 'AUDIO' });
    expect(component.previewText()).toBe('media.voice');
    component.message = message({ type: 'IMAGE' });
    expect(component.previewText()).toBe('media.photo');
  });

  it('emits cancelled when cancel() is called', () => {
    const spy = jasmine.createSpy('cancelled');
    component.cancelled.subscribe(spy);
    component.cancel();
    expect(spy).toHaveBeenCalled();
  });
});
