package dev.pioruocco.wacchat.common.i18n;

import java.util.List;
import java.util.Locale;

/**
 * The five UI languages (same set as the frontend's SUPPORTED_LANGS). Italian is the
 * default and the base bundle ({@code messages.properties}), so anything unknown or
 * missing degrades to Italian instead of failing.
 */
public final class SupportedLocales {

    public static final Locale DEFAULT = Locale.ITALIAN;
    public static final List<Locale> ALL = List.of(
            Locale.ITALIAN, Locale.ENGLISH, Locale.FRENCH, Locale.GERMAN, Locale.forLanguageTag("es"));

    private SupportedLocales() {
    }

    /** Maps any tag ("en-US", "fr_CA", "de") to one of {@link #ALL}, or {@link #DEFAULT}. */
    public static Locale of(String tag) {
        if (tag == null || tag.isBlank()) {
            return DEFAULT;
        }
        String language = tag.trim().replace('_', '-').split("-")[0].toLowerCase(Locale.ROOT);
        return ALL.stream().filter(l -> l.getLanguage().equals(language)).findFirst().orElse(DEFAULT);
    }

    /** Best match for an Accept-Language header value, or null when it names none of ours. */
    public static Locale fromAcceptLanguage(String header) {
        if (header == null || header.isBlank()) {
            return null;
        }
        try {
            return Locale.lookup(Locale.LanguageRange.parse(header), ALL);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
