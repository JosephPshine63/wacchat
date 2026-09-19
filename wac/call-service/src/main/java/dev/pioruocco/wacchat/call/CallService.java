package dev.pioruocco.wacchat.call;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Set;

@Service
@RequiredArgsConstructor
@Slf4j
public class CallService {

    private final CallSessionStore sessionStore;
    private final ChatValidationClient chatValidationClient;
    private final InternalMessageClient internalMessageClient;
    private final RabbitTemplate rabbitTemplate;

    @Value("${application.call.exchange}")
    private String exchangeName;

    @Value("${application.call.routing-key}")
    private String routingKey;

    @Value("${application.call.ring-timeout-seconds}")
    private long ringTimeoutSeconds;

    @Value("${application.call.max-participants}")
    private int maxParticipants;

    public void invite(String chatId, String callerId, String callerName, List<InviteeOffer> invitees, String callType) {
        if (invitees == null || invitees.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "At least one invitee is required");
        }
        List<String> inviteeIds = invitees.stream().map(InviteeOffer::peerId).toList();
        if (inviteeIds.contains(callerId)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Cannot invite yourself");
        }
        if (Set.copyOf(inviteeIds).size() != inviteeIds.size()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Duplicate invitees");
        }
        if (1 + inviteeIds.size() > maxParticipants) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Too many participants (max " + maxParticipants + ")");
        }

        boolean allowed = inviteeIds.size() == 1
                ? chatValidationClient.isAccepted(chatId, callerId, inviteeIds.get(0))
                : chatValidationClient.isGroupCallAllowed(chatId, callerId, inviteeIds);
        if (!allowed) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "No accepted chat between these users");
        }

        CallSession session = sessionStore.createIfAbsent(chatId, callerId, callType, inviteeIds)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.CONFLICT, "Call already active for this chat"));

        for (InviteeOffer invitee : invitees) {
            publish(invitee.peerId(),
                    new CallSignal(chatId, callerId, CallSignalType.INVITE, callType, invitee.sdpOffer(), null, null, null, callerName));
        }
    }

    public void answer(String chatId, String calleeId, String sdpAnswer) {
        CallSession session = requireParticipant(chatId, calleeId);
        if (calleeId.equals(session.getCallerId())) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No active call for this chat");
        }
        if (!session.markJoinedIfRinging(calleeId, Instant.now())) {
            // Lost the race against sweepRingTimeouts() (or a duplicate answer) — this
            // participant is no longer RINGING, so the answer is stale.
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Call is no longer ringing");
        }
        publish(session.getCallerId(),
                new CallSignal(chatId, calleeId, CallSignalType.ANSWER, session.getCallType(), sdpAnswer, null, null, null, null));

        // Mesh bootstrap: every other already-joined participant (besides the caller, who
        // already has a direct link to the new joiner from the original invite/answer)
        // proactively opens a new peer connection toward whoever just joined.
        for (String otherId : session.joinedParticipantIds()) {
            if (!otherId.equals(calleeId) && !otherId.equals(session.getCallerId())) {
                publish(otherId, new CallSignal(chatId, calleeId, CallSignalType.PARTICIPANT_JOINED,
                        session.getCallType(), null, null, null, null, null));
            }
        }
    }

    public void peerOffer(String chatId, String fromUserId, String peerId, String sdpOffer) {
        CallSession session = requireParticipant(chatId, fromUserId);
        requireParticipantId(session, peerId);
        publish(peerId, new CallSignal(chatId, fromUserId, CallSignalType.PEER_OFFER, session.getCallType(), sdpOffer, null, null, null, null));
    }

    public void peerAnswer(String chatId, String fromUserId, String peerId, String sdpAnswer) {
        CallSession session = requireParticipant(chatId, fromUserId);
        requireParticipantId(session, peerId);
        publish(peerId, new CallSignal(chatId, fromUserId, CallSignalType.PEER_ANSWER, session.getCallType(), sdpAnswer, null, null, null, null));
    }

    public void iceCandidate(String chatId, String fromUserId, String peerId, String candidate, String sdpMid, Integer sdpMLineIndex) {
        CallSession session = requireParticipant(chatId, fromUserId);
        requireParticipantId(session, peerId);
        publish(peerId,
                new CallSignal(chatId, fromUserId, CallSignalType.ICE_CANDIDATE, session.getCallType(), null, candidate, sdpMid, sdpMLineIndex, null));
    }

    public void end(String chatId, String userId, String reason) {
        CallSession session = sessionStore.get(chatId).orElse(null);
        if (session == null) {
            return;
        }
        if (!session.isParticipant(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No active call for this chat");
        }
        CallSignalType signalType = "REJECT".equals(reason) ? CallSignalType.REJECT : CallSignalType.END;
        ParticipantState endState = signalType == CallSignalType.REJECT ? ParticipantState.DECLINED : ParticipantState.LEFT;
        session.leave(userId, endState);

        CallSignal signal = new CallSignal(chatId, userId, signalType, session.getCallType(), null, null, null, null, null);
        for (String otherId : session.activeParticipantIds()) {
            publish(otherId, signal);
        }

        if (session.activeParticipantIds().size() <= 1) {
            sessionStore.remove(chatId);
            leaveSystemMessage(session);
        }
    }

    @Scheduled(fixedDelay = 5000)
    void sweepRingTimeouts() {
        Instant cutoff = Instant.now().minus(Duration.ofSeconds(ringTimeoutSeconds));
        for (CallSession session : List.copyOf(sessionStore.allSessions())) {
            for (String ringingId : Set.copyOf(session.ringingParticipantIds())) {
                if (session.markMissedIfRingingPast(ringingId, cutoff)) {
                    log.info("Ring timeout for chat {} participant {}, marking MISSED", session.getChatId(), ringingId);
                    // fromUserId identifies WHICH participant missed (not the caller) so a
                    // group call's other participants can tell who to drop from their
                    // roster — the timed-out participant's own client uses it the same way
                    // an END/REJECT sender id is used, to dismiss their own incoming banner.
                    CallSignal missed = new CallSignal(session.getChatId(), ringingId, CallSignalType.MISSED,
                            session.getCallType(), null, null, null, null, null);
                    publish(session.getCallerId(), missed);
                    publish(ringingId, missed);
                }
            }
            if (session.activeParticipantIds().size() <= 1) {
                sessionStore.remove(session.getChatId());
                leaveSystemMessage(session);
            }
        }
    }

    private void leaveSystemMessage(CallSession session) {
        Instant earliestJoin = session.earliestInviteeJoinAt();
        if (session.isGroupCall()) {
            // Language-neutral tokens ("i18n:<key>|<arg>|..."), rendered per viewer by the
            // frontend (and by backend for push bodies) — the row is shared by every member.
            String content = earliestJoin != null
                    ? "i18n:call.summary.groupEndedDuration|" + formatDuration(Duration.between(earliestJoin, Instant.now()))
                            + "|" + session.everJoinedCount()
                    : "i18n:call.summary.groupEnded";
            internalMessageClient.sendGroupSystemMessage(session.getChatId(), session.getCallerId(), content);
        } else {
            String content = earliestJoin != null
                    ? "i18n:call.summary.ended|" + formatDuration(Duration.between(earliestJoin, Instant.now()))
                    : "i18n:call.summary.missed";
            String calleeId = session.allParticipantIds().stream()
                    .filter(id -> !id.equals(session.getCallerId()))
                    .findFirst()
                    .orElse(null);
            internalMessageClient.sendSystemMessage(session.getChatId(), session.getCallerId(), calleeId, content);
        }
    }

    private static String formatDuration(Duration duration) {
        long totalSeconds = Math.max(0, duration.getSeconds());
        return String.format("%02d:%02d", totalSeconds / 60, totalSeconds % 60);
    }

    private CallSession requireSession(String chatId) {
        return sessionStore.get(chatId)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "No active call for this chat"));
    }

    private CallSession requireParticipant(String chatId, String userId) {
        CallSession session = requireSession(chatId);
        requireParticipantId(session, userId);
        return session;
    }

    private void requireParticipantId(CallSession session, String userId) {
        if (!session.isParticipant(userId)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "No active call for this chat");
        }
    }

    private void publish(String toUserId, CallSignal signal) {
        rabbitTemplate.convertAndSend(exchangeName, routingKey, new CallSignalEvent(toUserId, signal));
    }
}
