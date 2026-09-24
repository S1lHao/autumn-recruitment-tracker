export default function Loading() {
  return (
    <main aria-busy="true" className="route-state route-loading" role="status">
      <span className="sr-only">正在加载秋招协作台</span>
      <div aria-hidden="true" className="loading-shell">
        <div className="skeleton skeleton-title" />
        <div className="skeleton skeleton-control" />
        <div className="loading-card-grid">
          {Array.from({ length: 4 }, (_, index) => <div className="skeleton skeleton-card" key={index} />)}
        </div>
        <div className="skeleton skeleton-table" />
      </div>
    </main>
  );
}
