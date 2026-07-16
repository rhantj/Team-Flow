import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { CatTag } from "../../board/components/CatTag";
import { PriorityBadge } from "../../board/components/PriorityBadge";
import { getCat } from "../../board/libs/utils/taskService";
import { getStoredMeetings, getSavedMeetings, saveSavedMeetings, getStoredTasks, saveStoredTasks, saveStoredMeetings } from "../../board/libs/utils/localStore";
import { addActivity } from "../../board/libs/utils/activityStore";
import { MEMBERS } from "../../global/lib/mock/members";
import { CATEGORIES } from "../../board/libs/mock/tasks";
import type { Meeting, UploadFlow, UploadType, GenTodo, SavedMeetingRecord } from "../libs/types/meeting";
import type { CatId, Priority, Task } from "../../board/libs/types/task";
import { analyzeMeeting, fetchMeetings, registerMeetingTasks } from "../libs/utils/meetingAiApi";
import type { MeetingAiResult } from "../libs/types/meetingAiTypes";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import {
  LayoutDashboard,
  Columns3,
  FileAudio,
  Sparkles,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Clock,
  X,
  Calendar,
  Upload,
  Circle,
  CheckCheck,
  FileText,
  Mic,
  Eye,
  CheckSquare,
  ArrowRight,
  ArrowLeft,
  Check,
  Users,
  Film,
  ListChecks,
  Radio,
} from "lucide-react";

const CURRENT_USER_ROLE: "leader" | "member" = "leader";

const groupTodosByAssignee = (list: GenTodo[], resolveAssignee: (todo: GenTodo) => string): GenTodo[] => {
  const UNASSIGNED_KEY = "__unassigned__";
  const order: string[] = [];
  const groups = new Map<string, GenTodo[]>();
  list.forEach(todo => {
    const key = resolveAssignee(todo) || UNASSIGNED_KEY;
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key)!.push(todo);
  });
  const assignedOrder = order.filter(key => key !== UNASSIGNED_KEY);
  const finalOrder = groups.has(UNASSIGNED_KEY) ? [...assignedOrder, UNASSIGNED_KEY] : assignedOrder;
  return finalOrder.flatMap(key => groups.get(key)!);
};

const buildTodoRegistrationKey = (meetingIdentifier: string, title: string, assignee: string, dueDate: string): string =>
  `${meetingIdentifier.trim()}::${title.trim()}::${assignee}::${dueDate.trim()}`;

// 회의 상세 화면(meeting.todos)의 "이름: 업무내용 (마감일)" 문자열 포맷을 파싱한다.
const parseMeetingTodoLine = (line: string): { assigneeName: string; title: string; dueDate: string } => {
  const separatorIndex = line.indexOf(": ");
  if (separatorIndex === -1) return { assigneeName: "미배정", title: line, dueDate: "" };
  const assigneeName = line.slice(0, separatorIndex).trim() || "미배정";
  const rest = line.slice(separatorIndex + 2).trim();
  const dueMatch = rest.match(/\s\(([\d.]+)\)$/);
  const dueDate = dueMatch ? dueMatch[1] : "";
  const title = dueMatch ? rest.slice(0, dueMatch.index).trim() : rest;
  return { assigneeName, title, dueDate };
};

const groupMeetingTodoLines = (lines: string[]): string[] => {
  const UNASSIGNED = "미배정";
  const order: string[] = [];
  const groups = new Map<string, string[]>();
  lines.forEach(line => {
    const key = parseMeetingTodoLine(line).assigneeName || UNASSIGNED;
    if (!groups.has(key)) { groups.set(key, []); order.push(key); }
    groups.get(key)!.push(line);
  });
  const assignedOrder = order.filter(key => key !== UNASSIGNED);
  const finalOrder = groups.has(UNASSIGNED) ? [...assignedOrder, UNASSIGNED] : assignedOrder;
  return finalOrder.flatMap(key => groups.get(key)!);
};

const DOCUMENT_ANALYZE_STAGES = [
  "파일 업로드 완료", "문서 텍스트 추출 중",
  "회의 내용 분석 중", "핵심 결정사항 추출 중",
  "업무 자동 생성 중", "역할 분배 생성 중",
];

const AUDIO_ANALYZE_STAGES = [
  "파일 업로드 완료", "음성 변환 중", "텍스트 정리 중",
  "회의 내용 분석 중", "핵심 결정사항 추출 중",
  "업무 자동 생성 중", "역할 분배 생성 중",
];

const VIDEO_ANALYZE_STAGES = [
  "파일 업로드 완료", "영상 음성 트랙 추출 중", "음성 변환 중",
  "회의 내용 분석 중", "핵심 결정사항 추출 중",
  "업무 자동 생성 중", "역할 분배 생성 중",
];

const getAnalyzeStages = (type: UploadType): string[] => {
  if (type === "audio") return AUDIO_ANALYZE_STAGES;
  if (type === "video") return VIDEO_ANALYZE_STAGES;
  return DOCUMENT_ANALYZE_STAGES;
};

const AI_CATEGORY_TO_BOARD: Record<string, CatId> = {
  PLANNING: "planning",
  RESEARCH: "research",
  UX: "ux-ui",
  UI: "ux-ui",
  DESIGN: "design",
  FRONTEND: "frontend",
  BACKEND: "backend",
  AI: "ai-ml",
  ML: "ai-ml",
  STT: "ai-ml",
  RAG: "ai-ml",
  DATA: "data",
  DATABASE: "db",
  DB: "db",
  DEVOPS: "devops",
  GITHUB: "github",
  DASHBOARD: "frontend",
  DOCUMENT: "docs",
  DOCS: "docs",
  PRESENTATION: "presentation",
  QA: "qa",
  SECURITY: "security",
  DELIVERABLE: "deliverable",
  OPERATION: "operation",
  ETC: "other",
};

const mapAiPriority = (priority: string): Priority => {
  if (priority === "HIGH") return "high";
  if (priority === "LOW") return "low";
  return "medium";
};

const formatAiDueDate = (dueDate: string | null) => {
  if (!dueDate) return "미정";
  const [, month, day] = dueDate.split("-");
  return month && day ? `${month}.${day}` : dueDate;
};

const resolveAiAssignee = (candidate: string) => {
  const normalized = candidate.trim();
  const member = MEMBERS.find(m => normalized.includes(m.name) || m.name.includes(normalized));
  return member?.id ?? "";
};

const buildGeneratedTodos = (result: MeetingAiResult): GenTodo[] =>
  result.todos.map((todo, index) => {
    const assignee = resolveAiAssignee(todo.assignee_candidate);
    return {
      id: `GT-${String(index + 1).padStart(2, "0")}`,
      title: todo.title,
      desc: todo.description,
      category: AI_CATEGORY_TO_BOARD[todo.category.toUpperCase()] ?? "other",
      assignee,
      dueDate: formatAiDueDate(todo.due_date),
      priority: mapAiPriority(todo.priority),
      basis: todo.assignee_candidate ? `회의록 후보 담당자: ${todo.assignee_candidate}` : "회의록 AI 분석 결과",
      assigned: Boolean(assignee),
      source: "MEETING_AI" as const,
    };
  });

const buildRiskCards = (risks: string[]) =>
  risks.map((text, index) => ({
    level: index === 0 ? "high" : "medium",
    text,
    suggestion: index === 0
      ? "팀장 검토 후 담당자와 마감일을 먼저 확정하는 것을 권장합니다."
      : "관련 업무의 우선순위와 일정 여유를 재점검하세요.",
  }));

const getTodayIsoDate = () => {
  const date = new Date();
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

const stripFileExtension = (fileName: string) => fileName.replace(/\.[^/.]+$/, "");
const TEXT_PREVIEW_EXTENSIONS = new Set(["txt", "md", "csv", "json", "log"]);
const getFileExtension = (fileName: string) => (fileName.split(".").pop() ?? "").toLowerCase();

// UTF-8로 우선 디코딩하고, 깨진 바이트가 있으면(주로 EUC-KR/CP949로 저장된 옛 한글 문서) euc-kr로 재시도한다.
const decodeTextFile = async (file: File): Promise<string> => {
  const buffer = await file.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    try {
      return new TextDecoder("euc-kr").decode(buffer);
    } catch {
      return new TextDecoder("utf-8").decode(buffer);
    }
  }
};

// ZIP 스트리밍(data descriptor) 방식으로 쓰인 항목은 로컬 헤더의 compressedSize가 0이라
// 실제 길이를 알 수 없다. 다음 데이터 디스크립터/로컬 헤더/중앙 디렉터리 시그니처가
// 나오는 지점까지를 압축 데이터로 간주해 역산한다.
const findStreamedEntryLength = (bytes: Uint8Array, view: DataView, dataStart: number): number => {
  for (let i = dataStart; i < bytes.length - 4; i++) {
    const sig = view.getUint32(i, true);
    if (sig === 0x08074b50 || sig === 0x04034b50 || sig === 0x02014b50) return i - dataStart;
  }
  return bytes.length - dataStart;
};

