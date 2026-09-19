package dev.pioruocco.wacchat.user;

import dev.pioruocco.wacchat.common.i18n.Messages;
import dev.pioruocco.wacchat.common.i18n.SupportedLocales;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

import java.util.Locale;

@Service
@RequiredArgsConstructor
@Slf4j
public class MailService {

    private final JavaMailSender mailSender;
    private final Messages messages;

    @Value("${application.mail.from:}")
    private String fromAddress;

    public void sendWelcome(User user) {
        if (fromAddress.isBlank()) {
            log.warn("MAIL_FROM not configured — skipping welcome email for user {}", user.getId());
            return;
        }
        try {
            SimpleMailMessage msg = new SimpleMailMessage();
            msg.setFrom(fromAddress);
            msg.setTo(user.getEmail());
            Locale locale = SupportedLocales.of(user.getLocale());
            msg.setSubject(messages.get("mail.welcome.subject", locale));
            msg.setText(messages.get("mail.welcome.body", locale, user.getFirstName()));
            mailSender.send(msg);
            log.info("Welcome email sent to user {}", user.getId());
        } catch (Exception e) {
            log.error("Failed to send welcome email to user {}: {}", user.getId(), e.getMessage());
        }
    }
}
