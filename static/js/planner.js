/* ───────────── constants ───────────── */
const MONTH_NAMES  = ["СІЧЕНЬ","ЛЮТИЙ","БЕРЕЗЕНЬ","КВІТЕНЬ","ТРАВЕНЬ","ЧЕРВЕНЬ","ЛИПЕНЬ","СЕРПЕНЬ","ВЕРЕСЕНЬ","ЖОВТЕНЬ","ЛИСТОПАД","ГРУДЕНЬ"];
const WEEKDAY_NAMES = ["неділя","понеділок","вівторок","середа","четвер","п'ятниця","субота"];
const THEME_COLORS  = ['#1B2027','#141B2D','#1A2421','#231C1C','#1E1A28','#F4F0E6','#E8ECF0'];
const ITEM_COLORS   = ['#D4A94F','#4F8F82','#C1666B','#6B8FC1','#9B7EC8','#E07B54','#7EC1B8'];

/* ───────────── state ───────────── */
const today = new Date();
let viewYear  = today.getFullYear();
let viewMonth = today.getMonth();
let monthCache      = {};
let selectedDateKey = null;
let saveThemeTimer  = null;
let saveDataTimer   = null;
let saveStatusTimer = null;
let dragState       = null;
let justDropped     = false;
let currentThemeBg  = THEME_COLORS[0];
let colorPopCtx     = null;
let swipeStartX     = null;
let swipeStartY     = null;
let popOpenedAt     = 0;
let mobileViewMode  = 'week';
let viewWeekAnchor  = null;
let reassignState   = null;

function isMobile(){ return window.matchMedia('(max-width:768px)').matches; }

function getMonday(y, m, d){
  const date = new Date(y, m, d);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  date.setHours(0, 0, 0, 0);
  return date;
}

function syncWeekAnchor(){
  const anchorDay = selectedDateKey?.d || (
    viewYear === today.getFullYear() && viewMonth === today.getMonth()
      ? today.getDate() : 1
  );
  viewWeekAnchor = getMonday(viewYear, viewMonth, anchorDay);
}

function isWeekView(){
  return isMobile() && mobileViewMode === 'week';
}

function formatWeekTitle(start){
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  const sy = start.getFullYear();
  const ey = end.getFullYear();
  const sm = start.getMonth();
  const em = end.getMonth();
  if(sm === em && sy === ey){
    return start.getDate() + '–' + end.getDate() + ' ' + MONTH_NAMES[sm].toLowerCase() +
      ' <span class="year">' + sy + '</span>';
  }
  if(sy === ey){
    return start.getDate() + ' ' + MONTH_NAMES[sm].toLowerCase() + ' – ' +
      end.getDate() + ' ' + MONTH_NAMES[em].toLowerCase() +
      ' <span class="year">' + sy + '</span>';
  }
  return start.getDate() + '.' + pad(sm + 1) + '.' + sy + ' – ' +
    end.getDate() + '.' + pad(em + 1) + '.' + ey;
}

function updateViewToggle(){
  const toggle = document.getElementById('viewToggle');
  if(!toggle) return;
  toggle.style.display = isMobile() ? 'flex' : 'none';
  toggle.querySelectorAll('.view-btn').forEach(btn=>{
    btn.classList.toggle('active', btn.dataset.view === mobileViewMode);
  });
}

function setMobileViewMode(mode){
  if(!isMobile()) return;
  if(mobileViewMode === mode) return;
  if(reassignState) cancelReassign();
  if(mode === 'week'){
    syncWeekAnchor();
  } else if(viewWeekAnchor){
    viewYear = viewWeekAnchor.getFullYear();
    viewMonth = viewWeekAnchor.getMonth();
  }
  mobileViewMode = mode;
  updateViewToggle();
  renderCalendar();
}

function startReassign(fromKey, itemId, itemText){
  reassignState = { fromKey, itemId, itemText };
  closePanel();
  updateReassignBar();
  renderCalendar();
}

function cancelReassign(){
  reassignState = null;
  updateReassignBar();
  renderCalendar();
}

