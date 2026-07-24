import { useState } from "react";
import { createMeetingVersion } from "../libs/utils/meetingAiApi";
import { ApiRequestError } from "../../global/api/apiClient";

type MeetingEditPanelProps = {
  projectId: string;
  meetingId: string;
  initialTranscript: string;
  onSaved: () => void;
  onAnalyzed: () => void;
};

function toErrorMessage(error: unknown): string {
  const status = error instanceof ApiRequestError ? ` (${error.status})` : "";
  return `저장에 실패했습니다${status}. 잠시 후 다시 시도해주세요.`;
}

export function MeetingEditPanel({ projectId, meetingId, initialTranscript, onSaved, onAnalyzed }: MeetingEditPanelProps) {
  const [transcript, setTranscript] = useState(initialTranscript);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await createMeetingVersion(projectId, meetingId, transcript, false);
      onSaved();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAnalyze = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      await createMeetingVersion(projectId, meetingId, transcript, true);
      onAnalyzed();
    } catch (err) {
      setError(toErrorMessage(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <textarea
        className="w-full min-h-[240px] rounded-lg border border-border bg-card p-3 text-sm text-foreground"
        value={transcript}
        onChange={(e) => setTranscript(e.target.value)}
      />
      {error && <div className="text-xs text-red-600">{error}</div>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          disabled={isSubmitting}
          onClick={handleSave}
          className="px-4 py-2 rounded-lg border border-border bg-card text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
        >
          저장
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={handleAnalyze}
          className="px-4 py-2 rounded-lg bg-blue-600 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          분석하기
        </button>
      </div>
    </div>
  );
}
