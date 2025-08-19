(()=>{ if(window.__gasFetchInstalled) return; window.__gasFetchInstalled = true;

const getBases=()=>{ const s=document.currentScript||[...document.scripts].pop();
  if(!s) return []; const u=new URL(s.src,location.href);
  const fromParam=u.searchParams.get("base")||""; const fromData=s.dataset?.base||"";
  return (fromParam||fromData).split(",").map(x=>x.trim()).filter(Boolean).map(b=>new URL(b,location.href));
};

const BASES=getBases(); if(!BASES.length) return;
const OF=window.fetch;

const tryJSON=t=>{ try{return JSON.parse(t)}catch{return t} };

const planFor=urlStr=>{
  // 1) ถ้าเป็น path แบบ /xxx → ผูกกับ base แรก
  if(typeof urlStr==="string" && urlStr.startsWith("/")){
    const base=BASES[0]; const full=new URL(urlStr, base);
    const path=full.pathname.slice(base.pathname.length)||"/";
    return {wrap:true, base, full, path};
  }
  // 2) ถ้าเป็น URL เต็มที่ขึ้นต้นด้วย base ใด base หนึ่ง
  const u=new URL(String(urlStr), location.href);
  for(const base of BASES){
    if(u.href.startsWith(base.href)){
      const path=u.pathname.slice(base.pathname.length)||"/";
      return {wrap:true, base, full:u, path};
    }
  }
  // 3) ไม่แมตช์ → ไม่ยุ่ง
  return {wrap:false};
};

window.fetch=async(input,init)=>{
  const req=input instanceof Request? input : new Request(input, init);
  const plan=planFor(req.url); if(!plan.wrap) return OF(req);

  const query=Object.fromEntries(plan.full.searchParams.entries());
  let text=null; try{ if(!/^(GET|HEAD)$/i.test(req.method)) text=await req.clone().text(); }catch{}
  const body=text? tryJSON(text): null;

  const payload={ method:req.method,
    headers:Object.fromEntries(req.headers.entries()),
    path: plan.path.startsWith("/")? plan.path : "/"+plan.path,
    query, body };

  return OF(new Request(plan.base, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify(payload)
  }));
};
})();
