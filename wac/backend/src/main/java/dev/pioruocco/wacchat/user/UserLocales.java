package dev.pioruocco.wacchat.user;

import dev.pioruocco.wacchat.common.i18n.SupportedLocales;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.Locale;

/** Looks up a user's stored UI language, for code that runs outside their request (push, Arno, mail). */
@Component
@RequiredArgsConstructor
public class UserLocales {

    private final UserRepository userRepository;

    public Locale of(String userId) {
        return userRepository.findByPublicId(userId)
                .map(u -> SupportedLocales.of(u.getLocale()))
                .orElse(SupportedLocales.DEFAULT);
    }
}
