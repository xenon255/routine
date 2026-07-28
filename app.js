const STORAGE_KEY = "routine-pwa-v1";
const weekdays = ["Mo","Di","Mi","Do","Fr","Sa","So"];
const defaultState = {
  theme: "system", haptics: false, selectedDate: dateKey(new Date()), weekOffset: 0,
  calendarCursor: monthKey(new Date()),
  groups: [
    { id: crypto.randomUUID(), name: "Morgenroutine", order: 0, collapsed: false },
    { id: crypto.randomUUID(), name: "Fitness", order: 1, collapsed: false }
  ], habits: [], completions: {}
};
defaultState.habits = [
  { id: crypto.randomUUID(), name: "Wasser trinken", groupId: defaultState.groups[0].id, frequency: "daily", weekdays:[0,1,2,3,4,5,6], monthDay:1, createdAt: dateKey(new Date()), order:0 },
  { id: crypto.randomUUID(), name: "Kreatin", groupId: defaultState.groups[1].id, frequency: "daily", weekdays:[0,1,2,3,4,5,6], monthDay:1, createdAt: dateKey(new Date()), order:0 }
];
let state = loadState();
let activeView = "todayView";
let sortMode = false;
let suppressHabitClickUntil = 0;
let activeHabitDrag = null;
let ignoreMouseDragUntil = 0;

