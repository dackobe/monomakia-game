let ws;
let myName = "";
let currentHP1 = 5, currentHP2 = 5;
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playSound(type) {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  if (type === 'draw') { osc.type = 'square'; osc.frequency.setValueAtTime(440, now); gain.gain.setValueAtTime(0.05, now); osc.start(); osc.stop(now + 0.05); }
  else if (type === 'damage') { osc.frequency.setValueAtTime(100, now); gain.gain.setValueAtTime(0.3, now); osc.start(); osc.stop(now + 0.3); }
  else if (type === 'hit-success') { osc.frequency.setValueAtTime(800, now); gain.gain.setValueAtTime(0.2, now); osc.start(); osc.stop(now + 0.2); }
}

function initAudioAndLobby() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  showScreen('screen-lobby');
}

function connectWS() {
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}`);

  ws.onopen = () => {
    document.getElementById('status-dot').classList.add('dot-online');
    document.getElementById('status-text').innerText = "ONLINE";
    document.getElementById('start-button').disabled = false;
  };

  ws.onmessage = (e) => {
    const data = JSON.parse(e.data);
    const log = document.getElementById('log');

    if (data.type === "joined") {
      document.getElementById('room-display').innerText = data.room;
      showScreen('screen-wait');
    }

    if (data.type === "start") {
      showScreen('screen-game');
      updateHP(5, 5);
      currentHP1 = 5; currentHP2 = 5;
      log.innerHTML = "決闘開始！";
      
      document.getElementById('restart-area').style.display = "none";
      document.getElementById('finish-screen').style.display = "none";
      const finishBtn = document.getElementById('finish-btn-main');
      if(finishBtn) {
        finishBtn.disabled = false;
        finishBtn.innerText = "🔥 もう一度戦う";
      }
      const logRestartBtn = document.querySelector('#restart-area button:last-child');
      if(logRestartBtn) {
        logRestartBtn.disabled = false;
        logRestartBtn.innerText = "🔥 再戦";
      }

      // ★追加：開始時にボタン選択状態をリセット
      resetCardSelection();
    }

    if (data.type === "result") {
      // ★追加：結果が出たらボタン選択状態をリセット（次のターンのため）
      resetCardSelection();

      const isMyP1 = (data.p1_name === myName);
      const old1 = currentHP1;
      const old2 = currentHP2;
      currentHP1 = data.p1_hp;
      currentHP2 = data.p2_hp;
      updateHP(currentHP1, currentHP2);

      const iconMap = { smash: "💥", guard: "🛡️", attack: "⚔️", feint: "🃏", special: "🌀" };
      const hands = `<span class="log-hands">${iconMap[data.p1_card]} VS ${iconMap[data.p2_card]}</span>`;
      
      let logMsg = "";
      if (data.battleMsg) {
        if (data.isDraw) {
          playSound('draw');
          logMsg = `${hands}<div class="multiplier-notice">${data.battleMsg} ${data.multiplier ? data.multiplier + '倍' : ''}</div>`;
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
      document.getElementById('winner-text').innerText = data.winner + " の勝利！";
      document.getElementById('finish-screen').style.display = "flex";
      document.getElementById('restart-area').style.display = "flex";
    }
  };
}

function hideOverlay() {
  document.getElementById('finish-screen').style.display = "none";
}

function triggerEffect(mode) {
  const wrap = document.getElementById('battle-wrap');
  document.body.classList.remove('dmg-flash', 'hit-flash');
  wrap.classList.remove('shake-damage', 'shake-hit');
  void document.body.offsetWidth;
  if (mode === 'damage') {
    document.body.classList.add('dmg-flash');
    wrap.classList.add('shake-damage');
    playSound('damage');
  } else {
    document.body.classList.add('hit-flash');
    wrap.classList.add('shake-hit');
    playSound('hit-success');
  }
}

function updateHP(p1, p2) {
  document.getElementById('p1-hp-fill').style.width = (p1 * 20) + "%";
  document.getElementById('p2-hp-fill').style.width = (p2 * 20) + "%";
  document.getElementById('p1-hp-text').innerText = p1;
  document.getElementById('p2-hp-text').innerText = p2;
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

function joinRoom(n) {
  myName = document.getElementById('user-name').value || "剣闘士";
  ws.send(JSON.stringify({ type: "join", room: "第" + n + "の場", userName: myName }));
}

function sendReady() {
  ws.send(JSON.stringify({ type: "ready" }));
  const readyBtn = document.getElementById('ready-btn');
  if(readyBtn) readyBtn.disabled = true;
}

// ★追加：ボタンの色をリセットする関数
function resetCardSelection() {
  document.querySelectorAll('.card-btn').forEach(btn => {
    btn.classList.remove('selected');
  });
}

function sendCard(c) {
  // ★修正：押したボタンだけを光らせる（他のボタンは消す）
  resetCardSelection();
  const btnId = 'btn-' + c;
  const btn = document.getElementById(btnId);
  if (btn) {
    btn.classList.add('selected');
  }
  
  ws.send(JSON.stringify({ type: "card", card: c }));
}

connectWS();