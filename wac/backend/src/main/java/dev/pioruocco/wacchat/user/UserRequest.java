package dev.pioruocco.wacchat.user;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Getter
@Setter
@NoArgsConstructor
public class UserRequest {

    @NotBlank
    @Size(min = 3, max = 20, message = "{user.username.size}")
    @Pattern(regexp = "^[a-z0-9_.-]+$", message = "{user.username.pattern}")
    @Schema(requiredMode = Schema.RequiredMode.REQUIRED)
    private String username;
}
