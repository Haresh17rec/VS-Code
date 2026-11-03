'use strict';
// Run with Node.js 18+: node qa/run-tests.cjs
// No dependencies. Timers/DOM/worker faults are simulated; this is not a browser-rendering test.
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const {loadCore,loadApp}=require('./harness.cjs');
const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
const {C,AI}=loadCore(html),reports=[];
const board=entries=>{const b=new Int8Array(64);for(const [i,p] of entries)b[i]=p;return b;};
const plain=x=>JSON.parse(JSON.stringify(x));
const sample=()=>board([[8,-1],[17,-1],[26,1],[44,1],[56,1]]);
let seed=730249;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
async function test(name,fn){const start=performance.now();await fn();reports.push({name,ms:Math.round(performance.now()-start)});console.log('PASS '+name);}
function opening(app){app.clickSquare(40);app.clickSquare(33);}
function assertNoErrors(app){assert.deepEqual(app.errors,[]);assert.equal(app.nodes.get('fatal').classList.contains('show'),false);}
function brute(b,depth,player,rules){
 const moves=C.getLegalMoves(b,player,rules);
 if(!moves.length)return player===C.A?-1000000-depth:1000000+depth;
 if(!depth)return AI.evaluate(b,rules);
 const values=moves.map(m=>brute(C.applyMove(b,m),depth-1,-player,rules));
 return player===C.A?Math.max(...values):Math.min(...values);
}
(async()=>{
 await test('Self-contained JavaScript parses; no external script/style dependencies',()=>{
   new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);assert(!/<script[^>]+src=|<link[^>]+href=/i.test(html));
 });
 await test('Initial position: 12 pieces each, seven legal opening moves, dark squares only',()=>{
   const b=C.initialBoard();assert.equal(C.count(b,1).total,12);assert.equal(C.count(b,-1).total,12);
   for(const side of [1,-1])assert.equal(C.getLegalMoves(b,side).length,7);
   b.forEach((p,i)=>{if(p)assert.equal((Math.floor(i/8)+i%8)%2,1);});
 });
 await test('Default rules are authentic capture-chain checkers with mandatory continuation',()=>{
   const b=sample();const moves=C.getLegalMoves(b,-1);
   assert.deepEqual(plain(moves),[{path:[17,35,53],captures:[26,44]}]);
   const mirror=new Int8Array(Array.from(b).reverse().map(p=>-p));
   const red=C.getLegalMoves(mirror,1);assert(red.length);assert(red.every(m=>m.captures.length>=1));
 });
 await test('A completed multi-jump is represented as one legal turn',()=>{
   const b=sample();const move=C.getLegalMoves(b,-1)[0],next=C.applyMove(b,move);
   assert.equal(move.path.length,3);assert.equal(move.captures.length,2);assert.equal(next[53],-1);assert.equal(next[26],0);assert.equal(next[44],0);
 });
 await test('Promotion ends a jump turn; men cannot move/capture backwards; kings can',()=>{
   const b=board([[42,-1],[51,1],[53,1]]);const moves=C.getLegalMoves(b,-1,'standard');
   assert.deepEqual(plain(moves),[{path:[42,60],captures:[51]}]);assert.equal(C.applyMove(b,moves[0])[60],-2);
   const backwards=board([[35,-1],[26,1]]);assert(C.getLegalMoves(backwards,-1).every(m=>!m.captures.length&&m.path[1]>35));
   backwards[35]=-2;assert(C.getLegalMoves(backwards,-1).some(m=>m.path[1]===17&&m.captures[0]===26));
   const red=board([[10,1]]);assert(C.getLegalMoves(red,1).every(m=>C.applyMove(red,m)[m.path[1]]===2));
 });
 await test('King capture chains can return to their origin without losing the piece',()=>{
   const b=board([[42,2],[35,-1],[19,-1],[17,-1],[33,-1]]);
   const loops=C.getLegalMoves(b,1,'standard');assert.equal(loops.length,2);
   for(const m of loops){assert.equal(m.path.at(-1),42);assert.equal(m.captures.length,4);const next=C.applyMove(b,m);assert.equal(next[42],2);assert.equal(C.count(next,-1).total,0);}
 });
 const positions=[];let stressPlies=0,captures=0,promotions=0;
 await test('300 seeded games: movement, capture, promotion and piece-count invariants',()=>{
   for(const rules of ['standard'])for(let game=0;game<300;game++){
     let b=C.initialBoard(),side=1,quiet=0;const repetitions=new Map();
     for(let turn=0;turn<240;turn++){
       const moves=C.getLegalMoves(b,side,rules);if(!moves.length)break;
       assert(moves.every(m=>m.captures.length>0) || moves.every(m=>m.captures.length===0));
       const m=moves[Math.floor(random()*moves.length)],start=b[m.path[0]],next=C.applyMove(b,m);
       assert.equal(new Set(m.captures).size,m.captures.length);
       assert.equal(C.count(next,side).total,C.count(b,side).total);
       assert.equal(C.count(next,-side).total,C.count(b,-side).total-m.captures.length);
       for(const i of m.captures)assert.equal(C.owner(b[i]),-side);
       for(let k=1;k<m.path.length;k++){
         const [r,c]=C.rc(m.path[k-1]),[nr,nc]=C.rc(m.path[k]),distance=m.captures.length?2:1;
         assert.equal(Math.abs(nr-r),distance);assert.equal(Math.abs(nc-c),distance);
         if(!C.king(start))assert.equal(Math.sign(nr-r),side===1?-1:1);
       }
       if(!C.king(start)&&C.king(next[m.path.at(-1)]))promotions++;
       quiet=m.captures.length||!C.king(start)?0:quiet+1;
       captures+=m.captures.length;stressPlies++;
       if(game<6&&turn===20)positions.push({board:new Int8Array(b),rules,side});
       b=next;side=-side;const key=C.positionKey(b,side);repetitions.set(key,(repetitions.get(key)||0)+1);
       if(quiet>=80||repetitions.get(key)>=3)break;
     }
   }
   assert(stressPlies>10000);assert(captures>1000);assert(promotions>0);
 });
 await test('Alpha-beta choices and scores match independent exhaustive minimax',()=>{
   for(const {board:b,rules,side} of positions){
     const res=AI.chooseMove(b,{player:side,rules,maxDepth:4,budgetMs:10000});assert(res.move);assert(res.depth>0);
     assert.equal(res.bestScore,brute(b,res.depth,side,rules));
     assert.equal(brute(C.applyMove(b,res.move),res.depth-1,-side,rules),res.bestScore);
     for(const candidate of res.allCandidates){const m=C.getLegalMoves(b,side,rules).find(m=>C.moveKey(m)===candidate.key);assert.equal(candidate.score,brute(C.applyMove(b,m),res.depth-1,-side,rules));}
   }
 });
 await test('Deadline fallback and coach grades are finite and legal',()=>{
   const b=C.initialBoard(),r=AI.chooseMove(b,{maxDepth:10,budgetMs:1});assert(Number.isFinite(r.bestScore));
   assert(C.getLegalMoves(b,-1).some(m=>C.moveKey(m)===C.moveKey(r.move)));
   const move=C.getLegalMoves(b,1)[0],grade=AI.analyzeHuman(b,move,{maxDepth:3,budgetMs:300});
   assert(grade.score===null || Number.isFinite(grade.score)&&grade.score>=0&&grade.score<=100);
   assert(grade.loss===null || Number.isFinite(grade.loss));
 });
 await test('Serialized worker code runs in an isolated JavaScript context',()=>{
   const start=html.indexOf('function engineFactory()'),end=html.indexOf('const C=engineFactory(), AI=aiFactory(C);');
   let message;const self={postMessage:m=>{message=m;}},context={self,performance,Int8Array};vm.createContext(context);
   vm.runInContext(html.slice(start,end)+'\nworkerMain();',context);
   const before=C.initialBoard(),humanMove=C.getLegalMoves(before,1)[0],b=C.applyMove(before,humanMove);
   self.onmessage({data:{id:17,board:Array.from(b),before:Array.from(before),humanMove,options:{rules:'standard',maxDepth:2,budgetMs:200},coachOptions:{rules:'standard',maxDepth:2,budgetMs:200}}});
   assert.equal(message.id,17);assert.equal(message.ok,true);assert(C.getLegalMoves(b,-1).some(m=>C.moveKey(m)===C.moveKey(message.result.reply.move)));
 });
 await test('Game boots with visible 64-square board and authentic standard rules locked on',()=>{
   const app=loadApp(html);assert.equal(app.nodes.get('board').children.length,64);assert.equal(app.api.state.rules,'standard');assert.equal(app.inspect().phase,'human');assert.equal(app.nodes.get('rules').value,'standard');assert.equal(app.nodes.get('rules').disabled,true);assert.equal(app.nodes.get('undoBtn').disabled,true);assertNoErrors(app);
 });
 await test('AI waits at least 1.5 seconds, animates once, then yields; no later repeat',async()=>{
   const app=loadApp(html);opening(app);const before=app.inspect().board;
   assert.equal(app.inspect().history.length,1);assert.equal(app.nodes.get('difficulty').disabled,true);
   assert(app.nodes.get('board').children.every(e=>e.disabled));
   await app.clock.tick(1499);assert.equal(app.inspect().phase,'ai-thinking');assert.equal(app.inspect().animBoard,null);assert.deepEqual(app.inspect().board,before);
   await app.clock.tick(301);assert.equal(app.inspect().phase,'ai-moving');assert(app.inspect().flight);assert.equal(app.inspect().history.length,1);
   await app.clock.tick(1000);assert.equal(app.inspect().phase,'human');assert.equal(app.inspect().history.length,2);assertNoErrors(app);
   const final=app.inspect();await app.clock.tick(15000);assert.deepEqual(app.inspect(),final);assert.equal(app.blobs.size,0);
 });
 await test('Slow pace waits at least 2.5 seconds before any AI movement',async()=>{
   const app=loadApp(html);app.nodes.get('pace').value='slow';opening(app);await app.clock.tick(2499);assert.equal(app.inspect().phase,'ai-thinking');
   await app.clock.tick(2800);assert.equal(app.inspect().phase,'human');assert.equal(app.inspect().history.length,2);assertNoErrors(app);
 });
 await test('Reproduced double-jump position completes the forced chain as exactly one AI turn',async()=>{
   const app=loadApp(html);app.fixture(sample());app.clickSquare(56);app.clickSquare(49);await app.clock.tick(6000);
   const s=app.inspect();assert.equal(s.board[35],0);assert.equal(s.board[44],0);assert.equal(s.board[53],-1);assert.equal(s.history[1].captures,2);assert.equal(s.history.length,2);assert.equal(s.phase,'human');
   await app.clock.tick(30000);assert.deepEqual(app.inspect(),s);assertNoErrors(app);
 });
 await test('AI capture chain is animated jump by jump but commits once',async()=>{
   const app=loadApp(html);app.fixture(sample(),'standard');app.clickSquare(56);app.clickSquare(49);
   await app.clock.tick(2450);assert.equal(app.api.state.animBoard[35],-1);assert.equal(app.inspect().history.length,1);
   await app.clock.tick(1000);assert.equal(app.api.state.animBoard[53],-1);assert.equal(app.inspect().history.length,1);
   await app.clock.tick(350);assert.equal(app.inspect().history.length,2);assert.equal(app.inspect().history[1].captures,2);assert.equal(app.inspect().phase,'human');assertNoErrors(app);
 });
 await test('Rapid repeated human clicks cannot queue another AI turn',async()=>{
   const app=loadApp(html);const stale=app.nodes.get('board').children.find(e=>e.dataset.i==='40');opening(app);
   for(let i=0;i<200;i++){app.api.humanClick(40);app.api.humanClick(33);stale.click();}
   await app.clock.tick(20000);assert.equal(app.inspect().history.length,2);assert.equal(app.inspect().phase,'human');assertNoErrors(app);
 });
 for(const mode of ['normal','duplicate','constructor-error','post-error','error','messageerror','silent','wrong-id','illegal','malformed']){
   await test('Worker fault handling: '+mode+' produces one legal reply',async()=>{
     const app=loadApp(html,{workerMode:mode});opening(app);const afterHuman=new Int8Array(app.api.state.board),legal=C.getLegalMoves(afterHuman,-1);
     await app.clock.tick(15000);assert.equal(app.inspect().history.length,2);assert.equal(app.inspect().phase,'human');
     assert(legal.some(m=>Array.from(C.applyMove(afterHuman,m)).join(',')===app.inspect().board.join(',')));
     const s=app.inspect();await app.clock.tick(20000);assert.deepEqual(app.inspect(),s);assert.equal(app.blobs.size,0);assertNoErrors(app);
   });
 }
 await test('No Worker API: the offline fallback still plays once',async()=>{
   const app=loadApp(html,{noWorker:true});opening(app);await app.clock.tick(15000);assert.equal(app.inspect().history.length,2);assert.equal(app.inspect().phase,'human');assertNoErrors(app);
 });
 await test('Late worker result after timeout cannot duplicate the fallback reply',async()=>{
   const app=loadApp(html,{workerDelay:6000});opening(app);await app.clock.tick(20000);assert.equal(app.inspect().history.length,2);assert.equal(app.inspect().phase,'human');assertNoErrors(app);
 });
 for(const at of [0,100,1500,1800,2200,2450]){
   await test('New Game at '+at+' ms cancels pending AI work and animation',async()=>{
     const app=loadApp(html);opening(app);await app.clock.tick(at);app.nodes.get('newBtn').click();const clean=app.inspect();
     await app.clock.tick(20000);assert.deepEqual(app.inspect(),clean);assert.equal(clean.history.length,0);assert.equal(clean.phase,'human');assert.equal(app.blobs.size,0);assertNoErrors(app);
   });
   await test('Undo at '+at+' ms restores both turns and cancels AI work',async()=>{
     const app=loadApp(html);const initial=app.inspect();opening(app);await app.clock.tick(at);assert.equal(app.nodes.get('undoBtn').disabled,false);app.nodes.get('undoBtn').click();
     await app.clock.tick(20000);assert.deepEqual(app.inspect().board,initial.board);assert.equal(app.inspect().history.length,0);assert.equal(app.inspect().phase,'human');assertNoErrors(app);
   });
 }
 await test('Restart during fallback wait cannot apply an old board to the new game',async()=>{
   const app=loadApp(html,{workerMode:'silent'});opening(app);await app.clock.tick(2500);app.nodes.get('newBtn').click();opening(app);
   await app.clock.tick(15000);assert.equal(app.inspect().history.length,2);assert.equal(app.inspect().phase,'human');assertNoErrors(app);
 });
 await test('Undo completed round restores board, move history and draw counters',async()=>{
   const app=loadApp(html);const initial=app.inspect();opening(app);await app.clock.tick(6000);app.nodes.get('undoBtn').click();
   assert.deepEqual(app.inspect(),initial);assert.equal(app.api.state.repetitions.size,1);assertNoErrors(app);
 });
 await test('Standard human loop capture commits once and allows Undo after game over',async()=>{
   const app=loadApp(html);const b=board([[42,2],[35,-1],[19,-1],[17,-1],[33,-1]]);app.fixture(b,'standard');
   for(const i of [42,28,10,24,42])app.clickSquare(i);
   assert.equal(app.inspect().phase,'gameover');assert.equal(app.inspect().history.length,1);assert.equal(app.inspect().board[42],2);assert.equal(app.nodes.get('statusTitle').textContent,'You win!');
   app.nodes.get('undoBtn').click();assert.equal(app.inspect().phase,'human');assert.deepEqual(app.inspect().board,Array.from(b));await app.clock.tick(5000);assert.equal(app.inspect().history.length,0);assertNoErrors(app);
 });
 await test('Human capture chain cannot switch pieces; Undo cancels the uncommitted chain',()=>{
   const app=loadApp(html);const b=board([[42,2],[35,-1],[19,-1],[17,-1],[33,-1],[62,1]]);app.fixture(b,'standard');
   app.clickSquare(42);app.clickSquare(28);app.clickSquare(62);app.clickSquare(42);assert.deepEqual(app.inspect().prefix,[42,28]);
   app.nodes.get('undoBtn').click();assert.deepEqual(app.inspect().prefix,[]);assert.deepEqual(app.inspect().board,Array.from(b));assert.equal(app.inspect().history.length,0);assertNoErrors(app);
 });
 await test('Game-over uses next player mobility; AI win can be undone',async()=>{
   const app=loadApp(html);const b=board([[17,-1],[33,1]]);app.fixture(b);app.clickSquare(33);app.clickSquare(26);
   await app.clock.tick(6000);assert.equal(app.inspect().phase,'gameover');assert.equal(app.nodes.get('statusTitle').textContent,'AI wins!');assert.equal(app.inspect().history.length,2);
   app.nodes.get('undoBtn').click();assert.equal(app.inspect().phase,'human');assert.deepEqual(app.inspect().board,Array.from(b));assertNoErrors(app);
 });
 await test('Only the player whose turn is next is checked for blocked movement',()=>{
   const app=loadApp(html);app.fixture(board([[49,-1],[56,1],[58,1]]));
   assert.equal(app.api.checkGameEnd(1),false);assert.equal(app.api.checkGameEnd(-1),true);assert.equal(app.nodes.get('statusTitle').textContent,'You win!');assertNoErrors(app);
 });
 await test('Stale worker callback cannot update a restarted game',async()=>{
   const app=loadApp(html,{workerMode:'silent'});opening(app);const worker=app.workers[0],callback=worker.onmessage,id=worker.payload.id;
   app.nodes.get('newBtn').click();const clean=app.inspect();
   callback({data:{id,ok:true,result:{reply:{move:{path:[17,24],captures:[]}},coach:null}}});
   await app.clock.tick(10000);assert.deepEqual(app.inspect(),clean);assertNoErrors(app);
 });
 await test('Threefold repetition and 80 quiet turns end the game as draws',()=>{
   const app=loadApp(html);const key=C.positionKey(app.api.state.board,1);app.api.state.repetitions.set(key,3);assert.equal(app.api.checkGameEnd(1),true);assert.equal(app.nodes.get('statusTitle').textContent,'Draw');
   app.api.newGame();app.api.state.quietTurns=80;assert.equal(app.api.checkGameEnd(1),true);assert.equal(app.nodes.get('statusTitle').textContent,'Draw');assertNoErrors(app);
 });
 await test('End-to-end simulated games retain strict human/AI alternation',async()=>{
   for(const rules of ['standard'])for(let game=0;game<10;game++){
     const app=loadApp(html);app.api.newGame();
     for(let turn=0;turn<60&&app.api.state.phase==='human';turn++){
       const moves=app.api.state.legal,m= moves[Math.floor(random()*moves.length)];
       for(const i of m.path)app.clickSquare(i);
       await app.clock.tick(30000);
       const s=app.inspect();assert(s.phase==='human'||s.phase==='gameover');
       s.history.forEach((h,i)=>{assert.equal(h.player,i%2?'ai':'human');});
       assert(s.history.length%2===0||s.phase==='gameover');assertNoErrors(app);
     }
   }
 });
 const result={date:new Date().toISOString(),tests:reports.length,passed:reports.length,stressGames:300,stressPlies,captures,promotions,searchComparisonPositions:positions.length,environment:'Node '+process.version+'; deterministic DOM/timer/worker harness; actual rules and app JavaScript',browserRendering:'Not performed: cloud browser policy blocks file:// previews.',reports};
 if(process.argv.includes('--report'))fs.writeFileSync(path.join(__dirname,'../TEST_RESULTS.json'),JSON.stringify(result,null,2)+'\n');
 console.log('\nALL '+reports.length+' TESTS PASSED · '+stressPlies+' stress plies · '+captures+' captures · '+promotions+' promotions');
})().catch(e=>{console.error('\nFAIL',e.stack);process.exitCode=1;});