function updateReassignBar(){
  const bar = document.getElementById('reassignBar');
  const text = document.getElementById('reassignText');
  const app = document.querySelector('.app');
  if(!reassignState){
    bar?.classList.remove('open');
    app?.classList.remove('reassign-mode');
    return;
  }
  bar?.classList.add('open');
  app?.classList.add('reassign-mode');
  if(text) text.textContent = 'Оберіть день для «' + reassignState.itemText + '»';
}

function handleReassignClick(cellDate){
  if(!reassignState) return false;
  const sameDay = reassignState.fromKey.y === cellDate.y &&
    reassignState.fromKey.m === cellDate.m &&
    reassignState.fromKey.d === cellDate.d;
  if(!sameDay) moveItem(reassignState.fromKey, cellDate, reassignState.itemId);
  reassignState = null;
  updateReassignBar();
  renderCalendar();
  return true;
}

function cellDateFromEl(cell){
  if(!cell) return null;
  const y=+cell.dataset.y, m=+cell.dataset.m, d=+cell.dataset.d;
  if(Number.isNaN(y)) return null;
  return {y,m,d};
}

function createCalendarCell(cellDate, isOutside){
  const {y:cy, m:cm, d:dayNum} = cellDate;
  const cell=document.createElement('div');
  cell.className='cell'+(isOutside?' outside':'');
  cell.dataset.y=cy; cell.dataset.m=cm; cell.dataset.d=dayNum;
  if(cy===today.getFullYear()&&cm===today.getMonth()&&dayNum===today.getDate())
    cell.className+=' today';
  if(reassignState && isMobile()) cell.classList.add('reassign-target');

  const num=document.createElement('div');
  num.className='datenum'; num.textContent=dayNum;
  cell.appendChild(num);

  const wrap=document.createElement('div');
  wrap.className='cell-items';
  getDayData(cy,cm,dayNum).items.forEach(item=>{
    const block=document.createElement('div');
    block.className='cell-item'+(item.done?' done':'');
    block.textContent=item.text;
    block.style.background=item.color||ITEM_COLORS[0];
    block.style.color=textOnBg(item.color||ITEM_COLORS[0]);
    block.title=item.text;
    block.addEventListener('click',e=>e.stopPropagation());
    if(!isMobile()){
      block.draggable=true;
      block.addEventListener('dragstart',e=>{
        dragState={fromKey:cellDate,itemId:item.id};
        block.classList.add('dragging');
        e.dataTransfer.effectAllowed='move';
        e.dataTransfer.setData('text/plain',item.id);
      });
      block.addEventListener('dragend',()=>{
        block.classList.remove('dragging');
        clearDropTargets();
        if(dragState) dragState=null;
      });
    }
    wrap.appendChild(block);
  });
  cell.appendChild(wrap);

  cell.addEventListener('click',()=>{
    if(reassignState && isMobile()){
      handleReassignClick(cellDate);
      return;
    }
    if(!justDropped && !dragState) openPanel(cy,cm,dayNum);
  });
  if(!isMobile()) setupCellDrop(cell, cellDate);
  return cell;
}

/* iOS: click інколи не спрацьовує після touch — дублюємо через touchend */
function bindTap(el, handler){
  if(!el) return;
  let touched = false;
  el.addEventListener('touchstart', ()=>{ touched = true; }, {passive:true});
  el.addEventListener('touchend', e=>{
    if(!touched) return;
    touched = false;
    e.preventDefault();
    handler(e);
  });
  el.addEventListener('click', e=>{
    if(touched){ touched = false; return; }
    handler(e);
  });
}

function reportHeight(){
  const h = Math.max(
    document.documentElement.scrollHeight,
    document.documentElement.clientHeight,
    window.innerHeight
  );
  try { window.parent.postMessage({type:'planner-resize', height:h}, '*'); } catch(e){}
}

/* ───────────── utils ───────────── */
function pad(n){ return n<10?'0'+n:''+n; }
function monthKey(y,m){ return y+'-'+pad(m+1); }
function dayKey(d){ return pad(d); }
function uid(){ return crypto.randomUUID?crypto.randomUUID():'id'+Math.random().toString(36).slice(2); }

function hexToRgb(hex){
  const h = hex.replace('#','');
  const n = parseInt(h.length===3?h.split('').map(c=>c+c).join(''):h, 16);
  return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}
