package dev.pioruocco.wacchat.push;

import dev.pioruocco.wacchat.common.i18n.Messages;
import dev.pioruocco.wacchat.user.UserLocales;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import java.util.Locale;

/**
 * Called by notification-service's CallSignalListener for an incoming call INVITE (the
 * only call signal worth waking a backgrounded/closed client for). Guarded by
 * InternalAuthFilter, not JWT — same family as /api/v1/internal/sessions/validate and
 * /api/v1/internal/chats/validate.
 */
@RestController
@RequestMapping("/api/v1/internal/push")
@RequiredArgsConstructor
public class PushInternalController {

    private final PushDispatcher pushDispatcher;
    private final Messages messages;
    private final UserLocales userLocales;

    @PostMapping("/send")
    @ResponseStatus(HttpStatus.ACCEPTED)
    public void send(@RequestBody SendPushRequest request) {
        String title = request.title();
        String body = request.body();
        // "call.invite" lets the caller (notification-service, which has no user DB) ask for
        // the text to be built here, in the recipient's stored language; title/body stay as
        // the fallback for callers that still send finished text.
        if ("call.invite".equals(request.template())) {
            Locale locale = userLocales.of(request.userId());
            String caller = request.callerName();
            title = (caller != null && !caller.isBlank())
                    ? messages.get("push.call.titleNamed", locale, caller)
                    : messages.get("push.call.title", locale);
            body = messages.get("push.call.body", locale);
        }
        pushDispatcher.dispatch(request.userId(), title, body, request.chatId());
    }

    public record SendPushRequest(String userId, String title, String body, String chatId,
                                  String template, String callerName) {
    }
}
