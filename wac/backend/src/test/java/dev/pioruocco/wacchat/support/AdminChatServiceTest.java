package dev.pioruocco.wacchat.support;

import dev.pioruocco.wacchat.chat.ChatService;
import dev.pioruocco.wacchat.common.i18n.Messages;
import dev.pioruocco.wacchat.message.MessageType;
import dev.pioruocco.wacchat.message.SystemMessageSender;
import dev.pioruocco.wacchat.user.UserLocales;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.context.support.ResourceBundleMessageSource;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.Locale;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class AdminChatServiceTest {

    private static final String ADMIN_USER_ID = "admin-1";
    private static final String REAL_USER_ID = "user-1";

    @Mock
    private ChatService chatService;
    @Mock
    private SystemMessageSender systemMessageSender;

    @Mock
    private UserLocales userLocales;

    private AdminChatService adminChatService;

    private AdminChatService withAdminUserId(String adminUserId) {
        ResourceBundleMessageSource source = new ResourceBundleMessageSource();
        source.setBasename("messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        lenient().when(userLocales.of(any())).thenReturn(Locale.ITALIAN);
        AdminChatService service = new AdminChatService(chatService, systemMessageSender, new Messages(source), userLocales);
        ReflectionTestUtils.setField(service, "adminUserId", adminUserId);
        return service;
    }

    @Test
    void createChatWithWelcomeMessage_adminConfigured_createsAcceptedChatAndWelcomeMessage() {
        adminChatService = withAdminUserId(ADMIN_USER_ID);
        when(chatService.createSystemChat(REAL_USER_ID, ADMIN_USER_ID)).thenReturn("chat-1");

        adminChatService.createChatWithWelcomeMessage(REAL_USER_ID);

        verify(chatService).createSystemChat(REAL_USER_ID, ADMIN_USER_ID);
        verify(systemMessageSender).saveSystemMessage(
                eq("chat-1"), eq(ADMIN_USER_ID), eq(REAL_USER_ID), anyString(), eq(MessageType.TEXT));
    }

    @Test
    void createChatWithWelcomeMessage_adminUnset_isNoOp() {
        adminChatService = withAdminUserId("");

        adminChatService.createChatWithWelcomeMessage(REAL_USER_ID);

        verify(chatService, never()).createSystemChat(any(), any());
        verify(systemMessageSender, never()).saveSystemMessage(any(), any(), any(), any(), any());
    }

    @Test
    void createChatWithWelcomeMessage_calledForAdminItself_isNoOp() {
        adminChatService = withAdminUserId(ADMIN_USER_ID);

        adminChatService.createChatWithWelcomeMessage(ADMIN_USER_ID);

        verify(chatService, never()).createSystemChat(any(), any());
        verify(systemMessageSender, never()).saveSystemMessage(any(), any(), any(), any(), any());
    }

    @Test
    void isEnabled_reflectsAdminUserIdPresence() {
        assertIsEnabled(true, ADMIN_USER_ID);
        assertIsEnabled(false, "");
    }

    private void assertIsEnabled(boolean expected, String adminUserId) {
        AdminChatService service = withAdminUserId(adminUserId);
        org.assertj.core.api.Assertions.assertThat(service.isEnabled()).isEqualTo(expected);
    }
}
