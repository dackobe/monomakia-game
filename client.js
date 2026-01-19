let ws;
let myName = "";
let myImage = ""; // 自分の画像データ(Base64)
let currentHP1 = 5, currentHP2 = 5;
let currentRound = 1;
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// 音声要素の取得
const bgm = document.getElementById('bgm');
const bgmBattle = document.getElementById('bgm-battle');
const seHover = document.getElementById('se-hover'); // ホバー音
const seLogin = document.getElementById('se-login'); // ログイン音
const seNewRoom = document.getElementById('se-newroom'); // 新規ルーム作成音
const seDraw = document.getElementById('se-draw'); // ★追加：あいこ音

// --- ホバー音の自動再生ロジック ---
let lastHoveredElement = null;

document.body.addEventListener('mouseover', (e) => {
  const target = e.target.closest('button, input, .news-tab, .room-item, .card-btn, .avatar-preview, .wait-player-item, .retire-text-btn');

  if (target) {
    if (target !== lastHoveredElement) {
      playHoverSound();
      lastHoveredElement = target;
    }
  } else {
    lastHoveredElement = null;
  }
});

function playHoverSound() {
  if (seHover) {
    seHover.currentTime = 0;
    seHover.volume = 0.4;
    seHover.play().catch(() => {});
  }
}

// --- ENTERボタンでゲーム開始 & BGM再生 ---
function enterGame() {
  if (bgm) {
    bgm.volume = 0.3;
    bgm.play().then(() => {
      console.log("Lobby BGM started successfully.");
    }).catch(e => {
      console.log("BGM play failed:", e);
    });
  }

  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }

  const splash = document.getElementById('splash-overlay');
  if (splash) {
    splash.classList.add('hidden');
    setTimeout(() => { splash.style.display = 'none'; }, 500);
  }
  
  playHoverSound(); 
}

// --- 初期化 & 画面遷移 ---
function initAudioAndLobby() {
  if (seLogin) {
    seLogin.currentTime = 0;
    seLogin.volume = 0.5; 
    seLogin.play().catch(() => {});
  }
  showScreen('screen-lobby');
}

// --- 新規ルーム作成 ---
function createNewRoom() {
  const defaultName = "第" + Math.floor(Math.random() * 1000) + "の場";
  const roomName = prompt("作成するルーム名を入力してください", defaultName);
  if (roomName) {
    if (seNewRoom) {
      seNewRoom.currentTime = 0;
      seNewRoom.play().catch(() => {});
    }
    ws.send(JSON.stringify({ type: "create_room", room: roomName }));
  }
}

// --- リタイアモーダル ---
function openRetireModal() {
  document.getElementById('retire-modal').style.display = 'flex';
  playHoverSound();
}

function closeRetireModal() {
  document.getElementById('retire-modal').style.display = 'none';
  playHoverSound();
}

function confirmRetire() {
  closeRetireModal();
  exitRoom();
}

// --- 退出処理 ---
function exitRoom() {
  if(ws && ws.readyState === WebSocket.OPEN){
    ws.send(JSON.stringify({ type: "leave" }));
  }

  if (bgmBattle) { bgmBattle.pause(); bgmBattle.currentTime = 0; }
  if (bgm && bgm.paused) { bgm.play().catch(()=>{}); }

  const chatLogs = document.querySelectorAll('#wait-chat-log, #battle-chat-log');
  chatLogs.forEach(log => log.innerHTML = "");
  
  const roomDisplay = document.getElementById('room-display');
  if (roomDisplay) roomDisplay.innerText = "Waiting...";

  const pList = document.getElementById('wait-player-list');
  if(pList) pList.innerHTML = "";

  const readyBtn = document.getElementById('ready-btn');
  if(readyBtn) {
    readyBtn.disabled = false;
    readyBtn.innerText = "準備完了";
  }

  const retireContainer = document.getElementById('retire-area-container');
  if(retireContainer) retireContainer.style.display = "none";

  document.getElementById('finish-screen').style.display = "none";

  showScreen('screen-lobby');
}

