package dev.pioruocco.wacchat.common;

import dev.pioruocco.wacchat.common.i18n.Messages;
import jakarta.persistence.EntityNotFoundException;
import lombok.RequiredArgsConstructor;
import org.springframework.context.i18n.LocaleContextHolder;
import jakarta.servlet.http.HttpServletRequest;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.server.ResponseStatusException;

import java.time.Instant;
import java.util.stream.Collectors;

/**
 * Catch-all so no unhandled exception ever reaches the client as an opaque 500/blank
 * response — every error, regardless of source, comes back as the same
 * {code, message, status, timestamp, path} JSON shape the frontend's error-log
 * dropdown (errorLogInterceptor) reads. Doesn't touch the filter-level SESSION_CONFLICT
 * response in UserSynchronizerFilter — that's written directly to the response before
 * the request ever reaches a controller, so it never passes through here.
 */
@RestControllerAdvice
@Slf4j
@RequiredArgsConstructor
public class GlobalExceptionHandler {

    private final Messages messages;

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<ErrorResponse> handleResponseStatusException(ResponseStatusException ex, HttpServletRequest request) {
        HttpStatus status = HttpStatus.valueOf(ex.getStatusCode().value());
        return build(status, ex.getClass().getSimpleName(), ex.getReason() != null ? ex.getReason() : ex.getMessage(), request);
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ErrorResponse> handleAccessDenied(AccessDeniedException ex, HttpServletRequest request) {
        return build(HttpStatus.FORBIDDEN, "ACCESS_DENIED", ex.getMessage(), request);
    }

    @ExceptionHandler(EntityNotFoundException.class)
    public ResponseEntity<ErrorResponse> handleEntityNotFound(EntityNotFoundException ex, HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, "NOT_FOUND", ex.getMessage(), request);
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ErrorResponse> handleValidation(MethodArgumentNotValidException ex, HttpServletRequest request) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + " " + fe.getDefaultMessage())
                .collect(Collectors.joining(", "));
        return build(HttpStatus.BAD_REQUEST, "VALIDATION_FAILED", message, request);
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ErrorResponse> handleGeneric(Exception ex, HttpServletRequest request) {
        HttpStatus status = resolveAnnotatedStatus(ex.getClass());
        String message = status == HttpStatus.INTERNAL_SERVER_ERROR ? messages.get("error.internal", LocaleContextHolder.getLocale()) : ex.getMessage();
        if (status == HttpStatus.INTERNAL_SERVER_ERROR) {
            log.error("Unhandled exception on {}", request.getRequestURI(), ex);
        }
        return build(status, ex.getClass().getSimpleName(), message, request);
    }

    private static HttpStatus resolveAnnotatedStatus(Class<?> exceptionClass) {
        ResponseStatus annotation = exceptionClass.getAnnotation(ResponseStatus.class);
        return annotation != null ? annotation.value() : HttpStatus.INTERNAL_SERVER_ERROR;
    }

    private static ResponseEntity<ErrorResponse> build(HttpStatus status, String code, String message, HttpServletRequest request) {
        return ResponseEntity.status(status)
                .body(new ErrorResponse(code, message, status.value(), Instant.now(), request.getRequestURI()));
    }

    public record ErrorResponse(String code, String message, int status, Instant timestamp, String path) {
    }
}
