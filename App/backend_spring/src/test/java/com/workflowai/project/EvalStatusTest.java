package com.workflowai.project;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

class EvalStatusTest {

    @Test
    void toJson_mapsEachValueToLowercaseFrontendLiteral() {
        assertThat(EvalStatus.PENDING.toJson()).isEqualTo("pending");
        assertThat(EvalStatus.EVALUATING.toJson()).isEqualTo("evaluating");
        assertThat(EvalStatus.DONE.toJson()).isEqualTo("done");
        assertThat(EvalStatus.PUBLISHED.toJson()).isEqualTo("published");
    }
}
