/* ============================================
   HoyCredit — Global JS
   - Mobile menu
   - Affiliate link decorator
   - Optional gclid -> affiliate params
   - Loan calculator + offer matcher
   ============================================ */

/* Mobile menu */
(function(){
  const btn = document.getElementById('menu-toggle');
  const menu = document.getElementById('mobile-menu');
  if(!btn || !menu) return;

  function closeMenu(){
    menu.classList.remove('open');
    btn.setAttribute('aria-expanded','false');
    menu.setAttribute('aria-hidden','true');
  }
  function openMenu(){
    menu.classList.add('open');
    btn.setAttribute('aria-expanded','true');
    menu.setAttribute('aria-hidden','false');
  }

  btn.addEventListener('click', ()=> {
    const isOpen = menu.classList.contains('open');
    isOpen ? closeMenu() : openMenu();
  }, {passive:true});

  menu.querySelectorAll('a').forEach(a=>{
    a.addEventListener('click', closeMenu, {passive:true});
  });

  window.addEventListener('resize', ()=>{
    if (window.innerWidth > 900 && menu.classList.contains('open')) {
      closeMenu();
    }
  }, {passive:true});
})();

/* Affiliate link decorator */
(function(){
  const AFF_ENABLED = true;
  if(!AFF_ENABLED) return;

  // affiliate hubs you use
  const AFF_HOSTS=[{host:'clickcrafter.eu',param:'subid'},{host:'murtov.com',param:'subid'}];
  const DEFAULT_PARAM='subid';

  // read current URL params
  const sp=new URLSearchParams(location.search);
  const get = (k)=>sp.get(k);

  // cookie helpers (SameSite=Lax)
  function setCookie(n,v,days){
    try{
      const t=new Date(); t.setTime(t.getTime()+days*864e5);
      document.cookie = n+'='+encodeURIComponent(v)+'; path=/; expires='+t.toUTCString()+'; SameSite=Lax';
    }catch(e){}
  }
  function getCookie(name){
    const esc=name.replace(/([.*+?^${}()|[\]\\\/])/g,'\\$1');
    const m=document.cookie.match(new RegExp('(?:^|; )'+esc+'=([^;]*)'));
    return m?decodeURIComponent(m[1]):'';
  }

  function store(k,v){
    if(!v) return;
    try{localStorage.setItem(k,v)}catch(e){}
    try{sessionStorage.setItem(k,v)}catch(e){}
    setCookie(k,v,90);
  }
  function readStored(k){
    return get(k) || getCookie(k) || (sessionStorage.getItem(k)||'') || (localStorage.getItem(k)||'') || '';
  }

  // our own lightweight click/session id (not Google)
  function getCid(){
    let cid = readStored('cid');
    if(!cid){
      cid = (Date.now().toString(36) + Math.random().toString(36).slice(2,10)).toUpperCase();
      store('cid', cid);
    }
    return cid;
  }
  const CID = getCid();

  // store UTM params if present
  const UTM_KEYS = ['utm_source','utm_medium','utm_campaign','utm_content','utm_term'];
  UTM_KEYS.forEach(k=>{ const v=get(k); if(v){ store(k,v) }});

  // store gclid if present (optional; from Google Ads)
  const GCLID = get('gclid');
  if(GCLID) store('gclid', GCLID);

  function getAffParamForHost(h){
    const cfg=AFF_HOSTS.find(x=>h===x.host||h.endsWith('.'+x.host));
    return cfg?cfg.param:DEFAULT_PARAM;
  }
  function isAffHost(hostname){
    return AFF_HOSTS.some(x=>hostname===x.host||hostname.endsWith('.'+x.host));
  }

  function decorate(urlStr,overrideParam){
    try{
      const url=new URL(urlStr,location.href);
      if(!isAffHost(url.hostname)) return urlStr;

      const paramName=overrideParam||getAffParamForHost(url.hostname);

      // always set our own CID for affiliate tracking
      if(CID && !url.searchParams.has(paramName)) url.searchParams.set(paramName,CID);

      // pass gclid if it exists (some partners accept click_id / s1)
      const g = readStored('gclid');
      if(g){
        if(!url.searchParams.has('click_id')) url.searchParams.set('click_id', g);
        if(!url.searchParams.has('s1')) url.searchParams.set('s1', g);
      }

      // propagate UTM params
      UTM_KEYS.forEach(k=>{
        const v = readStored(k);
        if(v && !url.searchParams.has(k)) url.searchParams.set(k,v);
      });

      return url.toString();
    }catch(e){
      return urlStr;
    }
  }

  // decorate on click
  document.addEventListener('click',function(e){
    const a=e.target.closest('a[href]');
    if(!a) return;

    const href=a.getAttribute('href');
    if(!href || !/^https?:/i.test(href)) return;

    const decorated=decorate(href,a.getAttribute('data-aff-param')||'');
    if(decorated!==href) a.setAttribute('href',decorated);

    // keep safety attributes for affiliate clicks
    try{
      const u=new URL(decorated,location.href);
      if(isAffHost(u.hostname)){
        a.setAttribute('target','_blank');
        a.setAttribute('rel','nofollow noopener noreferrer sponsored');
      }
    }catch(err){}
  }, {capture:true,passive:true});
})();

/* ===== Loan calculator with offer matcher ===== */
(function(){
  const offers = [
    { name: "Credito-365", min: 100,  max: 20000,  link: "https://clickcrafter.eu/credito-365.mx/9is4591jin" },
    { name: "Crezu",      min: 100,  max: 20000,  link: "https://clickcrafter.eu/crezu.mx/9is4591jin" },
    { name: "Credy",      min: 1000, max: 30000,  link: "https://clickcrafter.eu/credy.mx/9is4591jin" },
    { name: "Dineria.mx", min: 1000, max: 35000,  link: "https://clickcrafter.eu/dineria.mx/9is4591jin" },
    { name: "Lanu.mx",    min: 1000, max: 35000,  link: "https://clickcrafter.eu/lanu.mx/9is4591jin" },
  ];

  const btn = document.getElementById("calcBtn");
  if(!btn) return;

  btn.addEventListener("click", ()=>{
    const amount = +document.getElementById("loanAmount").value;
    const days = +document.getElementById("loanDays").value;
    const rate = +document.getElementById("loanRate").value / 100;

    const resultEl = document.getElementById("loanResult");
    const matchWrap = document.getElementById("matchOffers");

    if(!amount || !days || !rate){
      resultEl.textContent = "Please fill in all fields.";
      resultEl.style.color = "#dc2626";
      matchWrap.innerHTML = "";
      return;
    }

    const total = amount * Math.pow(1 + rate, days);
    const overpay = total - amount;

    resultEl.innerHTML = `
💰 <strong>Total a pagar:</strong> ${total.toFixed(2)} MXN<br>
📈 <strong>Interés:</strong> ${overpay.toFixed(2)} MXN<br>
⏱ <strong>Plazo:</strong> ${days} días
`;
    resultEl.style.color = "#1e3a8a";

    const matched = offers.filter(o => amount >= o.min && amount <= o.max);
    if(matched.length === 0){
      matchWrap.innerHTML = "<p>No matching offers found for that amount.</p>";
      return;
    }

    matchWrap.innerHTML = `
      <h3>Matching Offers (${matched.length})</h3>
      <div class="match-list">
        ${matched.map(o=>`
          <div class="match-card">
            <span>${o.name}</span>
            <a href="${o.link}" target="_blank" rel="nofollow noopener noreferrer sponsored">Apply</a>
          </div>
        `).join("")}
      </div>
    `;
  });
})();