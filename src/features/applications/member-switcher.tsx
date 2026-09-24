"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import type { WorkspaceMember } from "./types";

export function MemberSwitcher({ members, selectedMember }: { members: readonly WorkspaceMember[]; selectedMember: WorkspaceMember }) {
  const router = useRouter();
  const [selectedMemberId, setSelectedMemberId] = useState(selectedMember.id);
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    setSelectedMemberId(selectedMember.id);
  }, [selectedMember.id]);

  return (
    <div className="member-switcher-control">
      <label className="member-switcher">
        <span>用户名称</span>
        <select
          aria-busy={isPending}
          aria-label="用户名称"
          value={selectedMemberId}
          onChange={(event) => {
            const target = members.find((member) => member.id === event.target.value);
            if (!target) return;
            setSelectedMemberId(target.id);
            startTransition(() => {
              router.replace(`?${new URLSearchParams({ member: target.id }).toString()}`, { scroll: false });
            });
          }}
        >
          {members.map((member) => <option key={member.id} value={member.id}>{member.displayName || member.email}</option>)}
        </select>
      </label>
      <span aria-live="polite" className="member-switch-status">
        {isPending ? <><span aria-hidden="true" className="switch-spinner" />正在切换</> : null}
      </span>
    </div>
  );
}
