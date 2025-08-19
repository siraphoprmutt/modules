(() => {
    // ป้องกันโหลดซ้ำ
    if (window.__gasFetchInstalled) return;
    window.__gasFetchInstalled = true;

    /** อ่านค่า base(s) จาก <script> ปัจจุบัน: data-base หรือ ?base= */
    const getBases = () => {
        const s = document.currentScript || [...document.scripts].pop();
        if (!s) return [];
        const u = new URL(s.src, location.href);
        const fromParam = u.searchParams.get("base") || "";
        const fromData = (s.dataset && s.dataset.base) || "";
        const list = (fromParam || fromData)
            .split(",")
            .map(x => x.trim())
            .filter(Boolean);
        // แปลงเป็น URL object (รองรับ relative)
        return list.map(b => new URL(b, location.href));
    };

    const BASES = getBases();
    if (!BASES.length) return; // ไม่ตั้ง base → ไม่ override

    const originalFetch = window.fetch;

    /** ทดลอง parse JSON อย่างปลอดภัย */
    const tryParseJSON = (txt) => {
        try { return JSON.parse(txt); } catch { return txt; }
    };

    /** ตรวจสอบว่าควร wrap ไหม + คืนข้อมูลที่จำเป็นสำหรับ wrap
     * - กรณี path เริ่มด้วย "/" → ใช้ BASES[0] เป็นปลายทาง
     * - กรณี URL เต็มที่ขึ้นต้นด้วย base ใด base หนึ่ง → ใช้ base ที่ match
     */
    const planFor = (inputUrl) => {
        // 1) /relative → ผูกกับ base แรก
        if (typeof inputUrl === "string" && inputUrl.startsWith("/")) {
            const base = BASES[0];
            const full = new URL(inputUrl, base);        // base + /users/1 → .../exec/users/1
            const path = full.pathname.slice(base.pathname.length) || "/"; // ส่วนที่เกินจาก /exec
            return { shouldWrap: true, base, finalURL: full, path };
        }

        // 2) URL ปกติ → ตรวจ base ที่ match
        const u = new URL(String(inputUrl), location.href);
        for (const base of BASES) {
            if (u.href.startsWith(base.href)) {
                const path = u.pathname.slice(base.pathname.length) || "/";
                return { shouldWrap: true, base, finalURL: u, path };
            }
        }

        // 3) อื่น ๆ → ไม่ยุ่ง
        return { shouldWrap: false };
    };

    /** override fetch */
    window.fetch = async (input, init) => {
        // สร้าง Request เพื่ออ่าน method/headers ได้สะดวก
        const req = input instanceof Request ? input : new Request(input, init);
        const plan = planFor(req.url);

        // ไม่เข้าเงื่อนไข → ส่งต่อ fetch เดิม
        if (!plan.shouldWrap) return originalFetch(req);

        // ดึง query ทั้งหมดจาก URL เป้าหมาย (หลังจับคู่ base แล้ว)
        const query = Object.fromEntries(plan.finalURL.searchParams.entries());

        // อ่าน body เดิม (ถ้าไม่ใช่ GET/HEAD)
        let text = null;
        try {
            if (!/^(GET|HEAD)$/i.test(req.method)) {
                text = await req.clone().text();
            }
        } catch { /* ไม่มี body ก็ข้าม */ }

        const body = text ? tryParseJSON(text) : null;

        // รวม payload ให้ GAS ใช้งานง่าย
        const payload = {
            method: req.method,
            headers: Object.fromEntries(req.headers.entries()),
            path: plan.path.startsWith("/") ? plan.path : `/${plan.path}`, // ให้เป็นรูป /... เสมอ
            query: query,
            body: body
        };

        // ยิงเข้า base เดิม (เฉพาะ root /exec) เป็น POST พร้อม JSON
        return originalFetch(new Request(plan.base, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        }));
    };
})();
