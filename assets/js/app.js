const $ = (id) => document.getElementById(id);
const LEADS_API_URL = "https://script.google.com/macros/s/AKfycbyYf_Myn5Sl-7pQbJ5mFDNn7FIA0XJYgkE7yR56oMXhoXh1mT9IiboACYprqPSBkqwo2Q/exec";
let units = [], sites = [], project = {}, planModels = {};
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
function listedPrice(unit){
  if(!unit || unit.status!=="available") return "";
  const value=Number(unit.price_sar);
  if(!Number.isFinite(value) || value<=0) return "";
  return money(value);
}
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
      reject(new Error("لم نتمكن من تأكيد حفظ الطلب في سجل العملاء. حاول مرة أخرى بعد قليل."));
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

async function loadJSON(path){const response=await fetch(path,{cache:"no-store"});if(!response.ok)throw new Error("تعذر تحميل البيانات");return response.json();}
function enNumber(value, max=2){
  if (value === null || value === undefined || value === "") return "—";
  return Number(value).toLocaleString("en-US", {maximumFractionDigits:max});
}
function floorLabel(f){return f ? `الدور ${f}` : "—";}
const floorEn = {"الأرضي":"Ground floor", "الأول":"First floor", "العلوي":"Second floor"};
function floorLabelEn(f){return floorEn[f] || f || "—";}
function unitLetter(unit){
  return String(unit.unit_code||"A").replace(/[^A-Za-z]/g,"").toUpperCase()||"A";
}
function unitMark(unit){
  return `${unitLetter(unit)}-1`;
}
function cardName(unit){
  return `الوحدة ${unitLetter(unit)}1`;
}
function placeLine(unit){
  return `Block ${enNumber(unit.block,0)} · Building ${enNumber(unit.building,0)} · ${floorLabelEn(unit.floor)}`;
}
function placeTitle(unit){
  return `Block ${enNumber(unit.block,0)} · Building ${enNumber(unit.building,0)} · ${unitMark(unit)} · ${floorLabelEn(unit.floor)}`;
}
function moneyEn(value){return `${enNumber(Math.round(Number(value)),0)} ريال`;}
function listedPriceEn(unit){
  if(!unit || unit.status!=="available") return "";
  const value=Number(unit.price_sar);
  if(!Number.isFinite(value) || value<=0) return "";
  return moneyEn(value);
}
function rangeText(min,max){return `${number(min)} – ${number(max)} م²`;}

