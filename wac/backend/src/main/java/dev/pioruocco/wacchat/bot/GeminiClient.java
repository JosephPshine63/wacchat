package dev.pioruocco.wacchat.bot;

import io.github.resilience4j.circuitbreaker.annotation.CircuitBreaker;
import io.github.resilience4j.retry.annotation.Retry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.Duration;
import java.util.List;
import java.util.Locale;

/**
 * Calls Google's Gemini generateContent API. Every failure mode (network error, 4xx, 5xx,
 * an empty/blank response) collapses to a null reply — the caller (BotService) decides what
 * a null reply means (a static fallback message), so this class never throws for a caller
 * to handle beyond what Resilience4j does internally.
 */
@Service
@Slf4j
public class GeminiClient {

    private final WebClient webClient;
    private final String model;
    private final long responseTimeoutMs;

    public GeminiClient(WebClient geminiWebClient,
                         @Value("${application.bot.gemini.model}") String model,
                         @Value("${application.bot.gemini.response-timeout-ms}") long responseTimeoutMs) {
        this.webClient = geminiWebClient;
        this.model = model;
        this.responseTimeoutMs = responseTimeoutMs;
    }

    @CircuitBreaker(name = "gemini", fallbackMethod = "generateReplyFallback")
    @Retry(name = "gemini")
    public String generateReply(List<GeminiContent> conversation, Locale locale) {
        GenerateContentRequest request = new GenerateContentRequest(
                SystemInstruction.of(BotConstants.systemInstruction(locale)), conversation);
        GenerateContentResponse response = webClient.post()
                .uri("/v1beta/models/" + model + ":generateContent")
                .bodyValue(request)
                .retrieve()
                .bodyToMono(GenerateContentResponse.class)
                .block(Duration.ofMillis(responseTimeoutMs));
        return extractText(response);
    }

    private String extractText(GenerateContentResponse response) {
        if (response == null || response.candidates() == null || response.candidates().isEmpty()) {
            return null;
        }
        GeminiContent content = response.candidates().get(0).content();
        if (content == null || content.parts() == null || content.parts().isEmpty()) {
            return null;
        }
        return content.parts().get(0).text();
    }

    @SuppressWarnings("unused")
    private String generateReplyFallback(List<GeminiContent> conversation, Locale locale, Throwable t) {
        if (t instanceof WebClientResponseException wcre) {
            log.warn("Gemini call failed with status {}: {}", wcre.getStatusCode(), wcre.getResponseBodyAsString());
        } else {
            log.error("Gemini call failed", t);
        }
        return null;
    }

    record GeminiContent(String role, List<GeminiPart> parts) {
        static GeminiContent of(String role, String text) {
            return new GeminiContent(role, List.of(new GeminiPart(text)));
        }
    }

    record GeminiPart(String text) {
    }

    // No "role" field — Gemini's system_instruction Content object doesn't take one.
    record SystemInstruction(List<GeminiPart> parts) {
        static SystemInstruction of(String text) {
            return new SystemInstruction(List.of(new GeminiPart(text)));
        }
    }

    private record GenerateContentRequest(SystemInstruction systemInstruction, List<GeminiContent> contents) {
    }

    private record GenerateContentResponse(List<Candidate> candidates) {
    }

    private record Candidate(GeminiContent content) {
    }
}
