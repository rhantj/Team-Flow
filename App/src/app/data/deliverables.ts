import {
  Layers, FileText, Code2, Star, FlaskConical, RefreshCw, Film,
  ClipboardList, Globe, Package, MoreHorizontal,
} from "lucide-react";
import type { Deliverable, DelivStatus, DelivCard } from "../models/deliverable";

export const DELIVERABLES: Deliverable[] = [
  { id: "d1", type: "발표자료", title: "최종 발표 PPT 초안", status: "draft", updatedAt: "12.10" },
  { id: "d2", type: "보고서", title: "중간 진행 보고서", status: "ready", updatedAt: "12.05" },
  { id: "d3", type: "README", title: "GitHub README 초안", status: "draft", updatedAt: "12.08" },
  { id: "d4", type: "제안서", title: "공모전 제안서", status: "ready", updatedAt: "11.28" },
  { id: "d5", type: "회고", title: "주간 회고 문서 (6주차)", status: "pending", updatedAt: "—" },
];

export const DELIVERABLE_READY = [
  { name: "발표자료",      pct: 20 },
  { name: "최종보고서",    pct: 40 },
  { name: "README",        pct: 60 },
  { name: "공모전 제안서", pct: 100 },
  { name: "데모 영상",     pct: 0 },
];

export const DELIV_CATS = [
  "발표자료","보고서","README","제안서","실험 보고서","회고",
  "시연 자료","포스터/요약","API 문서","제출 패키지","기타",
];

export const DELIV_CAT_ICONS: Record<string, any> = {
  "발표자료": Layers, "보고서": FileText, "README": Code2, "제안서": Star,
  "실험 보고서": FlaskConical, "회고": RefreshCw, "시연 자료": Film,
  "포스터/요약": ClipboardList, "API 문서": Globe, "제출 패키지": Package, "기타": MoreHorizontal,
};

export const DELIV_CAT_COLORS: Record<string, string> = {
  "발표자료":"#D946EF","보고서":"#3B5BDB","README":"#374151","제안서":"#F59E0B",
  "실험 보고서":"#10B981","회고":"#7048E8","시연 자료":"#0EA5E9","포스터/요약":"#F43F5E",
  "API 문서":"#6366F1","제출 패키지":"#059669","기타":"#8892A4",
};

export const DELIV_CARDS: DelivCard[] = [
  { id:"D1", type:"발표자료",   title:"최종 발표 PPT 초안",         status:"draft",   updatedAt:"12.10", author:"김민준", linkedTasks:3, fileType:"PPTX", version:"v0.1" },
  { id:"D2", type:"보고서",     title:"중간 진행 보고서",            status:"done",    updatedAt:"12.05", author:"이서연", linkedTasks:5, fileType:"PDF",  version:"v1.0" },
  { id:"D3", type:"README",     title:"GitHub README 초안",          status:"draft",   updatedAt:"12.08", author:"박지수", linkedTasks:2, fileType:"MD",   version:"v0.2" },
  { id:"D4", type:"제안서",     title:"공모전 제안서",               status:"done",    updatedAt:"11.28", author:"김민준", linkedTasks:4, fileType:"PDF",  version:"v1.0" },
  { id:"D5", type:"회고",       title:"6주차 스프린트 회고",         status:"pending", updatedAt:"—",     author:"—",     linkedTasks:0 },
  { id:"D6", type:"실험 보고서",title:"AI 예측 모델 실험 보고서",    status:"draft",   updatedAt:"12.09", author:"김민준", linkedTasks:2, fileType:"PDF",  version:"v0.1" },
];

export const STATUS_META: Record<DelivStatus, { label: string; cls: string }> = {
  pending: { label:"생성 전", cls:"bg-slate-100 text-slate-500" },
  draft:   { label:"초안",   cls:"bg-blue-100 text-blue-600" },
  editing: { label:"수정 중",cls:"bg-amber-100 text-amber-600" },
  done:    { label:"완료",   cls:"bg-emerald-100 text-emerald-600" },
};

export const DATA_SOURCES = ["회의록","To-Do","업무 보드","GitHub 기록","대시보드 진행률","업로드 파일"];
export const FILE_FORMATS = ["PDF","DOCX","PPTX","Markdown"];
export const TONE_OPTIONS = ["공식적","간결","자세히","발표용"];
