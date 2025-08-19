(() => {
  if (window.__gasFetchInstalled) return; window.__gasFetchInstalled = true;

  // อ่าน base(s) จาก <script src=... data-base="..."> หรือ ?base=
  const current = document.currentScript || [...document.scripts].pop();
  const getBases = () => {
    if (!current) return [];
    const u = new URL(current.src, location.href);
    const p = u.searchParams.get("base") || "";
    const d = current.dataset?.base || "";
    return (p || d).split(",").map(s => s.trim()).filter(Boolean)
      .map(b => new URL(b, location.href)); // ปรับเป็น absolute
  };

  const BASES = getBases();
  if (!BASES.length) return; // ไม่ตั้ง base → ไม่ override

  const origFetch = window.fetch;
  const tryParse = t => { try { return JSON.parse(t); } catch { return t; } };

  // วางแผนปลายทาง: /relative → ใช้ base แรก, หรือ URL ที่ขึ้นต้นด้วย base ใด ๆ
  const planFor = (inputUrl) => {
    if (typeof inputUrl === "string" && inputUrl.startsWith("/")) {
      const base = BASES[0];
      const full = new URL(inputUrl, base); // base + path
      const path = full.pathname.slice(base.pathname.length) || "/";
      return { wrap: true, base, full, path };
    }
    const u = new URL(String(inputUrl), location.href);
    for (const base of BASES) {
      if (u.href.startsWith(base.href)) {
        const path = u.pathname.slice(base.pathname.length) || "/";
        return { wrap: true, base, full: u, path };
      }
    }
    return { wrap: false };
  };

  window.fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const plan = planFor(req.url);
    if (!plan.wrap) return origFetch(req);

    const query = Object.fromEntries(plan.full.searchParams.entries());
    let text = null;
    try { if (!/^(GET|HEAD)$/i.test(req.method)) text = await req.clone().text(); } catch {}
    const body = text ? tryParse(text) : null;

    // ส่งเข้า GAS ที่ root /exec เป็น POST พร้อม payload ครบ
    const payload = {
      method:  req.method,
      headers: Object.fromEntries(req.headers.entries()),
      path:    plan.path.startsWith("/") ? plan.path : `/${plan.path}`,
      query, body
    };

    return origFetch(new Request(plan.base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }));
  };
})();
