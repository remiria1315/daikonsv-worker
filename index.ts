type NewsRow = {
  id: string;
  name: string;
  content: string;
  date: number;
};
const CORS = { "Access-Control-Allow-Origin": "*" };
export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/news") {
      const result = await env.RSS.prepare(
        "SELECT id, name, content, date FROM news ORDER BY date DESC LIMIT 100",
      ).run<NewsRow>();

      return new Response(JSON.stringify(result.results), {
        headers: { "Content-Type": "application/json", ...CORS },
      });
    }
    if (request.method === "PUT" && url.pathname === "/news") {
      const token = request.headers.get("X-RSS-Token");
      if (token !== env.RSS_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }

      const { name, content, date } = await request.json<NewsRow>();
      await env.RSS.prepare(
        "INSERT INTO news (id, name, content, date) VALUES (?, ?, ?, ?)",
      )
        .bind(crypto.randomUUID(), name, content, date)
        .run();

      return new Response("OK");
    }
    if (request.method === "DELETE" && url.pathname === "/news") {
  const token = request.headers.get("X-RSS-Token");
  if (token !== env.RSS_TOKEN) {
    return new Response("Unauthorized", { status: 401, headers: CORS });
  }

  const { id } = await request.json<{ id: string }>();
  await env.RSS.prepare("DELETE FROM news WHERE id = ?")
    .bind(id)
    .run();

  return new Response("OK", { headers: CORS });
}
    if (request.method === "GET" && url.pathname === "/rss") {
      const result = await env.RSS.prepare(
        "SELECT id, name, content, date FROM news ORDER BY date DESC LIMIT 100",
      ).run<NewsRow>();

      const items = result.results
        .map(
          (row) => `
    <item>
      <title>${row.name}</title>
      <description>${row.content}</description>
      <pubDate>${new Date(row.date * 1000).toUTCString()}</pubDate>
      <guid>${row.id}</guid>
    </item>
  `,
        )
        .join("");

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>大根サーバー ニュース</title>
    <link>https://news.daikonsv.f5.si</link>
    <description>大根サーバーのニュース</description>
    ${items}
  </channel>
</rss>`;

      return new Response(xml, {
        headers: { "Content-Type": "application/rss+xml", ...CORS },
      });
    }
    return new Response("Not Found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
