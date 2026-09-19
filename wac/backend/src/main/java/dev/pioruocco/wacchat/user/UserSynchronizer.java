package dev.pioruocco.wacchat.user;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
@Slf4j
public class UserSynchronizer {

    private final UserRepository userRepository;
    private final UserMapper userMapper;
    private final MailService mailService;
    private final SessionGuard sessionGuard;

    /**
     * {@code tabId} identifies the browser tab (not the Keycloak SSO session — two tabs of the
     * same browser share one {@code sid}), so it's what actually enforces "one active tab".
     */
    @Transactional
    public void synchronizeWithIdp(Jwt token, String tabId) {
        synchronizeWithIdp(token, tabId, null);
    }

    /** {@code locale} is the UI language code the client sent (null = unknown, keep what we have). */
    @Transactional
    public void synchronizeWithIdp(Jwt token, String tabId, String locale) {
        log.info("Synchronizing user with idp");
        getUserEmail(token).ifPresent(userEmail -> synchronizeUser(token, tabId, locale));
    }

    private void synchronizeUser(Jwt token, String tabId, String locale) {
        String userId = token.getSubject();
        log.info("Synchronizing user having id {}", userId);
        // Looked up by the stable Keycloak sub (not email): an email lookup can miss on a
        // legitimate existing user (case difference, provider resync, etc.), and since User's
        // @Id is manually assigned, a miss here would build a near-empty User with the SAME id
        // as the real row, which JPA then merge()s over it — silently wiping username/avatar.
        Optional<User> optUser = userRepository.findByPublicIdForUpdate(userId);
        boolean isNew = optUser.isEmpty();
        User user = optUser.orElseGet(User::new);
        applySessionAndClaims(user, token, tabId);
        if (locale != null) {
            user.setLocale(locale);
        }

        userRepository.saveAndFlush(user);

        if (isNew) {
            mailService.sendWelcome(user);
        }
    }

    private void applySessionAndClaims(User user, Jwt token, String tabId) {
        if (tabId != null) {
            if (sessionGuard.isConflicting(user, tabId)) {
                throw new SessionConflictException(user.getId());
            }
            sessionGuard.recordSession(user, tabId);
        }
        userMapper.updateFromTokenAttributes(user, token.getClaims());
    }

    private Optional<String> getUserEmail(Jwt token) {
        Map<String, Object> attributes = token.getClaims();
        if (attributes.containsKey("email")) {
            return Optional.of(attributes.get("email").toString());
        }
        return Optional.empty();

    }
}
