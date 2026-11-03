'use strict';
const vm=require('node:vm');
class Clock {
  constructor(){this.now=0;this.next=1;this.tasks=new Map();}
  setTimeout(fn,delay=0){const id=this.next++;this.tasks.set(id,{time:this.now+Math.max(0,Number(delay)||0),fn});return id;}
  clearTimeout(id){this.tasks.delete(id);}
  async flush(){for(let i=0;i<20;i++)await Promise.resolve();}
  async tick(ms){
    const end=this.now+ms;await this.flush();let safety=0;
    while(true){
      const next=[...this.tasks.entries()].filter(([,t])=>t.time<=end).sort((a,b)=>a[1].time-b[1].time||a[0]-b[0])[0];
      if(!next)break;if(++safety>10000)throw Error('Timer loop');
      const [id,task]=next;this.tasks.delete(id);this.now=task.time;task.fn();await this.flush();
    }
    this.now=end;await this.flush();
  }
}
class Element {
  constructor(tag='div'){
    this.tagName=tag.toUpperCase();this.children=[];this.attributes={};this.dataset={};this.listeners={};
    this.style={setProperty(name,value){this[name]=value;}};this._class='';this._text='';this.disabled=false;this.value='';
    const classes=()=>new Set(this._class.split(/\s+/).filter(Boolean));
    this.classList={
      add:(...items)=>{const s=classes();items.forEach(x=>s.add(x));this._class=[...s].join(' ');},
      remove:(...items)=>{const s=classes();items.forEach(x=>s.delete(x));this._class=[...s].join(' ');},
      contains:item=>classes().has(item),
      toggle:(item,force)=>{const has=classes().has(item),add=force===undefined?!has:force;this.classList[add?'add':'remove'](item);return add;}
    };
  }
  get className(){return this._class;} set className(value){this._class=String(value);}
  get innerHTML(){return this._text;} set innerHTML(value){this._text=String(value);this.children=[];}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  set textContent(value){this._text=String(value);this.children=[];}
  get scrollHeight(){return this.children.length*30;}
  appendChild(child){this.children.push(child);return child;}
  setAttribute(name,value){this.attributes[name]=String(value);}
  getAttribute(name){return this.attributes[name]??null;}
  addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
  removeEventListener(name,fn){this.listeners[name]=(this.listeners[name]||[]).filter(x=>x!==fn);}
  dispatch(name,event={}){for(const f of this.listeners[name]||[])f(event);}
  click(){if(!this.disabled)this.dispatch('click');}
}
function coreFrom(html){return html.slice(html.indexOf('function engineFactory()'),html.indexOf('function workerMain()'));}
function loadCore(html){
  const context={performance,Int8Array};vm.createContext(context);
  vm.runInContext(coreFrom(html)+'\nthis.C=engineFactory();this.AI=aiFactory(this.C);',context);
  return {C:context.C,AI:context.AI};
}
function loadApp(html,options={}){
  const clock=new Clock(),nodes=new Map(),errors=[],workers=[],blobs=new Map();
  for(const m of html.matchAll(/\bid="([^"]+)"/g))nodes.set(m[1],new Element());
  for(const match of html.matchAll(/<select[^>]*id="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    const options=[...match[2].matchAll(/<option([^>]*)value="([^"]+)"([^>]*)>/g)];
    const selected=options.find(option=>/selected/.test(option[1]+option[3]))||options[0];
    if(selected&&nodes.has(match[1]))nodes.get(match[1]).value=selected[2];
  }
  const document={getElementById:id=>nodes.get(id)||null,createElement:tag=>new Element(tag),body:new Element('body')};
  const core=loadCore(html),C=core.C,AI=core.AI;
  const workerOptions={mode:options.workerMode||'normal',delay:options.workerDelay??10};
  class FakeWorker {
    constructor(url){
      if(workerOptions.mode==='constructor-error')throw Error('Worker blocked');
      this.url=url;this.listeners={};this.terminated=false;workers.push(this);
    }
    addEventListener(name,fn){(this.listeners[name]??=[]).push(fn);}
    removeEventListener(name,fn){this.listeners[name]=(this.listeners[name]||[]).filter(x=>x!==fn);}
    emit(name,event){if(this.terminated)return;const handler=this['on'+name];if(handler)handler(event);for(const fn of [...(this.listeners[name]||[])])fn(event);}
    postMessage(data){
      this.payload=data;
      const mode=workerOptions.mode;
      if(mode==='post-error')throw Error('Post failed');
      if(mode==='silent')return;
      clock.setTimeout(()=>{
        if(mode==='error'){this.emit('error',{message:'Worker failure',preventDefault(){}});return;}
        if(mode==='messageerror'){this.emit('messageerror',{});return;}
        let result;
        const opt={...data.options,maxDepth:2,budgetMs:10000};
        if(data.type==='coach')result=AI.analyzeHuman(new Int8Array(data.before),data.move,{maxDepth:2,budgetMs:10000});
        else if(data.type==='ai')result=AI.chooseMove(new Int8Array(data.board),opt);
        else result={reply:AI.chooseMove(new Int8Array(data.board),opt),coach:AI.analyzeHuman(new Int8Array(data.before),data.humanMove,{rules:data.options.rules,maxDepth:2,budgetMs:10000})};
        if(mode==='illegal')result={reply:{move:{path:[0,1],captures:[]}}};
        if(mode==='malformed')result={reply:{move:{path:null}}};
        const event={data:{id:mode==='wrong-id'?data.id+100:data.id,ok:true,result}};
        this.emit('message',event);
        if(mode==='duplicate'){this.emit('message',event);clock.setTimeout(()=>this.emit('message',event),100);}
      },workerOptions.delay);
    }
    terminate(){this.terminated=true;}
  }
  const fakeURL={createObjectURL(blob){const key='blob:'+blobs.size;blobs.set(key,blob);return key;},revokeObjectURL(key){blobs.delete(key);}};
  class FakeBlob {constructor(parts){this.parts=parts;}}
  const context={document,console:{log(){},warn(){},error:e=>errors.push(String(e))},performance:{now:()=>clock.now},
    Int8Array,AbortController,URL:fakeURL,Blob:FakeBlob,Worker:options.noWorker?undefined:FakeWorker,
    URLSearchParams,location:{search:''},setTimeout:clock.setTimeout.bind(clock),clearTimeout:clock.clearTimeout.bind(clock)};
  context.window=context;
  vm.createContext(context);
  let script=html.match(/<script>([\s\S]*?)<\/script>/)[1];
  if(options.original){
    script=script.replace('newGame();if(new URLSearchParams',`window.testAPI={get state(){return state},C,AI,humanClick,completeHuman,newGame,undo,renderAll,setStatus,snapshot};newGame();if(new URLSearchParams`);
  }else{
    script=script.replace('// BOOT: regression tests attach a read/fixture seam here in memory only.',`window.testAPI={get state(){return state},C,AI,humanClick,completeHuman,newGame,undo,renderAll,humanStatus,snapshot,checkGameEnd,recordMove,get activeJob(){return activeJob}};`);
  }
  vm.runInContext(script,context,{timeout:10000});
  const api=context.testAPI;
  if(!api)throw Error('Application did not boot: '+errors.join('; '));
  const inspect=()=>JSON.parse(JSON.stringify({board:Array.from(api.state.board),phase:api.state.phase,history:api.state.history,prefix:api.state.prefix,animBoard:api.state.animBoard?Array.from(api.state.animBoard):null,flight:api.state.flight,quietTurns:api.state.quietTurns}));
  function fixture(board,rules='standard'){
    if(nodes.has('rules'))nodes.get('rules').value=rules;api.newGame();
    const s=api.state;s.board=new Int8Array(board);s.rules=rules;s.legal=api.C.getLegalMoves(s.board,C.H,rules);s.history=[];s.prefix=[];
    if(options.original){s.snapshots=[api.snapshot()];}
    else{s.repetitions=new Map([[C.positionKey(s.board,C.H),1]]);s.undoStack=[];api.humanStatus();}
    api.renderAll();
  }
  function clickSquare(i){const button=nodes.get('board').children.find(x=>Number(x.dataset.i)===i);if(!button)throw Error('Missing board square '+i);button.click();}
  return {api,clock,nodes,errors,workers,blobs,context,inspect,fixture,clickSquare,workerOptions,C,AI};
}
module.exports={loadCore,loadApp,coreFrom};