// 외부 라이브러리 없이 docx(zip) 안의 word/document.xml만 추출해 태그를 제거한 순수 텍스트로 변환한다.
const extractDocxText = async (file: File): Promise<string> => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  let offset = 0;
  while (offset < bytes.length - 4) {
    if (view.getUint32(offset, true) !== 0x04034b50) { offset++; continue; }
    const flags = view.getUint16(offset + 6, true);
    const compressionMethod = view.getUint16(offset + 8, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    const name = new TextDecoder().decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const headerSize = view.getUint32(offset + 18, true);
    const usesDataDescriptor = (flags & 0x0008) !== 0 && headerSize === 0;
    const compressedSize = usesDataDescriptor ? findStreamedEntryLength(bytes, view, dataStart) : headerSize;
    if (name === "word/document.xml") {
      const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
      let xmlBytes: Uint8Array;
      if (compressionMethod === 0) {
        xmlBytes = compressed;
      } else {
        const stream = new Blob([compressed]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
        xmlBytes = new Uint8Array(await new Response(stream).arrayBuffer());
      }
      const xml = new TextDecoder("utf-8").decode(xmlBytes);
      return xml
        .replace(/<\/w:p>/g, "\n")
        .replace(/<w:tab\/>/g, "\t")
        .replace(/<[^>]+>/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .trim();
    }
    offset = dataStart + compressedSize;
  }
  throw new Error("document.xml not found");
};
const formatDisplayDate = (date: string) => (date || getTodayIsoDate()).replace(/-/g, ".");
// 마감일 입력을 "MM.DD" 형식으로 자동 포맷한다 — 숫자만 받아 2자리 입력 시 자동으로 "." 삽입, 4자리 초과 무시.
const formatMMDDInput = (raw: string): string => {
  const digits = raw.replace(/\D/g, "").slice(0, 4);
  if (digits.length <= 2) return digits;
  return `${digits.slice(0, 2)}.${digits.slice(2)}`;
};

const formatDateTime = (iso?: string) => {
  if (!iso) return "";
  const d = new Date(iso);
  const datePart = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
  const timePart = d.toLocaleTimeString("ko-KR", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${datePart} ${timePart}`;
};

export function MeetingsView() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [meetings, setMeetings] = useState<Meeting[]>(getStoredMeetings);
  const [selected, setSelected] = useState<string|null>("m1");
  const [uploadFlow, setUploadFlow] = useState<UploadFlow>(null);
  const [uploadType, setUploadType] = useState<UploadType>(null);
  const [modalStep, setModalStep] = useState(0);
  const [analyzeStage, setAnalyzeStage] = useState(0);
  const [analyzeProgress, setAnalyzeProgress] = useState(0);
  const [meetTitle, setMeetTitle] = useState("");
  const [meetDate, setMeetDate] = useState(getTodayIsoDate());
  const [meetKind, setMeetKind] = useState("정기회의");
  const [partIds, setPartIds] = useState<string[]>(["1","2","3","4"]);
  const [analysisResult, setAnalysisResult] = useState<MeetingAiResult | null>(null);
  const [selTodos, setSelTodos] = useState<string[]>([]);
  const [todoAssignees, setTodoAssignees] = useState<Record<string,string>>({});
  const [todoDueDates, setTodoDueDates] = useState<Record<string,string>>({});
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [uploadFileName, setUploadFileName] = useState("");
  const [uploadFileSize, setUploadFileSize] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [analysisSource, setAnalysisSource] = useState<"fastapi"|"spring-fallback"|null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<"summary"|"todos"|"risks">("summary");
  const [manualTodos, setManualTodos] = useState<GenTodo[]>([]);
  const [showAddTodo, setShowAddTodo] = useState(false);
  const [newTodoTitle, setNewTodoTitle] = useState("");
  const [newTodoDesc, setNewTodoDesc] = useState("");
  const [newTodoCategory, setNewTodoCategory] = useState<CatId>("other");
  const [newTodoAssignee, setNewTodoAssignee] = useState(MEMBERS[0].id);
  const [newTodoDueDate, setNewTodoDueDate] = useState("");
  const [newTodoPriority, setNewTodoPriority] = useState<Priority>("medium");
  const [newTodoError, setNewTodoError] = useState<string | null>(null);
  const [saveMeetingMessage, setSaveMeetingMessage] = useState<string | null>(null);
  const [originalViewMessage, setOriginalViewMessage] = useState<string | null>(null);
  const [originalPreview, setOriginalPreview] = useState<{ kind: "text"; content: string; fileName: string } | { kind: "unsupported"; fileName: string } | null>(null);
  const [pdfExportMessage, setPdfExportMessage] = useState<string | null>(null);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [registerMessage, setRegisterMessage] = useState<string | null>(null);
  const [meetingListError, setMeetingListError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const pdfCaptureRef = useRef<HTMLDivElement | null>(null);
  const analyzeStages = getAnalyzeStages(uploadType);
  const canAddManualTodo = CURRENT_USER_ROLE === "leader";

  // Simulate analysis progress
  useEffect(() => {
    if (uploadFlow !== "analyzing") return;
    let prog = 0; let stg = 0;
    const iv = setInterval(() => {
      prog = Math.min(prog + 1.5, 100);
      stg = Math.min(Math.floor(prog / (100 / analyzeStages.length)), analyzeStages.length - 1);
      setAnalyzeStage(stg); setAnalyzeProgress(Math.round(prog));
      if (prog >= 100) { clearInterval(iv); setTimeout(() => { setUploadFlow("results"); setPanelTab("summary"); }, 600); }
    }, 70);
    return () => clearInterval(iv);
  }, [uploadFlow, analyzeStages.length]);

  useEffect(() => {
    if (searchParams.get("upload") === "1") {
      setUploadFlow("modal"); setModalStep(0); setUploadType(null);
      const next = new URLSearchParams(searchParams);
      next.delete("upload");
      setSearchParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 서버에 저장된 회의록 목록을 가져와 로컬에 없는 항목만 보충한다.
  // 실패해도 화면은 로컬 저장 목록으로 그대로 동작한다.
  useEffect(() => {
    fetchMeetings("demo-project")
      .then(list => {
        setMeetings(prev => {
          const existingIds = new Set(prev.map(m => m.id));
          const additions: Meeting[] = list
            .filter(dto => !existingIds.has(dto.meetingId))
            .map(dto => ({
              id: dto.meetingId,
              title: dto.title,
              date: dto.meetingDate ?? "",
              duration: dto.analysisStatus === "completed" ? "분석 완료" : dto.analysisStatus,
              status: dto.analysisStatus === "completed" ? "processed" : dto.analysisStatus === "pending" ? "pending" : "processing",
            }));
          return additions.length === 0 ? prev : [...additions, ...prev];
        });
      })
      .catch(() => {
        setMeetingListError("서버에서 회의록 목록을 불러오지 못했습니다. 로컬 저장 목록만 표시됩니다.");
        setTimeout(() => setMeetingListError(null), 4000);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const meeting = meetings.find(m => m.id === selected);
  // meetingId가 있으면 우선 사용, 없으면(review 화면에서 아직 meetings에 반영 전 등) meetTitle로 대체.
  const meetingIdentifier = meeting?.id || meetTitle;

  // ── Upload type metadata ─────────────────────────────────────────────────────
  const UPLOAD_TYPES = [
    { id:"document", label:"문서 업로드", desc:"PDF, Word, TXT, HWP 등 회의록 문서", icon:FileText, accept:".pdf,.doc,.docx,.txt,.hwp", color:"#3B5BDB", bg:"rgba(59,91,219,0.1)", note:"텍스트를 추출해 AI가 분석합니다." },
    { id:"audio",    label:"음성파일 업로드", desc:"mp3, wav, m4a 등 녹음파일", icon:Radio,    accept:".mp3,.wav,.m4a,.ogg", color:"#7048E8", bg:"rgba(112,72,232,0.1)", note:"음성을 텍스트로 변환한 뒤 분석합니다." },
    { id:"video",    label:"영상파일 업로드", desc:"mp4, mov, Zoom/Discord 녹화본", icon:Film,  accept:".mp4,.mov,.avi,.webm", color:"#10B981", bg:"rgba(16,185,129,0.1)", note:"음성 트랙을 추출해 분석합니다." },
  ] as const;

  const MEET_KINDS = ["정기회의","중간점검","발표준비","개발회의","기타"];

  const getAssignee = (todo: GenTodo): string => todoAssignees[todo.id] ?? todo.assignee;
  const getDueDate = (todo: GenTodo): string => todoDueDates[todo.id] ?? todo.dueDate;
  const toApiTodo = (todo: GenTodo) => {
    const assigneeId = getAssignee(todo);
    return {
      title: todo.title,
      description: todo.desc,
      assignee_candidate: "",
      assignee_id: assigneeId || null,
      due_date: getDueDate(todo) || null,
      priority: todo.priority.toUpperCase() as "HIGH" | "MEDIUM" | "LOW",
      category: todo.category,
      needs_leader_review: !assigneeId,
    };
  };

  const generatedTodos = analysisResult ? buildGeneratedTodos(analysisResult) : [];
  const riskCards = analysisResult ? buildRiskCards(analysisResult.risks) : [];
  const unassignedCount = generatedTodos.filter(t => !getAssignee(t)).length;
  const assignedCount = generatedTodos.filter(t => Boolean(getAssignee(t))).length;
  const nextActions = generatedTodos.slice(0, 3).map(t => t.title);
  const reviewTodos = [...generatedTodos, ...manualTodos];
  // 담당자 기준으로 묶어서 표시 (같은 담당자 업무가 연속 배치되도록) — 표시 순서만 바뀌고 원본 배열/등록 로직은 그대로 유지.
  const groupedGeneratedTodos = groupTodosByAssignee(generatedTodos, getAssignee);
  const isReviewBatchAlreadyRegistered = reviewTodos.length > 0 && reviewTodos.every(todo => {
    const key = buildTodoRegistrationKey(meetingIdentifier, todo.title, getAssignee(todo), getDueDate(todo));
    return getStoredTasks().some(task => buildTodoRegistrationKey(task.sourceMeetingTitle ?? "", task.title, task.assignee, task.dueDate) === key);
  });
  // 회의 상세 화면(meeting.todos, 문자열 배열)용 그룹 정렬 + 등록 여부 계산.
  const groupedMeetingTodos = meeting?.todos ? groupMeetingTodoLines(meeting.todos) : [];
  const isMeetingTodosRegistered = Boolean(meeting?.todos?.length) && meeting!.todos!.every(line => {
    const parsed = parseMeetingTodoLine(line);
    const assigneeId = MEMBERS.find(m => m.name === parsed.assigneeName)?.id ?? MEMBERS[0].id;
    const key = buildTodoRegistrationKey(meetingIdentifier, parsed.title, assigneeId, parsed.dueDate);
    return getStoredTasks().some(task => buildTodoRegistrationKey(task.sourceMeetingTitle ?? "", task.title, task.assignee, task.dueDate) === key);
  });

  const handleAddManualTodo = () => {
    if (!newTodoTitle.trim() || !newTodoAssignee || !newTodoDueDate) {
      setNewTodoError("업무명, 담당자, 마감일은 필수입니다.");
      return;
    }
    const todo: GenTodo = {
      id: `MANUAL-${Date.now()}`,
      title: newTodoTitle.trim(),
      desc: newTodoDesc.trim(),
      category: newTodoCategory,
      assignee: newTodoAssignee,
      dueDate: formatAiDueDate(newTodoDueDate),
      priority: newTodoPriority,
      basis: "팀장이 직접 추가",
      assigned: true,
      source: canAddManualTodo ? "LEADER_MANUAL" : "MANUAL",
    };
    setManualTodos(prev => [...prev, todo]);
    setSelTodos(prev => [...prev, todo.id]);
    setShowAddTodo(false);
    setNewTodoTitle(""); setNewTodoDesc(""); setNewTodoCategory("other");
    setNewTodoAssignee(MEMBERS[0].id); setNewTodoDueDate(""); setNewTodoPriority("medium");
    setNewTodoError(null);
  };

  const handleSaveMeeting = () => {
    if (!analysisResult) return;
    const meetingId = meeting?.id ?? selected ?? `local-${Date.now()}`;
    const record: SavedMeetingRecord = {
      meetingId,
      title: meetTitle,
      meetingDate: meetDate,
      meetingKind: meetKind,
      participants: partIds.map(id => MEMBERS.find(m => m.id === id)?.name ?? id),
      originalFileName: selectedFile?.name ?? uploadFileName ?? "",
      fileType: uploadType,
      summary: analysisResult.summary,
      decisions: analysisResult.decisions,
      risks: analysisResult.risks,
      actionItems: reviewTodos,
      createdAt: new Date().toISOString(),
      source: "MEETING_AI",
    };
    const next = [record, ...getSavedMeetings().filter(item => item.meetingId !== meetingId)];
    saveSavedMeetings(next);
    setSaveMeetingMessage("회의록이 저장되었습니다.");
    setTimeout(() => setSaveMeetingMessage(null), 2500);
  };

  const handleViewOriginal = async () => {
    if (!selectedFile) {
      setOriginalViewMessage("원본 파일이 없습니다.");
      setTimeout(() => setOriginalViewMessage(null), 2500);
      return;
    }
    const ext = getFileExtension(selectedFile.name);
    if (TEXT_PREVIEW_EXTENSIONS.has(ext)) {
      const content = await decodeTextFile(selectedFile);
      setOriginalPreview({ kind: "text", content, fileName: selectedFile.name });
      return;
    }
    if (ext === "docx") {
      try {
        const content = await extractDocxText(selectedFile);
        setOriginalPreview({ kind: "text", content, fileName: selectedFile.name });
      } catch {
        setOriginalPreview({ kind: "unsupported", fileName: selectedFile.name });
      }
      return;
    }
    setOriginalPreview({ kind: "unsupported", fileName: selectedFile.name });
  };

  const handleExportPdf = async () => {
    if (!analysisResult) {
      setPdfExportMessage("분석 결과가 없어 PDF로 저장할 수 없습니다.");
      setTimeout(() => setPdfExportMessage(null), 2500);
      return;
    }
    const target = pdfCaptureRef.current;
    if (!target || isExportingPdf) return;

    setIsExportingPdf(true);
    try {
      const canvas = await html2canvas(target, { scale: 2, backgroundColor: "#ffffff", useCORS: true });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({ unit: "pt", format: "a4" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const imgWidth = pageWidth;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      let heightLeft = imgHeight;
      let position = 0;
      pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
      heightLeft -= pageHeight;
      while (heightLeft > 0) {
        position -= pageHeight;
        pdf.addPage();
        pdf.addImage(imgData, "PNG", 0, position, imgWidth, imgHeight);
        heightLeft -= pageHeight;
      }

      const dateForFile = (meetDate || getTodayIsoDate()).replace(/-/g, "");
      const safeTitle = (meetTitle.trim() || "회의록").replace(/[\\/:*?"<>|]/g, "_");
      pdf.save(`회의록_${safeTitle}_${dateForFile}.pdf`);
    } catch {
      setPdfExportMessage("PDF 생성 중 오류가 발생했습니다. 다시 시도해주세요.");
      setTimeout(() => setPdfExportMessage(null), 2500);
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleFileSelect = (file: File | undefined) => {
    if (!file) return;
    const mb = file.size / (1024 * 1024);
    setSelectedFile(file);
    setUploadFileName(file.name);
    setUploadFileSize(mb >= 1 ? `${mb.toFixed(1)} MB` : `${Math.max(1, Math.round(file.size / 1024))} KB`);
    setAnalysisError(null);
    if (!meetTitle.trim()) setMeetTitle(stripFileExtension(file.name));
  };

  const startAnalysis = () => {
    if (!selectedFile || !uploadType) {
      setAnalysisError("분석할 회의록 파일을 먼저 업로드해주세요.");
      return;
    }
    const uploadedAt = new Date().toISOString();
    const title = meetTitle.trim() || stripFileExtension(selectedFile.name);
    setMeetTitle(title);
    setAnalysisResult(null);
    setSelTodos([]);
    setTodoAssignees({});
    setTodoDueDates({});
    setShowUnassigned(false);
    setAnalysisSource(null);
    setAnalysisError(null);
    setAnalyzeStage(0);
    setAnalyzeProgress(0);
    setUploadFlow("analyzing");

    void analyzeMeeting({
      projectId: "demo-project",
      file: selectedFile,
      title,
      meetingDate: meetDate,
      meetingKind: meetKind,
      sourceType: uploadType,
      participants: partIds.map(id => MEMBERS.find(member => member.id === id)?.name ?? id),
    }).then(response => {
      const apiTodos = buildGeneratedTodos(response.analysis);
      const source = response.analysisSource === "FASTAPI" ? "fastapi" : "spring-fallback";
      const analyzedMeeting: Meeting = {
        id: response.meetingId,
        title: response.analysis.meeting_meta.title || title,
        date: formatDisplayDate(response.analysis.meeting_meta.meeting_date || meetDate),
        duration: "분석 완료",
        status: "processed",
        summary: response.analysis.summary,
        decisions: response.analysis.decisions,
        todos: response.analysis.todos.map(todo => {
          const assignee = todo.assignee_candidate || "미배정";
          const due = todo.due_date ? ` (${todo.due_date.slice(5).replace("-", ".")})` : "";
          return `${assignee}: ${todo.title}${due}`;
        }),
        risks: response.analysis.risks,
        analysisSource: source,
        fileName: selectedFile?.name,
        uploadedAt,
        analyzedAt: new Date().toISOString(),
      };
      setAnalysisResult(response.analysis);
      setSelTodos(apiTodos.map(t => t.id));
      setAnalysisSource(source);
      setMeetings(prev => {
        const next = [analyzedMeeting, ...prev.filter(item => item.id !== analyzedMeeting.id)];
        saveStoredMeetings(next);
        return next;
      });
      setSelected(analyzedMeeting.id);
    }).catch(() => {
      setAnalysisResult(null);
      setSelTodos([]);
      setAnalysisSource(null);
      setAnalysisError("분석 서버 연결에 실패했습니다. Spring Boot와 FastAPI 서버가 실행 중인지 확인한 뒤 다시 시도해주세요.");
    });
  };

  const registerSelectedTodos = async () => {
    const existingTasks = getStoredTasks();
    const existingKeys = new Set(
      existingTasks.map(task => buildTodoRegistrationKey(task.sourceMeetingTitle ?? "", task.title, task.assignee, task.dueDate))
    );

    const now = Date.now();
    const selectedGeneratedTodos = reviewTodos.filter(todo => selTodos.includes(todo.id));
    const newTodos = selectedGeneratedTodos.filter(todo => {
      const assignee = getAssignee(todo) || MEMBERS[0].id;
      const key = buildTodoRegistrationKey(meetingIdentifier, todo.title, assignee, getDueDate(todo));
      return !existingKeys.has(key);
    });

    if (selectedGeneratedTodos.length > 0 && newTodos.length === 0) {
      setRegisterMessage("이미 등록된 업무입니다.");
      setTimeout(() => setRegisterMessage(null), 2500);
      return;
    }

    if (newTodos.length > 0) {
      try {
        await registerMeetingTasks("demo-project", meetingIdentifier, newTodos.map(todo => toApiTodo(todo)));
      } catch {
        setRegisterMessage("서버에 업무 등록을 실패했습니다. 다시 시도해주세요.");
        setTimeout(() => setRegisterMessage(null), 2500);
        return;
      }
    }

    const createdTasks: Task[] = newTodos.map((todo, index) => {
      const cat = getCat(todo.category);
      const sourceLabel = todo.source === "MEETING_AI" ? "회의록 AI" : "직접 추가";
      return {
        id: `AI-${now}-${String(index + 1).padStart(2, "0")}`,
        title: todo.title,
        status: "todo",
        priority: todo.priority,
        assignee: getAssignee(todo) || MEMBERS[0].id,
        dueDate: getDueDate(todo),
        category: todo.category,
        position: index,
        labels: [sourceLabel, cat.label],
        sourceMeetingTitle: meetingIdentifier,
      };
    });

    if (createdTasks.length > 0) {
      saveStoredTasks([...createdTasks, ...existingTasks]);
      addActivity(`회의록 AI로 '${meetingIdentifier}'의 업무 ${createdTasks.length}건을 업무보드에 등록했습니다.`, "김민준", "meeting-registered");
    }
    setUploadFlow("done");
  };

  // 회의 상세 화면(meeting.todos, 문자열 배열)에서 "업무로 등록" 클릭 시 실행.
  const handleRegisterMeetingTodos = async () => {
    if (!meeting || !meeting.todos || meeting.todos.length === 0) return;
    const existingTasks = getStoredTasks();
    const existingKeys = new Set(
      existingTasks.map(task => buildTodoRegistrationKey(task.sourceMeetingTitle ?? "", task.title, task.assignee, task.dueDate))
    );

    const parsedTodos = meeting.todos.map(line => {
      const parsed = parseMeetingTodoLine(line);
      const assigneeId = MEMBERS.find(m => m.name === parsed.assigneeName)?.id ?? MEMBERS[0].id;
      return { ...parsed, assigneeId };
    });

    const newTodos = parsedTodos.filter(todo => {
      const key = buildTodoRegistrationKey(meetingIdentifier, todo.title, todo.assigneeId, todo.dueDate);
      return !existingKeys.has(key);
    });

    if (newTodos.length === 0) {
      setRegisterMessage("이미 등록된 업무입니다.");
      setTimeout(() => setRegisterMessage(null), 2500);
      return;
    }

    try {
      await registerMeetingTasks("demo-project", meetingIdentifier, newTodos.map(todo => ({
        title: todo.title,
        description: "",
        assignee_candidate: todo.assigneeName,
        assignee_id: todo.assigneeId,
        due_date: todo.dueDate || null,
        priority: "MEDIUM",
        category: "ETC",
        needs_leader_review: false,
      })));
    } catch {
      setRegisterMessage("서버에 업무 등록을 실패했습니다. 다시 시도해주세요.");
      setTimeout(() => setRegisterMessage(null), 2500);
      return;
    }

    const now = Date.now();
    const createdTasks: Task[] = newTodos.map((todo, index) => ({
      id: `AI-${now}-${String(index + 1).padStart(2, "0")}`,
      title: todo.title,
      status: "todo",
      priority: "medium",
      assignee: todo.assigneeId,
      dueDate: todo.dueDate,
      category: "other",
      position: index,
      labels: ["회의록 AI"],
      sourceMeetingTitle: meetingIdentifier,
    }));
    saveStoredTasks([...createdTasks, ...existingTasks]);
    addActivity(`회의록 AI로 '${meetingIdentifier}'의 업무 ${createdTasks.length}건을 업무보드에 등록했습니다.`, "김민준", "meeting-registered");
    setRegisterMessage("업무 보드에 등록되었습니다.");
    setTimeout(() => setRegisterMessage(null), 2500);
  };

  // ── Analyzing screen ────────────────────────────────────────────────────────
  const renderAnalyzing = () => (
    <div className="h-full flex items-center justify-center bg-background" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
      <div className="w-full max-w-lg px-6 text-center">
        {/* Spinner */}
        <div className="relative w-28 h-28 mx-auto mb-8">
          <svg className="w-28 h-28 -rotate-90" viewBox="0 0 112 112">
            <circle cx="56" cy="56" r="48" fill="none" stroke="#EEF1F8" strokeWidth="8" />
            <circle cx="56" cy="56" r="48" fill="none" strokeWidth="8" strokeLinecap="round"
              strokeDasharray={`${(analyzeProgress / 100) * 301} 301`} stroke="url(#ag)" />
            <defs><linearGradient id="ag" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" stopColor="#7048E8" /><stop offset="100%" stopColor="#4F6EF7" />
            </linearGradient></defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-foreground">{analyzeProgress}%</span>
            <span className="text-[10px] text-muted-foreground">분석 중</span>
          </div>
        </div>

        <div className="mb-2 text-xs font-mono text-muted-foreground">{uploadFileName || "업로드된 회의록"}</div>
        <h2 className="text-xl font-bold text-foreground mb-1">AI 분석 진행 중</h2>
        <p className="text-sm text-muted-foreground mb-8">잠시만 기다려주세요. 회의 내용을 분석하고 업무를 자동 생성합니다.</p>

        {/* Stage list */}
        <div className="space-y-2 text-left max-w-sm mx-auto">
          {analyzeStages.map((stage, i) => {
            const done = i < analyzeStage; const active = i === analyzeStage;
            return (
              <div key={i} className={`flex items-center gap-3 px-4 py-2.5 rounded-lg transition-all ${active ? "bg-blue-50 border border-blue-200" : done ? "opacity-60" : "opacity-30"}`}>
                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 ${done ? "bg-emerald-500" : active ? "border-2 border-blue-500" : "border-2 border-slate-300"}`}>
                  {done ? <Check className="w-3 h-3 text-white" /> : active ? <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" /> : null}
                </div>
                <span className={`text-xs font-medium ${active ? "text-blue-700" : done ? "text-emerald-700" : "text-muted-foreground"}`}>{stage}</span>
                {active && <div className="ml-auto flex gap-0.5">{[0,1,2].map(j => <div key={j} className="w-1 h-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay:`${j*0.15}s` }} />)}</div>}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-muted-foreground mt-8">약 20~40초 소요 · 분석이 완료되면 자동으로 이동합니다</p>
      </div>
    </div>
  );

  // ── Results screen ───────────────────────────────────────────────────────────
  const renderResults = () => {
    if (!analysisResult) {
      return (
        <div className="h-full flex items-center justify-center bg-background" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
          <div className="w-full max-w-md px-6 text-center">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-5">
              {analysisError ? <AlertTriangle className="w-8 h-8 text-amber-500" /> : <Sparkles className="w-8 h-8 text-blue-500 animate-pulse" />}
            </div>
            <h2 className="text-xl font-bold text-foreground mb-2">{analysisError ? "분석을 완료하지 못했습니다" : "분석 결과를 불러오는 중"}</h2>
            <p className="text-sm text-muted-foreground leading-relaxed mb-6">
              {analysisError ?? "업로드한 회의록의 요약, 결정사항, To-Do, 위험요소를 정리하고 있습니다."}
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={() => setUploadFlow("modal")} className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity" style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                다시 업로드
              </button>
              <button onClick={() => setUploadFlow(null)} className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors">
                회의록으로 돌아가기
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
    <div className="h-full flex overflow-hidden" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
      {/* Left: meeting list (mini) */}
      <div className="w-72 shrink-0 border-r border-border flex flex-col bg-card">
        <div className="p-4 border-b border-border">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-xs font-semibold text-emerald-600">AI 분석 완료</span>
          </div>
          <div className="text-sm font-bold text-foreground leading-snug">{meetTitle}</div>
          <div className="text-xs text-muted-foreground mt-0.5">{meetDate} · {meetKind}</div>
          <div className="flex -space-x-1.5 mt-2">
            {partIds.map(id => { const m = MEMBERS.find(me => me.id === id)!; return (
              <div key={id} title={m.name} className="w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-white text-[9px] font-bold" style={{ background:m.color }}>{m.initials}</div>
            ); })}
          </div>
        </div>
        {/* Tabs */}
        <div className="flex border-b border-border shrink-0">
          {(["summary","todos","risks"] as const).map(tab => {
            const l = { summary:"요약", todos:"To-Do", risks:"위험" };
            return <button key={tab} onClick={() => setPanelTab(tab)} className={`flex-1 py-2.5 text-[11px] font-semibold border-b-2 transition-colors ${panelTab===tab ? "border-blue-500 text-blue-600" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{l[tab]}</button>;
          })}
        </div>
        {/* Quick info */}
        <div className="p-4 space-y-2 text-xs text-muted-foreground border-b border-border">
          <div className="flex justify-between"><span>업로드 유형</span><span className="font-medium text-foreground">{UPLOAD_TYPES.find(u => u.id === uploadType)?.label ?? "문서 업로드"}</span></div>
          <div className="flex justify-between"><span>생성된 To-Do</span><span className="font-semibold text-blue-600">{generatedTodos.length}개</span></div>
          <div className="flex justify-between"><span>미배정 업무</span><span className="font-semibold text-amber-600">{unassignedCount}개</span></div>
          <div className="flex justify-between"><span>위험 요소</span><span className="font-semibold text-red-600">{riskCards.length}건</span></div>
        </div>
        {/* Actions */}
        <div className="p-4 space-y-2">
          <button onClick={() => setUploadFlow("review")}
            className="w-full py-2.5 text-sm font-semibold text-white rounded-xl flex items-center justify-center gap-2 hover:opacity-90 transition-opacity"
            style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
            <ListChecks className="w-4 h-4" />역할 분배 검토 →
          </button>
          <button onClick={handleSaveMeeting} className="w-full py-2 text-xs font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors flex items-center justify-center gap-1.5">
            <FileText className="w-3.5 h-3.5" />회의록 저장
          </button>
          {saveMeetingMessage && <div className="text-[10px] text-emerald-600 text-center">{saveMeetingMessage}</div>}
          <button onClick={() => setUploadFlow(null)} className="w-full py-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            닫기
          </button>
        </div>
      </div>

      {/* Right: results */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">✓ AI 분석 완료</span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${analysisSource === "fastapi" ? "bg-blue-100 text-blue-700" : "bg-emerald-100 text-emerald-700"}`}>
                {analysisSource === "fastapi" ? "Spring/FastAPI 응답" : "Spring 분석 응답"}
              </span>
              <span className="text-[10px] text-muted-foreground">{meetDate}</span>
            </div>
            <h1 className="text-lg font-bold text-foreground">{meetTitle}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">{meetKind} · 참석자 {partIds.length}명</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <button onClick={handleViewOriginal} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card rounded-lg hover:bg-muted transition-colors"><Eye className="w-3.5 h-3.5" />원본 보기</button>
              <button onClick={handleExportPdf} disabled={!analysisResult || isExportingPdf} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-border bg-card rounded-lg hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-card"><FileText className="w-3.5 h-3.5" />{isExportingPdf ? "PDF 생성 중..." : "PDF 저장"}</button>
            </div>
            {originalViewMessage && <div className="text-[10px] text-amber-600">{originalViewMessage}</div>}
            {pdfExportMessage && <div className="text-[10px] text-amber-600">{pdfExportMessage}</div>}
          </div>
        </div>

        {/* Summary tab */}
        {panelTab === "summary" && (
          <div className="space-y-4">
            <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4" style={{ color:"var(--accent)" }} />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">AI 회의 요약</span>
              </div>
              <p className="text-sm text-foreground leading-relaxed">{analysisResult.summary}</p>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
              <div className="flex items-center gap-2 mb-3">
                <CheckCheck className="w-4 h-4 text-emerald-500" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">핵심 결정사항</span>
              </div>
              <ul className="space-y-2.5">
                {analysisResult.decisions.map((d, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold text-emerald-600">{i + 1}</div>
                    <span className="text-sm text-foreground leading-relaxed">{d}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">다음 회의 전까지</div>
              <ul className="space-y-1.5">
                {(nextActions.length ? nextActions : ["담당자 검토 후 업무 보드에 등록"]).map((t, i) => (
                  <li key={i} className="flex items-center gap-2 text-sm text-foreground">
                    <ArrowRight className="w-3.5 h-3.5 text-blue-500 shrink-0" />{t}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Todos tab */}
        {panelTab === "todos" && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="text-sm font-semibold text-foreground">생성된 To-Do <span className="text-muted-foreground font-normal">({generatedTodos.length}개)</span></div>
              <button onClick={() => setUploadFlow("review")} className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg hover:opacity-90"
                style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                <ListChecks className="w-3.5 h-3.5" />역할 분배 검토
              </button>
            </div>
            {groupedGeneratedTodos.map(todo => {
              const assigneeId = getAssignee(todo);
              const m = MEMBERS.find(me => me.id === assigneeId);
              return (
                <div key={todo.id} className={`bg-card rounded-xl p-4 border shadow-sm ${!todo.assigned ? "border-amber-300" : "border-border"}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <CatTag catId={todo.category} />
                      {!todo.assigned && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 border border-amber-200">미배정</span>}
                    </div>
                    <PriorityBadge priority={todo.priority} />
                  </div>
                  <div className="text-sm font-semibold text-foreground mb-1">{todo.title}</div>
                  <div className="text-xs text-muted-foreground mb-2">{todo.desc}</div>
                  <div className="flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5">
                      {m ? (
                        <div className="flex items-center gap-1"><div className="w-5 h-5 rounded-full flex items-center justify-center text-white text-[9px] font-bold" style={{ background:m.color }}>{m.initials}</div><span className="text-muted-foreground">{m.name}</span></div>
                      ) : <span className="text-amber-600 font-medium">담당자 미배정</span>}
                    </div>
                    <span className="text-muted-foreground">마감 {todo.dueDate}</span>
                  </div>
                  <div className="mt-2 pt-2 border-t border-border text-[10px] text-muted-foreground">
                    근거: <span className="text-foreground">{todo.basis}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Risks tab */}
        {panelTab === "risks" && (
          <div className="space-y-4">
            {riskCards.map((r, i) => (
              <div key={i} className={`rounded-xl p-5 border ${r.level==="high" ? "bg-red-50 border-red-200" : "bg-amber-50 border-amber-200"}`}>
                <div className="flex items-start gap-2 mb-2">
                  <AlertTriangle className={`w-4 h-4 shrink-0 mt-0.5 ${r.level==="high" ? "text-red-500" : "text-amber-500"}`} />
                  <div>
                    <span className={`text-[10px] font-bold mr-2 ${r.level==="high" ? "text-red-700" : "text-amber-700"}`}>{r.level==="high"?"🔴 즉시 대응":"🟡 주의"}</span>
                    <span className={`text-sm font-semibold ${r.level==="high" ? "text-red-900" : "text-amber-900"}`}>{r.text}</span>
                  </div>
                </div>
                <div className={`flex items-start gap-1.5 text-xs mt-2 ${r.level==="high" ? "text-red-700" : "text-amber-700"}`}>
                  <Sparkles className="w-3 h-3 shrink-0 mt-0.5" />
                  <span><strong>AI 추천 대응:</strong> {r.suggestion}</span>
                </div>
              </div>
            ))}
            <div className="bg-blue-50 rounded-xl p-4 border border-blue-200">
              <div className="flex items-center gap-2 mb-1"><Sparkles className="w-3.5 h-3.5 text-blue-500" /><span className="text-xs font-semibold text-blue-700">AI 종합 제안</span></div>
              <p className="text-xs text-blue-800 leading-relaxed">핵심 키워드({analysisResult.keywords.slice(0, 4).join(", ")})를 기준으로 업무 우선순위를 정리하고, 미배정 업무는 팀장이 먼저 확정하는 것을 권장합니다.</p>
            </div>
          </div>
        )}
      </div>

      {/* PDF 캡처용 숨김 영역: 화면에는 보이지 않고 html2canvas가 이 DOM을 캡처해 PDF로 저장한다.
          Tailwind 클래스/CSS 변수(oklch 등) 대신 인라인 스타일만 사용 — html2canvas가 최신 CSS 색상 함수를 못 읽는 문제를 피하기 위함. */}
      <div style={{ position: "fixed", top: 0, left: "-10000px", width: "760px" }}>
        <div ref={pdfCaptureRef} style={{ background: "#ffffff", padding: "40px", width: "760px", fontFamily: "'Malgun Gothic','Apple SD Gothic Neo',sans-serif", color: "#1a1a1a" }}>
          <h1 style={{ fontSize: "22px", fontWeight: 700, margin: "0 0 4px" }}>{meetTitle}</h1>
          <div style={{ fontSize: "12px", color: "#666666", marginBottom: "24px" }}>
            {meetDate} · {meetKind} · 참석자 {partIds.map(id => MEMBERS.find(m => m.id === id)?.name ?? id).join(", ")}
          </div>

          <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "20px 0 8px", borderBottom: "1px solid #dddddd", paddingBottom: "4px" }}>회의 요약</h2>
          <p style={{ fontSize: "13px", lineHeight: 1.7, margin: 0 }}>{analysisResult.summary}</p>

          <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "20px 0 8px", borderBottom: "1px solid #dddddd", paddingBottom: "4px" }}>핵심 결정사항</h2>
          <ul style={{ fontSize: "13px", lineHeight: 1.7, margin: 0, paddingLeft: "20px" }}>
            {analysisResult.decisions.length
              ? analysisResult.decisions.map((d, i) => <li key={i}>{d}</li>)
              : <li>결정사항이 없습니다.</li>}
          </ul>

          <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "20px 0 8px", borderBottom: "1px solid #dddddd", paddingBottom: "4px" }}>생성된 To-Do</h2>
          <ul style={{ fontSize: "13px", lineHeight: 1.7, margin: 0, paddingLeft: "20px" }}>
            {reviewTodos.length
              ? reviewTodos.map(t => {
                  const assigneeName = MEMBERS.find(m => m.id === getAssignee(t))?.name ?? "미배정";
                  return <li key={t.id}>{t.title} - {assigneeName} ({getDueDate(t) || "마감일 미정"})</li>;
                })
              : <li>생성된 업무가 없습니다.</li>}
          </ul>

          <h2 style={{ fontSize: "15px", fontWeight: 700, margin: "20px 0 8px", borderBottom: "1px solid #dddddd", paddingBottom: "4px" }}>위험 요소</h2>
          <ul style={{ fontSize: "13px", lineHeight: 1.7, margin: 0, paddingLeft: "20px" }}>
            {analysisResult.risks.length
              ? analysisResult.risks.map((r, i) => <li key={i}>{r}</li>)
              : <li>감지된 위험 요소가 없습니다.</li>}
          </ul>
        </div>
      </div>

      {/* 원본 보기 모달 */}
      {originalPreview && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setOriginalPreview(null)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
              <div className="flex items-center justify-between px-5 py-3.5 border-b border-border shrink-0">
                <div className="text-sm font-bold text-foreground truncate">{originalPreview.fileName}</div>
                <button onClick={() => setOriginalPreview(null)} className="p-1.5 hover:bg-muted rounded-lg transition-colors shrink-0"><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
              <div className="flex-1 overflow-y-auto p-5">
                {originalPreview.kind === "text" ? (
                  <pre className="text-xs text-foreground leading-relaxed" style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontFamily: "'JetBrains Mono','Noto Sans KR',monospace" }}>
                    {originalPreview.content}
                  </pre>
                ) : (
                  <div className="flex flex-col items-center justify-center text-center py-10 text-muted-foreground">
                    <FileText className="w-10 h-10 mb-3 text-slate-300" />
                    <div className="text-sm font-semibold text-foreground mb-1">이 파일 형식은 원본 미리보기를 지원하지 않습니다.</div>
                    <div className="text-xs">저장된 파일명: {originalPreview.fileName}</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
    );
  };

  // ── Review screen ────────────────────────────────────────────────────────────
  const renderReview = () => {
    const todos = showUnassigned ? reviewTodos.filter(t => !getAssignee(t)) : reviewTodos;
    const approvedCount = selTodos.length;
    return (
      <div className="h-full flex flex-col overflow-hidden" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
        {/* Header */}
        <div className="shrink-0 px-6 pt-5 pb-4 border-b border-border">
          <div className="flex items-start justify-between mb-3">
            <div>
              <button onClick={() => setUploadFlow("results")} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors group">
                <ArrowLeft className="w-3.5 h-3.5 group-hover:-translate-x-0.5 transition-transform" />분석 결과로 돌아가기
              </button>
              <h1 className="text-xl font-bold text-foreground">역할 분배 검토</h1>
              <p className="text-sm text-muted-foreground mt-0.5">팀장이 확인하고 승인한 업무만 업무 보드에 등록됩니다.</p>
            </div>
            <div className="flex flex-col items-end gap-1">
              <div className="flex items-center gap-2">
                <button onClick={() => setShowUnassigned(v => !v)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border transition-all ${showUnassigned ? "border-amber-400 bg-amber-50 text-amber-700" : "border-border bg-card text-muted-foreground hover:border-slate-300"}`}>
                  <AlertTriangle className="w-3.5 h-3.5" />미배정만 보기 {showUnassigned && <span className="bg-amber-200 text-amber-800 px-1 rounded text-[10px]">{unassignedCount}</span>}
                </button>
                {isReviewBatchAlreadyRegistered ? (
                  <button onClick={() => { setUploadFlow(null); navigate("/board"); }}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity"
                    style={{ background:"linear-gradient(135deg,#10B981,#059669)" }}>
                    <CheckCircle2 className="w-4 h-4" />등록 완료 · 업무보드 확인
                  </button>
                ) : (
                  <button onClick={registerSelectedTodos}
                    disabled={approvedCount === 0}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity disabled:opacity-50"
                    style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                    <CheckCircle2 className="w-4 h-4" />{approvedCount}개 업무 보드에 등록
                  </button>
                )}
              </div>
              {registerMessage && <div className="text-[11px] text-amber-600">{registerMessage}</div>}
            </div>
          </div>

          {/* Summary chips */}
          <div className="flex items-center gap-2 text-xs">
            <span className="px-2.5 py-1 rounded-full bg-blue-100 text-blue-700 font-medium">{generatedTodos.length}개 AI 생성</span>
            <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-700 font-medium">{assignedCount}개 배정 완료</span>
            <span className="px-2.5 py-1 rounded-full bg-amber-100 text-amber-700 font-medium">{unassignedCount}개 미배정</span>
            {manualTodos.length > 0 && <span className="px-2.5 py-1 rounded-full bg-purple-100 text-purple-700 font-medium">{manualTodos.length}개 직접 추가</span>}
            <button onClick={() => setSelTodos(reviewTodos.map(t=>t.id))} className="ml-auto text-xs text-blue-600 hover:text-blue-700 underline underline-offset-2">전체 선택</button>
            <button onClick={() => setSelTodos([])} className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2">전체 해제</button>
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-y-auto px-6 pb-24">
          <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden mt-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="pl-4 pr-2 py-3 w-8" />
                  {["ID","업무명","카테고리","담당자","마감일","우선순위","근거"].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">{h}</th>
                  ))}
                  <th className="px-3 py-3 w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {todos.map(todo => {
                  const checked = selTodos.includes(todo.id);
                  const assigneeId = getAssignee(todo);
                  const isUnassigned = !assigneeId;
                  return (
                    <tr key={todo.id} className={`hover:bg-muted/30 transition-colors ${isUnassigned ? "bg-amber-50/30" : ""}`}>
                      <td className="pl-4 pr-2 py-3">
                        <div onClick={() => setSelTodos(p => checked ? p.filter(x=>x!==todo.id) : [...p,todo.id])}
                          className={`w-4 h-4 rounded border cursor-pointer flex items-center justify-center transition-all ${checked ? "border-blue-500 bg-blue-500" : "border-border hover:border-blue-400"}`}>
                          {checked && <Check className="w-2.5 h-2.5 text-white" />}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px] text-muted-foreground">{todo.id}</td>
                      <td className="px-3 py-3 max-w-[180px]">
                        <div className="text-xs font-semibold text-foreground">{todo.title}</div>
                        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{todo.desc}</div>
                      </td>
                      <td className="px-3 py-3"><CatTag catId={todo.category} /></td>
                      <td className="px-3 py-3">
                        <select value={assigneeId} onChange={e => setTodoAssignees(p => ({ ...p, [todo.id]: e.target.value }))}
                          className={`text-xs rounded-lg border px-2 py-1.5 outline-none focus:border-blue-400 cursor-pointer ${isUnassigned ? "border-amber-300 bg-amber-50 text-amber-700" : "border-border bg-card text-foreground"}`}>
                          <option value="">⚠ 미배정</option>
                          {MEMBERS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                        </select>
                      </td>
                      <td className="px-3 py-3">
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="MM.DD"
                          value={getDueDate(todo)}
                          onChange={e => setTodoDueDates(p => ({ ...p, [todo.id]: formatMMDDInput(e.target.value) }))}
                          className="text-xs rounded-lg border border-border bg-card px-2 py-1.5 outline-none focus:border-blue-400 w-16 text-center"
                        />
                      </td>
                      <td className="px-3 py-3"><PriorityBadge priority={todo.priority} /></td>
                      <td className="px-3 py-3 text-[10px] text-muted-foreground max-w-[120px] truncate" title={todo.basis}>{todo.basis}</td>
                      <td className="px-3 py-3">
                        <button className="p-1 hover:bg-muted rounded transition-colors"><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add task */}
          {canAddManualTodo && (
            <div className="mt-3">
              {!showAddTodo && (
                <button onClick={() => setShowAddTodo(true)}
                  className="flex items-center gap-2 px-4 py-2 text-xs font-medium text-blue-600 border border-dashed border-blue-300 rounded-xl hover:bg-blue-50 transition-colors">
                  <Plus className="w-3.5 h-3.5" />새 업무 직접 추가
                </button>
              )}
              {showAddTodo && (
                <div className="p-4 rounded-xl border border-border bg-card space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-foreground block mb-1.5">업무명 <span className="text-red-500">*</span></label>
                      <input value={newTodoTitle} onChange={e => setNewTodoTitle(e.target.value)} placeholder="업무명을 입력하세요"
                        className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-xs outline-none focus:border-blue-400" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs font-semibold text-foreground block mb-1.5">설명</label>
                      <input value={newTodoDesc} onChange={e => setNewTodoDesc(e.target.value)} placeholder="업무 설명 (선택)"
                        className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-xs outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1.5">카테고리</label>
                      <select value={newTodoCategory} onChange={e => setNewTodoCategory(e.target.value as CatId)}
                        className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-xs outline-none focus:border-blue-400">
                        {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1.5">담당자 <span className="text-red-500">*</span></label>
                      <select value={newTodoAssignee} onChange={e => setNewTodoAssignee(e.target.value)}
                        className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-xs outline-none focus:border-blue-400">
                        {MEMBERS.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1.5">마감일 <span className="text-red-500">*</span></label>
                      <input type="date" value={newTodoDueDate} onChange={e => setNewTodoDueDate(e.target.value)}
                        className="w-full rounded-lg border border-border bg-input-background px-3 py-2 text-xs outline-none focus:border-blue-400" />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground block mb-1.5">우선순위</label>
                      <div className="flex gap-1.5">
                        {(["low","medium","high"] as Priority[]).map(p => (
                          <button key={p} type="button" onClick={() => setNewTodoPriority(p)}
                            className={`flex-1 py-1.5 text-[11px] font-semibold rounded-lg border transition-all ${newTodoPriority===p ? "border-blue-500 bg-blue-50 text-blue-700" : "border-border bg-card text-muted-foreground"}`}>
                            {p==="low"?"낮음":p==="medium"?"중간":"높음"}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                  {newTodoError && <div className="text-[11px] text-red-600">{newTodoError}</div>}
                  <div className="flex items-center gap-2 justify-end pt-1">
                    <button onClick={() => { setShowAddTodo(false); setNewTodoError(null); }} className="px-3 py-1.5 text-xs font-medium text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">취소</button>
                    <button onClick={handleAddManualTodo} className="px-3 py-1.5 text-xs font-semibold text-white rounded-lg hover:opacity-90 transition-opacity" style={{ background:"var(--primary)" }}>추가</button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  // ── Done screen ──────────────────────────────────────────────────────────────
  const renderDone = () => (
    <div className="h-full flex items-center justify-center bg-background" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
      <div className="text-center max-w-md px-6">
        <div className="w-20 h-20 rounded-3xl flex items-center justify-center mx-auto mb-6" style={{ background:"linear-gradient(135deg,#10B981,#059669)" }}>
          <CheckCircle2 className="w-10 h-10 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-foreground mb-2">업무 등록 완료!</h1>
        <p className="text-sm text-muted-foreground mb-2">{selTodos.length}개 업무가 업무 보드에 등록되었습니다.</p>
        <p className="text-xs text-muted-foreground mb-8">담당자별 할 일, 마일스톤 진행률, 대시보드가 자동으로 업데이트됩니다.</p>

        {/* Where registered */}
        <div className="grid grid-cols-2 gap-3 text-left mb-8">
          {[
            { icon:Columns3, label:"업무 보드", desc:"'할 일' 컬럼에 추가됨", color:"#3B5BDB" },
            { icon:Users, label:"담당자 할 일", desc:"개인 업무 목록에 반영", color:"#7048E8" },
            { icon:LayoutDashboard, label:"대시보드", desc:"전체 업무 수 업데이트", color:"#10B981" },
            { icon:Calendar, label:"캘린더", desc:"마감일 기반 일정 등록", color:"#F59E0B" },
          ].map(item => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-2.5 p-3 rounded-xl bg-card border border-border shadow-sm">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ background:`${item.color}15` }}>
                  <Icon className="w-4 h-4" style={{ color:item.color }} />
                </div>
                <div>
                  <div className="text-xs font-semibold text-foreground">{item.label}</div>
                  <div className="text-[10px] text-muted-foreground">{item.desc}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="flex gap-3 justify-center">
          <button onClick={() => setUploadFlow(null)} className="px-5 py-2.5 text-sm font-medium border border-border rounded-xl hover:bg-muted transition-colors">
            회의록으로 돌아가기
          </button>
          <button onClick={() => { setUploadFlow(null); navigate("/board"); }} className="px-5 py-2.5 text-sm font-semibold text-white rounded-xl hover:opacity-90 transition-opacity" style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
            업무 보드 확인하기
          </button>
        </div>
      </div>
    </div>
  );

  // ── Early returns for full-screen states ─────────────────────────────────────
  if (uploadFlow === "analyzing") return renderAnalyzing();
  if (uploadFlow === "results")   return renderResults();
  if (uploadFlow === "review")    return renderReview();
  if (uploadFlow === "done")      return renderDone();

  return (
    <div className="flex h-full overflow-hidden relative" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
      {/* ── Upload modal ── */}
      {uploadFlow === "modal" && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50" onClick={() => setUploadFlow(null)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" onClick={e => e.stopPropagation()}>
            <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col" style={{ fontFamily:"'Inter','Noto Sans KR',sans-serif" }}>
              {/* Modal header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div>
                  <div className="text-lg font-bold text-foreground">회의록 업로드</div>
                  <div className="text-xs text-muted-foreground mt-0.5">회의 파일을 업로드하면 AI가 자동으로 분석하고 업무를 생성합니다.</div>
                </div>
                <button onClick={() => setUploadFlow(null)} className="p-1.5 hover:bg-muted rounded-lg transition-colors"><X className="w-5 h-5 text-muted-foreground" /></button>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-5">
                {/* Step 0: type selection */}
                {modalStep === 0 && (
                  <div>
                    <div className="text-sm font-semibold text-foreground mb-3">업로드 유형 선택</div>
                    <div className="grid grid-cols-3 gap-3">
                      {UPLOAD_TYPES.map(t => {
                        const Icon = t.icon; const sel = uploadType === t.id;
                        return (
                          <button key={t.id} onClick={() => {
                            const nextType = t.id as UploadType;
                            setUploadType(nextType);
                            setSelectedFile(null);
                            setUploadFileName("");
                            setUploadFileSize("");
                            setAnalysisError(null);
                          }}
                            className={`flex flex-col items-center gap-2.5 p-5 rounded-xl border-2 transition-all hover:shadow-sm ${sel ? "shadow-sm" : "border-border hover:border-slate-300"}`}
                            style={sel ? { borderColor:t.color, background:t.bg } : {}}>
                            <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background:sel ? t.bg : "#F4F6FA" }}>
                              <Icon className="w-6 h-6" style={{ color:t.color }} />
                            </div>
                            <div className="text-center">
                              <div className="text-sm font-bold text-foreground">{t.label}</div>
                              <div className="text-[10px] text-muted-foreground mt-0.5">{t.desc}</div>
                            </div>
                            {sel && <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ background:t.color }}><Check className="w-3 h-3 text-white" /></div>}
                          </button>
                        );
                      })}
                    </div>
                    {uploadType && (
                      <div className="mt-3 px-4 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800 flex items-center gap-2">
                        <Sparkles className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                        {UPLOAD_TYPES.find(t => t.id === uploadType)?.note}
                      </div>
                    )}
                  </div>
                )}

                {/* Step 1: form + file upload */}
                {modalStep === 1 && uploadType && (() => {
                  const utype = UPLOAD_TYPES.find(t => t.id === uploadType)!;
                  const Icon = utype.icon;
                  return (
                    <div className="space-y-4">
                      <div className="flex items-center gap-2 mb-1">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background:utype.bg }}><Icon className="w-4 h-4" style={{ color:utype.color }} /></div>
                        <span className="text-sm font-bold text-foreground">{utype.label}</span>
                      </div>

                      {/* File drop zone */}
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept={utype.accept}
                        className="hidden"
                        onChange={e => handleFileSelect(e.target.files?.[0])}
                      />
                      <div className="border-2 border-dashed border-border rounded-xl p-8 text-center hover:border-blue-400 hover:bg-blue-50/30 transition-all cursor-pointer"
                        onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                        onDragEnter={e => { e.preventDefault(); e.stopPropagation(); }}
                        onDrop={e => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleFileSelect(e.dataTransfer.files?.[0]);
                        }}
                        onClick={() => fileInputRef.current?.click()}>
                        {uploadFileName ? (
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background:utype.bg }}><Icon className="w-6 h-6" style={{ color:utype.color }} /></div>
                            <div className="text-sm font-semibold text-foreground">{uploadFileName}</div>
                            <div className="text-[10px] text-muted-foreground">{uploadFileSize || "파일 선택됨"}</div>
                            <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-600">업로드 완료</span>
                          </div>
                        ) : (
                          <div className="flex flex-col items-center gap-2">
                            <Upload className="w-8 h-8 text-muted-foreground" />
                            <div className="text-sm font-medium text-foreground">파일을 드래그하거나 클릭하여 업로드</div>
                            <div className="text-xs text-muted-foreground">{utype.accept.toUpperCase().replace(/\./g,'').replace(/,/g,', ')} 지원</div>
                          </div>
                        )}
                      </div>

                      {/* Metadata form */}
                      <div className="grid grid-cols-2 gap-3">
                        <div className="col-span-2">
                          <label className="text-xs font-semibold text-foreground block mb-1.5">회의 제목 <span className="text-red-500">*</span></label>
                          <input value={meetTitle} onChange={e => setMeetTitle(e.target.value)} placeholder="예: 7차 정기 회의 — 결제 연동 점검"
                            className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">회의 날짜</label>
                          <input type="date" value={meetDate} onChange={e => setMeetDate(e.target.value)} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400" />
                        </div>
                        <div>
                          <label className="text-xs font-semibold text-foreground block mb-1.5">회의 유형</label>
                          <select value={meetKind} onChange={e => setMeetKind(e.target.value)} className="w-full rounded-xl border border-border bg-input-background px-4 py-2.5 text-sm outline-none focus:border-blue-400">
                            {MEET_KINDS.map(k => <option key={k}>{k}</option>)}
                          </select>
                        </div>
                      </div>

                      {/* Participants */}
                      <div>
                        <label className="text-xs font-semibold text-foreground block mb-2">참석자</label>
                        <div className="flex flex-wrap gap-2">
                          {MEMBERS.map(m => {
                            const sel = partIds.includes(m.id);
                            return (
                              <button key={m.id} onClick={() => setPartIds(p => sel ? p.filter(x=>x!==m.id) : [...p,m.id])}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${sel ? "border-blue-400 bg-blue-50 text-blue-700" : "border-border bg-card text-muted-foreground hover:border-slate-300"}`}>
                                <div className="w-4 h-4 rounded-full flex items-center justify-center text-white text-[8px] font-bold" style={{ background:m.color }}>{m.initials}</div>
                                {m.name}
                                {sel && <Check className="w-3 h-3" />}
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Auto analyze toggle */}
                      <div className="flex items-center justify-between p-3.5 rounded-xl bg-muted/50 border border-border">
                        <div>
                          <div className="text-xs font-semibold text-foreground">자동 분석 시작</div>
                          <div className="text-[10px] text-muted-foreground">업로드 후 즉시 AI 분석을 시작합니다.</div>
                        </div>
                        <div className="w-10 h-6 rounded-full flex items-center px-0.5 cursor-pointer" style={{ background:"var(--primary)" }}>
                          <div className="w-5 h-5 rounded-full bg-white shadow-sm ml-auto" />
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* Modal footer */}
              <div className="flex items-center justify-between px-6 py-4 border-t border-border">
                <button onClick={() => modalStep===0 ? setUploadFlow(null) : setModalStep(0)}
                  className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-muted-foreground border border-border rounded-xl hover:bg-muted transition-colors">
                  <ArrowLeft className="w-4 h-4" />{modalStep===0?"취소":"이전"}
                </button>
                {modalStep === 0 ? (
                  <button onClick={() => setModalStep(1)} disabled={!uploadType}
                    className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 hover:opacity-90 transition-opacity"
                    style={{ background:"linear-gradient(135deg,#3B5BDB,#4F6EF7)" }}>
                    다음<ArrowRight className="w-4 h-4" />
                  </button>
                ) : (
                  <button onClick={startAnalysis}
                    disabled={!selectedFile}
                    className="flex items-center gap-1.5 px-5 py-2 text-sm font-semibold text-white rounded-xl disabled:opacity-40 hover:opacity-90 transition-opacity"
                    style={{ background:"linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
                    <Sparkles className="w-4 h-4" />AI 분석 시작
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Meeting list ── */}
      <div className="w-80 shrink-0 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center gap-2">
          <button onClick={() => { setUploadFlow("modal"); setModalStep(0); setUploadType(null); setUploadFileName(""); setUploadFileSize(""); setSelectedFile(null); setAnalysisSource(null); setAnalysisError(null); }}
            className="flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-white text-sm font-medium transition-opacity hover:opacity-90"
            style={{ background:"linear-gradient(135deg,#7048E8 0%,#4F6EF7 100%)" }}>
            <Upload className="w-4 h-4" />회의록 업로드
          </button>
          <button className="p-2 rounded-lg border border-border bg-card hover:bg-muted transition-colors">
            <Mic className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {meetingListError && <div className="text-[11px] text-amber-600 px-1">{meetingListError}</div>}
          {meetings.length === 0 ? (
            <div className="h-full min-h-[360px] flex flex-col items-center justify-center text-center px-4 text-muted-foreground">
              <div className="w-14 h-14 rounded-2xl bg-muted flex items-center justify-center mb-4">
                <FileAudio className="w-7 h-7 text-slate-400" />
              </div>
              <div className="text-sm font-semibold text-foreground mb-1">아직 업로드한 회의록이 없습니다</div>
              <div className="text-xs leading-relaxed mb-4">문서, 음성, 영상 파일을 업로드하면 AI 분석 결과가 이곳에 자동으로 쌓입니다.</div>
              <button onClick={() => { setUploadFlow("modal"); setModalStep(0); setUploadType(null); setUploadFileName(""); setUploadFileSize(""); setSelectedFile(null); setAnalysisError(null); }}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ background:"linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
                회의록 업로드
              </button>
            </div>
          ) : meetings.map(m => (
            <button key={m.id} onClick={() => setSelected(m.id)}
              className={`w-full text-left p-3 rounded-lg border transition-all ${selected === m.id ? "border-blue-300 bg-blue-50" : "border-border bg-card hover:bg-muted"}`}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-mono text-muted-foreground">{m.date}</span>
                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${m.status === "processed" ? "bg-emerald-100 text-emerald-600" : m.status === "processing" ? "bg-blue-100 text-blue-600" : "bg-slate-100 text-slate-500"}`}>
                  {m.status === "processed" ? "AI 분석 완료" : m.status === "processing" ? "분석 중" : "예정"}
                </span>
              </div>
              <div className="text-sm font-medium text-foreground leading-snug">{m.title}</div>
              {m.duration !== "—" && <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1"><Clock className="w-3 h-3" />{m.duration}</div>}
            </button>
          ))}
        </div>
      </div>

      {/* Detail */}
      <div className="flex-1 overflow-y-auto p-6">
        {meeting && meeting.summary ? (
          <div className="max-w-2xl space-y-5">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <Sparkles className="w-4 h-4" style={{ color: "var(--accent)" }} />
                <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--accent)" }}>AI 회의록 분석</span>
              </div>
              <h2 className="text-lg font-bold text-foreground">{meeting.title}</h2>
              <div className="text-xs text-muted-foreground mt-0.5">{meeting.date} · {meeting.duration}</div>
              {(meeting.uploadedAt || meeting.analyzedAt) && (
                <div className="text-[10px] text-muted-foreground mt-1 space-x-3">
                  {meeting.uploadedAt && <span>업로드 {formatDateTime(meeting.uploadedAt)}</span>}
                  {meeting.analyzedAt && <span>분석 완료 {formatDateTime(meeting.analyzedAt)}</span>}
                </div>
              )}
            </div>

            <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">회의 요약</div>
              <p className="text-sm text-foreground leading-relaxed">{meeting.summary}</p>
            </div>

            {meeting.decisions && (
              <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <CheckCheck className="w-4 h-4 text-emerald-500" />
                  <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">핵심 결정사항</div>
                </div>
                <ul className="space-y-2">
                  {meeting.decisions.map((d, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {meeting.todos && (
              <div className="bg-card rounded-xl p-5 border border-border shadow-sm">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <CheckSquare className="w-4 h-4" style={{ color: "var(--primary)" }} />
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">생성된 To-Do</div>
                  </div>
                  {isMeetingTodosRegistered ? (
                    <button onClick={() => { navigate("/board"); }}
                      className="text-xs font-medium text-emerald-600 hover:text-emerald-700">
                      등록 완료 · 업무보드 확인
                    </button>
                  ) : (
                    <button
                      onClick={handleRegisterMeetingTodos}
                      disabled={meeting.todos.length === 0}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 disabled:text-slate-400 disabled:cursor-not-allowed">
                      업무로 등록
                    </button>
                  )}
                </div>
                {registerMessage && <div className="text-[11px] text-amber-600 mb-2">{registerMessage}</div>}
                <ul className="space-y-2">
                  {groupedMeetingTodos.map((t, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                      <Circle className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
                      {t}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {meeting.risks && (
              <div className="rounded-xl p-5 border border-amber-200 bg-amber-50">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <div className="text-xs font-semibold text-amber-600 uppercase tracking-wider">위험 요소</div>
                </div>
                <ul className="space-y-2">
                  {meeting.risks.map((r, i) => (
                    <li key={i} className="text-sm text-amber-800">{r}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : meeting ? (
          <div className="flex flex-col items-center justify-center h-full text-center gap-3 text-muted-foreground">
            <Clock className="w-12 h-12 text-muted" />
            <div className="text-sm font-medium">
              {meeting.status === "pending" ? "예정된 회의입니다" : "AI 분석이 준비되지 않았습니다"}
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center text-muted-foreground">
            <div className="w-16 h-16 rounded-2xl bg-muted flex items-center justify-center">
              <FileAudio className="w-8 h-8 text-slate-400" />
            </div>
            <div>
              <div className="text-sm font-semibold text-foreground mb-1">
                {meetings.length === 0 ? "분석할 회의록을 업로드해주세요" : "회의록을 선택하세요"}
              </div>
              <div className="text-xs leading-relaxed max-w-sm">
                {meetings.length === 0
                  ? "업로드 후 분석이 완료되면 회의 요약, 핵심 결정사항, 생성된 To-Do, 위험 요소가 이 화면에 표시됩니다."
                  : "왼쪽 목록에서 분석된 회의록을 선택하면 상세 결과를 확인할 수 있습니다."}
              </div>
            </div>
            {meetings.length === 0 && (
              <button onClick={() => { setUploadFlow("modal"); setModalStep(0); setUploadType(null); setUploadFileName(""); setUploadFileSize(""); setSelectedFile(null); setAnalysisError(null); }}
                className="mt-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                style={{ background:"linear-gradient(135deg,#7048E8,#4F6EF7)" }}>
                회의록 업로드
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
