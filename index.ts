type NewsRow = {
  id: string;
  name: string;
  content: string;
  date: number;
  author: string;
  icon: string;
};

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });

const sha256 = async (text: string) => {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(text),
  );
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
};

// Authorization: Bearer <token> と user(ユーザーID)のペアを tokens テーブルで照合
const authorized = async (request: Request, env: Env, userId: unknown) => {
  const token = request.headers.get("Authorization")?.replace(/^Bearer /, "");
  if (!token || typeof userId !== "string" || !userId) return false;
  const row = await env.RSS.prepare(
    "SELECT id FROM tokens WHERE token_hash = ? AND user_id = ?",
  )
    .bind(await sha256(token), userId)
    .first();
  return row !== null;
};

// XML 用エスケープ
const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const readBody = async <T>(request: Request): Promise<Partial<T> & { user?: string }> =>
  request.json<Partial<T> & { user?: string }>().catch(() => ({}));

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    // CORS プリフライト
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS });
    }

    // ニュース一覧
    if (request.method === "GET" && url.pathname === "/news") {
      const result = await env.RSS.prepare(
        "SELECT id, name, content, date, author, icon FROM news ORDER BY date DESC LIMIT 100",
      ).run<NewsRow>();
      return json(result.results);
    }

    // ログイン確認(トークンとユーザーIDが合っているか)
    if (request.method === "POST" && url.pathname === "/canlogin") {
      const { user } = await readBody<{}>(request);
      const ok = await authorized(request, env, user);
      return json({ ok }, ok ? 200 : 401);
    }

    // ニュース追加
    if (request.method === "PUT" && url.pathname === "/news") {
      const body = await readBody<NewsRow>(request);
      if (!(await authorized(request, env, body.user))) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
      const { name, content, date, author, icon } = body;
      if (!name || !content || typeof date !== "number" || !author) {
        return json({ ok: false, error: "Bad Request" }, 400);
      }
      await env.RSS.prepare(
        "INSERT INTO news (id, name, content, date, author, icon) VALUES (?, ?, ?, ?, ?, ?)",
      )
        .bind(crypto.randomUUID(), name, content, date, author, icon ?? "")
        .run();
      return json({ ok: true });
    }

    // ニュース削除
    if (request.method === "DELETE" && url.pathname === "/news") {
      const body = await readBody<{ id: string }>(request);
      if (!(await authorized(request, env, body.user))) {
        return json({ ok: false, error: "Unauthorized" }, 401);
      }
      if (!body.id) return json({ ok: false, error: "Bad Request" }, 400);
      await env.RSS.prepare("DELETE FROM news WHERE id = ?").bind(body.id).run();
      return json({ ok: true });
    }

    // RSS
    if (request.method === "GET" && url.pathname === "/rss") {
      const result = await env.RSS.prepare(
        "SELECT id, name, content, date, author, icon FROM news ORDER BY date DESC LIMIT 100",
      ).run<NewsRow>();

      const items = result.results
        .map(
          (row) => `
    <item>
      <title>${esc(row.name)}</title>
      <description>${esc(row.content)}</description>
      <pubDate>${new Date(row.date * 1000).toUTCString()}</pubDate>
      <guid isPermaLink="false">${esc(row.id)}</guid>
      <author>${esc(row.author)}</author>
      <enclosure url="${esc(row.icon)}" type="image/png" length="0"/>
    </item>`,
        )
        .join("");

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>大根サーバー ニュース</title>
    <link>https://news.daikonsv.f5.si</link>
    <description>大根サーバーのニュース</description>${items}
  </channel>
</rss>`;

      return new Response(xml, {
        headers: { "Content-Type": "application/rss+xml; charset=utf-8", ...CORS },
      });
    }

    return new Response("Not Found", { status: 404, headers: CORS });
  },
} satisfies ExportedHandler<Env>;