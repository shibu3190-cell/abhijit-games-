// ==========================================
// 1. STATE & NETWORKING (PEER JS)
// ==========================================
let peer, connection, myRole = '', myName = 'Player 1', friendName = 'Player 2';
let activeGame = 'ludo', isChatOpen = false, isMenuOpen = false, isRolling = false;
let activeIntervals = {};

// Enterprise Penalty Trackers
let sConsec1s = 0; 
let lConsec6s = 0;

function toggleMenu() { 
    isMenuOpen = !isMenuOpen; 
    document.getElementById('menuOverlay').classList.toggle('open', isMenuOpen); 
}

function setDiceFace(id, roll) {
    const d = document.getElementById(id); if(!d) return; d.innerHTML = '';
    const p = { 1:[4], 2:[0,8], 3:[0,4,8], 4:[0,2,6,8], 5:[0,2,4,6,8], 6:[0,2,3,5,6,8] };
    for(let i=0; i<9; i++) {
        let dot = document.createElement('div'); dot.style.width='100%'; dot.style.height='100%'; dot.style.borderRadius='50%';
        if(p[roll] && p[roll].includes(i)) { dot.style.background='#202124'; dot.style.boxShadow='inset 0 2px 3px rgba(0,0,0,0.6)'; } 
        d.appendChild(dot);
    }
}

