package dev.pioruocco.wacchat.call;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.server.ResponseStatusException;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CallServiceTest {

    private static final String CHAT_ID = "chat-1";
    private static final String CALLER_ID = "caller-1";
    private static final String CALLEE_ID = "callee-1";
    private static final String INVITEE_1 = "invitee-1";
    private static final String INVITEE_2 = "invitee-2";

    @Mock
    private ChatValidationClient chatValidationClient;
    @Mock
    private InternalMessageClient internalMessageClient;
    @Mock
    private RabbitTemplate rabbitTemplate;

    private CallSessionStore sessionStore;
    private CallService callService;

    @BeforeEach
    void setUp() {
        sessionStore = new CallSessionStore();
        callService = new CallService(sessionStore, chatValidationClient, internalMessageClient, rabbitTemplate);
        ReflectionTestUtils.setField(callService, "exchangeName", "wacchat.calls");
        ReflectionTestUtils.setField(callService, "routingKey", "call");
        ReflectionTestUtils.setField(callService, "ringTimeoutSeconds", 45L);
        ReflectionTestUtils.setField(callService, "maxParticipants", 8);
    }

    private void invite1to1(String sdpOffer) {
        callService.invite(CHAT_ID, CALLER_ID, "Caller Name", List.of(new InviteeOffer(CALLEE_ID, sdpOffer)), "AUDIO");
    }

    @SuppressWarnings("unchecked")
    private void backdateInvitedAt(CallSession session, String userId, Instant instant) {
        Map<String, Object> participants = (Map<String, Object>) ReflectionTestUtils.getField(session, "participants");
        Object participant = participants.get(userId);
        ReflectionTestUtils.setField(participant, "invitedAt", instant);
    }

    // --- 1:1 behavior (must stay byte-identical to the pre-mesh implementation) ---

    @Test
    void invite_chatNotAccepted_isRejectedAndNoSessionCreated() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(false);

        assertThatThrownBy(() -> invite1to1("sdp-offer"))
                .isInstanceOf(ResponseStatusException.class);

        assertThat(sessionStore.get(CHAT_ID)).isEmpty();
        verify(rabbitTemplate, never()).convertAndSend(anyString(), anyString(), any(Object.class));
    }

    @Test
    void invite_chatAccepted_createsRingingSessionAndPublishesInvite() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(true);

        invite1to1("sdp-offer");

        assertThat(sessionStore.get(CHAT_ID)).isPresent();
        assertThat(sessionStore.get(CHAT_ID).get().stateOf(CALLEE_ID)).isEqualTo(ParticipantState.RINGING);

        ArgumentCaptor<CallSignalEvent> captor = ArgumentCaptor.forClass(CallSignalEvent.class);
        verify(rabbitTemplate).convertAndSend(eq("wacchat.calls"), eq("call"), captor.capture());
        CallSignalEvent event = captor.getValue();
        assertThat(event.toUserId()).isEqualTo(CALLEE_ID);
        assertThat(event.signal().type()).isEqualTo(CallSignalType.INVITE);
        assertThat(event.signal().sdp()).isEqualTo("sdp-offer");
    }

    @Test
    void invite_secondInviteWhileCallActive_throwsConflictAndDoesNotOverwriteSession() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(true);
        invite1to1("sdp-offer");

        assertThatThrownBy(() -> invite1to1("sdp-offer-2"))
                .isInstanceOf(ResponseStatusException.class);

        verify(rabbitTemplate, times(1)).convertAndSend(eq("wacchat.calls"), eq("call"), any(CallSignalEvent.class));
    }

    @Test
    void answer_noSessionForChat_throwsNotFound() {
        assertThatThrownBy(() -> callService.answer(CHAT_ID, CALLEE_ID, "sdp-answer"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void answer_existingSession_movesToInCallAndNotifiesCaller() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(true);
        invite1to1("sdp-offer");

        callService.answer(CHAT_ID, CALLEE_ID, "sdp-answer");

        CallSession session = sessionStore.get(CHAT_ID).orElseThrow();
        assertThat(session.stateOf(CALLEE_ID)).isEqualTo(ParticipantState.JOINED);
        assertThat(session.joinedAtOf(CALLEE_ID)).isNotNull();

        ArgumentCaptor<CallSignalEvent> captor = ArgumentCaptor.forClass(CallSignalEvent.class);
        verify(rabbitTemplate, times(2)).convertAndSend(eq("wacchat.calls"), eq("call"), captor.capture());
        CallSignalEvent answerEvent = captor.getAllValues().get(1);
        assertThat(answerEvent.toUserId()).isEqualTo(CALLER_ID);
        assertThat(answerEvent.signal().type()).isEqualTo(CallSignalType.ANSWER);
    }

    @Test
    void answer_callerAttemptsToAnswerOwnCall_throwsNotFound() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(true);
        invite1to1("sdp-offer");

        assertThatThrownBy(() -> callService.answer(CHAT_ID, CALLER_ID, "sdp-answer"))
                .isInstanceOf(ResponseStatusException.class);

        assertThat(sessionStore.get(CHAT_ID).get().stateOf(CALLEE_ID)).isEqualTo(ParticipantState.RINGING);
    }

    @Test
    void answer_thirdPartyUser_throwsNotFoundAndSessionUnchanged() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(true);
        invite1to1("sdp-offer");

        assertThatThrownBy(() -> callService.answer(CHAT_ID, "stranger-1", "sdp-answer"))
                .isInstanceOf(ResponseStatusException.class);

        assertThat(sessionStore.get(CHAT_ID).get().stateOf(CALLEE_ID)).isEqualTo(ParticipantState.RINGING);
        verify(rabbitTemplate, times(1)).convertAndSend(eq("wacchat.calls"), eq("call"), any(CallSignalEvent.class));
    }

    @Test
    void iceCandidate_thirdPartyUser_throwsNotFound() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(true);
        invite1to1("sdp-offer");

        assertThatThrownBy(() -> callService.iceCandidate(CHAT_ID, "stranger-1", CALLEE_ID, "candidate", "0", 0))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void iceCandidate_relaysToSpecifiedPeer() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(true);
        invite1to1("sdp-offer");

        callService.iceCandidate(CHAT_ID, CALLER_ID, CALLEE_ID, "candidate", "0", 0);

        ArgumentCaptor<CallSignalEvent> captor = ArgumentCaptor.forClass(CallSignalEvent.class);
        verify(rabbitTemplate, times(2)).convertAndSend(eq("wacchat.calls"), eq("call"), captor.capture());
        CallSignalEvent iceEvent = captor.getAllValues().get(1);
        assertThat(iceEvent.toUserId()).isEqualTo(CALLEE_ID);
        assertThat(iceEvent.signal().type()).isEqualTo(CallSignalType.ICE_CANDIDATE);
        assertThat(iceEvent.signal().candidate()).isEqualTo("candidate");
    }

    @Test
    void end_thirdPartyUser_throwsNotFoundAndSessionSurvives() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(true);
        invite1to1("sdp-offer");

        assertThatThrownBy(() -> callService.end(CHAT_ID, "stranger-1", "HANGUP"))
                .isInstanceOf(ResponseStatusException.class);

        assertThat(sessionStore.get(CHAT_ID)).isPresent();
    }

    @Test
    void answer_calledTwice_secondCallThrowsConflictInsteadOfSilentlyReAnswering() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(true);
        invite1to1("sdp-offer");
        callService.answer(CHAT_ID, CALLEE_ID, "sdp-answer");

        assertThatThrownBy(() -> callService.answer(CHAT_ID, CALLEE_ID, "sdp-answer-2"))
                .isInstanceOf(ResponseStatusException.class);

        // Only the original invite + first answer, not a second ANSWER event.
        verify(rabbitTemplate, times(2)).convertAndSend(eq("wacchat.calls"), eq("call"), any(CallSignalEvent.class));
    }

    @Test
    void sweepRingTimeouts_sessionAlreadyAnsweredConcurrently_doesNotOverrideAnsweredSession() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(true);
        invite1to1("sdp-offer");
        callService.answer(CHAT_ID, CALLEE_ID, "sdp-answer");
        // Backdate as if the invite had been open long enough to be swept — simulates the
        // sweep and answer() racing right at the timeout boundary.
        backdateInvitedAt(sessionStore.get(CHAT_ID).orElseThrow(), CALLEE_ID, Instant.now().minus(Duration.ofSeconds(46)));

        callService.sweepRingTimeouts();

        assertThat(sessionStore.get(CHAT_ID)).isPresent();
        assertThat(sessionStore.get(CHAT_ID).get().stateOf(CALLEE_ID)).isEqualTo(ParticipantState.JOINED);
        verify(internalMessageClient, never()).sendSystemMessage(anyString(), anyString(), anyString(), anyString());
    }

    @Test
    void end_fromInCall_removesSessionAndLeavesDurationSystemMessage() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(true);
        invite1to1("sdp-offer");
        callService.answer(CHAT_ID, CALLEE_ID, "sdp-answer");

        callService.end(CHAT_ID, CALLER_ID, "HANGUP");

        assertThat(sessionStore.get(CHAT_ID)).isEmpty();
        verify(internalMessageClient).sendSystemMessage(eq(CHAT_ID), eq(CALLER_ID), eq(CALLEE_ID),
                eq("i18n:call.summary.ended|00:00"));
    }

    @Test
    void end_whileStillRinging_leavesMissedCallSystemMessage() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(true);
        invite1to1("sdp-offer");

        callService.end(CHAT_ID, CALLEE_ID, "REJECT");

        verify(internalMessageClient).sendSystemMessage(CHAT_ID, CALLER_ID, CALLEE_ID, "i18n:call.summary.missed");
    }

    @Test
    void sweepRingTimeouts_ringingPastTimeout_isMarkedMissedAndBothPeersNotified() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(true);
        invite1to1("sdp-offer");
        // Backdate invitedAt past the 45s timeout without waiting in the test.
        backdateInvitedAt(sessionStore.get(CHAT_ID).orElseThrow(), CALLEE_ID, Instant.now().minus(Duration.ofSeconds(46)));

        callService.sweepRingTimeouts();

        assertThat(sessionStore.get(CHAT_ID)).isEmpty();
        ArgumentCaptor<CallSignalEvent> captor = ArgumentCaptor.forClass(CallSignalEvent.class);
        verify(rabbitTemplate, times(3)).convertAndSend(eq("wacchat.calls"), eq("call"), captor.capture());
        assertThat(captor.getAllValues().get(1).signal().type()).isEqualTo(CallSignalType.MISSED);
        assertThat(captor.getAllValues().get(2).signal().type()).isEqualTo(CallSignalType.MISSED);
        verify(internalMessageClient).sendSystemMessage(CHAT_ID, CALLER_ID, CALLEE_ID, "i18n:call.summary.missed");
    }

    @Test
    void sweepRingTimeouts_stillWithinTimeout_leavesSessionUntouched() {
        when(chatValidationClient.isAccepted(CHAT_ID, CALLER_ID, CALLEE_ID)).thenReturn(true);
        invite1to1("sdp-offer");

        callService.sweepRingTimeouts();

        assertThat(sessionStore.get(CHAT_ID)).isPresent();
    }

    // --- invite validation ---

    @Test
    void invite_selfInvite_throwsBadRequest() {
        assertThatThrownBy(() -> callService.invite(CHAT_ID, CALLER_ID, "Caller Name", List.of(new InviteeOffer(CALLER_ID, "sdp")), "AUDIO"))
                .isInstanceOf(ResponseStatusException.class);
        verify(rabbitTemplate, never()).convertAndSend(anyString(), anyString(), any(Object.class));
    }

    @Test
    void invite_duplicateInvitees_throwsBadRequest() {
        List<InviteeOffer> invitees = List.of(new InviteeOffer(INVITEE_1, "sdp-1"), new InviteeOffer(INVITEE_1, "sdp-1b"));

        assertThatThrownBy(() -> callService.invite(CHAT_ID, CALLER_ID, "Caller Name", invitees, "AUDIO"))
                .isInstanceOf(ResponseStatusException.class);
        verify(rabbitTemplate, never()).convertAndSend(anyString(), anyString(), any(Object.class));
    }

    @Test
    void invite_tooManyParticipants_throwsBadRequest() {
        ReflectionTestUtils.setField(callService, "maxParticipants", 3);
        List<InviteeOffer> invitees = List.of(
                new InviteeOffer(INVITEE_1, "sdp-1"), new InviteeOffer(INVITEE_2, "sdp-2"), new InviteeOffer("invitee-3", "sdp-3"));

        assertThatThrownBy(() -> callService.invite(CHAT_ID, CALLER_ID, "Caller Name", invitees, "AUDIO"))
                .isInstanceOf(ResponseStatusException.class);
        verify(rabbitTemplate, never()).convertAndSend(anyString(), anyString(), any(Object.class));
    }

    // --- group calls (mesh) ---

    private void inviteGroup() {
        when(chatValidationClient.isGroupCallAllowed(CHAT_ID, CALLER_ID, List.of(INVITEE_1, INVITEE_2))).thenReturn(true);
        callService.invite(CHAT_ID, CALLER_ID, "Caller Name",
                List.of(new InviteeOffer(INVITEE_1, "sdp-1"), new InviteeOffer(INVITEE_2, "sdp-2")), "VIDEO");
    }

    @Test
    void groupInvite_validatesAsGroupCallAndPublishesOneInvitePerInvitee() {
        inviteGroup();

        CallSession session = sessionStore.get(CHAT_ID).orElseThrow();
        assertThat(session.isGroupCall()).isTrue();
        assertThat(session.stateOf(INVITEE_1)).isEqualTo(ParticipantState.RINGING);
        assertThat(session.stateOf(INVITEE_2)).isEqualTo(ParticipantState.RINGING);

        ArgumentCaptor<CallSignalEvent> captor = ArgumentCaptor.forClass(CallSignalEvent.class);
        verify(rabbitTemplate, times(2)).convertAndSend(eq("wacchat.calls"), eq("call"), captor.capture());
        assertThat(captor.getAllValues())
                .extracting(CallSignalEvent::toUserId)
                .containsExactlyInAnyOrder(INVITEE_1, INVITEE_2);
        assertThat(captor.getAllValues()).allSatisfy(event -> assertThat(event.signal().type()).isEqualTo(CallSignalType.INVITE));
    }

    @Test
    void groupInvite_secondInviteWhileActive_throwsConflict() {
        inviteGroup();

        assertThatThrownBy(() -> callService.invite(CHAT_ID, CALLER_ID, "Caller Name",
                List.of(new InviteeOffer(INVITEE_1, "sdp-1b"), new InviteeOffer(INVITEE_2, "sdp-2b")), "VIDEO"))
                .isInstanceOf(ResponseStatusException.class);

        verify(rabbitTemplate, times(2)).convertAndSend(eq("wacchat.calls"), eq("call"), any(CallSignalEvent.class));
    }

    @Test
    void groupAnswer_secondInviteeJoining_bootstrapsMeshViaParticipantJoinedSignal() {
        inviteGroup();

        callService.answer(CHAT_ID, INVITEE_1, "sdp-answer-1");
        callService.answer(CHAT_ID, INVITEE_2, "sdp-answer-2");

        CallSession session = sessionStore.get(CHAT_ID).orElseThrow();
        assertThat(session.stateOf(INVITEE_1)).isEqualTo(ParticipantState.JOINED);
        assertThat(session.stateOf(INVITEE_2)).isEqualTo(ParticipantState.JOINED);

        ArgumentCaptor<CallSignalEvent> captor = ArgumentCaptor.forClass(CallSignalEvent.class);
        // 2 INVITE + 1 ANSWER (invitee-1, no bootstrap yet) + 1 ANSWER + 1 PARTICIPANT_JOINED (invitee-2 joining).
        verify(rabbitTemplate, times(5)).convertAndSend(eq("wacchat.calls"), eq("call"), captor.capture());

        CallSignalEvent bootstrap = captor.getAllValues().get(4);
        assertThat(bootstrap.toUserId()).isEqualTo(INVITEE_1);
        assertThat(bootstrap.signal().type()).isEqualTo(CallSignalType.PARTICIPANT_JOINED);
        assertThat(bootstrap.signal().fromUserId()).isEqualTo(INVITEE_2);
    }

    @Test
    void peerOffer_relaysSignalToTargetPeer() {
        inviteGroup();
        callService.answer(CHAT_ID, INVITEE_1, "sdp-answer-1");
        callService.answer(CHAT_ID, INVITEE_2, "sdp-answer-2");

        callService.peerOffer(CHAT_ID, INVITEE_1, INVITEE_2, "peer-sdp-offer");

        ArgumentCaptor<CallSignalEvent> captor = ArgumentCaptor.forClass(CallSignalEvent.class);
        verify(rabbitTemplate, times(6)).convertAndSend(eq("wacchat.calls"), eq("call"), captor.capture());
        CallSignalEvent event = captor.getAllValues().get(5);
        assertThat(event.toUserId()).isEqualTo(INVITEE_2);
        assertThat(event.signal().fromUserId()).isEqualTo(INVITEE_1);
        assertThat(event.signal().type()).isEqualTo(CallSignalType.PEER_OFFER);
        assertThat(event.signal().sdp()).isEqualTo("peer-sdp-offer");
    }

    @Test
    void peerOffer_nonParticipantPeer_throwsNotFound() {
        inviteGroup();
        callService.answer(CHAT_ID, INVITEE_1, "sdp-answer-1");

        assertThatThrownBy(() -> callService.peerOffer(CHAT_ID, INVITEE_1, "stranger-1", "sdp"))
                .isInstanceOf(ResponseStatusException.class);
    }

    @Test
    void peerAnswer_relaysSignalToTargetPeer() {
        inviteGroup();
        callService.answer(CHAT_ID, INVITEE_1, "sdp-answer-1");
        callService.answer(CHAT_ID, INVITEE_2, "sdp-answer-2");

        callService.peerAnswer(CHAT_ID, INVITEE_2, INVITEE_1, "peer-sdp-answer");

        ArgumentCaptor<CallSignalEvent> captor = ArgumentCaptor.forClass(CallSignalEvent.class);
        verify(rabbitTemplate, times(6)).convertAndSend(eq("wacchat.calls"), eq("call"), captor.capture());
        CallSignalEvent event = captor.getAllValues().get(5);
        assertThat(event.toUserId()).isEqualTo(INVITEE_1);
        assertThat(event.signal().fromUserId()).isEqualTo(INVITEE_2);
        assertThat(event.signal().type()).isEqualTo(CallSignalType.PEER_ANSWER);
    }

    @Test
    void groupEnd_participantLeavesWithTwoRemaining_continuesCallWithoutSystemMessage() {
        inviteGroup();
        callService.answer(CHAT_ID, INVITEE_1, "sdp-answer-1");
        callService.answer(CHAT_ID, INVITEE_2, "sdp-answer-2");

        callService.end(CHAT_ID, CALLER_ID, "HANGUP");

        CallSession session = sessionStore.get(CHAT_ID).orElseThrow();
        assertThat(session.activeParticipantIds()).containsExactlyInAnyOrder(INVITEE_1, INVITEE_2);
        verify(internalMessageClient, never()).sendGroupSystemMessage(anyString(), anyString(), anyString());
    }

    @Test
    void groupEnd_lastActiveParticipantLeaves_removesSessionAndLeavesGroupDurationMessage() {
        inviteGroup();
        callService.answer(CHAT_ID, INVITEE_1, "sdp-answer-1");
        callService.answer(CHAT_ID, INVITEE_2, "sdp-answer-2");
        callService.end(CHAT_ID, CALLER_ID, "HANGUP");

        callService.end(CHAT_ID, INVITEE_1, "HANGUP");

        assertThat(sessionStore.get(CHAT_ID)).isEmpty();
        verify(internalMessageClient).sendGroupSystemMessage(eq(CHAT_ID), eq(CALLER_ID),
                eq("i18n:call.summary.groupEndedDuration|00:00|3"));
    }

    @Test
    void groupSweepRingTimeouts_oneInviteeTimesOutWhileOtherAlreadyJoined_continuesCallForRemaining() {
        inviteGroup();
        callService.answer(CHAT_ID, INVITEE_1, "sdp-answer-1");
        CallSession session = sessionStore.get(CHAT_ID).orElseThrow();
        backdateInvitedAt(session, INVITEE_2, Instant.now().minus(Duration.ofSeconds(46)));

        callService.sweepRingTimeouts();

        assertThat(sessionStore.get(CHAT_ID)).isPresent();
        assertThat(session.stateOf(INVITEE_2)).isEqualTo(ParticipantState.MISSED);
        assertThat(session.activeParticipantIds()).containsExactlyInAnyOrder(CALLER_ID, INVITEE_1);
        verify(internalMessageClient, never()).sendGroupSystemMessage(anyString(), anyString(), anyString());

        ArgumentCaptor<CallSignalEvent> captor = ArgumentCaptor.forClass(CallSignalEvent.class);
        verify(rabbitTemplate, times(5)).convertAndSend(eq("wacchat.calls"), eq("call"), captor.capture());
        assertThat(captor.getAllValues().get(3).signal().type()).isEqualTo(CallSignalType.MISSED);
        assertThat(captor.getAllValues().get(4).signal().type()).isEqualTo(CallSignalType.MISSED);
    }
}
