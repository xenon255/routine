const STORAGE_KEY = "routine-pwa-v1";
const weekdays = ["Mo","Di","Mi","Do","Fr","Sa","So"];

const defaultState = {
  theme: "system",
  selectedDate: dateKey(new Date()),
  weekOffset: 0,
  calendarCursor: monthKey(new Date()),
  groups: [
    { id: crypto.randomUUID(), name: "Morgenroutine", order: 0, collapsed: false },
    { id: crypto.randomUUID(), name: "Fitness", order: 1, collapsed: false }
  ],
  habits: [],
  completions: {}
};
defaultState.habits = [
  { id: crypto.randomUUID(), name: "Wasser trinken", groupId: defaultState.groups[0].id, frequency: "daily", weekdays:[0,1,2,3,4,5,6], monthDay:1, createdAt: dateKey(new Date()), order:0 },
  { id: crypto.randomUUID(), name: "Kreatin", groupId: defaultState.groups[1].id, frequency: "daily", weekdays:[0,1,2,3,4,5,6], monthDay:1, createdAt: dateKey(new Date()), order:0 }
];

let state = loadState();
let activeView = "todayView";

function pad2(n){ return String(n).padStart(2,"0"); }
function dateKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function monthKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }
function parseKey(k){ const [y,m,d]=k.split("-").map(Number); return new Date(y,m-1,d,12,0,0); }
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(defaultState); }
  catch { return structuredClone(defaultState); }
}
function completionKey(habitId, day){ return `${habitId}:${day}`; }
function isDone(habitId, day){ return !!state.completions[completionKey(habitId, day)]; }
function toggleDone(habitId, day){
  const key = completionKey(habitId, day);
  state.completions[key] = !state.completions[key];
  if (!state.completions[key]) delete state.completions[key];
  if (navigator.vibrate) navigator.vibrate(12);
  saveState(); renderAll();
}
function weekdayIndex(d){ return (d.getDay()+6)%7; }
function isDue(habit, dayKey){
  const d = parseKey(dayKey);
  if (dayKey < habit.createdAt) return false;
  if (habit.frequency === "daily") return true;
  if (habit.frequency === "weekly") return habit.weekdays.includes(weekdayIndex(d));
  if (habit.frequency === "monthly") return d.getDate() === Number(habit.monthDay);
  return false;
}
function dueHabits(dayKey){ return state.habits.filter(h => isDue(h, dayKey)); }
function progress(dayKey){
  const due = dueHabits(dayKey);
  const done = due.filter(h => isDone(h.id, dayKey)).length;
  return {done,total:due.length,pct:due.length ? done/due.length : 0};
}
function applyTheme(){
  const mode = state.theme;
  const dark = mode === "dark" || (mode === "system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]').content = dark ? "#0a0a0a" : "#ffffff";
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);

function weekDates(centerKey, offset=0){
  const center = parseKey(centerKey);
  const start = new Date(center);
  start.setDate(center.getDate()-weekdayIndex(center)+(offset*7));
  return Array.from({length:7},(_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d; });
}

function renderToday(){
  const el = document.getElementById("todayView");
  if (typeof state.weekOffset !== "number") state.weekOffset = 0;
  const dates = weekDates(state.selectedDate, state.weekOffset);
  const p = progress(state.selectedDate);
  const due = dueHabits(state.selectedDate);
  const groups = [...state.groups].sort((a,b)=>a.order-b.order);
  const rangeStart = dates[0], rangeEnd = dates[6];
  const rangeLabel = rangeStart.getMonth() === rangeEnd.getMonth()
    ? new Intl.DateTimeFormat("de-DE",{month:"long",year:"numeric"}).format(rangeStart)
    : `${new Intl.DateTimeFormat("de-DE",{month:"short"}).format(rangeStart)} – ${new Intl.DateTimeFormat("de-DE",{month:"short",year:"numeric"}).format(rangeEnd)}`;

  let html = `<div class="week-nav">
      <button class="week-arrow" data-week-prev aria-label="Vorherige Woche">‹</button>
      <strong class="week-label">${rangeLabel}</strong>
      <button class="week-arrow" data-week-next aria-label="Nächste Woche">›</button>
    </div>
    <div class="week-strip"><div class="week-row">`;
  dates.forEach(d=>{
    const k=dateKey(d), today=dateKey(new Date());
    html += `<button class="day-btn ${k===today?"today":""} ${k===state.selectedDate?"selected":""}" data-date="${k}">
      <small>${weekdays[weekdayIndex(d)]}</small><span class="day-number">${d.getDate()}</span></button>`;
  });
  html += `</div></div>
    <div class="progress-summary"><div class="ring" style="--p:${p.pct*360}deg"></div><strong>${p.done} / ${p.total}</strong></div>`;

  if (!due.length) html += `<div class="empty">Für diesen Tag sind keine Gewohnheiten fällig.</div>`;
  groups.forEach(group=>{
    const gh = due.filter(h=>h.groupId===group.id).sort((a,b)=>a.order-b.order);
    if (!gh.length) return;
    const done = gh.filter(h=>isDone(h.id,state.selectedDate)).length;
    html += `<section class="group ${group.collapsed?"collapsed":""}" data-group="${group.id}">
      <button class="group-header" data-toggle-group="${group.id}">
        <span class="group-title"><span class="chevron">⌄</span>${escapeHtml(group.name)}</span>
        <span class="group-meta">${done}/${gh.length}</span>
      </button><div class="habit-list">`;
    gh.forEach((h,idx)=>{
      html += `<div class="habit ${isDone(h.id,state.selectedDate)?"done":""}" draggable="true" data-habit="${h.id}">
        <div class="check" data-toggle-habit="${h.id}"></div>
        <div class="habit-main" data-toggle-habit="${h.id}"><div class="habit-name">${escapeHtml(h.name)}</div></div>
        <div class="habit-actions">
          <button class="icon-btn" data-move-up="${h.id}" title="Nach oben">↑</button>
          <button class="icon-btn" data-edit-habit="${h.id}" title="Bearbeiten">···</button>
        </div>
      </div>`;
    });
    html += `</div></section>`;
  });
  el.innerHTML = html;

  el.querySelectorAll("[data-date]").forEach(b=>b.onclick=()=>{state.selectedDate=b.dataset.date;saveState();renderAll();});
  el.querySelector("[data-week-prev]").onclick=()=>{ state.weekOffset--; saveState(); renderToday(); };
  el.querySelector("[data-week-next]").onclick=()=>{ state.weekOffset++; saveState(); renderToday(); };

  const strip = el.querySelector(".week-strip");
  let touchStartX = null;
  strip.addEventListener("touchstart",e=>{ touchStartX=e.changedTouches[0].clientX; },{passive:true});
  strip.addEventListener("touchend",e=>{
    if(touchStartX===null) return;
    const dx = e.changedTouches[0].clientX-touchStartX;
    if(Math.abs(dx)>45){
      state.weekOffset += dx<0 ? 1 : -1;
      saveState(); renderToday();
    }
    touchStartX=null;
  },{passive:true});
  el.querySelectorAll("[data-toggle-group]").forEach(b=>b.onclick=()=>{
    const g=state.groups.find(x=>x.id===b.dataset.toggleGroup); g.collapsed=!g.collapsed; saveState(); renderToday();
  });
  el.querySelectorAll("[data-toggle-habit]").forEach(b=>b.onclick=()=>toggleDone(b.dataset.toggleHabit,state.selectedDate));
  el.querySelectorAll("[data-edit-habit]").forEach(b=>b.onclick=()=>openHabitForm(state.habits.find(h=>h.id===b.dataset.editHabit)));
  el.querySelectorAll("[data-move-up]").forEach(b=>b.onclick=()=>moveHabitUp(b.dataset.moveUp));
  enableDragAndDrop(el);
}

function moveHabitUp(id){
  const h=state.habits.find(x=>x.id===id);
  const siblings=state.habits.filter(x=>x.groupId===h.groupId).sort((a,b)=>a.order-b.order);
  const i=siblings.findIndex(x=>x.id===id);
  if(i>0){ const prev=siblings[i-1]; [h.order,prev.order]=[prev.order,h.order]; saveState(); renderAll(); }
}

function enableDragAndDrop(root){
  let dragged=null;
  root.querySelectorAll(".habit").forEach(row=>{
    row.addEventListener("dragstart",()=>dragged=row.dataset.habit);
    row.addEventListener("dragover",e=>e.preventDefault());
    row.addEventListener("drop",e=>{
      e.preventDefault();
      const targetId=row.dataset.habit;
      if(!dragged || dragged===targetId) return;
      const a=state.habits.find(h=>h.id===dragged), b=state.habits.find(h=>h.id===targetId);
      a.groupId=b.groupId; [a.order,b.order]=[b.order,a.order];
      saveState(); renderAll();
    });
  });
}

function renderCalendar(){
  const el=document.getElementById("calendarView");
  const [y,m]=state.calendarCursor.split("-").map(Number);
  const first=new Date(y,m-1,1), last=new Date(y,m,0);
  const offset=weekdayIndex(first);
  const monthName=new Intl.DateTimeFormat("de-DE",{month:"long",year:"numeric"}).format(first);
  let html=`<h1 class="page-title">Kalender</h1><div class="calendar-header">
    <button data-cal-prev>‹</button><strong>${monthName}</strong><button data-cal-next>›</button></div>
    <div class="calendar-grid">${weekdays.map(w=>`<div class="calendar-weekday">${w}</div>`).join("")}`;
  for(let i=0;i<offset;i++) html+=`<div></div>`;
  for(let d=1;d<=last.getDate();d++){
    const dt=new Date(y,m-1,d), k=dateKey(dt), p=progress(k), future=k>dateKey(new Date());
    const deg=p.total?p.pct*360:0;
    html+=`<button class="calendar-day ${future?"future":""}" data-cal-day="${k}">
      ${p.total?`<span class="mini-ring" style="--p:${deg}deg"></span>`:""}
      <span class="num">${d}</span></button>`;
  }
  html+=`</div>`;
  el.innerHTML=html;
  el.querySelector("[data-cal-prev]").onclick=()=>shiftMonth(-1);
  el.querySelector("[data-cal-next]").onclick=()=>shiftMonth(1);
  el.querySelectorAll("[data-cal-day]").forEach(b=>b.onclick=()=>openDayDetails(b.dataset.calDay));
}
function shiftMonth(delta){
  const [y,m]=state.calendarCursor.split("-").map(Number);
  const d=new Date(y,m-1+delta,1);
  state.calendarCursor=monthKey(d); saveState(); renderCalendar();
}
function openDayDetails(k){
  const due=dueHabits(k), p=progress(k);
  const dateLabel=new Intl.DateTimeFormat("de-DE",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(parseKey(k));
  let html=`<h2>${dateLabel}</h2><p><strong>${p.done} / ${p.total}</strong> erledigt</p>`;
  html += due.length ? `<div class="habit-list">${due.map(h=>`<div class="habit ${isDone(h.id,k)?"done":""}">
    <div class="check"></div><div class="habit-main">${escapeHtml(h.name)}</div></div>`).join("")}</div>` : `<p class="empty">Keine Gewohnheiten fällig.</p>`;
  document.getElementById("dayDialogContent").innerHTML=html;
  document.getElementById("dayDialog").showModal();
}

function renderSettings(){
  const el=document.getElementById("settingsView");
  el.innerHTML=`<h1 class="page-title">Einstellungen</h1>
    <section class="settings-card"><strong>Darstellung</strong>
      <div class="segmented">
        ${["system","light","dark"].map(v=>`<button data-theme-choice="${v}" class="${state.theme===v?"active":""}">
          ${{system:"System",light:"Hell",dark:"Dunkel"}[v]}</button>`).join("")}
      </div>
    </section>
    <section class="settings-card"><strong>Datensicherung</strong>
      <button class="settings-button" data-export>Daten exportieren</button>
      <button class="settings-button" data-import>Daten importieren</button>
      <input id="importFile" type="file" accept="application/json" hidden>
    </section>
    <section class="settings-card"><strong>App-Version</strong>
      <p class="version-label">Routine 0.2.1</p>
    </section>
    <section class="settings-card"><strong>Verwaltung</strong>
      <button class="settings-button" data-manage-groups>Gruppen bearbeiten</button>
      <button class="settings-button" data-reset>Alle Daten zurücksetzen</button>
    </section>`;
  el.querySelectorAll("[data-theme-choice]").forEach(b=>b.onclick=()=>{state.theme=b.dataset.themeChoice;saveState();applyTheme();renderSettings();});
  el.querySelector("[data-export]").onclick=exportData;
  el.querySelector("[data-import]").onclick=()=>el.querySelector("#importFile").click();
  el.querySelector("#importFile").onchange=importData;
  el.querySelector("[data-reset]").onclick=()=>{if(confirm("Wirklich alle Daten löschen?")){localStorage.removeItem(STORAGE_KEY);state=structuredClone(defaultState);saveState();renderAll();}};
  el.querySelector("[data-manage-groups]").onclick=()=>manageGroups();
}

function manageGroups(){
  const names=state.groups.sort((a,b)=>a.order-b.order).map((g,i)=>`${i+1}. ${g.name}`).join("\n");
  const choice=prompt(`Gruppen:\n${names}\n\nGib die Nummer der Gruppe ein, die du bearbeiten möchtest.`);
  const idx=Number(choice)-1; if(idx>=0 && idx<state.groups.length) openGroupForm(state.groups[idx]);
}

function exportData(){
  const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"});
  const a=document.createElement("a"); a.href=URL.createObjectURL(blob); a.download=`routine-backup-${dateKey(new Date())}.json`; a.click(); URL.revokeObjectURL(a.href);
}
function importData(e){
  const file=e.target.files[0]; if(!file)return;
  const r=new FileReader(); r.onload=()=>{try{state=JSON.parse(r.result);saveState();applyTheme();renderAll();alert("Import erfolgreich.");}catch{alert("Ungültige Sicherungsdatei.");}}; r.readAsText(file);
}

function openActionSheet(){ document.getElementById("actionSheet").showModal(); }
function populateGroups(selected){
  const sel=document.getElementById("groupSelect");
  sel.innerHTML=state.groups.sort((a,b)=>a.order-b.order).map(g=>`<option value="${g.id}" ${g.id===selected?"selected":""}>${escapeHtml(g.name)}</option>`).join("");
}
function openHabitForm(habit=null){
  if(!state.groups.length){ alert("Erstelle zuerst eine Gruppe."); return; }
  document.getElementById("formTitle").textContent=habit?"Gewohnheit bearbeiten":"Neue Gewohnheit";
  document.getElementById("entityType").value="habit";
  document.getElementById("entityId").value=habit?.id||"";
  document.getElementById("nameInput").value=habit?.name||"";
  populateGroups(habit?.groupId||state.groups[0].id);
  document.getElementById("frequencySelect").value=habit?.frequency||"daily";
  document.getElementById("monthDayInput").value=habit?.monthDay||1;
  renderWeekdayPicker(habit?.weekdays||[0]);
  document.getElementById("habitFields").style.display="block";
  updateFrequencyFields();
  document.getElementById("formDialog").showModal();
}
function openGroupForm(group=null){
  document.getElementById("formTitle").textContent=group?"Gruppe bearbeiten":"Neue Gruppe";
  document.getElementById("entityType").value="group";
  document.getElementById("entityId").value=group?.id||"";
  document.getElementById("nameInput").value=group?.name||"";
  document.getElementById("habitFields").style.display="none";
  document.getElementById("formDialog").showModal();
}
function renderWeekdayPicker(selected){
  const box=document.getElementById("weekdayPicker");
  box.innerHTML=weekdays.map((w,i)=>`<button type="button" data-weekday="${i}" class="${selected.includes(i)?"active":""}">${w}</button>`).join("");
  box.querySelectorAll("button").forEach(b=>b.onclick=()=>b.classList.toggle("active"));
}
function updateFrequencyFields(){
  const f=document.getElementById("frequencySelect").value;
  document.getElementById("weeklyFields").style.display=f==="weekly"?"block":"none";
  document.getElementById("monthlyFields").style.display=f==="monthly"?"block":"none";
}
document.getElementById("frequencySelect").addEventListener("change",updateFrequencyFields);

document.getElementById("entityForm").addEventListener("submit",e=>{
  e.preventDefault();
  const type=document.getElementById("entityType").value, id=document.getElementById("entityId").value;
  const name=document.getElementById("nameInput").value.trim(); if(!name)return;
  if(type==="group"){
    if(id){ state.groups.find(g=>g.id===id).name=name; }
    else state.groups.push({id:crypto.randomUUID(),name,order:state.groups.length,collapsed:false});
  } else {
    const data={
      name,
      groupId:document.getElementById("groupSelect").value,
      frequency:document.getElementById("frequencySelect").value,
      weekdays:[...document.querySelectorAll("#weekdayPicker button.active")].map(b=>Number(b.dataset.weekday)),
      monthDay:Number(document.getElementById("monthDayInput").value||1)
    };
    if(data.frequency==="weekly" && data.weekdays.length===0){ alert("Wähle mindestens einen Wochentag."); return; }
    if(id){ Object.assign(state.habits.find(h=>h.id===id),data); }
    else state.habits.push({id:crypto.randomUUID(),...data,createdAt:dateKey(new Date()),order:state.habits.filter(h=>h.groupId===data.groupId).length});
  }
  saveState(); document.getElementById("formDialog").close(); renderAll();
});

document.getElementById("fab").onclick=openActionSheet;
document.getElementById("actionSheet").addEventListener("click",e=>{
  const a=e.target.dataset.action;
  if(!a)return;
  document.getElementById("actionSheet").close();
  if(a==="newHabit")openHabitForm();
  if(a==="newGroup")openGroupForm();
});
document.querySelectorAll(".tab").forEach(tab=>tab.onclick=()=>{
  activeView=tab.dataset.view;
  document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t===tab));
  document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===activeView));
  document.getElementById("fab").style.display=activeView==="settingsView"?"none":"block";
});

function escapeHtml(s){ return s.replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c])); }
function renderAll(){
  if (!state.calendarCursor) state.calendarCursor = monthKey(new Date());
  if (typeof state.weekOffset !== "number") state.weekOffset = 0;
  applyTheme(); renderToday(); renderCalendar(); renderSettings();
}
renderAll();
if("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js");
