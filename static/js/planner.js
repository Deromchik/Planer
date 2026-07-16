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
let touchDrag       = null;
let swipeStartX     = null;
let swipeStartY     = null;
let popOpenedAt     = 0;

function isMobile(){ return window.matchMedia('(max-width:768px)').matches; }

function cellDateFromEl(cell){
  if(!cell) return null;
  const y=+cell.dataset.y, m=+cell.dataset.m, d=+cell.dataset.d;
  if(Number.isNaN(y)) return null;
  return {y,m,d};
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
  const h = document.documentElement.scrollHeight || window.innerHeight;
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

/* ───────────── touch drag ───────────── */
function clearDropTargets(){
  document.querySelectorAll('.drop-target').forEach(n=>n.classList.remove('drop-target'));
}

function highlightCellAt(x,y){
  clearDropTargets();
  const el = document.elementFromPoint(x,y);
  const cell = el?.closest('.cell');
  if(cell) cell.classList.add('drop-target');
  return cell;
}

function finishTouchDrag(clientX, clientY){
  if(!touchDrag?.moved || !dragState) return false;
  const cell = highlightCellAt(clientX, clientY);
  const toKey = cellDateFromEl(cell);
  if(toKey){
    moveItem(dragState.fromKey, toKey, dragState.itemId);
    justDropped = true;
    setTimeout(()=>{ justDropped=false; },150);
    renderCalendar();
    if(selectedDateKey) renderPanelContent();
    return true;
  }
  return false;
}

function setupTouchDrag(el, item, fromKey){
  el.addEventListener('touchstart', e=>{
    if(e.touches.length!==1) return;
    const t = e.touches[0];
    touchDrag = { itemId:item.id, fromKey, el, startX:t.clientX, startY:t.clientY, moved:false };
  }, {passive:true});

  el.addEventListener('touchmove', e=>{
    if(!touchDrag || touchDrag.itemId!==item.id) return;
    const t = e.touches[0];
    const dx = Math.abs(t.clientX - touchDrag.startX);
    const dy = Math.abs(t.clientY - touchDrag.startY);
    if(dx>10 || dy>10){
      touchDrag.moved = true;
      dragState = { fromKey, itemId:item.id };
      el.classList.add('dragging');
      highlightCellAt(t.clientX, t.clientY);
      e.preventDefault();
    }
  }, {passive:false});

  el.addEventListener('touchend', e=>{
    if(!touchDrag || touchDrag.itemId!==item.id) return;
    const t = e.changedTouches[0];
    el.classList.remove('dragging');
    if(touchDrag.moved) finishTouchDrag(t.clientX, t.clientY);
    clearDropTargets();
    touchDrag = null;
    dragState = null;
  }, {passive:true});

  el.addEventListener('touchcancel', ()=>{
    el.classList.remove('dragging');
    clearDropTargets();
    touchDrag = null;
    dragState = null;
  }, {passive:true});
}

/* ───────────── calendar render ───────────── */
function renderCalendar(){
  loadMonth(viewYear,viewMonth);
  document.getElementById('monthTitle').innerHTML=
    MONTH_NAMES[viewMonth]+' <span class="year">'+viewYear+'</span>';

  const grid=document.getElementById('grid');
  grid.innerHTML='';
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

    const cellDate={y:cy,m:cm,d:dayNum};
    const cell=document.createElement('div');
    cell.className='cell'+(isOutside?' outside':'');
    cell.dataset.y=cy; cell.dataset.m=cm; cell.dataset.d=dayNum;
    if(cy===today.getFullYear()&&cm===today.getMonth()&&dayNum===today.getDate())
      cell.className+=' today';

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
      block.draggable=true; block.title=item.text;
      block.addEventListener('click',e=>e.stopPropagation());
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
      setupTouchDrag(block, item, cellDate);
      wrap.appendChild(block);
    });
    cell.appendChild(wrap);

    cell.addEventListener('click',()=>{ if(!justDropped&&!dragState) openPanel(cy,cm,dayNum); });
    setupCellDrop(cell,cellDate);
    grid.appendChild(cell);
  }
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
    ? 'Утримуй і перетягни запис на інший день. Свайп по календарю — змінити місяць.'
    : 'Перетягни блок на потрібний день у календарі.';
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

function createItemRow(item,index,y,m,d){
  const row=document.createElement('div');
  row.className='item-row'+(item.done?' done':'');
  row.style.borderLeftColor=item.color||ITEM_COLORS[0];
  row.draggable=true;

  const handle=document.createElement('span');
  handle.className='drag-handle'; handle.textContent='⠿';

  const cb=document.createElement('input'); cb.type='checkbox'; cb.checked=item.done;
  cb.addEventListener('change',()=>{
    item.done=cb.checked; scheduleSaveMonth(y,m);
    renderPanelContent(); renderCalendar();
  });

  const span=document.createElement('span');
  span.className='item-text'; span.textContent=item.text;

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

  setupTouchDrag(row, item, {y,m,d});
  row.append(handle,cb,span,dot,del);
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

function prevMonth(){ viewMonth--; if(viewMonth<0){viewMonth=11;viewYear--;} renderCalendar(); }
function nextMonth(){ viewMonth++; if(viewMonth>11){viewMonth=0;viewYear++;} renderCalendar(); }
function goToday(){ viewYear=today.getFullYear(); viewMonth=today.getMonth(); renderCalendar(); }

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
  bindTap(document.getElementById('prevBtn'), prevMonth);
  bindTap(document.getElementById('nextBtn'), nextMonth);
  bindTap(document.getElementById('todayBtn'), goToday);
  bindTap(document.getElementById('themeBtn'), e=>{
    e.stopPropagation();
    toggleThemePop();
  });

  const calendarBody = document.querySelector('.calendar-body');
  calendarBody.addEventListener('touchstart', e=>{
    if(e.touches.length!==1) return;
    swipeStartX = e.touches[0].clientX;
    swipeStartY = e.touches[0].clientY;
  }, {passive:true});
  calendarBody.addEventListener('touchend', e=>{
    if(swipeStartX===null || touchDrag?.moved) { swipeStartX=null; return; }
    const t = e.changedTouches[0];
    const dx = t.clientX - swipeStartX;
    const dy = Math.abs(t.clientY - swipeStartY);
    if(Math.abs(dx)>55 && dy<80){
      if(dx<0) nextMonth(); else prevMonth();
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

  window.addEventListener('resize', reportHeight);
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
}

if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initPlanner);
else initPlanner();
