type NewsRow = {
  id: string;
  name: string;
  content: string;
  date: number;
};

export default {
  async fetch(request: Request, env: Env) {
    const url = new URL(request.url);
    
    if (request.method === "GET" && url.pathname === "/news") {
      const result = await env.RSS.prepare(
        "SELECT id, name, content, date FROM news ORDER BY date DESC LIMIT 100"
      ).run<NewsRow>();
      
      return new Response(JSON.stringify(result.results), {
        headers: { "Content-Type": "application/json" }
      });
    }
    if (request.method === "PUT" && url.pathname === "/news") {
      const token = request.headers.get("X-RSS-Token");
      if (token !== env.RSS_TOKEN) {
        return new Response("Unauthorized", { status: 401 });
      }
      
      const { name, content, date } = await request.json<NewsRow>();
      await env.RSS.prepare(
        "INSERT INTO news (id, name, content, date) VALUES (?, ?, ?, ?)"
      ).bind(crypto.randomUUID(), name, content, date).run();
      
      return new Response("OK");
    }
    return new Response("Not Found", { status: 404 });
  }
} satisfies ExportedHandler<Env>;