package dev.pioruocco.wacchat.call;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.Duration;

/**
 * Calls backend's internal push-send endpoint to wake a backgrounded/closed client for an
 * incoming call INVITE. Fails open on backend outage, same as SessionValidationClient — a
 * missed push is a UX degradation, not a security boundary, and WS signaling (which is
 * unaffected either way) is the call's actual delivery path when the client is foreground.
 */
@Service
@Slf4j
public class PushNotificationClient {

    private final WebClient webClient;
    private final long responseTimeoutMs;

    public PushNotificationClient(WebClient backendWebClient,
                                   @Value("${application.backend.response-timeout-ms}") long responseTimeoutMs) {
        this.webClient = backendWebClient;
        this.responseTimeoutMs = responseTimeoutMs;
    }

    /** Asks backend to build the text itself, in the recipient's stored language
     *  (template "call.invite") — this service has no user DB to look the locale up in.
     *  Resilience4j sits directly on this method: it's called from another bean, so the proxy applies. */
    @CircuitBreaker(name = "pushNotification", fallbackMethod = "sendCallInviteFallback")
    @Retry(name = "pushNotification")
    public void sendCallInvite(String userId, String callerName, String chatId) {
        webClient.post()
                .uri("/api/v1/internal/push/send")
                .bodyValue(new SendPushRequest(userId, null, null, chatId, "call.invite", callerName))
                .retrieve()
                .toBodilessEntity()
                .block(Duration.ofMillis(responseTimeoutMs));
    }

    @SuppressWarnings("unused")
    private void sendCallInviteFallback(String userId, String callerName, String chatId, Throwable t) {
        log.warn("Push notification call to backend failed, failing open for user {}", userId, t);
    }

    record SendPushRequest(String userId, String title, String body, String chatId,
                           String template, String callerName) {
    }
}
