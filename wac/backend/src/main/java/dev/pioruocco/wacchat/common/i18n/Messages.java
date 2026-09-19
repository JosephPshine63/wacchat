package dev.pioruocco.wacchat.common.i18n;

import lombok.RequiredArgsConstructor;
import org.springframework.context.MessageSource;
import org.springframework.stereotype.Component;

import java.util.Locale;

/**
 * Thin wrapper over the MessageSource. Placeholders are plain {@code {0}}, {@code {1}}
 * replaced by hand instead of java.text.MessageFormat, so apostrophes ("l'utente") need no
 * doubling and DeepL output can be used as-is.
 */
@Component
@RequiredArgsConstructor
public class Messages {

    private final MessageSource messageSource;

    public String get(String key, Locale locale, Object... args) {
        String text = messageSource.getMessage(key, null, key, locale);
        for (int i = 0; i < args.length; i++) {
            text = text.replace("{" + i + "}", String.valueOf(args[i]));
        }
        return text;
    }
}
