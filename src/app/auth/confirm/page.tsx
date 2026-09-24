const supportedTypes = new Set(["email", "invite"]);

export default async function ConfirmAuthPage({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash: tokenHash, type } = await searchParams;
  const valid = Boolean(tokenHash && type && supportedTypes.has(type));

  return (
    <main>
      <h1>确认登录秋招工作台</h1>
      {valid ? (
        <>
          <p>为防止邮箱安全扫描使一次性链接失效，请点击下方按钮完成登录。</p>
          <form action="/auth/callback" method="post">
            <input name="token_hash" type="hidden" value={tokenHash} />
            <input name="type" type="hidden" value={type} />
            <button type="submit">继续登录</button>
          </form>
        </>
      ) : (
        <>
          <p role="status">登录链接无效或已过期，请重新发送。</p>
          <a href="/login">返回登录页</a>
        </>
      )}
    </main>
  );
}
