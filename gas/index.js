// gas index.js (reverse proxy แบบ client-side)
(() => {
  if (window.__gasProxyInstalled) return; window.__gasProxyInstalled = true;

  const cur = document.currentScript || [...document.scripts].pop();
  const parseProxies = () => {
    const raw = (cur?.dataset?.proxy || "").trim();
    if (!raw) return [];
    return raw.split(",").map(s => s.trim()).filter(Boolean).map(p => {
      const [prefixRaw, baseRaw] = p.split("=>").map(x => x.trim());
      if (!prefixRaw || !baseRaw) return null;
      const prefix = prefixRaw.endsWith("/") ? prefixRaw : prefixRaw + "/";
      const base = new URL(baseRaw, location.href);
      return { prefix, base };
    }).filter(Boolean);
  };

  const PROXIES = parseProxies();
  if (!PROXIES.length) return;

  const OF = window.fetch;
  const safeJSON = t => { try { return JSON.parse(t); } catch { return t; } };

  const plan = (urlStr) => {
    const u = new URL(String(urlStr), location.href);           // ทำ absolute เสมอ
    for (const p of PROXIES) {
      if (u.pathname.startsWith(p.prefix)) {                    // ✅ เช็คที่ pathname
        // path ส่วนที่เกินจาก prefix
        const restPath = u.pathname.slice(p.prefix.length - 1) || "/";
        // ต่อกับ base เพื่อดึง query รวมแบบถูกต้อง
        const full = new URL(restPath + (u.search || ""), p.base);
        const path = full.pathname.slice(p.base.pathname.length) || "/";
        return { wrap: true, base: p.base, full, path };
      }
    }
    // เผื่อเรียกเต็มๆ ที่เริ่มด้วย base อยู่แล้ว
    for (const p of PROXIES) {
      if (u.href.startsWith(p.base.href)) {
        const path = u.pathname.slice(p.base.pathname.length) || "/";
        return { wrap: true, base: p.base, full: u, path };
      }
    }
    return { wrap: false };
  };

  window.fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const pl = plan(req.url);
    if (!pl.wrap) return OF(req);

    const query = Object.fromEntries(pl.full.searchParams.entries());
    let text = null;
    try { if (!/^(GET|HEAD)$/i.test(req.method)) text = await req.clone().text(); } catch {}
    const body = text ? safeJSON(text) : null;

    const payload = {
      method:  req.method,
      headers: Object.fromEntries(req.headers.entries()),
      path:    pl.path.startsWith("/") ? pl.path : "/" + pl.path,
      query,   body
    };

    return OF(new Request(pl.base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }));
  };
})();