function rgbToHex(r,g,b){
  return '#'+[r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function mixHex(a,b,t){
  const c1=hexToRgb(a), c2=hexToRgb(b);
  return rgbToHex(c1.r+(c2.r-c1.r)*t, c1.g+(c2.g-c1.g)*t, c1.b+(c2.b-c1.b)*t);
}
function luminance(hex){
  const {r,g,b}=hexToRgb(hex);
  return [r,g,b].map(v=>{ v/=255; return v<=.03928?v/12.92:Math.pow((v+.055)/1.055,2.4); })
    .reduce((acc,v,i)=>acc+v*[.2126,.7152,.0722][i],0);
}
function textOnBg(hex){ return luminance(hex)>.4?'#1B2027':'#FFFFFF'; }
function isValidHex(hex){
  return typeof hex==='string' && /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(hex);
}

/* ───────────── theme ───────────── */
function applyBgTheme(bg){
  if(!isValidHex(bg)) bg = THEME_COLORS[0];
  currentThemeBg = bg;
  const dark = luminance(bg) < .4;
  const mix  = dark ? '#FFFFFF' : '#000000';
  const f    = dark ? [.06,.11,.20] : [.04,.07,.14];

  document.documentElement.style.setProperty('--bg',       bg);
  document.documentElement.style.setProperty('--panel',    mixHex(bg,mix,f[0]));
  document.documentElement.style.setProperty('--panel-2',  mixHex(bg,mix,f[1]));
  document.documentElement.style.setProperty('--line',     mixHex(bg,mix,f[2]));
  document.documentElement.style.setProperty('--ink',      dark?'#ECE7DA':'#1B2027');
  document.documentElement.style.setProperty('--muted',    dark?'#8B93A0':'#5A6270');
  document.documentElement.style.setProperty('--accent',   dark?'#D4A94F':'#9A7220');
  const {r,g,b} = hexToRgb(dark?'#D4A94F':'#9A7220');
  document.documentElement.style.setProperty('--accent-dim',`rgba(${r},${g},${b},.18)`);

  const dot = document.getElementById('themeBtnDot');
  if(dot) dot.style.background = bg;

  document.querySelectorAll('#themePopSwatches .swatch[data-color]').forEach(el=>{
    el.classList.toggle('active', el.dataset.color.toLowerCase()===bg.toLowerCase());
  });
  const custom = document.getElementById('themeCustomInput');
  if(custom){
    const isCustom = !THEME_COLORS.some(c=>c.toLowerCase()===bg.toLowerCase());
    custom.closest('.swatch').classList.toggle('active', isCustom);
    custom.value = bg;
  }
}

function buildThemePop(){
  const wrap = document.getElementById('themePopSwatches');
  if(!wrap) return;
  wrap.innerHTML = '';
  THEME_COLORS.forEach(color=>{
    const btn = document.createElement('button');
    btn.type='button'; btn.className='swatch'; btn.style.background=color;
    btn.dataset.color=color; btn.title=color;
    btn.addEventListener('click', e=>{
      e.stopPropagation();
      pickTheme(color);
      closeThemePop();
    });
    wrap.appendChild(btn);
  });
  const lbl = document.createElement('label');
  lbl.className='swatch swatch-custom'; lbl.title='Свій колір';
  const inp = document.createElement('input');
  inp.type='color'; inp.id='themeCustomInput'; inp.value=currentThemeBg;
  inp.addEventListener('input', e=>{ e.stopPropagation(); applyBgTheme(e.target.value); });
  inp.addEventListener('change', e=>{ e.stopPropagation(); pickTheme(e.target.value); });
  lbl.appendChild(inp);
  wrap.appendChild(lbl);
}

function positionPop(pop, anchor){
  const rect = anchor.getBoundingClientRect();
  pop.classList.add('open');
  popOpenedAt = Date.now();
  const popH = pop.offsetHeight || 110;

  if(isMobile()){
    pop.style.left = '50%';
    pop.style.transform = 'translateX(-50%)';
    if(rect.bottom + popH + 16 < window.innerHeight){
      pop.style.top = (rect.bottom + 8) + 'px';
      pop.style.bottom = 'auto';
    } else {
      pop.style.top = 'auto';
      pop.style.bottom = Math.max(16, window.innerHeight - rect.top + 8) + 'px';
    }
    return;
  }

  const popW = pop.offsetWidth || 184;
  let left = rect.right - popW;
  let top = rect.bottom + 8;
  if(left < 8) left = 8;
  if(left + popW > window.innerWidth - 8) left = window.innerWidth - popW - 8;
  if(top + popH > window.innerHeight - 8) top = rect.top - popH - 8;
  pop.style.left = left + 'px';
  pop.style.top = top + 'px';
  pop.style.bottom = 'auto';
  pop.style.transform = '';
}

function openThemePop(){
  closeColorPop();
  const pop = document.getElementById('themePop');
  const btn = document.getElementById('themeBtn');
  buildThemePop();
  applyBgTheme(currentThemeBg);
  positionPop(pop, btn);
  btn.classList.add('open');
}

function closeThemePop(){
  document.getElementById('themePop')?.classList.remove('open');
  document.getElementById('themeBtn')?.classList.remove('open');
}

function toggleThemePop(){
  const pop = document.getElementById('themePop');
  if(pop.classList.contains('open')) closeThemePop();
  else openThemePop();
}

function pickTheme(bg){
  applyBgTheme(bg);
  PlannerStorage.setThemeBg(bg);
  flashSaveStatus();
}

function loadTheme(){
  let bg = PlannerStorage.getThemeBg();
  if(!isValidHex(bg)) bg = THEME_COLORS[0];
  currentThemeBg = bg;
  applyBgTheme(bg);
  buildThemePop();
}

/* ───────────── save helpers ───────────── */
function flashSaveStatus(){
  const el = document.getElementById('saveStatus');
  el.classList.add('show');
  clearTimeout(saveStatusTimer);
  saveStatusTimer = setTimeout(()=>el.classList.remove('show'), 1500);
}
function scheduleSaveMonth(y,m){
  clearTimeout(saveDataTimer);
  saveDataTimer = setTimeout(()=>{ saveMonth(y,m); flashSaveStatus(); }, 300);
}

/* ───────────── data ───────────── */
function loadMonth(y,m){
  const key=monthKey(y,m);
  if(monthCache[key]) return monthCache[key];
  const stored = PlannerStorage.getMonth(key);
  monthCache[key] = migrateMonthData(stored || {});
  return monthCache[key];
}
function saveMonth(y,m){
  const key=monthKey(y,m);
  PlannerStorage.setMonth(key, monthCache[key]||{});
}
function migrateMonthData(data){
  const out={};
  for(const dk of Object.keys(data)){
    const day=data[dk];
    if(day.items){ out[dk]=day; continue; }
    const items=[];
    (day.tasks||[]).forEach(t=>items.push({
      id:t.id||uid(), text:t.text, done:!!t.done,
      color:t.color||ITEM_COLORS[items.length%ITEM_COLORS.length]
    }));
    out[dk]={items};
  }
  return out;
}
function getDayData(y,m,d){
  const key=monthKey(y,m);
  if(!monthCache[key]) loadMonth(y,m);
  const md=monthCache[key];
  const dk=dayKey(d);
  if(!md[dk]) md[dk]={items:[]};
  if(!md[dk].items) md[dk]=migrateMonthData({[dk]:md[dk]})[dk];
  return md[dk];
}

/* ───────────── drag / move ───────────── */
function moveItem(fromKey,toKey,itemId,insertIdx){
  const fromDay=getDayData(fromKey.y,fromKey.m,fromKey.d);
  const idx=fromDay.items.findIndex(i=>i.id===itemId);
  if(idx<0) return;
  const [item]=fromDay.items.splice(idx,1);

  if(fromKey.y===toKey.y && fromKey.m===toKey.m && fromKey.d===toKey.d){
    fromDay.items.splice(Math.min(insertIdx??fromDay.items.length, fromDay.items.length),0,item);
    scheduleSaveMonth(fromKey.y,fromKey.m);
    return;
  }
  const toDay=getDayData(toKey.y,toKey.m,toKey.d);
  toDay.items.splice(Math.min(insertIdx??toDay.items.length, toDay.items.length),0,item);
  scheduleSaveMonth(fromKey.y,fromKey.m);
  if(monthKey(fromKey.y,fromKey.m)!==monthKey(toKey.y,toKey.m))
    scheduleSaveMonth(toKey.y,toKey.m);
}

function setupCellDrop(cell,cellDate){
  cell.addEventListener('dragover',e=>{
    if(!dragState) return;
    e.preventDefault(); e.dataTransfer.dropEffect='move';
    cell.classList.add('drop-target');
  });
  cell.addEventListener('dragleave',e=>{
    if(!cell.contains(e.relatedTarget)) cell.classList.remove('drop-target');
  });
  cell.addEventListener('drop',e=>{
    e.preventDefault(); cell.classList.remove('drop-target');
    if(!dragState) return;
    moveItem(dragState.fromKey, cellDate, dragState.itemId);
    dragState=null; justDropped=true;
    setTimeout(()=>{ justDropped=false; },150);
    renderCalendar();
    if(selectedDateKey) renderPanelContent();
  });
}

/* ───────────── color popover ───────────── */
function openColorPop(dotEl, item, y, m, d){
  closeThemePop();
  colorPopCtx = {item, y, m, d, dotEl};
  const pop    = document.getElementById('colorPop');
  const swWrap = document.getElementById('colorPopSwatches');
  swWrap.innerHTML='';

  ITEM_COLORS.forEach(color=>{
    const btn=document.createElement('button');
    btn.type='button'; btn.className='swatch'; btn.style.background=color;
    btn.dataset.color=color;
    btn.classList.toggle('active', color===item.color);
    btn.addEventListener('click',e=>{ e.stopPropagation(); applyItemColor(color); });
    swWrap.appendChild(btn);
  });
  const lbl=document.createElement('label');
  lbl.className='swatch swatch-custom'; lbl.title='Свій колір';
  const inp=document.createElement('input');
  inp.type='color'; inp.value=item.color||ITEM_COLORS[0];
  inp.addEventListener('input', e=>{ e.stopPropagation(); applyItemColor(e.target.value); });
  inp.addEventListener('change',e=>{ e.stopPropagation(); applyItemColor(e.target.value); });
  lbl.appendChild(inp); swWrap.appendChild(lbl);

  positionPop(pop, dotEl);
}

function applyItemColor(color){
  if(!colorPopCtx) return;
  const {item, y, m, d, dotEl} = colorPopCtx;
  item.color = color;
  dotEl.style.background = color;
  const row = dotEl.closest('.item-row');
  if(row) row.style.borderLeftColor=color;
  document.querySelectorAll('#colorPopSwatches .swatch[data-color]').forEach(s=>{
    s.classList.toggle('active', s.dataset.color===color);
  });
  scheduleSaveMonth(y,m);
  renderCalendar();
}

function closeColorPop(){
  document.getElementById('colorPop')?.classList.remove('open');
  colorPopCtx=null;
}

/* ───────────── drag helpers ───────────── */
function clearDropTargets(){
  document.querySelectorAll('.drop-target').forEach(n=>n.classList.remove('drop-target'));
}

/* ───────────── calendar render ───────────── */
function renderWeekGrid(grid){
  syncWeekAnchor();
  for(let i=0; i<7; i++){
    const d = new Date(viewWeekAnchor);
    d.setDate(d.getDate() + i);
    loadMonth(d.getFullYear(), d.getMonth());
  }
  grid.classList.add('week-view');
  grid.style.setProperty('--weeks', 1);

  for(let i=0; i<7; i++){
    const d = new Date(viewWeekAnchor);
    d.setDate(d.getDate() + i);
    const cy = d.getFullYear();
    const cm = d.getMonth();
    const dayNum = d.getDate();
    const isOutside = cm !== viewMonth;
    grid.appendChild(createCalendarCell({y:cy, m:cm, d:dayNum}, isOutside));
  }
}

function renderMonthGrid(grid){
  grid.classList.remove('week-view');
  const firstWeekday=(new Date(viewYear,viewMonth,1).getDay()+6)%7;
  const daysInMonth =new Date(viewYear,viewMonth+1,0).getDate();
  const daysInPrev  =new Date(viewYear,viewMonth, 0).getDate();
  const totalCells  =Math.ceil((firstWeekday+daysInMonth)/7)*7;
  grid.style.setProperty('--weeks',totalCells/7);

  for(let i=0;i<totalCells;i++){
    let dayNum, isOutside=false, cy=viewYear, cm=viewMonth;
    if(i<firstWeekday){
      dayNum=daysInPrev-(firstWeekday-i-1); isOutside=true;
      cm=viewMonth-1; if(cm<0){cm=11;cy=viewYear-1;}
    } else if(i>=firstWeekday+daysInMonth){
      dayNum=i-(firstWeekday+daysInMonth)+1; isOutside=true;
      cm=viewMonth+1; if(cm>11){cm=0;cy=viewYear+1;}
    } else {
      dayNum=i-firstWeekday+1;
    }
    grid.appendChild(createCalendarCell({y:cy,m:cm,d:dayNum}, isOutside));
  }
}

function renderCalendar(){
  updateViewToggle();
  if(isWeekView()) syncWeekAnchor();

  loadMonth(viewYear, viewMonth);
  const titleEl = document.getElementById('monthTitle');
  if(isWeekView()){
    titleEl.innerHTML = formatWeekTitle(viewWeekAnchor);
  } else {
    titleEl.innerHTML = MONTH_NAMES[viewMonth]+' <span class="year">'+viewYear+'</span>';
  }

  const grid=document.getElementById('grid');
  grid.innerHTML='';
  if(isWeekView()) renderWeekGrid(grid);
  else renderMonthGrid(grid);
  reportHeight();
}

/* ───────────── side panel ───────────── */
function openPanel(y,m,d){
  loadMonth(y,m);
  selectedDateKey={y,m,d};
  const dateObj=new Date(y,m,d);
  document.getElementById('panelDate').textContent=d+' '+MONTH_NAMES[m].toLowerCase()+' '+y;
  document.getElementById('panelWeekday').textContent=WEEKDAY_NAMES[dateObj.getDay()];
  document.querySelector('.panel-hint').textContent = isMobile()
    ? 'Натисни текст запису, щоб редагувати. ↗ — перенести на інший день. Свайп — змінити ' +
      (isWeekView() ? 'тиждень' : 'місяць') + '.'
    : 'Натисни текст запису, щоб редагувати. Перетягни блок на потрібний день у календарі.';
  renderPanelContent();
  document.getElementById('overlay').classList.add('open');
  reportHeight();
}

function renderPanelContent(){
  if(!selectedDateKey) return;
  const {y,m,d}=selectedDateKey;
  const dd=getDayData(y,m,d);
  const list=document.getElementById('itemList');
  list.innerHTML='';
  if(!dd.items.length){
    const n=document.createElement('div');
    n.className='empty-note'; n.textContent='Записів на цей день ще немає.';
    list.appendChild(n); return;
  }
  dd.items.forEach((item,i)=>list.appendChild(createItemRow(item,i,y,m,d)));
}

function startItemTextEdit(item, textEl, y, m, d){
  if(textEl.closest('.item-list')?.querySelector('.item-text-input')) return;
  const original = item.text;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'item-text-input';
  input.value = original;
  input.setAttribute('autocomplete', 'off');
  textEl.replaceWith(input);
  input.focus();
  input.select();

  let finished = false;
  function finish(save){
    if(finished) return;
    finished = true;
    if(save){
      const next = input.value.trim();
      if(next && next !== item.text){
        item.text = next;
        scheduleSaveMonth(y,m);
      }
    }
    renderPanelContent();
    renderCalendar();
  }

  input.addEventListener('blur', ()=> finish(true));
  input.addEventListener('keydown', e=>{
    e.stopPropagation();
    if(e.key === 'Enter'){ e.preventDefault(); input.blur(); }
    if(e.key === 'Escape'){
      e.preventDefault();
      item.text = original;
      finish(false);
    }
  });
}

function createItemRow(item,index,y,m,d){
  const row=document.createElement('div');
  row.className='item-row'+(item.done?' done':'');
  row.style.borderLeftColor=item.color||ITEM_COLORS[0];
  if(!isMobile()) row.draggable=true;

  let moveControl;
  if(isMobile()){
    moveControl=document.createElement('button');
    moveControl.type='button';
    moveControl.className='move-btn';
    moveControl.textContent='↗';
    moveControl.title='Перенести на інший день';
    bindTap(moveControl, e=>{
      e.stopPropagation();
      startReassign({y,m,d}, item.id, item.text);
    });
  } else {
    moveControl=document.createElement('span');
    moveControl.className='drag-handle';
    moveControl.textContent='⠿';
  }

  const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=item.done;
  cb.addEventListener('change',()=>{
    item.done=cb.checked; scheduleSaveMonth(y,m);
    renderPanelContent(); renderCalendar();
  });

  const span=document.createElement('span');
  span.className='item-text';
  span.textContent=item.text;
  span.title='Натисни, щоб редагувати';
  bindTap(span, e=>{
    e.stopPropagation();
    startItemTextEdit(item, span, y, m, d);
  });

  const dot=document.createElement('button');
  dot.type='button'; dot.className='color-dot';
  dot.style.background=item.color||ITEM_COLORS[0]; dot.title='Колір запису';
  bindTap(dot, e=>{
    e.stopPropagation();
    if(colorPopCtx&&colorPopCtx.item===item){ closeColorPop(); return; }
    openColorPop(dot,item,y,m,d);
  });

  const del=document.createElement('button');
  del.type='button'; del.className='del-btn'; del.textContent='✕'; del.title='Видалити';
  del.addEventListener('click',e=>{
    e.stopPropagation();
    getDayData(y,m,d).items=getDayData(y,m,d).items.filter(x=>x.id!==item.id);
    scheduleSaveMonth(y,m); renderPanelContent(); renderCalendar();
  });

  if(!isMobile()){
    row.addEventListener('dragstart',e=>{
      dragState={fromKey:{y,m,d},itemId:item.id};
      row.classList.add('dragging');
      e.dataTransfer.effectAllowed='move';
      e.dataTransfer.setData('text/plain',item.id);
    });
    row.addEventListener('dragend',()=>{
      row.classList.remove('dragging');
      document.querySelectorAll('.drop-target,.drag-over').forEach(n=>{
        n.classList.remove('drop-target','drag-over');
      });
      if(dragState) dragState=null;
    });
    row.addEventListener('dragover',e=>{
      if(!dragState||dragState.itemId===item.id) return;
      if(dragState.fromKey.y!==y||dragState.fromKey.m!==m||dragState.fromKey.d!==d) return;
      e.preventDefault(); row.classList.add('drag-over');
    });
    row.addEventListener('dragleave',()=>row.classList.remove('drag-over'));
    row.addEventListener('drop',e=>{
      e.preventDefault(); e.stopPropagation();
      row.classList.remove('drag-over');
      if(!dragState) return;
      moveItem(dragState.fromKey,{y,m,d},dragState.itemId,index);
      dragState=null; renderPanelContent(); renderCalendar();
    });
  }

  row.append(moveControl,cb,span,dot,del);
  return row;
}

function addItemHandler(){
  const input=document.getElementById('newItem');
  const text=input.value.trim();
  if(!text||!selectedDateKey) return;
  const {y,m,d}=selectedDateKey;
  const dd=getDayData(y,m,d);
  dd.items.push({id:uid(),text,done:false,color:ITEM_COLORS[dd.items.length%ITEM_COLORS.length]});
  input.value='';
  scheduleSaveMonth(y,m); renderPanelContent(); renderCalendar();
  input.focus();
}

function prevPeriod(){
  if(reassignState) cancelReassign();
  if(isWeekView()){
    syncWeekAnchor();
    viewWeekAnchor.setDate(viewWeekAnchor.getDate() - 7);
    viewYear = viewWeekAnchor.getFullYear();
    viewMonth = viewWeekAnchor.getMonth();
  } else {
    viewMonth--;
    if(viewMonth<0){viewMonth=11;viewYear--;}
  }
  renderCalendar();
}

function nextPeriod(){
  if(reassignState) cancelReassign();
  if(isWeekView()){
    syncWeekAnchor();
    viewWeekAnchor.setDate(viewWeekAnchor.getDate() + 7);
    viewYear = viewWeekAnchor.getFullYear();
    viewMonth = viewWeekAnchor.getMonth();
  } else {
    viewMonth++;
    if(viewMonth>11){viewMonth=0;viewYear++;}
  }
  renderCalendar();
}

function goToday(){
  if(reassignState) cancelReassign();
  viewYear=today.getFullYear();
  viewMonth=today.getMonth();
  if(isWeekView()) viewWeekAnchor = getMonday(today.getFullYear(), today.getMonth(), today.getDate());
  renderCalendar();
}

function closePanel(){
  closeColorPop();
  closeThemePop();
  document.getElementById('overlay').classList.remove('open');
  reportHeight();
}

/* ───────────── event listeners ───────────── */
function bindEvents(){
  bindTap(document.getElementById('addItemBtn'), addItemHandler);
  document.getElementById('newItem').addEventListener('keydown',e=>{ if(e.key==='Enter') addItemHandler(); });
  bindTap(document.getElementById('panelClose'), closePanel);
  document.getElementById('overlay').addEventListener('click',e=>{
    if(e.target===document.getElementById('overlay')) closePanel();
  });
  bindTap(document.getElementById('prevBtn'), prevPeriod);
  bindTap(document.getElementById('nextBtn'), nextPeriod);
  bindTap(document.getElementById('todayBtn'), goToday);
  bindTap(document.getElementById('reassignCancel'), cancelReassign);
  bindTap(document.getElementById('themeBtn'), e=>{
    e.stopPropagation();
    toggleThemePop();
  });

  document.getElementById('viewToggle')?.querySelectorAll('.view-btn').forEach(btn=>{
    bindTap(btn, ()=> setMobileViewMode(btn.dataset.view));
  });

  const calendarBody = document.querySelector('.calendar-body');
  calendarBody.addEventListener('touchstart', e=>{
    if(e.touches.length!==1 || reassignState) return;
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
  }, {passive:true});
  calendarBody.addEventListener('touchend', e=>{
    if(swipeStartX===null || reassignState) { swipeStartX=null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStartX;
    const dy = Math.abs(t.clientY - swipeStartY);
    if(Math.abs(dx)>55 && dy<80){
      if(dx<0) nextPeriod(); else prevPeriod();
    }
    swipeStartX = null;
  }, {passive:true});

  let panelSwipeY = null;
  const panelEl = document.querySelector('.panel');
  panelEl.addEventListener('touchstart', e=>{
    if(!isMobile() || panelEl.scrollTop>0) return;
    panelSwipeY = e.touches[0].clientY;
  }, {passive:true});
  panelEl.addEventListener('touchend', e=>{
    if(panelSwipeY===null) return;
    const dy = e.changedTouches[0].clientY - panelSwipeY;
    if(dy>80) closePanel();
    panelSwipeY = null;
  }, {passive:true});

  document.addEventListener('click', e=>{
    if(Date.now() - popOpenedAt < 300) return;
    const themePop = document.getElementById('themePop');
    const themeBtn = document.getElementById('themeBtn');
    if(themePop?.classList.contains('open') &&
       !themePop.contains(e.target) && !themeBtn.contains(e.target))
      closeThemePop();
    if(colorPopCtx && !document.getElementById('colorPop').contains(e.target) &&
       !e.target.closest('.color-dot'))
      closeColorPop();
  });

  window.addEventListener('resize', ()=>{
    if(!isMobile() && reassignState) cancelReassign();
    updateViewToggle();
    reportHeight();
  });
  PlannerStorage.setOnSaved(flashSaveStatus);
}

/* ───────────── init ───────────── */
function initPlanner(){
  const cfg = window.__PLANNER_CONFIG__ || {};
  const initial = window.__PLANNER_DATA__ || null;

  PlannerStorage.init({
    supabaseUrl: cfg.supabaseUrl || null,
    supabaseKey: cfg.supabaseKey || null,
    rowId: cfg.rowId || 'main',
  }, initial);

  if(!initial) PlannerStorage.loadLocal();

  const allMonths = PlannerStorage.getAllMonths();
  for(const k of Object.keys(allMonths)) monthCache[k] = migrateMonthData(allMonths[k]);

  bindEvents();
  loadTheme();
  renderCalendar();
  reportHeight();
  setTimeout(reportHeight, 100);
  setTimeout(reportHeight, 500);
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPlanner);
else initPlanner();
