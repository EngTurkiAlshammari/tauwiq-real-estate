const $ = (id) => document.getElementById(id);
const LEADS_API_URL = "https://script.google.com/macros/s/AKfycbyYf_Myn5Sl-7pQbJ5mFDNn7FIA0XJYgkE7yR56oMXhoXh1mT9IiboACYprqPSBkqwo2Q/exec";
let units = [], sites = [], project = {};
const DIGITS = "٠١٢٣٤٥٦٧٨٩";
const statusLabels = {available:"متاحة", reserved:"محجوزة", sold:"مباعة"};
const statusClass = {available:"", reserved:"reserved", sold:"sold"};
const arabicDigits = value => String(value).replace(/[0-9]/g, d => DIGITS[Number(d)]);
const normalizeDigits = value => String(value).replace(/[٠-٩]/g, d => String("٠١٢٣٤٥٦٧٨٩".indexOf(d)));
const number = (value, max=2) => {
  if (value === null || value === undefined || value === "") return "—";
  const formatted = Number(value).toLocaleString("en-US", {maximumFractionDigits:max});
  return arabicDigits(formatted).replace(/,/g,"٬").replace(/\./g,"٫");
};
const money = value => `${number(Math.round(Number(value)),0)} ريال`;
const yesNo = value => value || "—";
const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const normalizeSearch = value => normalizeDigits(value).toLowerCase().replace(/أ/g,"a").replace(/إ/g,"a").replace(/آ/g,"a").replace(/ب/g,"b").replace(/[·،]/g," ");

/**
 * Send the lead with a CORS-simple POST, then confirm its assignment through
 * a JSONP status lookup. This works from a static GitHub Pages origin.
 */
