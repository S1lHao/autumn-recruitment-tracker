import type { WorkspacePermission } from "./application-workspace";

const PERMISSION_COPY: Record<WorkspacePermission, { label: string; text: string }> = {
  own: { label: "可编辑", text: "本人可编辑：你可以新增、修改和删除自己的记录" },
  readonly: { label: "只读", text: "只读：你可以查看，但不能修改此成员的记录" },
  temporary: { label: "临时可编辑", text: "临时可编辑：授权到期前可以新增和修改记录" },
};

export function PermissionBadge({ mode }: { mode: WorkspacePermission }) {
  const copy = PERMISSION_COPY[mode];
  return (
    <p className={`permission-badge permission-${mode}`}>
      <span aria-hidden="true" className="permission-label">{copy.label}</span>
      <span>{copy.text}</span>
    </p>
  );
}

export function EmptyState({ kind, onClear }: { kind: "empty" | "filtered"; onClear?: () => void }) {
  const filtered = kind === "filtered";
  return (
    <div className="application-empty" role="status">
      <span aria-hidden="true" className="state-icon">{filtered ? "⌕" : "+"}</span>
      <p>{filtered ? "没有符合筛选条件的记录" : "还没有投递记录"}</p>
      {filtered ? <button onClick={onClear} type="button">清除筛选</button> : null}
    </div>
  );
}
