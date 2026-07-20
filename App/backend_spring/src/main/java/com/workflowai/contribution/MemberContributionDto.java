package com.workflowai.contribution;

import java.util.List;

public record MemberContributionDto(Long user_id, String name, String summary, List<String> evidence) {}