function submitLeadToGoogle(payload) {
  const requestId = `TW-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
  const body = { ...payload, requestId };

  return fetch(LEADS_API_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify(body)
  }).then(() => readLeadStatus(requestId));
}

function readLeadStatus(requestId) {
  return new Promise((resolve, reject) => {
    const callbackName = `tauwiqStatus_${requestId.replace(/[^A-Za-z0-9_]/g, "")}`;
    let attempts = 0;
    let activeScript = null;
    let finished = false;

    const cleanup = () => {
      finished = true;
      if (activeScript) activeScript.remove();
      activeScript = null;
      try { delete window[callbackName]; } catch (_) { window[callbackName] = undefined; }
    };

    const fail = () => {
      if (finished) return;
      cleanup();
      reject(new Error("لم نتمكن من تأكيد حفظ الطلب في سجل العملاء. تحقق من نشر آخر إصدار في Apps Script ثم حاول مرة أخرى."));
    };

    window[callbackName] = data => {
      if (finished) return;
      if (activeScript) activeScript.remove();
      activeScript = null;
      if (data && data.success && data.found) {
        cleanup();
        resolve(data);
        return;
      }
      if (data && data.success === false) {
        cleanup();
        reject(new Error(data.message || "تعذر التحقق من تسجيل الطلب."));
        return;
      }
      if (attempts >= 20) {
        fail();
      } else {
        window.setTimeout(load, 800);
      }
    };

    function load() {
      if (finished) return;
      attempts += 1;
      const script = document.createElement("script");
      activeScript = script;
      script.src = `${LEADS_API_URL}?action=status&requestId=${encodeURIComponent(requestId)}&callback=${encodeURIComponent(callbackName)}&cacheBust=${Date.now()}`;
      script.onerror = () => {
        if (activeScript) activeScript.remove();
        activeScript = null;
        if (attempts >= 20) fail();
        else window.setTimeout(load, 800);
      };
      document.head.appendChild(script);
    }

    load();
    window.setTimeout(() => { if (!finished) fail(); }, 25000);
  });
}

async function loadJSON(path){const response=await fetch(path);if(!response.ok)throw new Error("تعذر تحميل البيانات");return response.json();}
function floorLabel(f){return f ? `الدور ${f}` : "—";}
function rangeText(min,max){return `${number(min)} – ${number(max)} م²`;}

function populateFilters(){
  $("siteFilter").innerHTML = '<option value="">جميع البلوكات</option>' +
    sites.map(s=>`<option value="${s.block}">البلوك ${number(s.block,0)}</option>`).join("");
  updateBuildingFilter();
  const floors = [...new Set(units.map(u=>u.floor))];
  $("floorFilter").innerHTML = '<option value="">جميع الأدوار</option>' +
    floors.map(f=>`<option value="${esc(f)}">${floorLabel(f)}</option>`).join("");
}
function updateBuildingFilter(){
  const block = $("siteFilter").value;
  const buildings = [...new Set(units.filter(u=>!block||String(u.block)===block).map(u=>u.building))].sort((a,b)=>a-b);
  const old = $("buildingFilter").value;
  $("buildingFilter").innerHTML = '<option value="">جميع المباني</option>' +
    buildings.map(b=>`<option value="${b}">المبنى ${number(b,0)}</option>`).join("");
  if(buildings.map(String).includes(old)) $("buildingFilter").value=old;
}
function renderSites(){
  $("siteList").innerHTML = sites.map(s=>`<button class="site-chip" data-block="${s.block}">
    <span><strong>البلوك ${number(s.block,0)}</strong><small>${number(s.total,0)} وحدة في القائمة · ${number(s.available,0)} متاحة</small></span>
    <span class="site-arrow">←</span>
  </button>`).join("");
  document.querySelectorAll(".site-chip").forEach(button=>button.addEventListener("click",()=>{
    $("siteFilter").value=button.dataset.block; updateBuildingFilter(); renderUnits();
    document.querySelectorAll(".site-chip").forEach(item=>item.classList.toggle("active",item===button));
    $("units").scrollIntoView({behavior:"smooth"});
  }));
}
function getFiltered(){
  const query=normalizeSearch($("searchInput").value.trim());
  const block=$("siteFilter").value, building=$("buildingFilter").value,
    floor=$("floorFilter").value, type=$("typeFilter").value;
  let list=units.filter(unit=>{
    if(unit.status!=="available") return false;
    if(block && String(unit.block)!==block) return false;
    if(building && String(unit.building)!==building) return false;
    if(floor && unit.floor!==floor) return false;
    if(type && unit.unit_type!==type) return false;
    const searchable=normalizeSearch(`${unit.unit_name} ${unit.unit_code} ${unit.unit_code_ar} ${unit.block} ${unit.building} ${unit.unit_type}`);
    if(query && !searchable.includes(query)) return false;
    return true;
  });
  const sort=$("sortFilter").value;
  list.sort((a,b)=>{
    return sort==="area-desc" ? b.total_area_sqm-a.total_area_sqm : a.total_area_sqm-b.total_area_sqm;
  });
  return list;
}
function renderUnits(){
  const list=getFiltered();
  $("resultsCount").textContent=`عرض ${number(list.length,0)} من ${number(units.length,0)} وحدة`;
  $("unitGrid").innerHTML=list.map(unit=>`
    <article class="unit-card" data-id="${esc(unit.id)}" tabindex="0" role="button" aria-label="تفاصيل الوحدة ${esc(unit.unit_code_ar)}">
      <div class="unit-card-top">
        <span class="unit-code">${esc(unit.unit_code_ar)}</span>
        <span class="unit-status ${statusClass[unit.status]||""}">${statusLabels[unit.status]||"غير محددة"}</span>
      </div>
      <p class="unit-location">البلوك ${number(unit.block,0)} · المبنى ${number(unit.building,0)} · ${floorLabel(unit.floor)}</p>
      <div class="unit-specs">
        <div><span>المساحة الإجمالية</span><strong>${number(unit.total_area_sqm)} م²</strong></div>
        <div><span>نوع الوحدة</span><strong>${esc(unit.unit_type)}</strong></div>
        <div><span>غرف النوم</span><strong>${number(unit.bedrooms,0)}</strong></div>
        <div><span>المساحة الداخلية</span><strong>${number(unit.internal_area_sqm)} م²</strong></div>
      </div>
      <div class="unit-price-row">
        <span class="unit-more">عرض التفاصيل ←</span>
      </div>
    </article>`).join("");
  $("noResults").hidden=list.length!==0;
  document.querySelectorAll(".unit-card").forEach(card=>{
    const open=()=>showUnit(card.dataset.id);
    card.addEventListener("click",open);
    card.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();open();}});
  });
}
function detailRow(label,value){return `<div><span>${label}</span><strong>${value}</strong></div>`;}
function showUnit(id){
  const unit=units.find(item=>item.id===id); if(!unit)return;
  const planBlock=unit.plan_image
    ? `<section class="dialog-plan-section">
        <div class="dialog-plan-heading"><strong>مخطط الوحدة</strong><span>${esc(unit.plan_caption || `البلوك ${number(unit.block,0)} · المبنى ${number(unit.building,0)} · ${floorLabel(unit.floor)}`)}</span></div>
        <div class="dialog-plan-wrap"><img class="dialog-plan" src="${esc(unit.plan_image)}" alt="مخطط البلوك ${number(unit.block,0)} المبنى ${number(unit.building,0)} ${floorLabel(unit.floor)}" loading="lazy"></div>
        <p class="dialog-plan-note">${esc(unit.plan_note || "المخطط من كتيب نماذج الوحدات.")}</p>
      </section>`
    : `<p class="dialog-plan-missing">لا يتوفر مخطط مطابق لهذه الوحدة في الملفات الحالية.</p>`;
  const buildingImage=`<section class="dialog-building-photo">
      <div class="dialog-plan-heading"><strong>صورة من المشروع</strong><span>صورة معتمدة</span></div>
      <div class="dialog-building-photo-wrap"><img src="${esc(unit.building_image || "assets/images/official-building-photo.jpeg")}" alt="صورة من مشروع عالية طويق" loading="lazy"></div>
    </section>`;
  $("dialogContent").innerHTML=`<div class="dialog-body">
    <p class="dialog-eyebrow">عالية طويق · تفاصيل الوحدة</p>
    <h2 class="dialog-title">الوحدة ${esc(unit.unit_code_ar)} — ${esc(unit.unit_type)}</h2>
    <div class="dialog-badges">
      <span class="unit-status ${statusClass[unit.status]||""}">${statusLabels[unit.status]||"غير محددة"}</span>
      <span class="floor-badge">${floorLabel(unit.floor)}</span>
    </div>
    ${buildingImage}
    ${planBlock}
    <div class="dialog-specs-heading"><strong>مواصفات الوحدة</strong><span></span></div>
    <div class="dialog-grid">
      ${detailRow("رقم الوحدة",esc(unit.unit_code_ar))}
      ${detailRow("البلوك",number(unit.block,0))}
      ${detailRow("المبنى",number(unit.building,0))}
      ${detailRow("الدور",floorLabel(unit.floor))}
      ${detailRow("نوع الوحدة",esc(unit.unit_type))}
      ${detailRow("وصف الوحدة",esc(unit.specifications))}
      ${detailRow("عدد غرف النوم",number(unit.bedrooms,0))}
      ${detailRow("المساحة الداخلية حسب الصك",`${number(unit.internal_area_sqm)} م²`)}
      ${detailRow("مساحة الموقف",`${number(unit.parking_area_sqm)} م²`)}
      ${detailRow("مساحة الأجزاء الخاصة",`${number(unit.private_area_sqm)} م²`)}
      ${detailRow("المساحة الإجمالية شاملة المرافق",`${number(unit.total_area_sqm)} م²`)}
      ${detailRow("مدخل خاص",esc(yesNo(unit.private_entrance)))}
      ${detailRow("حالة التوفر",esc(unit.status_ar))}
    </div>
    <p class="dialog-foot">للاستفسار عن تفاصيل هذه الوحدة، تواصل مع فريق المبيعات.</p>
  </div>`;
  $("unitDialog").showModal();
}

const gallerySlides = [{"src": "assets/images/gallery/photo-01.webp", "caption": "مساحة معيشة واسعة", "alt": "مساحة معيشة واسعة"}, {"src": "assets/images/gallery/photo-02.webp", "caption": "تفاصيل المساحة الداخلية", "alt": "تفاصيل المساحة الداخلية"}, {"src": "assets/images/gallery/photo-03.webp", "caption": "واجهات الوحدات السكنية", "alt": "واجهات الوحدات السكنية"}, {"src": "assets/images/gallery/photo-04.webp", "caption": "تفاصيل المغاسل", "alt": "تفاصيل المغاسل"}, {"src": "assets/images/gallery/photo-05.webp", "caption": "واجهات المشروع", "alt": "واجهات المشروع"}, {"src": "assets/images/gallery/photo-06.webp", "caption": "مشهد عام للوحدات", "alt": "مشهد عام للوحدات"}, {"src": "assets/images/gallery/photo-07.webp", "caption": "تفاصيل دورة المياه", "alt": "تفاصيل دورة المياه"}, {"src": "assets/images/gallery/photo-08.webp", "caption": "واجهة مبنى سكني", "alt": "واجهة مبنى سكني"}, {"src": "assets/images/gallery/photo-09.webp", "caption": "المدخل والدرج الداخلي", "alt": "المدخل والدرج الداخلي"}, {"src": "assets/images/gallery/photo-10.webp", "caption": "واجهة المبنى", "alt": "واجهة المبنى"}];
let galleryIndex = 0;
let galleryTimer = null;
let galleryPaused = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initGallery(){
  const mainImage = $("galleryMainImage");
  const caption = $("galleryCaption");
  const count = $("galleryCount");
  const dotsWrap = $("galleryDots");
  const thumbsWrap = $("galleryThumbnails");
  const playButton = $("galleryPlay");
  if(!mainImage || !caption || !count || !dotsWrap || !thumbsWrap || !playButton) return;

  const arabic = value => String(value).replace(/[0-9]/g, digit => "٠١٢٣٤٥٦٧٨٩"[Number(digit)]);
  dotsWrap.innerHTML = gallerySlides.map((slide,index) =>
    `<button type="button" class="gallery-dot${index===0?" active":""}" data-index="${index}" aria-label="عرض الصورة ${arabic(index+1)}"></button>`
  ).join("");
  thumbsWrap.innerHTML = gallerySlides.map((slide,index) =>
    `<button type="button" class="gallery-thumb${index===0?" active":""}" data-index="${index}" aria-label="عرض ${slide.alt}">
       <img src="${slide.src}" alt="" loading="lazy">
     </button>`
  ).join("");

  function showSlide(index){
    galleryIndex = (index + gallerySlides.length) % gallerySlides.length;
    const slide = gallerySlides[galleryIndex];
    mainImage.classList.add("is-changing");
    window.setTimeout(() => {
      mainImage.src = slide.src;
      mainImage.alt = slide.alt;
      caption.textContent = slide.caption;
      count.textContent = `${arabic(galleryIndex+1)} / ${arabic(gallerySlides.length)}`;
      mainImage.classList.remove("is-changing");
    }, 180);
    document.querySelectorAll(".gallery-dot").forEach((dot,i)=>dot.classList.toggle("active",i===galleryIndex));
    document.querySelectorAll(".gallery-thumb").forEach((thumb,i)=>thumb.classList.toggle("active",i===galleryIndex));
  }
  function stopTimer(){
    if(galleryTimer){window.clearInterval(galleryTimer);galleryTimer=null;}
  }
  function startTimer(){
    stopTimer();
    if(!galleryPaused) galleryTimer = window.setInterval(()=>showSlide(galleryIndex+1), 3000);
  }
  function updatePlayButton(){
    $("galleryPlayIcon").textContent = galleryPaused ? "▶" : "Ⅱ";
    $("galleryPlayText").textContent = galleryPaused ? "تشغيل العرض" : "إيقاف العرض";
    playButton.setAttribute("aria-label", galleryPaused ? "تشغيل عرض الصور" : "إيقاف عرض الصور");
  }

  $("galleryPrev").addEventListener("click",()=>{showSlide(galleryIndex-1);startTimer();});
  $("galleryNext").addEventListener("click",()=>{showSlide(galleryIndex+1);startTimer();});
  dotsWrap.addEventListener("click",event=>{
    const target=event.target.closest("[data-index]");
    if(target){showSlide(Number(target.dataset.index));startTimer();}
  });
  thumbsWrap.addEventListener("click",event=>{
    const target=event.target.closest("[data-index]");
    if(target){showSlide(Number(target.dataset.index));startTimer();}
  });
  playButton.addEventListener("click",()=>{
    galleryPaused=!galleryPaused;
    updatePlayButton();
    startTimer();
  });

  const slider=$("gallerySlider");
  slider.addEventListener("mouseenter",stopTimer);
  slider.addEventListener("mouseleave",startTimer);
  slider.addEventListener("focusin",stopTimer);
  slider.addEventListener("focusout",startTimer);
  document.addEventListener("visibilitychange",()=>document.hidden?stopTimer():startTimer());
  updatePlayButton();
  startTimer();
}

async function init(){
  try{
    [project,units,sites]=await Promise.all([loadJSON("data/project.json"),loadJSON("data/units.json"),loadJSON("data/sites.json")]);
    $("totalUnits").textContent=number(project.project_total_units || project.units_count,0);
    $("availableUnits").textContent=number(project.available_count,0);
    $("siteCount").textContent=number(project.blocks_count || project.sites_count,0);
    $("availableStamp").textContent=number(project.available_count,0);
    $("footerSold").textContent=number(project.sold_count,0);
    $("footerReserved").textContent=number(project.reserved_count,0);
    $("footerAvailable").textContent=number(project.available_count,0);
    document.title="عالية طويق | الوحدات السكنية";
    populateFilters();renderSites();renderUnits();initGallery();
    $("siteFilter").addEventListener("change",()=>{updateBuildingFilter();renderUnits();document.querySelectorAll(".site-chip").forEach(item=>item.classList.toggle("active",item.dataset.block===$("siteFilter").value));});
    ["buildingFilter","floorFilter","typeFilter","sortFilter","searchInput"].forEach(id=>$(id).addEventListener("input",renderUnits));
    $("dialogClose").addEventListener("click",()=>$("unitDialog").close());
    $("unitDialog").addEventListener("click",event=>{if(event.target===$("unitDialog"))$("unitDialog").close();});
    $("menuBtn").addEventListener("click",()=>$("nav").classList.toggle("open"));
    document.querySelectorAll(".nav a").forEach(link=>link.addEventListener("click",()=>$("nav").classList.remove("open")));
    $("leadForm").addEventListener("submit", async event=>{
      event.preventDefault();
      const leadForm=event.currentTarget;
      if(!leadForm.reportValidity()) return;
      const form=new FormData(leadForm);
      const submitButton=leadForm.querySelector(".lead-submit");
      const feedback=$("leadFeedback");
      const normalizePhone=value=>String(value||"").replace(/[٠-٩]/g,d=>String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[^0-9]/g,"");
      const phone=normalizePhone(form.get("phone"));
      const payload={
        firstName:String(form.get("firstName")||"").trim(),
        lastName:String(form.get("lastName")||"").trim(),
        phone,
        contactMethod:String(form.get("contactMethod")||"واتساب"),
        unit:String(form.get("unit")||"").trim(),
        consent:form.get("consent")==="on",
        website:String(form.get("website")||"")
      };
      submitButton.disabled=true;
      submitButton.setAttribute("aria-busy","true");
      feedback.textContent="جارٍ تسجيل طلبك وتوجيهه إلى فريق المبيعات...";
      try{
        const result=await submitLeadToGoogle(payload);
        const salesName=result.assignedSalesName||"فريق المبيعات";
        const salesPhone=String(result.assignedSalesPhone||"").replace(/[^0-9]/g,"");
        const message=[
          "طلب اهتمام بمشروع عالية طويق",
          `الاسم: ${payload.firstName} ${payload.lastName}`,
          `رقم الجوال: ${payload.phone}`,
          `الوحدة المهتم بها: ${payload.unit||"غير محددة"}`,
          `طريقة التواصل المفضلة: ${payload.contactMethod}`,
          `رقم الطلب: ${result.leadId||result.requestId||"—"}`
        ].join("\n");
        feedback.replaceChildren();
        const success=document.createElement("span");
        success.textContent=`تم تسجيل طلبك بنجاح وتوجيهه إلى ${salesName}. `;
        feedback.append(success);
        if(salesPhone){
          const link=document.createElement("a");
          link.href=`https://wa.me/${salesPhone}?text=${encodeURIComponent(message)}`;
          link.target="_blank";
          link.rel="noopener noreferrer";
          link.textContent="اضغط هنا لبدء محادثة واتساب";
          feedback.append(link);
        }
        leadForm.reset();
      }catch(error){
        feedback.textContent=error.message||"تعذر تسجيل الطلب. يرجى المحاولة لاحقاً.";
      }finally{
        submitButton.disabled=false;
        submitButton.removeAttribute("aria-busy");
      }
    });
  }catch(error){
    $("unitGrid").innerHTML='<div class="no-results">تعذر تحميل بيانات المشروع. تحقق من ملفات البيانات وشغّل الموقع عبر خادم محلي.</div>';
    console.error(error);
  }
}
init();