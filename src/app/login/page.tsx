import { LoginForm } from "./login-form";

const loginErrors = {
  invalid_link: "登录链接无效或已过期，请重新发送。",
  not_invited: "该账号尚未加入工作台。",
} as const;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error && error in loginErrors ? loginErrors[error as keyof typeof loginErrors] : null;

  return (
    <main className="auth-page">
      <section className="auth-shell">
        <aside className="auth-intro" aria-labelledby="auth-intro-title">
          <div className="auth-brand">
            <span aria-hidden="true" className="auth-brand-mark">秋</span>
            <span>秋招协作台</span>
          </div>
          <div className="auth-intro-copy">
            <p className="auth-eyebrow">PRIVATE WORKSPACE</p>
            <h1 id="auth-intro-title">把每一次投递，变成清晰的下一步</h1>
            <p>和受邀伙伴共享投递进度、关键节点与待办事项，重要信息始终只对工作台成员可见。</p>
          </div>
          <ol className="auth-feature-list">
            <li><span>01</span><div><strong>集中记录</strong><p>公司、岗位、进度与截止时间一处管理。</p></div></li>
            <li><span>02</span><div><strong>安全协作</strong><p>仅受邀邮箱可登录，成员权限彼此隔离。</p></div></li>
            <li><span>03</span><div><strong>验证码登录</strong><p>无需密码，也无需点击邮件中的跳转链接。</p></div></li>
          </ol>
          <p className="auth-private-note"><span aria-hidden="true">●</span> 仅限受邀成员访问</p>
        </aside>

        <section className="auth-card" aria-labelledby="login-heading">
          <header>
            <p className="auth-eyebrow">成员登录</p>
            <h2 id="login-heading">进入秋招协作台</h2>
            <p>使用受邀邮箱获取验证码，两步即可进入。</p>
          </header>
          {message ? <p className="auth-route-message" role="status">{message}</p> : null}
          <LoginForm />
          <footer>还没有权限？请联系工作台管理员发送邀请。</footer>
        </section>
      </section>
    </main>
  );
}
