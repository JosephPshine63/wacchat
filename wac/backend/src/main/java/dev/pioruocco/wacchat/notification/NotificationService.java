package dev.pioruocco.wacchat.notification;

import dev.pioruocco.wacchat.common.i18n.Messages;
import dev.pioruocco.wacchat.common.i18n.SystemMessageTokens;
import dev.pioruocco.wacchat.push.PushDispatcher;
import dev.pioruocco.wacchat.user.UserLocales;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class NotificationService {

    // Only types worth waking a backgrounded/closed client for — status-only types (SEEN,
    // AVATAR_UPDATED, MESSAGE_EDITED/DELETED, REACTION_*, CHAT_REQUEST_ACCEPTED/REJECTED)
    // are foreground-UI enrichments, not worth an OS-level push.
    private static final Set<NotificationType> PUSH_ELIGIBLE_TYPES = EnumSet.of(
            NotificationType.MESSAGE, NotificationType.IMAGE, NotificationType.VIDEO, NotificationType.AUDIO,
            NotificationType.CHAT_REQUEST, NotificationType.GROUP_ADDED);

    private final RabbitTemplate rabbitTemplate;
    private final PushDispatcher pushDispatcher;
    private final Messages messages;
    private final UserLocales userLocales;

    @Value("${application.notification.exchange}")
    private String exchangeName;

    @Value("${application.notification.routing-key}")
    private String routingKey;

    public void sendNotification(String userId, Notification notification) {
        log.info("Publishing notification event for {} with payload {}", userId, notification);
        rabbitTemplate.convertAndSend(exchangeName, routingKey, new NotificationEvent(userId, notification));

        if (PUSH_ELIGIBLE_TYPES.contains(notification.getType())) {
            Locale locale = userLocales.of(userId);
            pushDispatcher.dispatch(userId, buildPushTitle(notification, locale), buildPushBody(notification, locale), notification.getChatId());
        }
    }

    private String buildPushTitle(Notification notification, Locale locale) {
        String chatName = notification.getChatName();
        return (chatName != null && !chatName.isBlank()) ? chatName : messages.get("push.title.newMessage", locale);
    }

    private String buildPushBody(Notification notification, Locale locale) {
        return switch (notification.getType()) {
            case IMAGE, VIDEO, AUDIO -> messages.get("push.body.media", locale);
            case CHAT_REQUEST -> messages.get("push.body.chatRequest", locale);
            case GROUP_ADDED -> messages.get("push.body.groupAdded", locale);
            default -> notification.getContent() != null
                    ? SystemMessageTokens.render(notification.getContent(), locale, messages) : "";
        };
    }
}
