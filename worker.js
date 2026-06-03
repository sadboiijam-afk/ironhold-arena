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
      <div id="hud-root" class="hud">
        <section class="hud-top">
          <div class="health-panel" aria-label="Player health">
            <div class="health-meta"><span>Health</span><strong data-hp-text>120 / 120</strong></div>
            <div class="health-track"><div class="health-fill" data-hp-fill></div></div>
          </div>
          <div class="stat-stack">
            <div class="stat"><span>Wave</span><strong data-wave>1</strong></div>
            <div class="stat"><span>Gold</span><strong data-gold>0</strong></div>
          </div>
        </section>
        <section class="skill-bar" aria-label="Skills">
          <div class="skill" data-skill="basic"><span class="skill-key">J</span><strong>Strike</strong><span class="skill-cooldown"></span><span class="skill-mask"></span></div>
          <div class="skill" data-skill="dash"><span class="skill-key">Space</span><strong>Dash</strong><span class="skill-cooldown"></span><span class="skill-mask"></span></div>
          <div class="skill" data-skill="area"><span class="skill-key">Q / K</span><strong>Cleave</strong><span class="skill-cooldown"></span><span class="skill-mask"></span></div>
        </section>
        <div class="toast" data-toast></div>
        <div class="defeat hidden" data-defeat>
          <div><h1>Defeated</h1><p>The arena holds. Try another run.</p><button type="button" data-restart>Restart</button></div>
        </div>
      </div>
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

    if (url.pathname.startsWith("/src/") && (url.pathname.endsWith(".js") || url.pathname.endsWith(".css"))) {
      const upstream = await fetch(`${REPO_RAW}${url.pathname}`, {
        headers: { "user-agent": "ironhold-arena-worker" },
      });

      if (!upstream.ok) {
        return new Response("Not found", { status: 404 });
      }

      const contentType = url.pathname.endsWith(".css")
        ? "text/css; charset=utf-8"
        : "text/javascript; charset=utf-8";

      return reply(await upstream.text(), contentType);
    }

    return reply(INDEX, "text/html; charset=utf-8");
  },
};

const SECURITY_HEADERS = {
  "content-security-policy": [
    "default-src 'self'",
    "script-src 'self' https://cdn.jsdelivr.net",
    "style-src 'self'",
    "img-src 'self' data:",
    "font-src 'self'",
    "connect-src 'self' https://raw.githubusercontent.com",
    "media-src 'none'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; "),
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "permissions-policy": "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  "x-frame-options": "DENY",
  "cross-origin-opener-policy": "same-origin",
};

function reply(body, contentType) {
  return new Response(body, {
    headers: {
      "content-type": contentType,
      "cache-control": "no-store",
      ...SECURITY_HEADERS,
    },
  });
}
