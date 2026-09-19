package dev.pioruocco.wacchat.call;

import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.WebClient;

import static org.assertj.core.api.Assertions.assertThatCode;

/**
 * notification-service has no MockWebServer dependency (unlike backend's
 * FileServiceClientTest), so this exercises the fail-open fallback directly rather than
 * simulating an actual backend outage over HTTP — same minimum bar used for
 * SessionValidationClient, which this class's shape mirrors.
 */
class PushNotificationClientTest {

    @Test
    void sendFallback_swallowsTheFailureInsteadOfPropagatingIt() {
        PushNotificationClient client = new PushNotificationClient(WebClient.create("http://localhost"), 2000L);

        assertThatCode(() -> ReflectionTestUtils.invokeMethod(
                client, "sendCallInviteFallback", "user-1", "Ada", "chat-1", new RuntimeException("backend down")))
                .doesNotThrowAnyException();
    }
}
