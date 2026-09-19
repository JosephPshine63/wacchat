package dev.pioruocco.wacchat.common.i18n;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.LocaleResolver;
import org.springframework.web.servlet.i18n.AcceptHeaderLocaleResolver;

@Configuration
public class I18nConfig {

    /** Request locale comes from Accept-Language (the frontend sets it from the language the
     *  user picked), restricted to the supported set with Italian as the fallback. */
    @Bean
    public LocaleResolver localeResolver() {
        AcceptHeaderLocaleResolver resolver = new AcceptHeaderLocaleResolver();
        resolver.setSupportedLocales(SupportedLocales.ALL);
        resolver.setDefaultLocale(SupportedLocales.DEFAULT);
        return resolver;
    }
}
