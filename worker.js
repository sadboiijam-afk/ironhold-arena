const REPO_RAW = "https://raw.githubusercontent.com/sadboiijam-afk/ironhold-arena/main";

const INDEX = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ironhold Arena</title>
    <link rel="stylesheet" href="/src/styles.css" />
  </head>
  <body>
    <div id="app">
      <div id="game-root"></div>
      <div id="hud-root"></div>
    </div>
    <script type="module" src="/src/main.js"></script>
  </body>
</html>`;

export default {
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      return reply(INDEX, "text/html; charset=utf-8");
    }

    if (url.pathname === "/src/main.js" || url.pathname === "/src/styles.css") {
      const upstream = await fetch(`${REPO_RAW}${url.pathname}`, {
        headers: { "user-agent": "ironhold-arena-worker" },
      });
      if (!upstream.ok) return new Response("Not found", { status: 404 });
      const type = url.pathname.endsWith(".css")
        ? "text/css; charset=utf-8"
        : "text/javascript; charset=utf-8";
      return reply(await upstream.text(), type);
    }

    return reply(INDEX, "text/html; charset=utf-8");
  },
};

function reply(body, contentType) {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=60",
    },
  });
}