// --- ルームリスト描画 ---
function renderRoomList(list) {
  const container = document.getElementById('room-list-container');
  if (!container) return;
  container.innerHTML = ""; 
  if (list.length === 0) {
    container.innerHTML = "<div style='color:#554433; text-align:center; padding:20px; font-weight:bold;'>現在ルームはありません。<br>新規作成してください。</div>";
    return;
  }
  list.forEach(room => {
    const isFull = room.count >= 2;
    const isPlaying = room.status === 'playing';
    const disabledAttr = (isFull || isPlaying) ? "disabled" : "";
    let statusText = "募集中";
    if (isPlaying) statusText = "対戦中";
    else if (isFull) statusText = "満員";
    const item = document.createElement('div');
    item.className = `room-item ${isFull || isPlaying ? 'full' : ''}`;
    item.innerHTML = `
      <div class="room-info">
        <div class="room-name">${room.name}</div>
        <div class="room-status">${statusText} (${room.count}/2)</div>
      </div>
      <button class="image-btn join-btn-img" ${disabledAttr} onclick="joinRoom('${room.name}')">
        <img src="btn_join.png" alt="参加">
      </button>
    `;
    container.appendChild(item);
  });
}

// --- 待機画面描画 ---
function renderWaitScreen(members) {
  const container = document.getElementById('wait-player-list');
  if (!container) return;
  container.innerHTML = "";
  for (let i = 0; i < 2; i++) {
    const member = members[i];
    const isReady = member ? member.isReady : false;
    const readyClass = isReady ? 'ready' : '';
    let html = "";
    if (member) {
      const imgStyle = member.image ? `background-image: url(${member.image})` : "";
      html = `<div class="wait-player-item ${readyClass}"><div class="wp-avatar" style="${imgStyle}"></div><div class="wp-name">${member.name}</div><div class="wp-status">${isReady ? '準備完了' : '準備中...'}</div><div class="wp-check">✔</div></div>`;
    } else {
      html = `<div class="wait-player-item"><div class="wp-avatar"></div><div class="wp-name" style="color:#666;">待機中...</div><div class="wp-status"></div><div class="wp-check"></div></div>`;
    }
    container.innerHTML += html;
  }
}

// --- チャット ---
function sendChat() {
  const input = document.getElementById('chat-input');
  const msg = input.value.trim();
  if (msg) {
    ws.send(JSON.stringify({ type: "chat_send", message: msg }));
    input.value = "";
  }
}

function sendBattleChat() {
  const input = document.getElementById('battle-chat-input');
  const msg = input.value.trim();
  if (msg) {
    ws.send(JSON.stringify({ type: "chat_send", message: msg }));
    input.value = "";
  }
}

