import { DEFAULT_TIMES, dayKey, nextReminder, dueReminders, validateTimes, calendarText } from './core.mjs';

const routines = [
  {id:'breakfast', name:'好好吃早餐', short:'早餐', icon:'sun', action:'吃过早餐啦', message:'新的一天，从一顿暖暖的早餐开始。', reminder:'靳雯，吃早餐啦', complete:'吃饱了，再慢慢开启今天。'},
  {id:'lunch', name:'按时吃午饭', short:'午餐', icon:'bowl', action:'吃过午饭啦', message:'先把事情放一放，好好吃顿午饭。', reminder:'靳雯，该吃午饭啦', complete:'午饭已打卡，下午也要照顾好自己。'},
  {id:'dinner', name:'认真吃晚饭', short:'晚餐', icon:'dinner', action:'吃过晚饭啦', message:'忙了一天，记得给自己一顿热乎的晚餐。', reminder:'靳雯，记得吃晚饭', complete:'晚饭已打卡，给认真生活的你一个拥抱。'},
  {id:'sleep', name:'今晚早点睡', short:'睡觉', icon:'moon', action:'准备睡觉啦', message:'把手机放一放，剩下的就交给明天。', reminder:'靳雯，今天早点睡', complete:'今天辛苦了。放下手机，愿你做个好梦。'}
];
const letters = [
  ['世界很大，事情很多，','但好好吃饭、安心睡觉，永远值得排在前面。'],
  ['饭要趁热吃，觉要早点睡。','忙碌的日子里，也给自己留一点温柔。'],
  ['今天做不完的事，就留一点给明天。','你可以休息，也值得被好好照顾。'],
  ['不必把每一天都过得很厉害，','有吃饱，有睡好，就已经很好。']
];
const KEY = 'jinwen-little-day-v1';
const $ = selector => document.querySelector(selector);
const icon = name => `<svg aria-hidden="true"><use href="#i-${name}"/></svg>`;
let storageFailed = false;
let state = {times:{...DEFAULT_TIMES}, days:{}, notifications:false};
try {
  const saved = JSON.parse(localStorage.getItem(KEY) || 'null');
  if(saved && typeof saved === 'object') {
    if(validateTimes(saved.times)) state.times = {...saved.times};
    if(saved.days && typeof saved.days === 'object' && !Array.isArray(saved.days)) {
      for(const [date,record] of Object.entries(saved.days)) {
        if(/^\d{4}-\d{2}-\d{2}$/.test(date) && record && typeof record==='object') {
          state.days[date]={done:Array.isArray(record.done)?record.done.filter(id=>routines.some(r=>r.id===id)):[], notified:Array.isArray(record.notified)?record.notified.filter(x=>typeof x==='string'):[]};
        }
      }
    }
    state.notifications = saved.notifications === true;
  }
} catch { storageFailed = true; }

function save() {
  const dates = Object.keys(state.days).sort();
  for(const date of dates.slice(0,Math.max(0,dates.length-30))) delete state.days[date];
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { if(!storageFailed) toast('当前浏览器无法保存记录，本次打开期间仍可打卡。'); storageFailed=true; }
}
function today(now = new Date()) { const key=dayKey(now); if(!state.days[key]) state.days[key]={done:[],notified:[]}; return state.days[key]; }
let activeDate = dayKey(new Date());
let nextId = null;
let reminderItem = null;
let reminderDate = null;
let reminderQueue = [];
let toastTimer;
let letterIndex=0;
function toast(message) { clearTimeout(toastTimer); $('#toast').textContent=message; $('#toast').classList.add('show'); toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),4500); }

