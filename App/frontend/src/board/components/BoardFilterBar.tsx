import { ChevronDown, RotateCcw, X } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "../../global/component/ui/dropdown-menu";
import type { MemberResponse } from "../../global/api/projectsApi";
import { CATEGORIES } from "../libs/mock/tasks";
import { getCat } from "../libs/utils/taskService";
import type { Priority } from "../libs/types/task";

// URLSearchParams는 빈 문자열을 값으로 저장/구분하지 못하므로(split(",").filter(Boolean)에서 사라짐),
// "미배정" 필터에는 실제 담당자 id일 수 없는 sentinel 값을 쓰고 BoardView에서 빈 문자열로 다시 매핑한다.
export const UNASSIGNED_FILTER_ID = "__unassigned__";

const PRIORITY_OPTIONS: { id: Priority; label: string }[] = [
  { id: "high", label: "높음" },
  { id: "medium", label: "중간" },
  { id: "low", label: "낮음" },
];

interface BoardFilterBarProps {
  projectMembers: MemberResponse[];
  assigneeFilter: string[];
  priorityFilter: string[];
  categoryFilter: string[];
  onToggleAssignee: (id: string) => void;
  onTogglePriority: (level: Priority) => void;
  onToggleCategory: (id: string) => void;
  onReset: () => void;
  totalCount: number;
  filteredCount: number;
}

interface FilterOption {
  id: string;
  label: string;
}

function FilterDropdown({
  label,
  options,
  selected,
  onToggle,
}: {
  label: string;
  options: FilterOption[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
            selected.length > 0
              ? "border-transparent text-white"
              : "border-border text-foreground hover:bg-accent"
          }`}
          style={selected.length > 0 ? { background: "var(--primary)" } : undefined}
        >
          {label}
          {selected.length > 0 && <span className="text-[10px] font-semibold">{selected.length}</span>}
          <ChevronDown className="w-3 h-3" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-72 overflow-y-auto">
        {options.map((opt) => (
          <DropdownMenuCheckboxItem
            key={opt.id}
            checked={selected.includes(opt.id)}
            onSelect={(e) => e.preventDefault()}
            onCheckedChange={() => onToggle(opt.id)}
          >
            {opt.label}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 text-[11px] font-medium rounded-full bg-accent text-foreground">
      {label}
      <button onClick={onRemove} className="p-0.5 rounded-full hover:bg-border" aria-label={`${label} 필터 해제`}>
        <X className="w-2.5 h-2.5" />
      </button>
    </span>
  );
}

export function BoardFilterBar({
  projectMembers,
  assigneeFilter,
  priorityFilter,
  categoryFilter,
  onToggleAssignee,
  onTogglePriority,
  onToggleCategory,
  onReset,
  totalCount,
  filteredCount,
}: BoardFilterBarProps) {
  const hasActiveFilters = assigneeFilter.length + priorityFilter.length + categoryFilter.length > 0;

  const memberOptions: FilterOption[] = [
    { id: UNASSIGNED_FILTER_ID, label: "미배정" },
    ...projectMembers.map((m) => ({ id: String(m.userId), label: m.name })),
  ];
  const categoryOptions: FilterOption[] = CATEGORIES.map((c) => ({ id: c.id, label: c.label }));

  const chips = [
    ...assigneeFilter.map((id) => ({
      key: `assignee-${id}`,
      label: id === UNASSIGNED_FILTER_ID ? "미배정" : (projectMembers.find((m) => String(m.userId) === id)?.name ?? id),
      onRemove: () => onToggleAssignee(id),
    })),
    ...priorityFilter.map((id) => ({
      key: `priority-${id}`,
      label: PRIORITY_OPTIONS.find((p) => p.id === id)?.label ?? id,
      onRemove: () => onTogglePriority(id as Priority),
    })),
    ...categoryFilter.map((id) => ({
      key: `category-${id}`,
      label: getCat(id).label,
      onRemove: () => onToggleCategory(id),
    })),
  ];

  return (
    <div className="flex flex-wrap items-center gap-2 px-5 py-2.5 border-b border-border">
      <FilterDropdown label="담당자" options={memberOptions} selected={assigneeFilter} onToggle={onToggleAssignee} />
      <FilterDropdown label="우선순위" options={PRIORITY_OPTIONS} selected={priorityFilter} onToggle={(id) => onTogglePriority(id as Priority)} />
      <FilterDropdown label="업무유형" options={categoryOptions} selected={categoryFilter} onToggle={onToggleCategory} />

      {hasActiveFilters && (
        <button
          onClick={onReset}
          className="flex items-center gap-1 px-2 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <RotateCcw className="w-3 h-3" />필터 초기화
        </button>
      )}

      {chips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.map((chip) => (
            <FilterChip key={chip.key} label={chip.label} onRemove={chip.onRemove} />
          ))}
        </div>
      )}

      <span className="ml-auto text-xs text-muted-foreground shrink-0">
        {hasActiveFilters ? `전체 ${totalCount}건 중 ${filteredCount}건` : `총 ${totalCount}건`}
      </span>
    </div>
  );
}
