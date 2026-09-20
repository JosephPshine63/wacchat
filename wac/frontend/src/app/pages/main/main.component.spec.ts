import { NgZone } from '@angular/core';
import { of } from 'rxjs';
import { MainComponent } from './main.component';
import { MessageResponse } from '../../services/models/message-response';
import { ChatResponse } from '../../services/models/chat-response';

describe('MainComponent', () => {
  let component: MainComponent;

  beforeEach(() => {
    const fakeChatService = {} as any;
    const fakeMessageService = {} as any;
    const fakeKeycloakService = { userId: 'me' } as any;
    const fakeUsernameService = {} as any;
    const fakeNgZone = new NgZone({ enableLongStackTrace: false });
    const fakeSessionGuard = {} as any;
    const fakeBrowserNotifications = {} as any;
    const fakeCallApiService = {} as any;
    const fakeWebRtcCallService = {} as any;
    const fakeDraftService = { getDraft: () => '', setDraft: () => {}, clearDraft: () => {}, clearAll: () => {} } as any;
    const fakeMuteService = { isMuted: () => false, toggleMute: () => {} } as any;
    const fakeSupportService = {} as any;
    const fakeErrorLogService = {} as any;
    const fakePushSubscriptionService = { registerServiceWorkerAndSubscribe: () => Promise.resolve() } as any;
    const fakeLanguageService = { translate: (key: string) => key, intlLocale: 'it-IT' } as any;

    const fakeBuildInfo = { label: () => null } as any;

    component = new MainComponent(
      fakeChatService,
      fakeMessageService,
      fakeKeycloakService,
      fakeUsernameService,
      fakeNgZone,
      fakeSessionGuard,
      fakeBrowserNotifications,
      fakeCallApiService,
      fakeWebRtcCallService,
      fakeDraftService,
      fakeMuteService,
      fakeSupportService,
      fakeErrorLogService,
      fakePushSubscriptionService,
      fakeLanguageService,
      fakeBuildInfo
    );

    component.chatMessages = [
      { id: 1, type: 'TEXT', content: 'Ciao come stai' } as MessageResponse,
      { id: 2, type: 'TEXT', content: 'Tutto bene grazie' } as MessageResponse,
      { id: 3, type: 'IMAGE', content: '📷 Foto' } as MessageResponse,
      { id: 4, type: 'TEXT', content: 'Bene anche a te' } as MessageResponse
    ];
  });

  describe('in-conversation message search', () => {
    it('finds no matches for an empty query', () => {
      component.messageSearchQuery = '';
      component.onMessageSearchInput();
      expect(component.searchMatchIndices).toEqual([]);
      expect(component.currentSearchMatchIndex).toBe(-1);
    });

    it('matches TEXT messages case-insensitively and skips non-TEXT messages', () => {
      component.messageSearchQuery = 'bene';
      component.onMessageSearchInput();
      expect(component.searchMatchIndices).toEqual([1, 3]);
      expect(component.currentSearchMatchIndex).toBe(0);
    });

    it('wraps around when jumping past the last match', () => {
      component.messageSearchQuery = 'bene';
      component.onMessageSearchInput();
      component.jumpToNextMatch();
      expect(component.currentSearchMatchIndex).toBe(1);
      component.jumpToNextMatch();
      expect(component.currentSearchMatchIndex).toBe(0);
    });

    it('wraps around when jumping before the first match', () => {
      component.messageSearchQuery = 'bene';
      component.onMessageSearchInput();
      component.jumpToPreviousMatch();
      expect(component.currentSearchMatchIndex).toBe(1);
    });

    it('clears search state when closing the search bar', () => {
      component.messageSearchQuery = 'bene';
      component.onMessageSearchInput();
      component.showMessageSearch = true;
      component.toggleMessageSearch();
      expect(component.showMessageSearch).toBe(false);
      expect(component.messageSearchQuery).toBe('');
      expect(component.searchMatchIndices).toEqual([]);
      expect(component.currentSearchMatchIndex).toBe(-1);
    });
  });

  describe('date separators', () => {
    beforeEach(() => {
      component.chatMessages = [
        { id: 1, type: 'TEXT', content: 'a', createdAt: '2026-07-01T10:00:00' } as MessageResponse,
        { id: 2, type: 'TEXT', content: 'b', createdAt: '2026-07-01T11:00:00' } as MessageResponse,
        { id: 3, type: 'TEXT', content: 'c', createdAt: '2026-07-02T09:00:00' } as MessageResponse
      ];
    });

    it('always shows a separator before the first message', () => {
      expect(component.shouldShowDateSeparator(0)).toBe(true);
    });

    it('does not show a separator between messages on the same day', () => {
      expect(component.shouldShowDateSeparator(1)).toBe(false);
    });

    it('shows a separator when the day changes', () => {
      expect(component.shouldShowDateSeparator(2)).toBe(true);
    });
  });

  describe('scroll tracking', () => {
    function fakeScrollableDiv(scrollTop: number, scrollHeight: number, clientHeight: number) {
      (component as any).scrollableDiv = { nativeElement: { scrollTop, scrollHeight, clientHeight } };
    }

    it('marks isScrolledUp true when far from the bottom', () => {
      fakeScrollableDiv(0, 1000, 400);
      component.onMessagesScroll();
      expect(component.isScrolledUp).toBe(true);
    });

    it('marks isScrolledUp false when near the bottom', () => {
      fakeScrollableDiv(590, 1000, 400);
      component.onMessagesScroll();
      expect(component.isScrolledUp).toBe(false);
    });

    it('jumpToLatest resets isScrolledUp', () => {
      fakeScrollableDiv(0, 1000, 400);
      component.onMessagesScroll();
      expect(component.isScrolledUp).toBe(true);
      component.jumpToLatest();
      expect(component.isScrolledUp).toBe(false);
    });
  });

  describe('mobile back navigation', () => {
    it('goBack() clears the selected chat', () => {
      component.selectedChat = { id: 'chat-1', name: 'Alice' };
      component.goBack();
      expect(component.selectedChat).toEqual({});
    });
  });

  describe('message actions menu', () => {
    it('toggleMessageMenu opens the menu for a given id and closes it on a second call', () => {
      component.toggleMessageMenu(1);
      expect(component.activeMessageMenuId).toBe(1);
      component.toggleMessageMenu(1);
      expect(component.activeMessageMenuId).toBeNull();
    });

    it('toggleMessageMenu switches to a different message id', () => {
      component.toggleMessageMenu(1);
      component.toggleMessageMenu(2);
      expect(component.activeMessageMenuId).toBe(2);
    });

    it('findMessageById returns the matching message or undefined', () => {
      expect(component.findMessageById(2)?.content).toBe('Tutto bene grazie');
      expect(component.findMessageById(999)).toBeUndefined();
      expect(component.findMessageById(undefined)).toBeUndefined();
    });
  });

  describe('reply', () => {
    it('startReply sets replyingToMessage and cancelReply clears it', () => {
      const message = component.chatMessages[0];
      component.startReply(message);
      expect(component.replyingToMessage).toBe(message);
      component.cancelReply();
      expect(component.replyingToMessage).toBeNull();
    });

    it('sendMessage includes replyToId from the active reply and clears it afterwards', () => {
      const messageService = (component as any).messageService;
      messageService.saveMessage = jasmine.createSpy('saveMessage').and.returnValue(of({ id: 42 }));
      component.selectedChat = { id: 'chat-1', senderId: 'me', receiverId: 'peer', status: 'ACCEPTED' };
      component.replyingToMessage = component.chatMessages[0];
      component.messageContent = 'risposta';

      component.sendMessage();

      expect(messageService.saveMessage).toHaveBeenCalledWith({
        body: { chatId: 'chat-1', content: 'risposta', type: 'TEXT', replyToId: 1 }
      });
      expect(component.replyingToMessage).toBeNull();
      expect(component.chatMessages[component.chatMessages.length - 1].replyToId).toBe(1);
    });
  });

  describe('forward', () => {
    it('startForward sets forwardingMessage and cancelForward clears it', () => {
      const message = component.chatMessages[0];
      component.startForward(message);
      expect(component.forwardingMessage).toBe(message);
      component.cancelForward();
      expect(component.forwardingMessage).toBeNull();
    });

    it('confirmForward sends a forwarded TEXT message and appends it when the target chat is open', () => {
      const messageService = (component as any).messageService;
      messageService.saveMessage = jasmine.createSpy('saveMessage').and.returnValue(of({ id: 55 }));
      component.selectedChat = { id: 'chat-2', senderId: 'me', receiverId: 'other', status: 'ACCEPTED' };
      component.forwardingMessage = component.chatMessages[0];
      const targetChat: ChatResponse = { id: 'chat-2', senderId: 'me', receiverId: 'other' };

      component.confirmForward(targetChat);

      expect(messageService.saveMessage).toHaveBeenCalledWith({
        body: { chatId: 'chat-2', content: 'Ciao come stai', type: 'TEXT', forwarded: true }
      });
      const last = component.chatMessages[component.chatMessages.length - 1];
      expect(last.forwarded).toBe(true);
      expect(last.id).toBe(55);
      expect(component.forwardingMessage).toBeNull();
    });

    it('confirmForward does not append to chatMessages when the target chat is not the open one', () => {
      const messageService = (component as any).messageService;
      messageService.saveMessage = jasmine.createSpy('saveMessage').and.returnValue(of({ id: 56 }));
      component.selectedChat = { id: 'chat-1', senderId: 'me', receiverId: 'peer' };
      component.forwardingMessage = component.chatMessages[0];
      const originalLength = component.chatMessages.length;
      const targetChat: ChatResponse = { id: 'chat-other', senderId: 'me', receiverId: 'someone-else' };

      component.confirmForward(targetChat);

      expect(component.chatMessages.length).toBe(originalLength);
    });

    it('confirmForward is a no-op for non-TEXT messages', () => {
      const messageService = (component as any).messageService;
      messageService.saveMessage = jasmine.createSpy('saveMessage');
      component.forwardingMessage = component.chatMessages[2];
      const targetChat: ChatResponse = { id: 'chat-2' };

      component.confirmForward(targetChat);

      expect(messageService.saveMessage).not.toHaveBeenCalled();
      expect(component.forwardingMessage).toBeNull();
    });
  });

  describe('edit message', () => {
    it('startEdit sets editingMessage/editContent for TEXT messages and cancelEdit clears them', () => {
      const message = component.chatMessages[0];
      component.startEdit(message);
      expect(component.editingMessage).toBe(message);
      expect(component.editContent).toBe('Ciao come stai');
      component.cancelEdit();
      expect(component.editingMessage).toBeNull();
      expect(component.editContent).toBe('');
    });

    it('startEdit is a no-op for non-TEXT messages', () => {
      component.startEdit(component.chatMessages[2]);
      expect(component.editingMessage).toBeNull();
    });

    it('confirmEdit calls the edit endpoint and patches the message content/editedAt in place', () => {
      const messageService = (component as any).messageService;
      messageService.editMessage = jasmine.createSpy('editMessage')
        .and.returnValue(of({ id: 1, content: 'updated', editedAt: '2026-07-06T10:00:00' }));
      component.startEdit(component.chatMessages[0]);
      component.editContent = 'updated';

      component.confirmEdit();

      expect(messageService.editMessage).toHaveBeenCalledWith({ messageId: 1, body: { content: 'updated' } });
      expect(component.chatMessages[0].content).toBe('updated');
      expect(component.chatMessages[0].editedAt).toBe('2026-07-06T10:00:00');
      expect(component.editingMessage).toBeNull();
    });

    it('confirmEdit does nothing when the content is blank', () => {
      const messageService = (component as any).messageService;
      messageService.editMessage = jasmine.createSpy('editMessage');
      component.startEdit(component.chatMessages[0]);
      component.editContent = '   ';

      component.confirmEdit();

      expect(messageService.editMessage).not.toHaveBeenCalled();
    });

    it('handleMessageEdited patches the matching message from a peer notification', () => {
      (component as any).handleMessageEdited({ messageId: 2, content: 'peer updated' });
      expect(component.chatMessages[1].content).toBe('peer updated');
      expect(component.chatMessages[1].editedAt).toBeTruthy();
    });
  });

  describe('delete message', () => {
    it('confirmDelete asks for confirmation, marks the message deleted and calls the endpoint', () => {
      spyOn(window, 'confirm').and.returnValue(true);
      const messageService = (component as any).messageService;
      messageService.deleteMessage = jasmine.createSpy('deleteMessage').and.returnValue(of(undefined));
      const message = component.chatMessages[0];

      component.confirmDelete(message);

      expect(window.confirm).toHaveBeenCalled();
      expect(message.deleted).toBe(true);
      expect(message.content).toBeUndefined();
      expect(messageService.deleteMessage).toHaveBeenCalledWith({ messageId: 1 });
    });

    it('confirmDelete does nothing when the user cancels the confirmation', () => {
      spyOn(window, 'confirm').and.returnValue(false);
      const messageService = (component as any).messageService;
      messageService.deleteMessage = jasmine.createSpy('deleteMessage');
      const message = component.chatMessages[0];

      component.confirmDelete(message);

      expect(message.deleted).toBeFalsy();
      expect(messageService.deleteMessage).not.toHaveBeenCalled();
    });

    it('confirmDelete is a no-op for an already-deleted message', () => {
      spyOn(window, 'confirm');
      const messageService = (component as any).messageService;
      messageService.deleteMessage = jasmine.createSpy('deleteMessage');
      const message = component.chatMessages[0];
      message.deleted = true;

      component.confirmDelete(message);

      expect(window.confirm).not.toHaveBeenCalled();
      expect(messageService.deleteMessage).not.toHaveBeenCalled();
    });

    it('handleMessageDeleted patches the matching message from a peer notification', () => {
      (component as any).handleMessageDeleted({ messageId: 2 });
      expect(component.chatMessages[1].deleted).toBe(true);
      expect(component.chatMessages[1].content).toBeUndefined();
    });
  });

  describe('emoji reactions', () => {
    it('openReactionPicker toggles the picker open/closed for a given message id', () => {
      component.openReactionPicker(1);
      expect(component.reactingToMessageId).toBe(1);
      component.openReactionPicker(1);
      expect(component.reactingToMessageId).toBeNull();
    });

    it('onReactionSelected calls toggleReaction and patches the reactions list from the response', () => {
      const messageService = (component as any).messageService;
      const response = { reactions: [{ emoji: '👍', count: 1, reactedByMe: true }] };
      messageService.toggleReaction = jasmine.createSpy('toggleReaction').and.returnValue(of(response));
      const message = component.chatMessages[0];
      component.reactingToMessageId = message.id ?? null;

      component.onReactionSelected(message, { emoji: { native: '👍' } });

      expect(messageService.toggleReaction).toHaveBeenCalledWith({ messageId: 1, body: { emoji: '👍' } });
      expect(component.reactingToMessageId).toBeNull();
      expect(component.chatMessages[0].reactions).toEqual(response.reactions);
    });

    it('onReactionSelected does nothing when the emoji has no native representation', () => {
      const messageService = (component as any).messageService;
      messageService.toggleReaction = jasmine.createSpy('toggleReaction');

      component.onReactionSelected(component.chatMessages[0], { emoji: {} });

      expect(messageService.toggleReaction).not.toHaveBeenCalled();
    });

    it('handleReactionEvent(added) increments the count for an existing emoji entry', () => {
      component.chatMessages[0].reactions = [{ emoji: '👍', count: 1, reactedByMe: false }];
      (component as any).handleReactionEvent({ messageId: 1, reactionEmoji: '👍' }, true);
      expect(component.chatMessages[0].reactions).toEqual([{ emoji: '👍', count: 2, reactedByMe: false }]);
    });

    it('handleReactionEvent(added) appends a new emoji entry with reactedByMe false', () => {
      component.chatMessages[0].reactions = [];
      (component as any).handleReactionEvent({ messageId: 1, reactionEmoji: '❤️' }, true);
      expect(component.chatMessages[0].reactions).toEqual([{ emoji: '❤️', count: 1, reactedByMe: false }]);
    });

    it('handleReactionEvent(removed) decrements and removes the entry once it hits zero', () => {
      component.chatMessages[0].reactions = [{ emoji: '👍', count: 1, reactedByMe: false }];
      (component as any).handleReactionEvent({ messageId: 1, reactionEmoji: '👍' }, false);
      expect(component.chatMessages[0].reactions).toEqual([]);
    });

    it('handleReactionEvent(removed) decrements without removing when count stays above zero', () => {
      component.chatMessages[0].reactions = [{ emoji: '👍', count: 2, reactedByMe: false }];
      (component as any).handleReactionEvent({ messageId: 1, reactionEmoji: '👍' }, false);
      expect(component.chatMessages[0].reactions).toEqual([{ emoji: '👍', count: 1, reactedByMe: false }]);
    });

    it('handleReactionEvent is a no-op when the message or emoji is missing', () => {
      (component as any).handleReactionEvent({ messageId: 999, reactionEmoji: '👍' }, true);
      (component as any).handleReactionEvent({ messageId: 1, reactionEmoji: undefined }, true);
      expect(component.chatMessages[0].reactions).toBeUndefined();
    });
  });

  describe('copy message text', () => {
    it('copies TEXT message content to the clipboard', () => {
      const writeTextSpy = jasmine.createSpy('writeText').and.returnValue(Promise.resolve());
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextSpy }, configurable: true });

      component.copyMessageText(component.chatMessages[0]);

      expect(writeTextSpy).toHaveBeenCalledWith('Ciao come stai');
    });

    it('does nothing for non-TEXT messages', () => {
      const writeTextSpy = jasmine.createSpy('writeText');
      Object.defineProperty(navigator, 'clipboard', { value: { writeText: writeTextSpy }, configurable: true });

      component.copyMessageText(component.chatMessages[2]);

      expect(writeTextSpy).not.toHaveBeenCalled();
    });
  });

  describe('mute suppresses desktop notifications', () => {
    it('does not notify when the chat is muted', () => {
      const muteService = (component as any).muteService;
      spyOn(muteService, 'isMuted').and.returnValue(true);
      const browserNotifications = (component as any).browserNotifications;
      browserNotifications.notify = jasmine.createSpy('notify');
      (component as any).maybeShowDesktopNotification({ chatId: 'chat-1', type: 'MESSAGE', content: 'hi' });
      expect(browserNotifications.notify).not.toHaveBeenCalled();
    });
  });
});
