package dev.pioruocco.wacchat.call;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Component;

@Component
@RequiredArgsConstructor
@Slf4j
public class CallSignalListener {

    private final SimpMessagingTemplate messagingTemplate;
    private final PushNotificationClient pushNotificationClient;

    @RabbitListener(queues = "${application.call.queue}")
    public void onCallSignalEvent(CallSignalEvent event) {
        log.info("Pushing call signal to {}: type={} chatId={}", event.toUserId(), event.signal().type(), event.signal().chatId());
        // Same /queue prefix requirement as NotificationListener — enableStompBrokerRelay
        // in WebSocketConfig only forwards /topic and /queue destinations.
        messagingTemplate.convertAndSendToUser(event.toUserId(), "/queue/call", event.signal());

        // Only INVITE is worth waking a backgrounded/closed client for — ANSWER/ICE/PEER_*
        // are mid-call plumbing between already-connected parties, END/REJECT/BUSY/MISSED/
        // PARTICIPANT_JOINED are post-hoc status updates.
        if (event.signal().type() == CallSignalType.INVITE) {
            // Text is built by backend in the recipient's language (see PushInternalController).
            pushNotificationClient.sendCallInvite(event.toUserId(), event.signal().fromUserName(), event.signal().chatId());
        }
    }
}