async function initPeer() {
    if(document.getElementById('playerName').value.trim()) myName = document.getElementById('playerName').value.trim();
    const rid = Math.random().toString(36).substr(2, 4).toUpperCase();
    return new Promise((res) => {
        peer = new Peer(rid, { 
            config: { 
                'iceServers': [
                    { urls: 'stun:stun.l.google.com:19302' },
                    { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
                ] 
            }
        });
        peer.on('open', id => res(id));
        peer.on('disconnected', () => { peer.reconnect(); });
        peer.on('error', err => { document.getElementById('myIdDisplay').innerText = "Failed."; });
    });
}

function handleDisconnectUI(disconnected) {
    document.getElementById('disconnectOverlay').style.display = disconnected ? 'flex' : 'none';
}

async function hostGame() { 
    document.getElementById('myIdDisplay').innerText = "GENERATING..."; const id = await initPeer(); 
    if(id) { 
        document.getElementById('myIdDisplay').innerText = id; 
        peer.on('connection', (conn) => { 
            connection = conn; setupListeners();
            conn.on('open', () => {
                handleDisconnectUI(false);
                if (document.getElementById('setupPanel').style.display === 'none') {
                    conn.send({ type: 'reconnectSync', ludoState, sllPlayers, sllTurn, portals, tttBoard, isMyTurnTTT: !isMyTurnTTT, hostName: myName, sConsec1s, lConsec6s });
                    appendChat('System', `Guest Reconnected!`);
                } else { myRole = 'Host'; startGame(); }
            });
        }); 
    } 
}

async function joinGame() { 
    const fid = document.getElementById('joinId').value.trim().toUpperCase(); if (!fid) return; 
    document.getElementById('joinId').value = "Connecting...";
    await initPeer(); connection = peer.connect(fid); 
    connection.on('open', () => { handleDisconnectUI(false); myRole = 'Guest'; setupListeners(); startGame(); }); 
}

function startGame() {
    document.getElementById('setupPanel').style.display = 'none'; 
    document.getElementById('navMenuBtn').style.display = 'block'; 
    document.getElementById('chatToggleBtn').style.display = 'flex';
    document.getElementById('controlDock').style.display = 'flex';
    
    setDiceFace('diceHost', 6); setDiceFace('diceGuest', 6);
    updateNameUI(); connection.send({ type: 'init', name: myName }); appendChat('System', `You joined as ${myName}.`);
    if(myRole === 'Host') { portals = generateRandomPortals(); connection.send({ type: 'initSnakesMap', portals }); initSnakes(); }
    initTTT(); initLudo(); switchGame('ludo');
    
    window.addEventListener('resize', () => { if(activeGame === 'snakes') { drawPortalsSVG(); setupTokens(); } });
}

function updateNameUI() {
    const h = myRole === 'Host' ? myName+" (You)" : friendName; const g = myRole === 'Guest' ? myName+" (You)" : friendName;
    let iconH = activeGame==='ttt' ? '❌' : '🔴'; let iconG = activeGame==='ttt' ? '⭕' : (activeGame==='ludo'?'🟡':'🔵');
    document.getElementById('p1Name').innerText = `${h} ${iconH}`; document.getElementById('p2Name').innerText = `${g} ${iconG}`;
}

function setupListeners() {
    connection.on('close', () => handleDisconnectUI(true));
    connection.on('error', () => handleDisconnectUI(true));

    connection.on('data', (data) => {
        if (data.type === 'init') { friendName = data.name; updateNameUI(); appendChat('System', `${friendName} connected!`); updateAllUI(); }
        if (data.type === 'reconnectSync') {
            friendName = data.hostName; ludoState = data.ludoState; sllPlayers = data.sllPlayers; sllTurn = data.sllTurn; portals = data.portals; tttBoard = data.tttBoard; isMyTurnTTT = data.isMyTurnTTT; sConsec1s = data.sConsec1s; lConsec6s = data.lConsec6s;
            document.getElementById('setupPanel').style.display = 'none'; document.getElementById('navMenuBtn').style.display = 'block'; document.getElementById('chatToggleBtn').style.display = 'flex'; document.getElementById('controlDock').style.display = 'flex';
            updateNameUI(); initSnakes(); updateAllUI(); appendChat('System', `Reconnected!`);
        }
        if (data.type === 'chat') appendChat(friendName, data.msg, 'msg-them');
        
        if (myRole === 'Host') {
            if (data.type === 'requestRoll') hostGenerateRoll(data.game, 'Guest');
            if (data.type === 'requestLudoMove') { let t = ludoState.tokens['Guest'].find(x => x.id === data.tokenId); if (t) attemptLudoMove(t, ludoState.roll); }
            if (data.type === 'requestTTTMove') executeTTTMove(data.index, 'O');
        }

        if (data.type === 'diceRollAnim') playDiceAnimation(data);
        if (data.type === 'tttSync') { tttBoard = data.board; isMyTurnTTT = data.turn === myRole; updateTTTLocal(); }
        if (data.type === 'initSnakesMap') { portals = data.portals; initSnakes(); }
        if (data.type === 'snakesSync') handleSnakesSync(data);
        if (data.type === 'ludoSync') handleLudoSync(data); 
    });
}

function toggleChat() { isChatOpen = !isChatOpen; const p = document.getElementById('chatPanel'), b = document.getElementById('chatBadge'); if (isChatOpen) { p.style.display = 'block'; b.style.display = 'none'; document.getElementById('chatBox').scrollTop = document.getElementById('chatBox').scrollHeight; } else { p.style.display = 'none'; } }
function sendChat() { const i = document.getElementById('chatInput'); const m = i.value.trim(); if (!m) return; appendChat('You', m, 'msg-me'); connection.send({ type: 'chat', msg: m }); i.value = ''; }
function handleChatKeyPress(e) { if (e.key === 'Enter') sendChat(); }
function appendChat(s, m, c = 'msg-system') { const b = document.getElementById('chatBox'); b.innerHTML += `<div class="${c}"><b>${s}:</b> ${m}</div>`; b.scrollTop = b.scrollHeight; if (!isChatOpen && c === 'msg-them') document.getElementById('chatBadge').style.display = 'flex'; }

function switchGame(gid) { 
    isRolling = false; document.querySelectorAll('.rolling').forEach(e => e.classList.remove('rolling'));
    document.querySelectorAll('.game-section').forEach(e => e.classList.remove('active-game')); document.getElementById(gid).classList.add('active-game'); 
    activeGame = gid; updateNameUI(); updateAllUI(); 
    
    const dh = document.getElementById('diceHost'), dg = document.getElementById('diceGuest');
    if(gid === 'ttt') { dh.style.display='none'; dg.style.display='none'; } else { dh.style.display='grid'; dg.style.display='grid'; }
    if(gid === 'snakes') requestAnimationFrame(() => setTimeout(() => { drawPortalsSVG(); setupTokens(); }, 50)); 
}

function updateAllUI() { 
    if(activeGame === 'ttt') document.getElementById('gameStatus').innerText = isMyTurnTTT ? "Your Turn!" : `${friendName}'s Turn...`; 
    if(activeGame === 'ludo') updateLudoUI(); 
    if(activeGame === 'snakes') updateDiceTurnUI(); 
}

function resetCurrentGame() {
    if(myRole !== 'Host') return alert("Only the Host can reset the game.");
    if(activeGame === 'ttt') { tttBoard = ['','','','','','','','','']; isMyTurnTTT = true; connection.send({type: 'tttSync', board: tttBoard, turn: 'Host'}); updateTTTLocal(); }
    else if(activeGame === 'snakes') { portals = generateRandomPortals(); sllPlayers = {'Host':{pos:0,class:'Host'},'Guest':{pos:0,class:'Guest'}}; sllTurn = 'Host'; sConsec1s = 0; connection.send({type: 'initSnakesMap', portals}); connection.send({type: 'snakesSync', players: sllPlayers, nextTurn: sllTurn, msg: "New Game!"}); initSnakes(); }
    else if(activeGame === 'ludo') { ludoState = getInitialLudoState(); lConsec6s = 0; connection.send({type: 'ludoSync', state: ludoState}); updateLudoUI(); }
}

// ==========================================
// 2. UNIFIED DICE ENGINE
// ==========================================
function requestUniversalRoll(clickedRole) {
    if (clickedRole !== myRole || isRolling) return;
    if(activeGame === 'ludo' && (ludoState.turn !== myRole || ludoState.hasRolled)) return;
    if(activeGame === 'snakes' && sllTurn !== myRole) return;
    
    if (myRole === 'Guest') connection.send({ type: 'requestRoll', game: activeGame }); 
    else hostGenerateRoll(activeGame, 'Host');
}

function hostGenerateRoll(gameType, role) {
    const finalRoll = Math.floor(Math.random()*6)+1;
    const payload = { type: 'diceRollAnim', game: gameType, role: role, result: finalRoll, ts: Date.now() };
    playDiceAnimation(payload); 
    connection.send(payload); 
}

function playDiceAnimation(data) {
    isRolling = true; const dice = document.getElementById(`dice${data.role}`); dice.classList.add('rolling');
    if(activeIntervals['dice']) clearInterval(activeIntervals['dice']);

    let ticks = 0; 
    activeIntervals['dice'] = setInterval(() => {
        setDiceFace(`dice${data.role}`, Math.floor(Math.random()*6)+1); ticks++;
        if(ticks > 8) { 
            clearInterval(activeIntervals['dice']); 
            setDiceFace(`dice${data.role}`, data.result); 
            dice.classList.remove('rolling'); isRolling = false;
            
            if (myRole === 'Host') {
                if (data.game === 'snakes') processSnakesRoll(data.result, data.role); 
                if (data.game === 'ludo') processLudoRoll(data.result, data.role);
            }
        }
    }, 60);
}

// ==========================================
// 3. SNAKES & LADDERS (ENTERPRISE LOGIC)
// ==========================================
let sllPlayers = { 'Host': { pos: 0, class: 'Host' }, 'Guest': { pos: 0, class: 'Guest' } }, sllTurn = 'Host', portals = {}; 
function generateRandomPortals() { let p={}; let u = new Set([1, 100]); for(let i=0;i<6;i++){ let s=getRandFree(u,2,80); let e=getRandFree(u,s+10,99); p[s]=e; u.add(s); u.add(e); } for(let i=0;i<6;i++){ let s=getRandFree(u,20,99); let e=getRandFree(u,2,s-10); p[s]=e; u.add(s); u.add(e); } return p; }
function getRandFree(u, min, max) { let v; do{ v=Math.floor(Math.random()*(max-min+1))+min; }while(u.has(v)); return v; }

function initSnakes() { 
    const b = document.getElementById('snakesBoard'); b.querySelectorAll('.snakes-cell, .token').forEach(e => e.remove());
    let l2r = true; 
    for (let r=10; r>=1; r--) { let cells=[]; for(let c=1; c<=10; c++) cells.push((r-1)*10+c); if(!l2r) cells.reverse(); 
        cells.forEach((num, idx) => { const cell=document.createElement('div'); cell.className='snakes-cell'; cell.id=`scell-${num}`; cell.innerText=num; cell.style.background = (r+idx)%2===0 ? '#ffca3a':'#ffea00'; b.appendChild(cell); }); l2r=!l2r; } 
    if(activeGame === 'snakes') requestAnimationFrame(()=>setTimeout(() => { drawPortalsSVG(); setupTokens(); updateDiceTurnUI(); }, 50));
}

function drawPortalsSVG() {
    const svg = document.getElementById('snakesSvg'); svg.innerHTML = ''; 
    Object.keys(portals).forEach(s => {
        let e = portals[s]; let c1 = document.getElementById(`scell-${s}`); let c2 = document.getElementById(`scell-${e}`);
        if(c1 && c2 && c1.offsetWidth>0) { 
            let x1=c1.offsetLeft+c1.offsetWidth/2, y1=c1.offsetTop+c1.offsetHeight/2, x2=c2.offsetLeft+c2.offsetWidth/2, y2=c2.offsetTop+c2.offsetHeight/2;
            let isLadder = e > s; let dx=x2-x1, dy=y2-y1, len=Math.sqrt(dx*dx+dy*dy), nx=-dy/len, ny=dx/len;
            if(isLadder) {
                let r=6, r1=`<line x1="${x1+nx*r}" y1="${y1+ny*r}" x2="${x2+nx*r}" y2="${y2+ny*r}" stroke="#4285f4" stroke-width="4" stroke-linecap="round" />`, r2=`<line x1="${x1-nx*r}" y1="${y1-ny*r}" x2="${x2-nx*r}" y2="${y2-ny*r}" stroke="#4285f4" stroke-width="4" stroke-linecap="round" />`; svg.innerHTML+=r1+r2;
            } else {
                let c1x=x1+dx*0.3+nx*30, c1y=y1+dy*0.3+ny*30, c2x=x1+dx*0.7-nx*30, c2y=y1+dy*0.7-ny*30;
                svg.innerHTML+=`<path d="M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}" fill="none" stroke="#00A551" stroke-width="8" stroke-linecap="round" />`;
            }
        }
    });
}

function setupTokens() { ['Host', 'Guest'].forEach(k => { let t = document.getElementById(`token-${k}`); if(!t) { t=document.createElement('div'); t.id=`token-${k}`; t.className=`token ${sllPlayers[k].class}`; document.getElementById('snakesBoard').appendChild(t); } moveTokenDOM(k, sllPlayers[k].pos); }); }

function moveTokenDOM(k, p) { 
    let t = document.getElementById(`token-${k}`);
    if (p === 0) { t.style.display = 'none'; return; } // Hide if off board
    t.style.display = 'block';
    let c = document.getElementById(`scell-${p}`); 
    if(t&&c&&c.offsetWidth>0){ let off = k==='Host'?-4:4; t.style.transform=`translate(${c.offsetLeft+c.offsetWidth/2-10+off}px, ${c.offsetTop+c.offsetHeight/2-10+off}px)`; } 
}

function processSnakesRoll(roll, role) { 
    let p = sllPlayers[role];
    let cur = p.pos;
    let nextTurn = (role === 'Host') ? 'Guest' : 'Host';
    let bonus = false;

    // 1. Triple-1 Penalty Check
    if (roll === 1) {
        sConsec1s++;
        if (sConsec1s === 3) {
            sConsec1s = 0;
            let data = { type: 'snakesSync', players:sllPlayers, nextTurn:nextTurn, msg:"Triple 1s! Turn Skipped.", animData:{player:role, intPos:cur, finPos:cur} };
            connection.send(data); handleSnakesSync(data); return;
        }
        bonus = true; 
    } else { sConsec1s = 0; }

    // 2. Exact 100 & Entry Logic
    let target = cur;
    if (cur === 0) { if (roll === 1) target = 1; } // 1 to enter
    else if (cur + roll > 100) { target = cur; } // Exact roll required
    else { target = cur + roll; }

    let fin = portals[target] ? portals[target] : target;
    p.pos = fin;
    let msg = `Rolled ${roll}. ` + (portals[target] ? (fin>target ? "🪜 Climbed!" : "🐍 Slide!") : ""); 
    
    if(fin === 100){ msg="🏆 YOU WIN!"; nextTurn='none'; } 
    else if(bonus) { nextTurn = role; msg+=" Extra Roll!"; }

    let data = { type: 'snakesSync', players:sllPlayers, nextTurn:nextTurn, msg, animData:{player:role, intPos:target, finPos:fin} };
    connection.send(data); handleSnakesSync(data);
}

function handleSnakesSync(data) { 
    sllPlayers=data.players; sllTurn=data.nextTurn; if(activeGame==='snakes') document.getElementById('gameStatus').innerText=`${sllTurn!==myRole ? myName : friendName}: ${data.msg}`; 
    const {player,intPos,finPos} = data.animData; moveTokenDOM(player,intPos); 
    document.getElementById('diceHost').style.pointerEvents='none'; document.getElementById('diceGuest').style.pointerEvents='none'; 
    if(intPos!==finPos){ setTimeout(()=>{ moveTokenDOM(player,finPos); setTimeout(updateDiceTurnUI,600); }, 600); } else setTimeout(updateDiceTurnUI,600); 
}

function updateDiceTurnUI() { 
    if(activeGame !== 'snakes') return;
    const h=document.getElementById('diceHost'), g=document.getElementById('diceGuest');
    if(sllTurn==='Host') { h.style.opacity='1'; h.style.pointerEvents=myRole==='Host'?'auto':'none'; g.style.opacity='0.3'; g.style.pointerEvents='none'; if(!document.getElementById('gameStatus').innerText.includes("again")) document.getElementById('gameStatus').innerText=myRole==='Host'?"Your Turn!":`${friendName}'s Turn`; }
    else if(sllTurn==='Guest') { g.style.opacity='1'; g.style.pointerEvents=myRole==='Guest'?'auto':'none'; h.style.opacity='0.3'; h.style.pointerEvents='none'; if(!document.getElementById('gameStatus').innerText.includes("again")) document.getElementById('gameStatus').innerText=myRole==='Guest'?"Your Turn!":`${friendName}'s Turn`; }
    else { h.style.pointerEvents='none'; g.style.pointerEvents='none'; }
}

// ==========================================
// 4. LUDO PRO (ENTERPRISE LOGIC)
// ==========================================
let ludoCanvas = document.getElementById('ludoCanvas'); let lctx = ludoCanvas.getContext('2d'); const CS = 40; const logicalSize = 600;
let isLudoRendering = false; 

const ludoPath = [[6,13],[6,12],[6,11],[6,10],[6,9],[5,8],[4,8],[3,8],[2,8],[1,8],[0,8],[0,7],[0,6],[1,6],[2,6],[3,6],[4,6],[5,6],[6,5],[6,4],[6,3],[6,2],[6,1],[6,0],[7,0],[8,0],[8,1],[8,2],[8,3],[8,4],[8,5],[9,6],[10,6],[11,6],[12,6],[13,6],[14,6],[14,7],[14,8],[13,8],[12,8],[11,8],[10,8],[9,8],[8,9],[8,10],[8,11],[8,12],[8,13],[8,14],[7,14],[6,14]];
const safeZones = [0, 8, 13, 21, 26, 34, 39, 47];
const redHomePath = [[7,13],[7,12],[7,11],[7,10],[7,9]]; const yellowHomePath = [[7,1],[7,2],[7,3],[7,4],[7,5]];

let ludoState = getInitialLudoState();
function getInitialLudoState() { return { turn: 'Host', roll: 0, hasRolled: false, tokens: { 'Host': [ { id: 'H1', state: 'base', pos: 0, player: 'Host', bx: 2.2*CS, by: 11.2*CS, x: 2.2*CS, y: 11.2*CS, targetX: 2.2*CS, targetY: 11.2*CS, z: 0, visualPos: 0, isFlyingBack: false, flyDist: 0 }, { id: 'H2', state: 'base', pos: 0, player: 'Host', bx: 3.8*CS, by: 11.2*CS, x: 3.8*CS, y: 11.2*CS, targetX: 3.8*CS, targetY: 11.2*CS, z: 0, visualPos: 0, isFlyingBack: false, flyDist: 0 }, { id: 'H3', state: 'base', pos: 0, player: 'Host', bx: 2.2*CS, by: 12.8*CS, x: 2.2*CS, y: 12.8*CS, targetX: 2.2*CS, targetY: 12.8*CS, z: 0, visualPos: 0, isFlyingBack: false, flyDist: 0 }, { id: 'H4', state: 'base', pos: 0, player: 'Host', bx: 3.8*CS, by: 12.8*CS, x: 3.8*CS, y: 12.8*CS, targetX: 3.8*CS, targetY: 12.8*CS, z: 0, visualPos: 0, isFlyingBack: false, flyDist: 0 } ], 'Guest': [ { id: 'G1', state: 'base', pos: 0, player: 'Guest', bx: 11.2*CS, by: 2.2*CS, x: 11.2*CS, y: 2.2*CS, targetX: 11.2*CS, targetY: 2.2*CS, z: 0, visualPos: 0, isFlyingBack: false, flyDist: 0 }, { id: 'G2', state: 'base', pos: 0, player: 'Guest', bx: 12.8*CS, by: 2.2*CS, x: 12.8*CS, y: 2.2*CS, targetX: 12.8*CS, targetY: 2.2*CS, z: 0, visualPos: 0, isFlyingBack: false, flyDist: 0 }, { id: 'G3', state: 'base', pos: 0, player: 'Guest', bx: 11.2*CS, by: 3.8*CS, x: 11.2*CS, y: 3.8*CS, targetX: 11.2*CS, targetY: 3.8*CS, z: 0, visualPos: 0, isFlyingBack: false, flyDist: 0 }, { id: 'G4', state: 'base', pos: 0, player: 'Guest', bx: 12.8*CS, by: 3.8*CS, x: 12.8*CS, y: 3.8*CS, targetX: 12.8*CS, targetY: 3.8*CS, z: 0, visualPos: 0, isFlyingBack: false, flyDist: 0 } ] } }; }

function initLudo() { 
    if (!ludoCanvas.hasAttribute('data-scaled')) {
        const dpr = window.devicePixelRatio || 1; ludoCanvas.width = logicalSize * dpr; ludoCanvas.height = logicalSize * dpr;
        lctx.scale(dpr, dpr); ludoCanvas.setAttribute('data-scaled', 'true');
    }
    if(!isLudoRendering) { isLudoRendering = true; requestAnimationFrame(renderLudoAnimation); }
    updateLudoUI(); 
}

function processLudoRoll(roll, role) {
    ludoState.roll=roll; ludoState.hasRolled=true; let valid=false;
    ludoState.tokens[role].forEach(t => { if((t.state==='base'&&roll===6) || (t.state==='path'&&t.pos+roll<=56) || (t.state==='home'&&t.pos+roll<=5)) valid=true; });
    
    // Triple 6 Check handled here before turn ends
    if(roll === 6) lConsec6s++; else lConsec6s = 0;
    if(lConsec6s === 3) {
        lConsec6s = 0; ludoState.hasRolled = false; ludoState.turn = role === 'Host' ? 'Guest' : 'Host';
        appendChat('System', `🚫 Triple 6s! ${role}'s turn skipped.`);
        connection.send({type: 'ludoSync', state: ludoState}); updateLudoUI(); return;
    }

    if(!valid){ if(activeGame==='ludo') document.getElementById('gameStatus').innerText=`Rolled ${roll}, no moves.`; setTimeout(()=>endLudoTurn(false), 1500); } 
    else { 
        if(activeGame==='ludo') document.getElementById('gameStatus').innerText=`Rolled ${roll}! Tap a token.`; 
        connection.send({type: 'ludoSync', state: ludoState}); 
    }
}

function handleLudoTap(cx, cy) {
    if (ludoState.turn !== myRole || !ludoState.hasRolled) return;
    for (let t of ludoState.tokens[myRole]) {
        if (Math.sqrt((cx - t.targetX)**2 + (cy - t.targetY)**2) <= 40) { 
            if(myRole==='Guest') connection.send({type:'requestLudoMove', tokenId:t.id}); 
            else attemptLudoMove(t, ludoState.roll); 
            return; 
        }
    }
}
ludoCanvas.addEventListener("touchstart", (e) => { e.preventDefault(); if(e.touches.length>0){ const rect=ludoCanvas.getBoundingClientRect(); handleLudoTap((e.touches[0].clientX-rect.left)*(logicalSize/rect.width), (e.touches[0].clientY-rect.top)*(logicalSize/rect.height)); } }, {passive: false});

function attemptLudoMove(t, roll) {
    if(t.state==='base') { if(roll!==6) return false; t.state='path'; t.pos=0; t.visualPos=0; } 
    else if(t.state==='path') { if(t.pos+roll>56) return false; t.pos+=roll; if(t.pos>50){ t.state='home'; t.pos=(t.pos-50)-1; } } 
    else if(t.state==='home') { if(t.pos+roll>5) return false; t.pos+=roll; if(t.pos===5){ t.state='done'; appendChat('System', `🌟 Token HOME!`); } } 
    else return false;
    let cap = checkCaptures(t); endLudoTurn(cap); return true;
}

function checkCaptures(myT) {
    if(myT.state!=='path') return false; let myP = (myT.player==='Host') ? myT.pos : (myT.pos+26)%52; let cap=false;
    if(!safeZones.includes(myP)) {
        ludoState.tokens[myRole==='Host'?'Guest':'Host'].forEach(e => {
            if(e.state==='path' && ((e.player==='Host'?e.pos:(e.pos+26)%52) === myP)) { e.state='base'; e.pos=0; e.visualPos=0; e.isFlyingBack=true; e.flyDist=Math.sqrt(Math.pow(e.bx-e.x,2)+Math.pow(e.by-e.y,2)); appendChat('System', `⚔️ Captured! Extra turn!`); cap=true; }
        });
    } return cap;
}

function endLudoTurn(cap = false) {
    let roll = ludoState.roll;
    let win=true; ludoState.tokens[myRole].forEach(t=>{if(t.state!=='done') win=false;});
    if(win) { ludoState.turn='none'; if(activeGame==='ludo') document.getElementById('gameStatus').innerText="🏆 YOU WIN! 🏆"; connection.send({type:'ludoSync',state:ludoState,msg:"win"}); return; }
    
    // Enterprise Extra Turn Logic (1, 6, or Capture)
    let bonus = (roll === 6 || roll === 1 || cap);
    ludoState.hasRolled = false; 
    
    if(bonus) { ludoState.turn = myRole; appendChat('System', `🎲 Bonus Roll!`); } 
    else { ludoState.turn = myRole==='Host'?'Guest':'Host'; lConsec6s = 0; }
    
    updateLudoUI(); connection.send({type:'ludoSync',state:ludoState});
}

function handleLudoSync(data) { 
    let old=ludoState; ludoState=data.state; ['Host','Guest'].forEach(k=>{ ludoState.tokens[k].forEach((t,i)=>{ t.x=old.tokens[k][i].x; t.y=old.tokens[k][i].y; t.z=old.tokens[k][i].z; t.isFlyingBack=old.tokens[k][i].isFlyingBack; t.flyDist=old.tokens[k][i].flyDist; }); });
    if(data.msg==="win" && activeGame==='ludo'){ document.getElementById('gameStatus').innerText=`🏆 ${friendName} WINS! 🏆`; } else updateLudoUI(); 
}

function updateLudoUI() {
    if(activeGame !== 'ludo' || ludoState.turn==='none') return;
    const h=document.getElementById('diceHost'), g=document.getElementById('diceGuest');
    if(ludoState.turn==='Host') { h.style.opacity='1'; h.style.pointerEvents=(myRole==='Host'&&!ludoState.hasRolled)?'auto':'none'; g.style.opacity='0.3'; g.style.pointerEvents='none'; if(!ludoState.hasRolled) document.getElementById('gameStatus').innerText=myRole==='Host'?"Your Turn! Tap dice.":`${friendName}'s Turn`; }
    else { g.style.opacity='1'; g.style.pointerEvents=(myRole==='Guest'&&!ludoState.hasRolled)?'auto':'none'; h.style.opacity='0.3'; h.style.pointerEvents='none'; if(!ludoState.hasRolled) document.getElementById('gameStatus').innerText=myRole==='Guest'?"Your Turn! Tap dice.":`${friendName}'s Turn`; }
}

function drawPawn(ctx, x, y, color, z = 0) {
    y = y - z; let dc=color==='Host'?'#990000':'#b38600', mc=color==='Host'?'#E3000F':'#FFD100', lc=color==='Host'?'#ff6666':'#ffea75';
    ctx.beginPath(); ctx.ellipse(x, y+z+4, 11, 5, 0, 0, Math.PI*2); ctx.fillStyle=`rgba(0,0,0,${z>0?0.15:0.35})`; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y+3, 11, 5, 0, 0, Math.PI*2); ctx.fillStyle=dc; ctx.fill();
    ctx.beginPath(); ctx.ellipse(x, y+1, 11, 5, 0, 0, Math.PI*2); ctx.fillStyle=mc; ctx.fill();
    ctx.beginPath(); ctx.moveTo(x-10, y+1); ctx.lineTo(x+10, y+1); ctx.lineTo(x+4, y-10); ctx.lineTo(x-4, y-10); let g = ctx.createLinearGradient(x-10,0,x+10,0); g.addColorStop(0,dc); g.addColorStop(0.3,mc); g.addColorStop(0.7,lc); g.addColorStop(1,dc); ctx.fillStyle=g; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y-13, 8, 0, Math.PI*2); let hg = ctx.createRadialGradient(x-3,y-16,2,x,y-13,8); hg.addColorStop(0,lc); hg.addColorStop(0.6,mc); hg.addColorStop(1,dc); ctx.fillStyle=hg; ctx.fill();
    ctx.strokeStyle="rgba(255,255,255,0.3)"; ctx.lineWidth=1; ctx.stroke();
}

