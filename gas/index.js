(() => {
  if (window.__gasFetchInstalled) return; window.__gasFetchInstalled = true;

  // ----- อ่าน config -----
  const cur = document.currentScript || [...document.scripts].pop();
  // data-proxy ตัวอย่าง: /api=>https://script.google.com/.../exec
  const readProxies = () => {
    const raw = (cur?.dataset?.proxy || "").trim();
    const list = raw
      ? raw.split(",").map(s => s.trim()).filter(Boolean)
      : (window.apiUrl ? ["/api=>" + window.apiUrl] : []);
    return list.map(p => {
      const [prefix, base] = p.split("=>").map(s => s.trim());
      if (!prefix || !base) return null;
      const baseUrl = new URL(base, location.href); // ทำเป็น absolute
      const pf = prefix.endsWith("/") ? prefix : prefix + "/";
      return { prefix: pf, base: baseUrl };
    }).filter(Boolean);
  };
  const PROXIES = readProxies();
  if (!PROXIES.length) return; // ไม่มี proxy ก็ไม่ override

  const OF = window.fetch;
  const tryJSON = t => { try { return JSON.parse(t); } catch { return t; } };

  // หา proxy ที่ match จาก URL ที่เรียก
  const matchPlan = (urlStr) => {
    const s = String(urlStr);
    // รูปแบบ /api/xxx
    for (const p of PROXIES) {
      if (s.startsWith(p.prefix)) {
        // ตัด prefix ออกแล้วต่อกับ base
        const rest = s.slice(p.prefix.length - 1); // keep leading '/'
        const full = new URL(rest, p.base);        // base + /users/1
        const path = full.pathname.slice(p.base.pathname.length) || "/";
        return { wrap: true, base: p.base, full, path };
      }
    }
    // รูปแบบ URL เต็มที่ขึ้นต้นด้วย base อยู่แล้ว
    const u = new URL(s, location.href);
    for (const p of PROXIES) {
      if (u.href.startsWith(p.base.href)) {
        const path = u.pathname.slice(p.base.pathname.length) || "/";
        return { wrap: true, base: p.base, full: u, path };
      }
    }
    return { wrap: false };
  };

  // ----- override fetch -----
  window.fetch = async (input, init) => {
    const req = input instanceof Request ? input : new Request(input, init);
    const plan = matchPlan(req.url);
    if (!plan.wrap) return OF(req); // ไม่แมตช์ proxy → ส่งต่อปกติ

    const query = Object.fromEntries(plan.full.searchParams.entries());
    let text = null;
    try { if (!/^(GET|HEAD)$/i.test(req.method)) text = await req.clone().text(); } catch {}
    const body = text ? tryJSON(text) : null;

    // ยิงเข้า root ของ GAS (เช่น .../exec) เป็น POST พร้อม payload ครบ
    const payload = {
      method:  req.method,
      headers: Object.fromEntries(req.headers.entries()),
      path:    plan.path.startsWith("/") ? plan.path : `/${plan.path}`,
      query,   body
    };

    return OF(new Request(plan.base, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }));
  };
})();