function renderCards() {
  const day=today();
  const next=nextReminder(new Date(),state.times,day.done);
  nextId=next?.tomorrow?null:next?.id;
  $('#routine-grid').innerHTML=routines.map(r=>{
    const done=day.done.includes(r.id);
    const isNext=!done&&r.id===nextId;
    return `<article class="routine-card ${done?'completed':''} ${isNext?'next-routine':''}" data-id="${r.id}"><div class="card-top"><span class="routine-icon">${icon(r.icon)}</span><span class="card-tag">${done?'已完成 ✓':isNext?'下一份提醒':'每日小约定'}</span></div><p class="card-time">${state.times[r.id]}</p><h3>${r.name}</h3><p class="card-description">${r.message}</p><button class="check-button" type="button" data-check="${r.id}" aria-pressed="${done}" aria-label="${done?`撤销${r.short}打卡`:r.action}">${icon(done?'check':'heart')}${done?'已打卡 · 可撤销':r.action}</button></article>`;
  }).join('');
  $('#progress-label').textContent=`已完成 ${day.done.length} / 4`;
  $('#progress-fill').style.width=`${day.done.length*25}%`;
  $('.progress-track').setAttribute('aria-valuenow',day.done.length);
  $('#day-message').textContent=day.done.length===4?'今天的小约定都完成啦。辛苦了，愿你有个好梦。':'不用赶进度。每一次照顾自己，都算数。';
  $('#date-label').textContent=new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',month:'long',day:'numeric',weekday:'long'}).format(new Date())+' · 今天，也慢慢来';
}
function markDone(id,force = false) {
  const day=today();
  const r=routines.find(r=>r.id===id);
  if(!r) return;
  const already=day.done.includes(id);
  if(already && !force) { day.done=day.done.filter(x=>x!==id); toast('已撤销打卡，按自己的节奏来。'); }
  else if(!already) {day.done.push(id);toast(r.complete);}
  save(); renderCards(); updateClock();
  const button=document.querySelector(`[data-check="${id}"]`);
  if(button && !force) button.focus({preventScroll:true});
}

function updateClock() {
  const now=new Date();
  if(activeDate!==dayKey(now)) {activeDate=dayKey(now);reminderQueue=[];renderCards();save();}
  const n=nextReminder(now,state.times,today(now).done);
  if(!n) return;
  const r=routines.find(r=>r.id===n.id);
  if(nextId!==(n.tomorrow?null:n.id)) renderCards();
  $('#next-kicker').textContent=n.tomorrow?'明天，继续好好照顾自己':'下一份小提醒';
  $('#next-title').textContent=`${n.tomorrow?'明天 ':''}${state.times[n.id]} · ${r.name}`;
  $('#next-message').textContent=r.message;
  $('#next-svg use').setAttribute('href',`#i-${r.icon}`);
  const seconds=Math.max(0,Math.ceil((n.at.getTime()-now.getTime())/1000));
  $('#count-h').textContent=String(Math.floor(seconds/3600)).padStart(2,'0');
  $('#count-m').textContent=String(Math.floor(seconds/60)%60).padStart(2,'0');
  $('#count-s').textContent=String(seconds%60).padStart(2,'0');
  $('#countdown-label').textContent=`距离${r.short}时间还有`;
}

function notificationStatus() {
  const supported='Notification' in window && window.isSecureContext;
  const active=supported && Notification.permission==='granted' && state.notifications;
  $('#notification-label').textContent=active?'提醒已开启 · 关闭':'开启温柔提醒';
  $('#notification-button').setAttribute('aria-pressed',String(active));
  $('#notification-note').textContent=active?'通知已开启。请保持网页打开，关闭后不会继续提醒。':!supported?'当前浏览器支持网页内提醒，请保持页面打开。':Notification.permission==='denied'?'系统通知未获允许，网页内提醒仍然可用。':'保持网页打开，到点会出现小提醒。';
}
$('#notification-button').addEventListener('click',async()=>{
  if(!('Notification' in window)||!window.isSecureContext) { toast('当前浏览器暂不支持系统通知，保持页面打开即可看到小提醒。'); return; }
  if(state.notifications && Notification.permission==='granted') {state.notifications=false;save();notificationStatus();toast('系统通知已关闭，网页内提醒仍然可用。');return;}
  try {
    const permission=Notification.permission==='default'?await Notification.requestPermission():Notification.permission;
    state.notifications=permission==='granted';save();notificationStatus();
    toast(permission==='granted'?'温柔提醒已开启，请保持这个网页打开。':permission==='denied'?'通知权限未开启，可在浏览器设置中允许通知。':'暂时使用网页内提醒，随时可以再开启通知。');
  } catch {toast('系统通知暂时不可用，网页内提醒仍然可用。');}
});

