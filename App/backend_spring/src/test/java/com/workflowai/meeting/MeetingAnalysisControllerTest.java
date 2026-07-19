package com.workflowai.meeting;

import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@ExtendWith(MockitoExtension.class)
class MeetingAnalysisControllerTest {

    @Mock
    private MeetingAnalysisService meetingAnalysisService;

    @Test
    void statusReturns404WhenMeetingMissing() throws Exception {
        when(meetingAnalysisService.findStatus("demo-project", "999")).thenReturn(null);
        MeetingAnalysisController controller = new MeetingAnalysisController(meetingAnalysisService);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(get("/api/v1/projects/demo-project/meetings/999/status"))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error.code").value("MEETING_NOT_FOUND"));
    }

    @Test
    void retryReturns409WhenMeetingIsNotFailed() throws Exception {
        when(meetingAnalysisService.retry("demo-project", "42")).thenThrow(new IllegalStateException("MEETING_NOT_FAILED"));
        MeetingAnalysisController controller = new MeetingAnalysisController(meetingAnalysisService);
        MockMvc mockMvc = MockMvcBuilders.standaloneSetup(controller).build();

        mockMvc.perform(post("/api/v1/projects/demo-project/meetings/42/retry"))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error.code").value("MEETING_NOT_FAILED"));
    }
}
