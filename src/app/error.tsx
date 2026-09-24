"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="route-state">
      <section aria-labelledby="route-error-title" className="state-card state-card-error" role="alert">
        <span aria-hidden="true" className="state-icon">!</span>
        <h1 id="route-error-title">页面暂时无法加载</h1>
        <p>请检查网络连接后重试。你的申请数据不会因此被修改。</p>
        <button onClick={reset} type="button">重试</button>
      </section>
    </main>
  );
}
