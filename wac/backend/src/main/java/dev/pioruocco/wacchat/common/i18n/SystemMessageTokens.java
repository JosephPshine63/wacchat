package dev.pioruocco.wacchat.common.i18n;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Call summaries ("Chiamata persa", "durata 03:12") are stored once per chat but read by
 * several people in different languages, so call-service persists a language-neutral token
 * ({@code i18n:call.summary.ended|03:12}) instead of finished text. The frontend renders
 * it in the viewer's language; here we only need it for the push body. Only the
 * {@code call.summary.*} namespace is honoured, so a user typing "i18n:..." into a chat
 * can't pull arbitrary keys out of the bundle.
 */
public final class SystemMessageTokens {

    private static final String PREFIX = "i18n:";
    private static final Pattern ALLOWED_KEY = Pattern.compile("call\\.summary\\.[A-Za-z]+");

    private SystemMessageTokens() {
    }

    public static boolean isToken(String content) {
        return content != null && content.startsWith(PREFIX);
    }

    /** Returns the localized text, or the content untouched if it is not a valid token. */
    public static String render(String content, Locale locale, Messages messages) {
        if (!isToken(content)) {
            return content;
        }
        String[] parts = content.substring(PREFIX.length()).split("\\|");
        if (!ALLOWED_KEY.matcher(parts[0]).matches()) {
            return content;
        }
        Object[] args = new Object[parts.length - 1];
        System.arraycopy(parts, 1, args, 0, args.length);
        return messages.get(parts[0], locale, args);
    }
}
