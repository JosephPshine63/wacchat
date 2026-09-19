package dev.pioruocco.wacchat.common.i18n;

import org.junit.jupiter.api.Test;
import org.springframework.context.support.ResourceBundleMessageSource;

import java.util.Locale;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class I18nTest {

    private static Messages messages() {
        ResourceBundleMessageSource source = new ResourceBundleMessageSource();
        source.setBasename("messages");
        source.setDefaultEncoding("UTF-8");
        source.setFallbackToSystemLocale(false);
        return new Messages(source);
    }

    @Test
    void mapsTagsToSupportedLocalesWithItalianFallback() {
        assertEquals(Locale.ENGLISH, SupportedLocales.of("en-US"));
        assertEquals(Locale.FRENCH, SupportedLocales.of("fr_CA"));
        assertEquals(Locale.ITALIAN, SupportedLocales.of("ja"));
        assertEquals(Locale.ITALIAN, SupportedLocales.of(null));
    }

    @Test
    void acceptLanguagePicksBestSupportedOrNull() {
        assertEquals(Locale.GERMAN, SupportedLocales.fromAcceptLanguage("de-DE,de;q=0.9,en;q=0.5"));
        assertNull(SupportedLocales.fromAcceptLanguage("ja,zh;q=0.8"));
        assertNull(SupportedLocales.fromAcceptLanguage("not a header;;;"));
    }

    @Test
    void substitutesPlaceholdersAndKeepsApostrophes() {
        String text = messages().get("mail.welcome.body", Locale.ITALIAN, "Giulia");
        assertEquals(true, text.startsWith("Ciao Giulia,\n\nBenvenuto"));
        assertEquals(true, text.contains("L'ho realizzata"));
    }

    @Test
    void unknownLocaleFallsBackToItalianBase() {
        assertEquals("Chiamata in arrivo", messages().get("push.call.title", Locale.JAPANESE).replace("📞 ", ""));
    }

    @Test
    void rendersOnlyCallSummaryTokens() {
        Messages m = messages();
        assertEquals("📞 Chiamata terminata - durata 03:12",
                SystemMessageTokens.render("i18n:call.summary.ended|03:12", Locale.ITALIAN, m));
        assertEquals("i18n:bot.welcome", SystemMessageTokens.render("i18n:bot.welcome", Locale.ITALIAN, m));
        assertEquals("ciao", SystemMessageTokens.render("ciao", Locale.ITALIAN, m));
    }
}
