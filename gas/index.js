// https://docs.google.com/spreadsheets/d/1GKbo9kKu-2shA6JgL6pfLdZvjjhOzrmPB-dnGM8yyKI/copy
// https://script.google.com/macros/s/AKfycbx_ux3BTvwXBjQxND1vKTt-SnKlXQAIC_LKr2t3eTVXzx6uYCPqjHI5aGWKtfyTCIQ8UQ/exec

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

  let body = null;
  try {
    if (!/^(GET|HEAD)$/i.test(req.method)) {
      const ct = req.headers.get("content-type") || "";
      // 1) FormData / x-www-form-urlencoded
      if (ct.includes("multipart/form-data") || ct.includes("application/x-www-form-urlencoded")) {
          const fd = await req.clone().formData();
        
          // helper: รองรับคีย์ซ้ำ -> ทำเป็น array ให้อัตโนมัติ
          const pushKV = (obj, k, v) => {
            if (k in obj) { if (!Array.isArray(obj[k])) obj[k] = [obj[k]]; obj[k].push(v); }
            else obj[k] = v;
          };
        
          const obj = {};
          for (const [k, v] of fd.entries()) {
            if (v instanceof File) {
              const ab  = await v.arrayBuffer();
              const b64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
              pushKV(obj, k, { filename: v.name, type: v.type, size: v.size, base64: b64 });
            } else {
              pushKV(obj, k, String(v));
            }
          }
          body = obj; // ✅ ส่งเป็น object key/value ปกติ (คีย์ซ้ำ -> array)
        } else {
          const t = await req.clone().text();
          try { body = t ? JSON.parse(t) : null; } catch { body = t || null; }
        }
    }
  } catch {}

  // ส่งเข้า GAS เป็น simple request เพื่อเลี่ยง preflight
  return OF(new Request(pl.base, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8" },
    body: JSON.stringify({
      method:  req.method,
      headers: Object.fromEntries(req.headers.entries()),
      path:    pl.path.startsWith("/") ? pl.path : "/" + pl.path,
      query,   body
    })
  }));
};
})();
