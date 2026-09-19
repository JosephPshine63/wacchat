package dev.pioruocco.wacchat.bot;

import dev.pioruocco.wacchat.bot.GeminiClient.GeminiContent;
import dev.pioruocco.wacchat.chat.ChatService;
import dev.pioruocco.wacchat.message.Message;
import dev.pioruocco.wacchat.message.MessageRepository;
import dev.pioruocco.wacchat.message.MessageType;
import dev.pioruocco.wacchat.message.SystemMessageSender;
import dev.pioruocco.wacchat.common.i18n.Messages;
import dev.pioruocco.wacchat.user.UserLocales;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;

@Service
@RequiredArgsConstructor
@Slf4j
public class BotService {

    private static final int HISTORY_SIZE = 20;

    private final GeminiClient geminiClient;
    private final MessageRepository messageRepository;
    private final SystemMessageSender systemMessageSender;
    private final ChatService chatService;
    private final Messages messages;
    private final UserLocales userLocales;

    @Value("${application.bot.gemini.api-key:}")
    private String geminiApiKey;

    public boolean isEnabled() {
        return !geminiApiKey.isBlank();
    }

    /** Called synchronously right after username-setup completes — no Gemini call involved,
     *  so there's no latency/availability reason to make this async. */
    public void createChatWithWelcomeMessage(String realUserId) {
        if (!isEnabled()) {
            return;
        }
        String chatId = chatService.createSystemChat(realUserId, BotConstants.ARNO_USER_ID);
        systemMessageSender.saveSystemMessage(
                chatId, BotConstants.ARNO_USER_ID, realUserId,
                messages.get("bot.welcome", userLocales.of(realUserId)), MessageType.TEXT);
    }

    /** Called after a real user sends a text message into the Arno chat. Runs off the request
     *  thread so the human's own POST /api/v1/messages never waits on a Gemini network call. */
    @Async("botReplyExecutor")
    public void generateAndSendReply(String chatId, String realUserId) {
        if (!isEnabled()) {
            return;
        }
        try {
            List<GeminiContent> conversation = buildConversation(chatId);
            Locale locale = userLocales.of(realUserId);
            String reply = geminiClient.generateReply(conversation, locale);
            String content = (reply != null && !reply.isBlank()) ? reply : messages.get("bot.fallback", locale);
            systemMessageSender.saveSystemMessage(
                    chatId, BotConstants.ARNO_USER_ID, realUserId, content, MessageType.TEXT);
        } catch (Exception e) {
            log.error("Failed to generate/send Arno reply for chat {}", chatId, e);
        }
    }

    private List<GeminiContent> buildConversation(String chatId) {
        List<Message> history = messageRepository.findMessagesByChatId(chatId);
        int from = Math.max(0, history.size() - HISTORY_SIZE);
        return history.subList(from, history.size()).stream()
                .filter(m -> m.getType() == MessageType.TEXT && m.getContent() != null)
                .map(m -> GeminiContent.of(
                        BotConstants.ARNO_USER_ID.equals(m.getSenderId()) ? "model" : "user",
                        m.getContent()))
                .toList();
    }
}