function populateFilters(){
  $("siteFilter").innerHTML = '<option value="">جميع البلوكات</option>' +
    sites.map(s=>`<option value="${s.block}">البلوك ${number(s.block,0)}</option>`).join("");
  updateBuildingFilter();
  const floors = [...new Set(units.map(u=>u.floor))];
  $("floorFilter").innerHTML = '<option value="">جميع الأدوار</option>' +
    floors.map(f=>`<option value="${esc(f)}">${floorLabel(f)}</option>`).join("");
  const bedrooms = [...new Set(units.map(u=>Number(u.bedrooms)).filter(n=>Number.isFinite(n)))].sort((a,b)=>a-b);
  $("bedroomFilter").innerHTML = '<option value="">جميع غرف النوم</option>' +
    bedrooms.map(n=>`<option value="${n}">${number(n,0)} غرف نوم</option>`).join("");
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
    floor=$("floorFilter").value, type=$("typeFilter").value, bedrooms=$("bedroomFilter").value;
  let list=units.filter(unit=>{
    if(unit.status!=="available") return false;
    if(block && String(unit.block)!==block) return false;
    if(building && String(unit.building)!==building) return false;
    if(floor && unit.floor!==floor) return false;
    if(type && unit.unit_type!==type) return false;
    if(bedrooms && String(unit.bedrooms)!==bedrooms) return false;
    const searchable=normalizeSearch(`${unit.unit_name} ${unit.unit_code} ${unit.unit_code_ar} ${unit.block} ${unit.building} ${unit.unit_type}`);
    if(query && !searchable.includes(query)) return false;
    return true;
  });
  const sort=$("sortFilter").value;
  const priceOf=unit=>{
    const value=Number(unit.price_sar);
    return Number.isFinite(value) && value>0 ? value : Number.POSITIVE_INFINITY;
  };
  list.sort((a,b)=>{
    if(sort==="price-asc") return priceOf(a)-priceOf(b);
    if(sort==="price-desc") return priceOf(b)-priceOf(a);
    return sort==="area-desc" ? b.total_area_sqm-a.total_area_sqm : a.total_area_sqm-b.total_area_sqm;
  });
  return list;
}
function renderUnits(){
  const list=getFiltered();
  $("resultsCount").textContent=`عرض ${number(list.length,0)} من ${number(units.length,0)} وحدة`;
  $("unitGrid").innerHTML=list.map(unit=>{
    const price=listedPriceEn(unit);
    const plan=planSlidesFor(unit)[0];
    return `
    <article class="unit-card" data-id="${esc(unit.id)}" tabindex="0" role="button" aria-label="${esc(cardName(unit))}، ${esc(placeLine(unit))}${price?`، السعر ${price}`:""}">
      <div class="unit-plan-thumb">
        ${plan
          ? `<img src="${esc(plan.src)}" alt="${esc(cardName(unit))}" loading="lazy">`
          : `<span class="unit-plan-missing">لا يوجد مخطط</span>`}
      </div>
      <div class="unit-card-body">
        <div class="unit-card-top">
          <div class="unit-name">
            <span class="unit-code">${esc(cardName(unit))}</span>
            <span class="unit-place" dir="ltr">${esc(placeLine(unit))}</span>
          </div>
          <span class="unit-status ${statusClass[unit.status]||""}">${statusLabels[unit.status]||"غير محددة"}</span>
        </div>
        <div class="unit-specs">
          <div><span>النوع</span><strong>${esc(unit.unit_type)}</strong></div>
          <div><span>المساحة</span><strong>${enNumber(unit.total_area_sqm)} م²</strong></div>
          <div><span>غرف النوم</span><strong>${enNumber(unit.bedrooms,0)}</strong></div>
          <div><span>دورات المياه</span><strong>${enNumber(unit.bathrooms,0)}</strong></div>
          <div><span>المجلس</span><strong>${esc(unit.majlis || "يوجد")}</strong></div>
          <div><span>غرفة المعيشة</span><strong>${esc(unit.living_room || "يوجد")}</strong></div>
        </div>
        <div class="unit-price-row">
          ${price
            ? `<div class="unit-price"><span>السعر</span><strong>${price}</strong></div>`
            : `<span class="unit-price-note">السعر عند الاستفسار</span>`}
          <span class="unit-more">عرض التفاصيل ←</span>
        </div>
      </div>
    </article>`;
  }).join("");
  $("noResults").hidden=list.length!==0;
  document.querySelectorAll(".unit-plan-thumb img").forEach(img=>{
    img.addEventListener("error",()=>{
      const note=document.createElement("span");
      note.className="unit-plan-missing";
      note.textContent="لا يوجد مخطط";
      img.replaceWith(note);
    });
  });
  document.querySelectorAll(".unit-card").forEach(card=>{
    const open=()=>showUnit(card.dataset.id);
    card.addEventListener("click",open);
    card.addEventListener("keydown",event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();open();}});
  });
}
function detailRow(label,value){return `<div><span>${label}</span><strong>${value}</strong></div>`;}
function planSlidesFor(unit){
  const slides=planModels[unit.id];
  const list=Array.isArray(slides) && slides.length
    ? slides
    : (unit.plan_image ? [{src:unit.plan_image, caption:unit.plan_caption || ""}] : []);
  if(list.length<=1) return list;
  const floor=unit.floor_raw||"";
  const token=floor==="أول" ? "الأول" : floor==="علوي" ? "الثاني" : "الأرضي";
  const match=list.find(slide=>{
    const caption=String(slide.caption||"");
    return caption.includes(token) || (floor==="علوي" && caption.includes("الملحق"));
  });
  return [match || list[0]];
}
function unitInterestText(unit){
  return `${cardName(unit)} · البلوك ${enNumber(unit.block,0)} · المبنى ${enNumber(unit.building,0)} · ${floorLabel(unit.floor)}`;
}
function bookUnit(unit){
  const dialog=$("unitDialog");
  if(dialog && dialog.open) dialog.close();
  const form=$("leadForm");
  const unitInput=form && form.querySelector('[name="unit"]');
  if(unitInput){
    unitInput.value=unitInterestText(unit);
    unitInput.classList.add("is-filled");
  }
  const contact=$("contact");
  if(contact){
    document.documentElement.style.scrollBehavior="auto";
    contact.scrollIntoView({block:"start"});
  }
  const first=form && form.querySelector('[name="firstName"]');
  if(first) window.setTimeout(()=>first.focus({preventScroll:true}), 60);
}
function showUnit(id){
  const unit=units.find(item=>item.id===id); if(!unit)return;
  const price=listedPriceEn(unit);
  const slides=planSlidesFor(unit);
  const planBlock=slides.length
    ? `<section class="dialog-plan-section">
        <div class="dialog-plan-heading"><strong>المخطط</strong><span>من كتيب نماذج الوحدات</span></div>
        ${slides.map(slide=>`<figure class="dialog-plan-slide">
          <div class="dialog-plan-wrap"><img class="dialog-plan" src="${esc(slide.src)}" alt="${esc(placeTitle(unit))}"></div>
          <figcaption class="dialog-plan-note">${esc(placeTitle(unit))}</figcaption>
        </figure>`).join("")}
      </section>`
    : `<p class="dialog-plan-missing">لا يتوفر مخطط مطابق لهذه الوحدة.</p>`;
  const factGroup=(title, rows)=>`<section class="dialog-group"><h3>${title}</h3><div class="dialog-grid">${rows}</div></section>`;
  $("dialogContent").innerHTML=`<div class="dialog-body">
    <header class="dialog-head">
      <div>
        <p class="dialog-eyebrow">عالية طويق · تفاصيل الوحدة</p>
        <h2 class="dialog-title">${esc(placeTitle(unit))}</h2>
        <div class="dialog-badges">
          <span class="unit-status ${statusClass[unit.status]||""}">${statusLabels[unit.status]||"غير محددة"}</span>
          <span class="floor-badge">${esc(unit.unit_type)}</span>
          <span class="floor-badge">${floorLabel(unit.floor)}</span>
        </div>
      </div>
      ${price
        ? `<p class="dialog-price">${price}</p>`
        : `<p class="dialog-price-hidden">السعر غير منشور لهذه الوحدة.</p>`}
    </header>
    <div class="dialog-layout">
      ${planBlock}
      <div class="dialog-facts">
        ${factGroup("الموقع", [
          detailRow("البلوك", enNumber(unit.block,0)),
          detailRow("المبنى", enNumber(unit.building,0)),
          detailRow("الدور", floorLabel(unit.floor)),
          detailRow("الوحدة", unitMark(unit))
        ].join(""))}
        ${factGroup("المساحات", [
          detailRow("الداخلية", `${enNumber(unit.internal_area_sqm)} م²`),
          detailRow("الموقف", `${enNumber(unit.parking_area_sqm)} م²`),
          detailRow("الأجزاء الخاصة", `${enNumber(unit.private_area_sqm)} م²`),
          detailRow("الإجمالية", `${enNumber(unit.total_area_sqm)} م²`)
        ].join(""))}
        ${factGroup("التفاصيل", [
          detailRow("غرف النوم", enNumber(unit.bedrooms,0)),
          detailRow("دورات المياه", enNumber(unit.bathrooms,0)),
          detailRow("المجلس", esc(unit.majlis || "يوجد")),
          detailRow("غرفة المعيشة", esc(unit.living_room || "يوجد")),
          detailRow("المدخل الخاص", esc(yesNo(unit.private_entrance))),
          detailRow("الوصف", esc(unit.specifications))
        ].join(""))}
        <button type="button" class="dialog-book">احجز الآن</button>
      </div>
    </div>
  </div>`;
  $("dialogContent").querySelector(".dialog-book").addEventListener("click", ()=>bookUnit(unit));
  $("unitDialog").showModal();
  $("dialogContent").querySelectorAll(".dialog-plan").forEach(planImg=>{
    const hideMissingPlan=()=>{
      const slide=planImg.closest(".dialog-plan-slide");
      const section=planImg.closest(".dialog-plan-section");
      if(slide) slide.remove();
      if(section && section.isConnected && !section.querySelector(".dialog-plan")){
        section.outerHTML='<p class="dialog-plan-missing">لا يتوفر نموذج مطابق لهذه الوحدة في كتيب النماذج.</p>';
      }
    };
    planImg.addEventListener("error", hideMissingPlan);
    if(planImg.complete && planImg.naturalWidth===0) hideMissingPlan();
  });
}

