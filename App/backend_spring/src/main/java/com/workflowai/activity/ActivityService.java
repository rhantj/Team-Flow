package com.workflowai.activity;

import org.springframework.stereotype.Service;

/** 다른 컨트롤러(TaskController, ChecklistController 등)가 실제 동작이 일어날 때 활동 로그를 남기기 위해 쓰는 공용 서비스. */
@Service
public class ActivityService {
    private final ActivityRepository activityRepository;

    public ActivityService(ActivityRepository activityRepository) {
        this.activityRepository = activityRepository;
    }

    public void record(Long projectId, Long actorId, String type, Long targetId, String message) {
        activityRepository.save(new Activity(projectId, actorId, type, targetId, message));
    }
}
