package dev.pioruocco.wacchat.support;

import dev.pioruocco.wacchat.chat.ChatService;
import dev.pioruocco.wacchat.message.MessageType;
import dev.pioruocco.wacchat.message.SystemMessageSender;
import dev.pioruocco.wacchat.common.i18n.Messages;
import dev.pioruocco.wacchat.user.UserLocales;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/**
 * Auto-creates a direct chat between every new user and the real admin account
 * (a normal Keycloak-issued user, not a fixed bot id like Arno), so users can report
 * bugs or reach the admin without a separate ticket/form system. Unlike BotService,
 * there is no AI/Gemini reply logic here — the admin answers manually through the
 * ordinary chat UI.
 */
@Service
@RequiredArgsConstructor
public class AdminChatService {

    private final ChatService chatService;
    private final SystemMessageSender systemMessageSender;
    private final Messages messages;
    private final UserLocales userLocales;

    @Value("${application.admin.user-id:}")
    private String adminUserId;

    public boolean isEnabled() {
        return !adminUserId.isBlank();
    }

    /** Called synchronously right after username-setup completes, same trigger point as
     *  BotService.createChatWithWelcomeMessage. No-op if ADMIN_USER_ID is unset, or if the
     *  new user IS the admin (avoids the admin's own onboarding creating a self-chat). */
    public void createChatWithWelcomeMessage(String realUserId) {
        if (!isEnabled() || adminUserId.equals(realUserId)) {
            return;
        }
        String chatId = chatService.createSystemChat(realUserId, adminUserId);
        systemMessageSender.saveSystemMessage(
                chatId, adminUserId, realUserId, messages.get("admin.welcome", userLocales.of(realUserId)), MessageType.TEXT);
    }

    /** Lazy fallback for users who completed username-setup before this feature existed
     *  (createChatWithWelcomeMessage only fires once, at that trigger point) — called from
     *  the frontend's "Segnala un bug" button so it works retroactively for any account.
     *  Idempotent: reuses an existing chat instead of re-sending the welcome message.
     *  Returns null if the feature is disabled (ADMIN_USER_ID unset) or the caller IS the
     *  admin account, so the controller can respond 404 instead of chatting with itself. */
    public String getOrCreateChatId(String realUserId) {
        if (!isEnabled() || adminUserId.equals(realUserId)) {
            return null;
        }
        boolean alreadyExists = chatService.chatExistsBetween(realUserId, adminUserId);
        String chatId = chatService.createSystemChat(realUserId, adminUserId);
        if (!alreadyExists) {
            systemMessageSender.saveSystemMessage(
                    chatId, adminUserId, realUserId, messages.get("admin.welcome", userLocales.of(realUserId)), MessageType.TEXT);
        }
        return chatId;
    }
}