function showReminder(id=null) {
  reminderItem=id; reminderDate=dayKey(new Date());
  const r=routines.find(r=>r.id===id);
  $('#reminder-title').textContent=r?r.reminder:'靳雯，要好好照顾自己呀';
  $('#reminder-message').textContent=r?r.message:'饭要按时吃，觉要早点睡。再忙，也别忘了把自己放在心上。';
  $('#reminder-done').innerHTML=(r?r.action:'记住啦')+icon(r?'check':'heart');
  if(!$('#reminder-dialog').open) $('#reminder-dialog').showModal();
}
function showNextQueued() {
  if($('#settings-dialog').open || $('#reminder-dialog').open) return;
  const day=today();
  while(reminderQueue.length){const id=reminderQueue.shift();if(!day.done.includes(id)){showReminder(id);break;}}
}
function checkDue() {
  const now=new Date();
  updateClock();
  const day=today(now);
  const ids=dueReminders(now,state.times,day.done,day.notified);
  for(const id of ids) {
    day.notified.push(`${id}:${state.times[id]}`);
    reminderQueue.push(id);
    const r=routines.find(r=>r.id===id);
    if(state.notifications && 'Notification' in window && Notification.permission==='granted') {
      try { new Notification(r.reminder,{body:r.message,tag:`jinwen-${dayKey(now)}-${id}`}); } catch { /* In-page reminders remain available. */ }
    }
  }
  if(ids.length) save();
  showNextQueued();
}

$('#routine-grid').addEventListener('click',event=>{const button=event.target.closest('[data-check]');if(button)markDone(button.dataset.check);});
$('#preview-button').addEventListener('click',()=>showReminder());
$('#close-reminder').addEventListener('click',()=>$('#reminder-dialog').close());
$('#reminder-done').addEventListener('click',()=>{if(reminderItem && reminderDate===dayKey(new Date()))markDone(reminderItem,true);$('#reminder-dialog').close();});
$('#reminder-dialog').addEventListener('close',()=>{reminderItem=null;setTimeout(showNextQueued,150);});

function showFields(times) {
  $('#time-fields').innerHTML=routines.map(r=>`<div class="time-field"><label for="time-${r.id}">${icon(r.icon)}${r.short}</label><input type="time" id="time-${r.id}" name="${r.id}" value="${times[r.id]}" required></div>`).join('');
}
$('#settings-button').addEventListener('click',()=>{showFields(state.times);$('#form-error').textContent='';$('#settings-dialog').showModal();});
$('#close-settings').addEventListener('click',()=>$('#settings-dialog').close());
$('#settings-dialog').addEventListener('close',()=>setTimeout(showNextQueued,150));
$('#reset-times').addEventListener('click',()=>{showFields(DEFAULT_TIMES);$('#form-error').textContent='';toast('已填入默认时间，点击保存后生效。');});
$('#settings-form').addEventListener('submit',event=>{
  event.preventDefault();
  const times=Object.fromEntries(new FormData(event.currentTarget));
  if(!validateTimes(times)){ $('#form-error').textContent='请为四个小约定填写有效时间。'; return; }
  reminderQueue=reminderQueue.filter(id=>state.times[id]===times[id]);
  state.times=times;save();renderCards();updateClock();$('#settings-dialog').close();toast('新的作息已保存，按自己的节奏慢慢来。');checkDue();
});

$('#letter-button').addEventListener('click',()=>{letterIndex=(letterIndex+1)%letters.length;$('#letter-text').replaceChildren(document.createTextNode(letters[letterIndex][0]),document.createElement('br'),document.createTextNode(letters[letterIndex][1]));});
$('#calendar-button').addEventListener('click',()=>{
  const blob=new Blob([calendarText(state.times,new Date())],{type:'text/calendar;charset=utf-8'});
  const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download='给靳雯的小小提醒.ics';document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),15000);
  toast('日历文件已下载。导入日历并允许提醒后生效；修改网页作息不会同步到日历。');
});
document.addEventListener('visibilitychange',()=>{if(!document.hidden){notificationStatus();checkDue();}});
window.addEventListener('focus',()=>{notificationStatus();checkDue();});
window.addEventListener('storage',event=>{if(event.key===KEY)toast('另一页面的记录发生了变化，刷新可查看最新状态。');});
renderCards();updateClock();notificationStatus();checkDue();
setInterval(updateClock,1000);
setInterval(checkDue,15000);
if(storageFailed)toast('当前浏览器无法读取保存记录，仍可使用本次网页。');