function pad2(n){ return String(n).padStart(2,"0"); }
function dateKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}-${pad2(d.getDate())}`; }
function monthKey(d){ return `${d.getFullYear()}-${pad2(d.getMonth()+1)}`; }
function parseKey(k){ const [y,m,d]=k.split("-").map(Number); return new Date(y,m-1,d,12,0,0); }
function saveState(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
function loadState(){ try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || structuredClone(defaultState); } catch { return structuredClone(defaultState); } }
function completionKey(habitId, day){ return `${habitId}:${day}`; }
function isDone(habitId, day){ return !!state.completions[completionKey(habitId, day)]; }
function haptic(ms=12){ if (state.haptics && typeof navigator.vibrate === "function") navigator.vibrate(ms); }
function toggleDone(habitId, day){
  const key = completionKey(habitId, day), completed = !state.completions[key];
  state.completions[key] = completed; if (!completed) delete state.completions[key];
  if (completed) haptic(12); saveState(); renderAll();
}
function weekdayIndex(d){ return (d.getDay()+6)%7; }
function isDue(habit, dayKey){
  const d = parseKey(dayKey); if (dayKey < habit.createdAt) return false;
  if (habit.frequency === "daily") return true;
  if (habit.frequency === "weekly") return habit.weekdays.includes(weekdayIndex(d));
  if (habit.frequency === "monthly") return d.getDate() === Number(habit.monthDay);
  return false;
}
function dueHabits(dayKey){ return state.habits.filter(h => isDue(h, dayKey)); }
function progress(dayKey){ const due=dueHabits(dayKey), done=due.filter(h=>isDone(h.id,dayKey)).length; return {done,total:due.length,pct:due.length?done/due.length:0}; }
function applyTheme(){
  const dark=state.theme==="dark" || (state.theme==="system" && matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme=dark?"dark":"light";
  document.querySelector('meta[name="theme-color"]').content=dark?"#0a0a0a":"#ffffff";
}
matchMedia("(prefers-color-scheme: dark)").addEventListener("change",applyTheme);
function weekDates(centerKey,offset=0){
  const center=parseKey(centerKey), start=new Date(center); start.setDate(center.getDate()-weekdayIndex(center)+(offset*7));
  return Array.from({length:7},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return d;});
}
function isCurrentWeek(){ return weekDates(state.selectedDate,state.weekOffset).some(d=>dateKey(d)===dateKey(new Date())); }
function goToToday(){ state.selectedDate=dateKey(new Date()); state.weekOffset=0; state.calendarCursor=monthKey(new Date()); saveState(); renderAll(); }

function renderToday(){
  const el=document.getElementById("todayView");
  if(typeof state.weekOffset!=="number") state.weekOffset=0;
  const dates=weekDates(state.selectedDate,state.weekOffset), p=progress(state.selectedDate), due=dueHabits(state.selectedDate);
  const groups=[...state.groups].sort((a,b)=>a.order-b.order), rangeStart=dates[0], rangeEnd=dates[6];
  const rangeLabel=rangeStart.getMonth()===rangeEnd.getMonth()
    ? new Intl.DateTimeFormat("de-DE",{month:"long",year:"numeric"}).format(rangeStart)
    : `${new Intl.DateTimeFormat("de-DE",{month:"short"}).format(rangeStart)} – ${new Intl.DateTimeFormat("de-DE",{month:"short",year:"numeric"}).format(rangeEnd)}`;
  let html=`<div class="week-nav"><button class="week-arrow" data-week-prev aria-label="Vorherige Woche">‹</button><strong class="week-label">${rangeLabel}</strong><button class="week-arrow" data-week-next aria-label="Nächste Woche">›</button></div>`;
  if(!isCurrentWeek()) html+=`<button class="today-jump" data-go-today>Heute</button>`;
  html+=`<div class="week-strip"><div class="week-row">`;
  dates.forEach(d=>{const k=dateKey(d),today=dateKey(new Date());html+=`<button class="day-btn ${k===today?"today":""} ${k===state.selectedDate?"selected":""}" data-date="${k}"><small>${weekdays[weekdayIndex(d)]}</small><span class="day-number">${d.getDate()}</span></button>`;});
  html+=`</div></div><div class="progress-summary"><div class="ring" style="--p:${p.pct*360}deg"></div><strong>${p.done} / ${p.total}</strong></div>`;
  if(!due.length) html+=`<div class="empty">Für diesen Tag sind keine Gewohnheiten fällig.</div>`;
  groups.forEach(group=>{
    const gh=due.filter(h=>h.groupId===group.id).sort((a,b)=>a.order-b.order); if(!gh.length)return;
    const done=gh.filter(h=>isDone(h.id,state.selectedDate)).length;
    html+=`<section class="group ${group.collapsed?"collapsed":""}" data-group="${group.id}"><button class="group-header" data-toggle-group="${group.id}"><span class="group-title"><span class="chevron">⌄</span>${escapeHtml(group.name)}</span><span class="group-meta">${done}/${gh.length}</span></button><div class="habit-list">`;
    gh.forEach(h=>{html+=`<div class="habit ${isDone(h.id,state.selectedDate)?"done":""}" data-habit="${h.id}">${sortMode?`<button class="drag-handle" data-drag-handle="${h.id}" aria-label="Gewohnheit verschieben">≡</button>`:`<div class="check" data-toggle-habit="${h.id}"></div>`}<div class="habit-main" ${sortMode?"":`data-toggle-habit="${h.id}"`}><div class="habit-name">${escapeHtml(h.name)}</div></div>${sortMode?"":`<div class="habit-actions"><button class="icon-btn" data-edit-habit="${h.id}" title="Bearbeiten" aria-label="Gewohnheit bearbeiten">···</button></div>`}</div>`;});
    html+=`</div></section>`;
  });
  el.innerHTML=html;
  el.querySelectorAll("[data-date]").forEach(b=>b.onclick=()=>{if(sortMode)return;state.selectedDate=b.dataset.date;saveState();renderAll();});
  el.querySelector("[data-week-prev]").onclick=()=>{if(sortMode)return;state.weekOffset--;saveState();renderToday();};
  el.querySelector("[data-week-next]").onclick=()=>{if(sortMode)return;state.weekOffset++;saveState();renderToday();};
  el.querySelector("[data-go-today]")?.addEventListener("click",goToToday);
  const strip=el.querySelector(".week-strip"); let touchStartX=null;
  strip.addEventListener("touchstart",e=>{if(!sortMode)touchStartX=e.changedTouches[0].clientX;},{passive:true});
  strip.addEventListener("touchend",e=>{if(touchStartX===null)return;const dx=e.changedTouches[0].clientX-touchStartX;if(Math.abs(dx)>45){state.weekOffset+=dx<0?1:-1;saveState();renderToday();}touchStartX=null;},{passive:true});
  el.querySelectorAll("[data-toggle-group]").forEach(b=>b.onclick=()=>{if(sortMode)return;const g=state.groups.find(x=>x.id===b.dataset.toggleGroup);g.collapsed=!g.collapsed;saveState();renderToday();});
  el.querySelectorAll("[data-toggle-habit]").forEach(b=>b.onclick=()=>{if(Date.now()<suppressHabitClickUntil||sortMode)return;toggleDone(b.dataset.toggleHabit,state.selectedDate);});
  el.querySelectorAll("[data-edit-habit]").forEach(b=>b.onclick=e=>{e.stopPropagation();openHabitForm(state.habits.find(h=>h.id===b.dataset.editHabit));});
  enableSortModeEntry(el); if(sortMode) enableHandleSorting(el);
}
function normalizeHabitOrders(groupId){state.habits.filter(h=>h.groupId===groupId).sort((a,b)=>a.order-b.order).forEach((h,i)=>h.order=i);}
function enterSortMode(){if(sortMode)return;sortMode=true;suppressHabitClickUntil=Date.now()+1000;document.body.classList.add("sort-mode");document.getElementById("sortDoneButton").hidden=false;document.getElementById("fab").hidden=true;haptic(18);renderToday();}
function exitSortMode(){sortMode=false;document.body.classList.remove("sort-mode");document.getElementById("sortDoneButton").hidden=true;document.getElementById("fab").hidden=false;saveState();renderAll();}
function enableSortModeEntry(root){
  root.querySelectorAll(".habit").forEach(row=>{let timer=null,startX=0,startY=0;
    row.addEventListener("pointerdown",e=>{if(sortMode||e.target.closest("button"))return;startX=e.clientX;startY=e.clientY;row.classList.add("hold-pending");timer=setTimeout(()=>{row.classList.remove("hold-pending");enterSortMode();},900);});
    row.addEventListener("pointermove",e=>{if(timer&&(Math.abs(e.clientX-startX)>10||Math.abs(e.clientY-startY)>10)){clearTimeout(timer);timer=null;row.classList.remove("hold-pending");}});
    ["pointerup","pointercancel"].forEach(type=>row.addEventListener(type,()=>{clearTimeout(timer);timer=null;row.classList.remove("hold-pending");}));
    row.addEventListener("contextmenu",e=>e.preventDefault());
  });
}
function startHabitDrag(handle,clientX,clientY,inputType){
  if(activeHabitDrag||!sortMode)return;
  const row=handle.closest(".habit"),list=row?.parentElement,groupId=row?.closest("[data-group]")?.dataset.group;
  if(!row||!list||!groupId)return;
  const rect=row.getBoundingClientRect(),placeholder=document.createElement("div");
  placeholder.className="habit-placeholder";placeholder.style.height=`${rect.height}px`;
  list.insertBefore(placeholder,row);
  row.classList.add("sorting","drag-floating");
  Object.assign(row.style,{width:`${rect.width}px`,left:`${rect.left}px`,top:`${rect.top}px`,height:`${rect.height}px`});
  document.body.appendChild(row);document.body.classList.add("dragging-habit");
  activeHabitDrag={row,list,placeholder,groupId,offsetY:clientY-rect.top,inputType};
  updateHabitDrag(clientY);haptic(10);
}
function updateHabitDrag(clientY){
  const drag=activeHabitDrag;if(!drag)return;
  const maxTop=Math.max(0,window.innerHeight-drag.row.offsetHeight),top=Math.max(0,Math.min(maxTop,clientY-drag.offsetY));
  drag.row.style.top=`${top}px`;
  const siblings=[...drag.list.querySelectorAll(".habit")];
  const before=siblings.find(node=>{const rect=node.getBoundingClientRect();return clientY<rect.top+rect.height/2;});
  if(before)drag.list.insertBefore(drag.placeholder,before);else drag.list.appendChild(drag.placeholder);
  const edge=88;if(clientY<edge)window.scrollBy(0,-10);else if(clientY>window.innerHeight-edge)window.scrollBy(0,10);
}
function finishHabitDrag(){
  const drag=activeHabitDrag;if(!drag)return;
  drag.list.insertBefore(drag.row,drag.placeholder);drag.placeholder.remove();
  drag.row.classList.remove("sorting","drag-floating");drag.row.removeAttribute("style");
  [...drag.list.querySelectorAll(".habit")].forEach((node,i)=>{const habit=state.habits.find(x=>x.id===node.dataset.habit);if(habit)habit.order=i;});
  normalizeHabitOrders(drag.groupId);document.body.classList.remove("dragging-habit");activeHabitDrag=null;saveState();
}
function enableHandleSorting(root){
  root.querySelectorAll("[data-drag-handle]").forEach(handle=>{
    handle.addEventListener("touchstart",e=>{const touch=e.touches[0];if(!touch)return;e.preventDefault();e.stopPropagation();ignoreMouseDragUntil=Date.now()+900;startHabitDrag(handle,touch.clientX,touch.clientY,"touch");},{passive:false});
    handle.addEventListener("mousedown",e=>{if(e.button!==0||Date.now()<ignoreMouseDragUntil)return;e.preventDefault();e.stopPropagation();startHabitDrag(handle,e.clientX,e.clientY,"mouse");});
    handle.addEventListener("keydown",e=>{if(!["ArrowUp","ArrowDown"].includes(e.key))return;e.preventDefault();const row=handle.closest(".habit"),list=row.parentElement,target=e.key==="ArrowUp"?row.previousElementSibling:row.nextElementSibling;if(!target?.classList.contains("habit"))return;if(e.key==="ArrowUp")list.insertBefore(row,target);else list.insertBefore(target,row);[...list.querySelectorAll(".habit")].forEach((node,i)=>{const habit=state.habits.find(x=>x.id===node.dataset.habit);if(habit)habit.order=i;});saveState();renderToday();});
  });
}
document.addEventListener("touchmove",e=>{if(!activeHabitDrag||activeHabitDrag.inputType!=="touch")return;const touch=e.touches[0];if(!touch)return;e.preventDefault();updateHabitDrag(touch.clientY);},{passive:false});
document.addEventListener("touchend",()=>{if(activeHabitDrag?.inputType==="touch")finishHabitDrag();},{passive:false});
document.addEventListener("touchcancel",()=>{if(activeHabitDrag?.inputType==="touch")finishHabitDrag();},{passive:false});
document.addEventListener("mousemove",e=>{if(activeHabitDrag?.inputType!=="mouse")return;e.preventDefault();updateHabitDrag(e.clientY);});
document.addEventListener("mouseup",()=>{if(activeHabitDrag?.inputType==="mouse")finishHabitDrag();});

function renderCalendar(){
  const el=document.getElementById("calendarView"),[y,m]=state.calendarCursor.split("-").map(Number),first=new Date(y,m-1,1),last=new Date(y,m,0),offset=weekdayIndex(first),monthName=new Intl.DateTimeFormat("de-DE",{month:"long",year:"numeric"}).format(first);
  let html=`<h1 class="page-title">Kalender</h1><div class="calendar-header"><button data-cal-prev>‹</button><strong>${monthName}</strong><button data-cal-next>›</button></div><div class="calendar-grid">${weekdays.map(w=>`<div class="calendar-weekday">${w}</div>`).join("")}`;
  for(let i=0;i<offset;i++)html+=`<div></div>`;
  for(let d=1;d<=last.getDate();d++){const dt=new Date(y,m-1,d),k=dateKey(dt),p=progress(k),future=k>dateKey(new Date()),deg=p.total?p.pct*360:0;html+=`<button class="calendar-day ${future?"future":""}" data-cal-day="${k}">${p.total?`<span class="mini-ring" style="--p:${deg}deg"></span>`:""}<span class="num">${d}</span></button>`;}
  html+=`</div>`;el.innerHTML=html;el.querySelector("[data-cal-prev]").onclick=()=>shiftMonth(-1);el.querySelector("[data-cal-next]").onclick=()=>shiftMonth(1);el.querySelectorAll("[data-cal-day]").forEach(b=>b.onclick=()=>openDayDetails(b.dataset.calDay));
}
function shiftMonth(delta){const[y,m]=state.calendarCursor.split("-").map(Number),d=new Date(y,m-1+delta,1);state.calendarCursor=monthKey(d);saveState();renderCalendar();}
function openDayDetails(k){const due=dueHabits(k),p=progress(k),dateLabel=new Intl.DateTimeFormat("de-DE",{weekday:"long",day:"numeric",month:"long",year:"numeric"}).format(parseKey(k));let html=`<h2>${dateLabel}</h2><p><strong>${p.done} / ${p.total}</strong> erledigt</p>`;html+=due.length?`<div class="habit-list">${due.map(h=>`<div class="habit ${isDone(h.id,k)?"done":""}"><div class="check"></div><div class="habit-main">${escapeHtml(h.name)}</div></div>`).join("")}</div>`:`<p class="empty">Keine Gewohnheiten fällig.</p>`;document.getElementById("dayDialogContent").innerHTML=html;document.getElementById("dayDialog").showModal();}

function renderSettings(){
  const el=document.getElementById("settingsView"),hapticSupported=typeof navigator.vibrate==="function";if(typeof state.haptics!=="boolean")state.haptics=false;
  el.innerHTML=`<h1 class="page-title">Einstellungen</h1><section class="settings-card display-settings"><strong>Darstellung</strong><div class="segmented">${["system","light","dark"].map(v=>`<button data-theme-choice="${v}" class="${state.theme===v?"active":""}">${{system:"System",light:"Hell",dark:"Dunkel"}[v]}</button>`).join("")}</div></section><section class="settings-card"><strong>Feedback</strong><label class="switch-row ${hapticSupported?"":"unsupported"}"><span><span class="setting-name">Kurzes Vibrieren</span><small>${hapticSupported?"Beim Abschließen einer Gewohnheit":"Auf diesem Gerät nicht unterstützt"}</small></span><input type="checkbox" data-haptics ${state.haptics?"checked":""} ${hapticSupported?"":"disabled"}><span class="switch"></span></label></section><section class="settings-card"><strong>Datensicherung</strong><button class="settings-button" data-export>Daten exportieren</button><button class="settings-button" data-import>Daten importieren</button><input id="importFile" type="file" accept="application/json" hidden></section><section class="settings-card"><strong>Verwaltung</strong><button class="settings-button" data-sort>Reihenfolge bearbeiten</button><button class="settings-button" data-manage-groups>Gruppen bearbeiten</button><button class="settings-button danger-text" data-reset>Alle Daten zurücksetzen</button></section><section class="settings-card version-card"><strong>App-Version</strong><p class="version-label">Routine 0.4.1</p></section>`;
  el.querySelectorAll("[data-theme-choice]").forEach(b=>b.onclick=()=>{state.theme=b.dataset.themeChoice;saveState();applyTheme();renderSettings();});
  const hapticToggle=el.querySelector("[data-haptics]");hapticToggle.onchange=()=>{state.haptics=hapticToggle.checked;saveState();if(state.haptics)haptic(18);};
  el.querySelector("[data-export]").onclick=exportData;el.querySelector("[data-import]").onclick=()=>el.querySelector("#importFile").click();el.querySelector("#importFile").onchange=importData;
  el.querySelector("[data-reset]").onclick=()=>{if(confirm("Wirklich alle Daten löschen?")){localStorage.removeItem(STORAGE_KEY);state=structuredClone(defaultState);saveState();renderAll();}};
  el.querySelector("[data-manage-groups]").onclick=manageGroups;
  el.querySelector("[data-sort]").onclick=()=>{activeView="todayView";document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t.dataset.view==="todayView"));document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id==="todayView"));enterSortMode();};
}
function manageGroups(){const ordered=[...state.groups].sort((a,b)=>a.order-b.order),names=ordered.map((g,i)=>`${i+1}. ${g.name}`).join("\n"),choice=prompt(`Gruppen:\n${names}\n\nGib die Nummer der Gruppe ein, die du bearbeiten möchtest.`),idx=Number(choice)-1;if(idx>=0&&idx<ordered.length)openGroupForm(ordered[idx]);}
function exportData(){const blob=new Blob([JSON.stringify(state,null,2)],{type:"application/json"}),a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`routine-backup-${dateKey(new Date())}.json`;a.click();URL.revokeObjectURL(a.href);}
function importData(e){const file=e.target.files[0];if(!file)return;const r=new FileReader();r.onload=()=>{try{state=JSON.parse(r.result);saveState();applyTheme();renderAll();alert("Import erfolgreich.");}catch{alert("Ungültige Sicherungsdatei.");}};r.readAsText(file);}
function deleteHabit(id){const habit=state.habits.find(h=>h.id===id);if(!habit||!confirm(`Gewohnheit „${habit.name}“ wirklich löschen?`))return;state.habits=state.habits.filter(h=>h.id!==id);Object.keys(state.completions).filter(k=>k.startsWith(`${id}:`)).forEach(k=>delete state.completions[k]);normalizeHabitOrders(habit.groupId);saveState();document.getElementById("formDialog").close();renderAll();}
function deleteGroup(id){const group=state.groups.find(g=>g.id===id);if(!group)return;const count=state.habits.filter(h=>h.groupId===id).length,message=count?`Gruppe „${group.name}“ und ihre ${count} Gewohnheit${count===1?"":"en"} wirklich löschen?`:`Gruppe „${group.name}“ wirklich löschen?`;if(!confirm(message))return;const habitIds=new Set(state.habits.filter(h=>h.groupId===id).map(h=>h.id));state.habits=state.habits.filter(h=>h.groupId!==id);state.groups=state.groups.filter(g=>g.id!==id);Object.keys(state.completions).filter(k=>habitIds.has(k.split(":")[0])).forEach(k=>delete state.completions[k]);state.groups.sort((a,b)=>a.order-b.order).forEach((g,i)=>g.order=i);saveState();document.getElementById("formDialog").close();renderAll();}
function openActionSheet(){document.getElementById("actionSheet").showModal();}
function populateGroups(selected){const sel=document.getElementById("groupSelect");sel.innerHTML=[...state.groups].sort((a,b)=>a.order-b.order).map(g=>`<option value="${g.id}" ${g.id===selected?"selected":""}>${escapeHtml(g.name)}</option>`).join("");}
function openHabitForm(habit=null){if(!state.groups.length){alert("Erstelle zuerst eine Gruppe.");return;}document.getElementById("formTitle").textContent=habit?"Gewohnheit bearbeiten":"Neue Gewohnheit";document.getElementById("entityType").value="habit";document.getElementById("entityId").value=habit?.id||"";document.getElementById("nameInput").value=habit?.name||"";populateGroups(habit?.groupId||state.groups[0].id);document.getElementById("frequencySelect").value=habit?.frequency||"daily";document.getElementById("monthDayInput").value=habit?.monthDay||1;renderWeekdayPicker(habit?.weekdays||[0]);document.getElementById("habitFields").style.display="block";const btn=document.getElementById("deleteEntityButton");btn.hidden=!habit;btn.textContent="Gewohnheit löschen";btn.onclick=()=>deleteHabit(habit.id);updateFrequencyFields();document.getElementById("formDialog").showModal();}
function openGroupForm(group=null){document.getElementById("formTitle").textContent=group?"Gruppe bearbeiten":"Neue Gruppe";document.getElementById("entityType").value="group";document.getElementById("entityId").value=group?.id||"";document.getElementById("nameInput").value=group?.name||"";document.getElementById("habitFields").style.display="none";const btn=document.getElementById("deleteEntityButton");btn.hidden=!group;btn.textContent="Gruppe löschen";btn.onclick=()=>deleteGroup(group.id);document.getElementById("formDialog").showModal();}
function renderWeekdayPicker(selected){const box=document.getElementById("weekdayPicker");box.innerHTML=weekdays.map((w,i)=>`<button type="button" data-weekday="${i}" class="${selected.includes(i)?"active":""}">${w}</button>`).join("");box.querySelectorAll("button").forEach(b=>b.onclick=()=>b.classList.toggle("active"));}
function updateFrequencyFields(){const f=document.getElementById("frequencySelect").value;document.getElementById("weeklyFields").style.display=f==="weekly"?"block":"none";document.getElementById("monthlyFields").style.display=f==="monthly"?"block":"none";}
document.getElementById("frequencySelect").addEventListener("change",updateFrequencyFields);
document.getElementById("cancelFormButton").addEventListener("click",()=>{document.getElementById("entityForm").reset();document.getElementById("formDialog").close();});
document.getElementById("entityForm").addEventListener("submit",e=>{e.preventDefault();const type=document.getElementById("entityType").value,id=document.getElementById("entityId").value,name=document.getElementById("nameInput").value.trim();if(!name)return;if(type==="group"){if(id)state.groups.find(g=>g.id===id).name=name;else state.groups.push({id:crypto.randomUUID(),name,order:state.groups.length,collapsed:false});}else{const old=state.habits.find(h=>h.id===id),data={name,groupId:document.getElementById("groupSelect").value,frequency:document.getElementById("frequencySelect").value,weekdays:[...document.querySelectorAll("#weekdayPicker button.active")].map(b=>Number(b.dataset.weekday)),monthDay:Number(document.getElementById("monthDayInput").value||1)};if(data.frequency==="weekly"&&data.weekdays.length===0){alert("Wähle mindestens einen Wochentag.");return;}if(id){const oldGroup=old.groupId;Object.assign(old,data);if(oldGroup!==data.groupId){normalizeHabitOrders(oldGroup);old.order=state.habits.filter(h=>h.groupId===data.groupId&&h.id!==id).length;}}else state.habits.push({id:crypto.randomUUID(),...data,createdAt:dateKey(new Date()),order:state.habits.filter(h=>h.groupId===data.groupId).length});}saveState();document.getElementById("formDialog").close();renderAll();});
document.getElementById("fab").onclick=openActionSheet;
document.getElementById("sortDoneButton").onclick=exitSortMode;
document.getElementById("actionSheet").addEventListener("click",e=>{const a=e.target.dataset.action;if(!a)return;document.getElementById("actionSheet").close();if(a==="newHabit")openHabitForm();if(a==="newGroup")openGroupForm();});
document.querySelectorAll(".tab").forEach(tab=>tab.onclick=()=>{if(sortMode)exitSortMode();activeView=tab.dataset.view;document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active",t===tab));document.querySelectorAll(".view").forEach(v=>v.classList.toggle("active",v.id===activeView));document.getElementById("fab").style.display=activeView==="settingsView"?"none":"block";});
function escapeHtml(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));}
function renderAll(){if(!state.calendarCursor)state.calendarCursor=monthKey(new Date());if(typeof state.weekOffset!=="number")state.weekOffset=0;if(typeof state.haptics!=="boolean")state.haptics=false;applyTheme();renderToday();renderCalendar();renderSettings();}
renderAll();document.addEventListener("dblclick",e=>e.preventDefault(),{passive:false});if("serviceWorker" in navigator)navigator.serviceWorker.register("sw.js?v=4.1");