function renderLudoAnimation() {
    if(document.hidden || activeGame !== 'ludo') { requestAnimationFrame(renderLudoAnimation); return; } // Saves Battery
    Object.values(ludoState.tokens).flat().forEach(t => {
        if (t.visualPos !== t.pos && !t.isFlyingBack) { let diff=t.pos-t.visualPos; t.visualPos += Math.sign(diff)*Math.min(Math.abs(diff), 0.15); if(Math.abs(t.pos-t.visualPos)<0.01) t.visualPos=t.pos; }
        if(t.state==='base'){ t.targetX=t.bx; t.targetY=t.by; } 
        else if(t.state==='path'){ let o=t.player==='Host'?0:26, i1=Math.floor(t.visualPos), i2=Math.min(i1+1,51), f=t.visualPos-i1; let p1=ludoPath[(i1+o)%52], p2=ludoPath[(i2+o)%52]; if((i1+o)%52===51) p2=ludoPath[0]; t.targetX=(p1[0]+(p2[0]-p1[0])*f)*CS+CS/2; t.targetY=(p1[1]+(p2[1]-p1[1])*f)*CS+CS/2; } 
        else if(t.state==='home'){ let p=t.player==='Host'?redHomePath:yellowHomePath, i1=Math.floor(t.visualPos), i2=Math.min(i1+1,4), f=t.visualPos-i1; t.targetX=(p[i1][0]+(p[i2][0]-p[i1][0])*f)*CS+CS/2; t.targetY=(p[i1][1]+(p[i2][1]-p[i1][1])*f)*CS+CS/2; } 
        else if(t.state==='done'){ t.targetX=7.5*CS; t.targetY=7.5*CS; }
    });

    let occ={}; Object.values(ludoState.tokens).flat().forEach(t=>{ if(t.state!=='base'&&!t.isFlyingBack&&t.state!=='done'){ let k=Math.round(t.targetX)+'_'+Math.round(t.targetY); if(!occ[k]) occ[k]=[]; occ[k].push(t); } });
    for(let k in occ) { let g=occ[k]; if(g.length>1){ g.forEach((t,i)=>{ let a=(Math.PI*2*i)/g.length; t.targetX+=Math.cos(a)*8; t.targetY+=Math.sin(a)*8; }); } }

    Object.values(ludoState.tokens).flat().forEach(t => {
        let dx=t.targetX-t.x, dy=t.targetY-t.y; 
        if(t.isFlyingBack) { let cur=Math.sqrt(dx*dx+dy*dy); t.x+=dx*0.1; t.y+=dy*0.1; t.z=Math.max(Math.sin((cur/Math.max(t.flyDist,1))*Math.PI)*45,0); if(cur<2){t.isFlyingBack=false;t.z=0;t.x=t.targetX;t.y=t.targetY;} } 
        else { t.x+=dx*0.4; t.y+=dy*0.4; t.z=(Math.abs(dx)+Math.abs(dy)>1)?Math.min((Math.abs(dx)+Math.abs(dy))*0.8, 15):0; }
    });

    lctx.clearRect(0,0,600,600);
    const cols = ["#00A551", "#FFD100", "#E3000F", "#0072CE"];
    lctx.fillStyle=cols[0]; lctx.fillRect(0,0,6*CS,6*CS); lctx.fillStyle=cols[1]; lctx.fillRect(9*CS,0,6*CS,6*CS); lctx.fillStyle=cols[2]; lctx.fillRect(0,9*CS,6*CS,6*CS); lctx.fillStyle=cols[3]; lctx.fillRect(9*CS,9*CS,6*CS,6*CS); 
    
    lctx.strokeStyle="#333"; lctx.lineWidth=1.5;
    ludoPath.forEach((c, i) => {
        lctx.fillStyle="#fff"; if(i===0) lctx.fillStyle=cols[2]; else if(i===13) lctx.fillStyle=cols[0]; else if(i===26) lctx.fillStyle=cols[1]; else if(i===39) lctx.fillStyle=cols[3];
        lctx.fillRect(c[0]*CS,c[1]*CS,CS,CS); lctx.strokeRect(c[0]*CS,c[1]*CS,CS,CS);
        if(safeZones.includes(i)) { lctx.fillStyle=(i%13===0)?"#fff":"#333"; lctx.font="bold 24px Arial"; lctx.fillText("★",c[0]*CS+8,c[1]*CS+28); }
    });
    
    redHomePath.forEach(c => { lctx.fillStyle=cols[2]; lctx.fillRect(c[0]*CS,c[1]*CS,CS,CS); lctx.strokeRect(c[0]*CS,c[1]*CS,CS,CS); });
    yellowHomePath.forEach(c => { lctx.fillStyle=cols[1]; lctx.fillRect(c[0]*CS,c[1]*CS,CS,CS); lctx.strokeRect(c[0]*CS,c[1]*CS,CS,CS); });
    [[1,7],[2,7],[3,7],[4,7],[5,7]].forEach(c => { lctx.fillStyle=cols[0]; lctx.fillRect(c[0]*CS,c[1]*CS,CS,CS); lctx.strokeRect(c[0]*CS,c[1]*CS,CS,CS); });
    [[13,7],[12,7],[11,7],[10,7],[9,7]].forEach(c => { lctx.fillStyle=cols[3]; lctx.fillRect(c[0]*CS,c[1]*CS,CS,CS); lctx.strokeRect(c[0]*CS,c[1]*CS,CS,CS); });

    lctx.fillStyle="#fff"; lctx.font="24px Arial"; lctx.fillText("⬆",6*CS+8,13*CS+28); lctx.fillText("⬇",8*CS+8,1*CS+28); 
    
    lctx.fillStyle=cols[0]; lctx.beginPath(); lctx.moveTo(6*CS,6*CS); lctx.lineTo(6*CS,9*CS); lctx.lineTo(7.5*CS,7.5*CS); lctx.fill(); lctx.fillStyle=cols[1]; lctx.beginPath(); lctx.moveTo(6*CS,6*CS); lctx.lineTo(9*CS,6*CS); lctx.lineTo(7.5*CS,7.5*CS); lctx.fill(); lctx.fillStyle=cols[2]; lctx.beginPath(); lctx.moveTo(6*CS,9*CS); lctx.lineTo(9*CS,9*CS); lctx.lineTo(7.5*CS,7.5*CS); lctx.fill(); lctx.fillStyle=cols[3]; lctx.beginPath(); lctx.moveTo(9*CS,6*CS); lctx.lineTo(9*CS,9*CS); lctx.lineTo(7.5*CS,7.5*CS); lctx.fill(); lctx.strokeStyle="#333"; lctx.stroke();

    lctx.fillStyle="#fff"; lctx.beginPath(); lctx.roundRect(1*CS,10*CS,4*CS,4*CS,20); lctx.fill(); lctx.stroke(); lctx.beginPath(); lctx.roundRect(10*CS,1*CS,4*CS,4*CS,20); lctx.fill(); lctx.stroke(); lctx.beginPath(); lctx.roundRect(1*CS,1*CS,4*CS,4*CS,20); lctx.fill(); lctx.stroke(); lctx.beginPath(); lctx.roundRect(10*CS,10*CS,4*CS,4*CS,20); lctx.fill(); lctx.stroke(); 
    [[2.5,11.5],[3.5,11.5],[2.5,12.5],[3.5,12.5]].forEach(c=>{ lctx.beginPath();lctx.arc(c[0]*CS,c[1]*CS,12,0,Math.PI*2);lctx.fillStyle=cols[2];lctx.fill(); }); 
    [[11.5,2.5],[12.5,2.5],[11.5,3.5],[12.5,3.5]].forEach(c=>{ lctx.beginPath();lctx.arc(c[0]*CS,c[1]*CS,12,0,Math.PI*2);lctx.fillStyle=cols[1];lctx.fill(); });

    Object.values(ludoState.tokens).flat().forEach(t => drawPawn(lctx, t.x, t.y, t.player, t.z));
    requestAnimationFrame(renderLudoAnimation); 
}