const gallerySlides = [
  {src:"images/gallery/show-unit.jpg?v=2", caption:"وحدة العرض", alt:"وحدة العرض"},
  {src:"images/gallery/interior-majlis.jpg?v=2", caption:"مجلس الضيوف", alt:"مجلس الضيوف"},
  {src:"images/gallery/interior-living.jpg?v=2", caption:"غرفة المعيشة", alt:"غرفة المعيشة"},
  {src:"images/gallery/interior-kitchen.jpg?v=2", caption:"المطبخ", alt:"المطبخ"},
  {src:"images/gallery/interior-bedroom.jpg?v=2", caption:"غرفة النوم", alt:"غرفة النوم"}
];
function initGallery(){
  const board = $("galleryBoard");
  if(!board) return;
  board.innerHTML = gallerySlides.map(slide =>
    `<figure class="gallery-card">
       <img src="${esc(slide.src)}" alt="${esc(slide.alt)}" loading="lazy">
       <span>${esc(slide.caption)}</span>
     </figure>`
  ).join("");
}

async function init(){
  try{
    [project,units,sites,planModels]=await Promise.all([loadJSON("data/project.json"),loadJSON("data/units.json"),loadJSON("data/sites.json"),loadJSON("data/plan-models.json")]);
    const counts = units.reduce((acc, unit) => {
      acc.total += 1;
      if (unit.status === "sold") acc.sold += 1;
      else if (unit.status === "reserved") acc.reserved += 1;
      else if (unit.status === "available") acc.available += 1;
      return acc;
    }, {total:0, sold:0, reserved:0, available:0});
    $("totalUnits").textContent=number(project.project_total_units || counts.total,0);
    $("availableUnits").textContent=number(counts.available,0);
    $("siteCount").textContent=number(sites.length,0);
    $("availableStamp").textContent=number(counts.available,0);
    document.title="عالية طويق | الوحدات السكنية";
    populateFilters();renderSites();renderUnits();initGallery();
    $("siteFilter").addEventListener("change",()=>{updateBuildingFilter();renderUnits();document.querySelectorAll(".site-chip").forEach(item=>item.classList.toggle("active",item.dataset.block===$("siteFilter").value));});
    ["buildingFilter","floorFilter","typeFilter","bedroomFilter","sortFilter","searchInput"].forEach(id=>$(id).addEventListener("input",renderUnits));
    $("dialogClose").addEventListener("click",()=>$("unitDialog").close());
    $("unitDialog").addEventListener("click",event=>{if(event.target===$("unitDialog"))$("unitDialog").close();});
    $("sentClose").addEventListener("click",()=>$("sentDialog").close());
    $("sentDialog").addEventListener("click",event=>{if(event.target===$("sentDialog"))$("sentDialog").close();});
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
        feedback.textContent=`تم تسجيل طلبك وتوجيهه إلى ${salesName}.`;
        const sentMessage=$("sentMessage");
        sentMessage.replaceChildren();
        const line=document.createElement("span");
        line.textContent=`وصل طلبك إلى ${salesName}.`;
        const note=document.createElement("span");
        note.className="sent-note";
        note.textContent="إذا رغبت في التواصل، تواصل معنا عبر واتساب.";
        sentMessage.append(line, note);
        if(salesPhone){
          const link=document.createElement("a");
          link.className="sent-whatsapp";
          link.href=`https://wa.me/${salesPhone}?text=${encodeURIComponent(message)}`;
          link.target="_blank";
          link.rel="noopener noreferrer";
          link.textContent="تواصل معنا واتساب";
          sentMessage.append(link);
        }
        $("sentDialog").showModal();
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