function appendChatLog(sender, message) {
  const logs = [document.getElementById('wait-chat-log'), document.getElementById('battle-chat-log')];
  logs.forEach(log => {
    if (!log) return;
    const div = document.createElement('div');
    const isSystem = sender === "System";
    div.className = `chat-msg ${isSystem ? 'system' : ''}`;
    div.innerHTML = `<span class="sender">${sender}:</span> ${message}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
  });
}

// --- その他ロジック ---
function switchNewsTab(tabName) {
  const tabNews = document.getElementById('tab-news');
  const tabEvent = document.getElementById('tab-event');
  const contentNews = document.getElementById('content-news');
  const contentEvent = document.getElementById('content-event');

  if (tabName === 'news') {
    tabNews.classList.add('active'); tabEvent.classList.remove('active');
    contentNews.style.display = 'block'; contentEvent.style.display = 'none';
  } else {
    tabNews.classList.remove('active'); tabEvent.classList.add('active');
    contentNews.style.display = 'none'; contentEvent.style.display = 'block';
  }
}

const uploadInput = document.getElementById('image-upload');
if (uploadInput) {
  uploadInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
      const img = new Image();
      img.onload = function() {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        const maxSize = 150;
        let width = img.width; let height = img.height;
        if (width > height) { if (width > maxSize) { height *= maxSize / width; width = maxSize; } } 
        else { if (height > maxSize) { width *= maxSize / height; height = maxSize; } }
        canvas.width = width; canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        myImage = canvas.toDataURL('image/jpeg', 0.8);
        const preview = document.getElementById('avatar-preview');
        preview.style.backgroundImage = `url(${myImage})`;
        preview.innerHTML = "";
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });
}

function playSound(type) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  // draw はmp3に差し替えたため削除 (念のため残す場合はelse ifで分岐)
  if (type === 'damage') { osc.frequency.setValueAtTime(100, now); gain.gain.setValueAtTime(0.3, now); osc.start(); osc.stop(now + 0.3); }
  else if (type === 'hit-success') { osc.frequency.setValueAtTime(800, now); gain.gain.setValueAtTime(0.2, now); osc.start(); osc.stop(now + 0.2); }
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(id);
  if (target) target.classList.add('active');
}

function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);
  ws.onopen = () => {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    const btn = document.getElementById('start-button');
    if(dot) dot.classList.add('dot-online');
    if(text) text.innerText = "ONLINE";
    if(btn) btn.disabled = false;
  };
  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    const log = document.getElementById('log');
    if (data.type === "room_list") renderRoomList(data.list);
    if (data.type === "room_update") renderWaitScreen(data.members);
    if (data.type === "chat_receive") appendChatLog(data.sender, data.message);
    if (data.type === "joined") {
      const chatLog = document.getElementById('wait-chat-log');
      if (chatLog) chatLog.innerHTML = "";
      const roomDisplay = document.getElementById('room-display');
      if (roomDisplay) roomDisplay.innerText = data.room;
      showScreen('screen-wait');
    }
    if (data.type === "error") {
      alert(data.message);
      if(document.getElementById('screen-wait').classList.contains('active')) {
        exitRoom();
      }
    }
    if (data.type === "start") {
      if (bgm) { bgm.pause(); } 
      if (bgmBattle) {
        bgmBattle.volume = 0.3;
        bgmBattle.currentTime = 0;
        bgmBattle.play().catch(()=>{});
      }

      showScreen('screen-game');
      updateHP(5, 5);
      currentHP1 = 5; currentHP2 = 5;
      currentRound = 1;
      document.getElementById('round-count').innerText = currentRound;
      document.getElementById('p1-last-action').innerText = "---";
      document.getElementById('p2-last-action').innerText = "---";
      log.innerHTML = "<div>⚔️ 決闘開始！</div>";
      
      document.getElementById('restart-area').style.display = "none";
      document.getElementById('finish-screen').style.display = "none";
      const retireContainer = document.getElementById('retire-area-container');
      if(retireContainer) retireContainer.style.display = "block";

      const finishBtn = document.getElementById('finish-btn-main');
      if(finishBtn) { finishBtn.disabled = false; finishBtn.innerText = "🔥 もう一度戦う"; }
      
      const p1Label = document.getElementById('p1-name');
      const p2Label = document.getElementById('p2-name');
      p1Label.style.color = "var(--text-sub)";
      p2Label.style.color = "var(--text-sub)";
      p1Label.innerText = data.p1_name;
      p2Label.innerText = data.p2_name;
      const p1Icon = document.getElementById('p1-icon'); const p2Icon = document.getElementById('p2-icon');
      p1Icon.style.backgroundImage = ""; p2Icon.style.backgroundImage = ""; p1Icon.innerHTML = ""; p2Icon.innerHTML = "";
      if(data.p1_image) { p1Icon.style.backgroundImage = `url(${data.p1_image})`; } else { p1Icon.innerHTML = "<span>No<br>Img</span>"; }
      if(data.p2_image) { p2Icon.style.backgroundImage = `url(${data.p2_image})`; } else { p2Icon.innerHTML = "<span>No<br>Img</span>"; }
      if (data.p1_name === myName) { p1Label.style.color = "var(--hp-green)"; p1Label.innerText += " (自分)"; } 
      else if (data.p2_name === myName) { p2Label.style.color = "var(--hp-green)"; p2Label.innerText += " (自分)"; }
      resetCardSelection();
    }
    if (data.type === "result") {
      resetCardSelection();
      currentRound++;
      document.getElementById('round-count').innerText = currentRound;
      const isMyP1 = (data.p1_name === myName);
      const old1 = currentHP1; const old2 = currentHP2;
      currentHP1 = data.p1_hp; currentHP2 = data.p2_hp;
      updateHP(currentHP1, currentHP2);
      const iconMap = { smash: "💥 強襲", guard: "🛡️ 守備", attack: "⚔️ 斬撃", feint: "🃏 避ける", special: "🌀 奇行" };
      document.getElementById('p1-last-action').innerText = iconMap[data.p1_card];
      document.getElementById('p2-last-action').innerText = iconMap[data.p2_card];
      const hands = `<span class="log-hands">${iconMap[data.p1_card]} VS ${iconMap[data.p2_card]}</span>`;
      let logMsg = "";
      if (data.battleMsg) {
        if (data.isDraw) {
          // ★変更: あいこSE再生
          if (seDraw) { seDraw.currentTime = 0; seDraw.play().catch(()=>{}); }
          logMsg = `${hands}<div class="multiplier-notice">${data.battleMsg} ${data.multiplier ? '(次' + data.multiplier + '倍)' : ''}</div>`;
        } else {
          const tookDmg = isMyP1 ? (old1 > currentHP1) : (old2 > currentHP2);
          triggerEffect(tookDmg ? 'damage' : 'hit');
          const color = tookDmg ? 'var(--hp-red)' : 'var(--hp-green)';
          logMsg = `${hands}<div style="color:${color};">${data.battleMsg}</div>`;
        }
      }
      log.innerHTML = `<div class="log-entry">${logMsg}</div>` + log.innerHTML;
    }
    if (data.type === "finish") {
      if (data.winner === "DRAW") { document.getElementById('winner-text').innerText = "引き分け！"; } 
      else { document.getElementById('winner-text').innerText = data.winner + " の勝利！"; }
      
      document.getElementById('finish-screen').style.display = "flex";
      document.getElementById('restart-area').style.display = "flex";
      
      const retireContainer = document.getElementById('retire-area-container');
      if(retireContainer) retireContainer.style.display = "none";
    }
  };
}
function joinRoom(roomName) {
  myName = document.getElementById('user-name').value || "剣闘士";
  ws.send(JSON.stringify({ type: "join", room: roomName, userName: myName, userImage: myImage }));
}
function sendReady() {
  ws.send(JSON.stringify({ type: "ready" }));
  const readyBtn = document.getElementById('ready-btn');
  if(readyBtn) { readyBtn.disabled = true; readyBtn.innerText = "待機中..."; }
}
function resetCardSelection() {
  document.querySelectorAll('.card-btn').forEach(btn => { btn.classList.remove('selected'); });
}
function sendCard(c) {
  resetCardSelection();
  const btnId = 'btn-' + c;
  const btn = document.getElementById(btnId);
  if (btn) { btn.classList.add('selected'); }
  ws.send(JSON.stringify({ type: "card", card: c }));
}
function updateHP(p1, p2) {
  document.getElementById('p1-hp-fill').style.width = (p1 * 20) + "%";
  document.getElementById('p2-hp-fill').style.width = (p2 * 20) + "%";
  document.getElementById('p1-hp-text').innerText = p1;
  document.getElementById('p2-hp-text').innerText = p2;
}
function triggerEffect(mode) {
  const wrap = document.getElementById('screen-game');
  document.body.classList.remove('dmg-flash', 'hit-flash');
  wrap.classList.remove('shake-damage');
  void document.body.offsetWidth;
  if (mode === 'damage') {
    document.body.classList.add('dmg-flash'); wrap.classList.add('shake-damage'); playSound('damage');
    setTimeout(() => { document.body.classList.remove('dmg-flash'); }, 300);
  } else {
    document.body.classList.add('hit-flash'); playSound('hit-success');
    setTimeout(() => { document.body.classList.remove('hit-flash'); }, 200);
  }
}
function hideOverlay() {
  document.getElementById('finish-screen').style.display = "none";
}
connectWS();