// ==========================================
// 5. TIC-TAC-TOE (Basic Implementation)
// ==========================================
let tttBoard = ['','','','','','','','',''], isMyTurnTTT = false;
const winCombos = [[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];
function initTTT() { isMyTurnTTT = (myRole === 'Host'); const b = document.getElementById('tttBoard'); b.innerHTML = ''; for(let i=0;i<9;i++){ const c = document.createElement('div'); c.className='ttt-cell'; c.id=`tcell-${i}`; c.onclick=()=>requestTTT(i); b.appendChild(c); } if(activeGame==='ttt') document.getElementById('gameStatus').innerText = isMyTurnTTT ? "Your Turn!" : `${friendName}'s Turn...`; }
function requestTTT(i) { if(!isMyTurnTTT || tttBoard[i]!=='') return; if(myRole === 'Guest') connection.send({ type: 'requestTTTMove', index: i }); else executeTTTMove(i, 'X'); }
function executeTTTMove(i, sym) { tttBoard[i] = sym; let next = sym === 'X' ? 'Guest' : 'Host'; connection.send({ type: 'tttSync', board: tttBoard, turn: next }); isMyTurnTTT = (myRole === next); updateTTTLocal(); }
function updateTTTLocal() { for(let i=0;i<9;i++) { const c = document.getElementById(`tcell-${i}`); c.innerText = tttBoard[i]; c.style.color = tttBoard[i] === 'X' ? 'var(--host-color)' : 'var(--guest-color)'; } if(!checkTTTWin() && activeGame==='ttt') document.getElementById('gameStatus').innerText = isMyTurnTTT ? "Your Turn!" : `${friendName}'s Turn...`; }
function checkTTTWin() { for(let w of winCombos) { if(tttBoard[w[0]] && tttBoard[w[0]]===tttBoard[w[1]] && tttBoard[w[0]]===tttBoard[w[2]]) { if(activeGame==='ttt') document.getElementById('gameStatus').innerText = (tttBoard[w[0]]==='X' && myRole==='Host') || (tttBoard[w[0]]==='O' && myRole==='Guest') ? "🏆 You Win!" : `🏆 ${friendName} Wins!`; isMyTurnTTT=false; return true; } } if(!tttBoard.includes('')) { if(activeGame==='ttt') document.getElementById('gameStatus').innerText="Draw!"; isMyTurnTTT=false; return true; } return false; }
