ALTER TABLE milestones ADD COLUMN IF NOT EXISTS start_date DATE;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS start_date DATE;

CREATE INDEX IF NOT EXISTS idx_tasks_project_milestone
    ON tasks(project_id, milestone_id);

CREATE INDEX IF NOT EXISTS idx_milestones_project_dates
    ON milestones(project_id, start_date, due_date);
