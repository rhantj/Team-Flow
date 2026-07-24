package com.workflowai.auth;

import static org.assertj.core.api.Assertions.assertThat;

import jakarta.validation.Validation;
import jakarta.validation.Validator;
import java.util.List;
import org.junit.jupiter.api.Test;

class UpdateMeRequestValidationTest {

    private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

    @Test
    void acceptsAllNullFields() {
        UpdateMeRequest request = new UpdateMeRequest(null, null, null, null);

        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    void rejectsBlankName() {
        UpdateMeRequest request = new UpdateMeRequest("   ", null, null, null);

        assertThat(validator.validate(request)).isNotEmpty();
    }

    @Test
    void rejectsNameOver100Chars() {
        UpdateMeRequest request = new UpdateMeRequest("a".repeat(101), null, null, null);

        assertThat(validator.validate(request)).isNotEmpty();
    }

    @Test
    void rejectsMoreThan10FieldTags() {
        List<String> tooMany = List.of("1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11");
        UpdateMeRequest request = new UpdateMeRequest(null, null, tooMany, null);

        assertThat(validator.validate(request)).isNotEmpty();
    }

    @Test
    void rejectsBlankFieldTag() {
        UpdateMeRequest request = new UpdateMeRequest(null, null, List.of("백엔드", "  "), null);

        assertThat(validator.validate(request)).isNotEmpty();
    }

    @Test
    void rejectsInvalidGithubUsername() {
        UpdateMeRequest request = new UpdateMeRequest(null, null, null, "-invalid-start");

        assertThat(validator.validate(request)).isNotEmpty();
    }

    @Test
    void acceptsValidGithubUsername() {
        UpdateMeRequest request = new UpdateMeRequest(null, null, null, "octocat");

        assertThat(validator.validate(request)).isEmpty();
    }

    @Test
    void acceptsEmptyGithubUsernameAsDisconnect() {
        UpdateMeRequest request = new UpdateMeRequest(null, null, null, "");

        assertThat(validator.validate(request)).isEmpty();
    }
}
