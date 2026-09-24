import Link from "next/link";

export default function NotFound() {
  return (
    <main className="route-state">
      <section aria-labelledby="not-found-title" className="state-card">
        <span aria-hidden="true" className="state-icon">?</span>
        <h1 id="not-found-title">页面不存在</h1>
        <p>这个地址可能已失效，或者页面已经移动。</p>
        <Link className="button-link" href="/">返回秋招协作台</Link>
      </section>
    </main>
  );
}
