import { useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ArrowLeft, Briefcase, Camera, Github, Layers, Plus, User as UserIcon, X } from "lucide-react";
import { useAuth } from "../../global/hooks/useAuth";
import { API_ORIGIN, ApiRequestError } from "../../global/api/apiClient";
import { updateMe, uploadAvatar } from "../../global/api/userApi";

function normalizeGithubUsername(value: string): string {
  const trimmed = value.trim();
  const withoutUrl = trimmed.replace(/^https?:\/\/(www\.)?github\.com\//i, "");
  return withoutUrl.replace(/\/+$/, "");
}

const AVATAR_MAX_BYTES = 10 * 1024 * 1024;
const AVATAR_ALLOWED_TYPES = ["image/png", "image/jpeg"];

function AvatarUploader({ imageUrl, name }: { imageUrl: string | null; name: string }) {
  const { refreshMe } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [cacheBust, setCacheBust] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const handleFileSelect = async (file: File | undefined) => {
    if (!file) return;
    setAvatarError(null);

    if (!AVATAR_ALLOWED_TYPES.includes(file.type)) {
      setAvatarError("PNG 또는 JPG 파일만 업로드할 수 있습니다.");
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      setAvatarError("파일 용량은 최대 10MB까지 업로드할 수 있습니다.");
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setUploading(true);
    try {
      await uploadAvatar(file);
      await refreshMe();
      setCacheBust(Date.now());
    } catch (err) {
      setAvatarError(err instanceof ApiRequestError ? err.message : "이미지 업로드에 실패했습니다.");
    } finally {
      // 성공/실패 어느 쪽이든 미리보기를 내리는 것과 동시에 URL을 해제한다 — 성공했을 때
      // previewUrl을 남겨두면, 곧이어 해제된(무효화된) blob URL을 계속 img src로 쓰게 되어
      // 정작 새로 반영된 실제 이미지(imageUrl)로 못 넘어가고 깨진 상태로 보일 수 있었다.
      setPreviewUrl(null);
      setUploading(false);
      URL.revokeObjectURL(objectUrl);
    }
  };

  const displayUrl = previewUrl ?? (imageUrl ? `${API_ORIGIN}${imageUrl}${cacheBust ? `?v=${cacheBust}` : ""}` : null);

  return (
    <div className="flex flex-col items-center gap-2 mb-2">
      <div className="relative w-20 h-20">
        <div className="w-20 h-20 rounded-full overflow-hidden border-4 border-white shadow-sm flex items-center justify-center text-white text-2xl font-bold" style={{ background: "#7048E8" }}>
          {displayUrl ? (
            <img src={displayUrl} alt="프로필 사진" className="w-full h-full object-cover" />
          ) : (
            name ? name[0] : <UserIcon className="w-8 h-8" />
          )}
        </div>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-card border border-border shadow-sm flex items-center justify-center hover:bg-muted transition-colors disabled:opacity-50"
        >
          <Camera className="w-3.5 h-3.5 text-foreground" />
        </button>
        <input
          ref={inputRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={e => void handleFileSelect(e.target.files?.[0])}
        />
      </div>
      <span className="text-[11px] text-muted-foreground">
        {uploading ? "업로드 중..." : "PNG, JPG · 최대 10MB"}
      </span>
      {avatarError && <span className="text-[11px] text-red-500">{avatarError}</span>}
    </div>
  );
}

function FieldTagInput({ label, placeholder, tags, onAdd, onRemove, icon: Icon }: {
  label: string; placeholder: string; tags: string[];
  onAdd: (v: string) => void; onRemove: (v: string) => void; icon: any;
}) {
  const [draft, setDraft] = useState("");

  const submit = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setDraft("");
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-foreground">{label}</label>
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder={placeholder}
            value={draft}
            onChange={e => setDraft(e.target.value)}
            onKeyDown={e => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            className="w-full rounded-xl border border-border bg-input-background text-sm text-foreground placeholder-muted-foreground outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
            style={{ padding: "10px 12px 10px 36px" }}
          />
        </div>
        <button
          type="button"
          onClick={submit}
          className="shrink-0 flex items-center gap-1 px-3 py-2.5 rounded-xl border border-border text-xs font-semibold text-foreground hover:bg-muted transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />추가
        </button>
      </div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-0.5">
          {tags.map(tag => (
            <span
              key={tag}
              className="flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200"
            >
              {tag}
              <button type="button" onClick={() => onRemove(tag)} className="hover:text-blue-900">
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ProfileField({ label, placeholder, value, onChange, icon: Icon }: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void; icon: any;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label className="text-xs font-semibold text-foreground">{label}</label>
      <div className="relative">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full rounded-xl border border-border bg-input-background text-sm text-foreground placeholder-muted-foreground outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100 transition-all"
          style={{ padding: "10px 12px 10px 36px" }}
        />
      </div>
    </div>
  );
}

export function MyPageEditScreen() {
  const navigate = useNavigate();
  const { user, refreshMe } = useAuth();

  const [name, setName] = useState(user?.name ?? "");
  const [affiliation, setAffiliation] = useState(user?.affiliation ?? "");
  const [fieldTags, setFieldTags] = useState<string[]>(user?.field ?? []);
  const [github, setGithub] = useState(user?.githubUsername ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const valid = Boolean(name.trim());

  const addFieldTag = (tag: string) => {
    setFieldTags(prev => (prev.includes(tag) ? prev : [...prev, tag]));
  };
  const removeFieldTag = (tag: string) => {
    setFieldTags(prev => prev.filter(t => t !== tag));
  };

  const handleSubmit = async () => {
    if (!valid || loading) return;
    setError(null);
    setLoading(true);
    try {
      await updateMe({
        name: name.trim(),
        affiliation: affiliation.trim(),
        field: fieldTags,
        githubUsername: normalizeGithubUsername(github),
      });
      await refreshMe();
      navigate("/mypage", { replace: true });
    } catch (err) {
      setError(err instanceof ApiRequestError ? err.message : "개인정보 수정에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-6" style={{ fontFamily: "'Inter', 'Noto Sans KR', sans-serif" }}>
      <div className="max-w-md mx-auto">
        <button
          onClick={() => navigate("/mypage")}
          className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground mb-4 transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />마이페이지로
        </button>

        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <h1 className="text-lg font-bold text-foreground mb-1">개인정보 수정</h1>
          <p className="text-xs text-muted-foreground mb-6">이름, 소속, 분야, GitHub 아이디를 수정할 수 있습니다.</p>

          <AvatarUploader imageUrl={user?.profileImageUrl ?? null} name={name} />

          <div className="space-y-4">
            <ProfileField label="이름" placeholder="실명을 입력하세요" value={name} onChange={setName} icon={UserIcon} />
            <ProfileField label="소속" placeholder="예: 컴퓨터공학과 3학년" value={affiliation} onChange={setAffiliation} icon={Briefcase} />
            <FieldTagInput label="분야" placeholder="예: 프론트엔드 (입력 후 추가)" tags={fieldTags} onAdd={addFieldTag} onRemove={removeFieldTag} icon={Layers} />
            <ProfileField label="GitHub 아이디" placeholder="예: octocat" value={github} onChange={setGithub} icon={Github} />
          </div>

          {error && (
            <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-600">
              {error}
            </div>
          )}

          <div className="flex items-center gap-2 mt-6">
            <button
              onClick={() => navigate("/mypage")}
              className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
            >
              취소
            </button>
            <button
              onClick={() => void handleSubmit()}
              disabled={!valid || loading}
              className="flex-1 py-2.5 rounded-xl text-white text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #3B5BDB 0%, #4F6EF7 100%)" }}
            >
              {loading ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
