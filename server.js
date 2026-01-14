const http = require('http');
const fs = require('fs');
const WebSocket = require('ws');
const path = require('path');

const server = http.createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/') {
    const filePath = path.join(__dirname, 'index.html');
    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading index.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=UTF-8' });
      res.end(data);
    });
  }
});

const wss = new WebSocket.Server({ server });
const rooms = {};

wss.on('connection', (ws) => {
  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg.toString());

      if (data.type === "join") {
        const roomId = data.room;
        ws.userName = data.userName || "名無しの戦士";
        ws.roomId = roomId;
        
        if (!rooms[roomId]) {
          rooms[roomId] = { players: [], spectators: [], gameActive: false };
        }

        const room = rooms[roomId];
        room.players = room.players.filter(p => p.readyState === WebSocket.OPEN);

        if (room.players.length < 2) {
          ws.isSpectator = false;
          ws.isReady = false;
          ws.hp = 5; 
          room.players.push(ws);
          ws.send(JSON.stringify({ type: "joined", room: roomId, role: "player" }));
          broadcast(roomId, { type: "info", message: `👤 【${ws.userName}】が参戦した` });
        } else {
          ws.isSpectator = true;
          room.spectators.push(ws);
          ws.send(JSON.stringify({ type: "joined", room: roomId, role: "spectator" }));
          if (room.gameActive) {
            ws.send(JSON.stringify({
              type: "start",
              p1_name: room.players[0].userName,
              p2_name: room.players[1].userName,
              p1_hp: room.players[0].hp,
              p2_hp: room.players[1].hp
            }));
          }
          broadcast(roomId, { type: "info", message: `👁 【${ws.userName}】が観戦中` });
        }
      }

      if (data.type === "ready" && !ws.isSpectator) {
        ws.isReady = true;
        ws.hp = 5;
        const room = rooms[ws.roomId];
        // broadcast(ws.roomId, { type: "info", message: `✅ 【${ws.userName}】準備完了` });

        const readyPlayers = room.players.filter(p => p.isReady);
        if (readyPlayers.length === 2) {
          room.gameActive = true;
          const [p1, p2] = room.players;
          p1.opponent = p2;
          p2.opponent = p1;
          broadcast(ws.roomId, { 
            type: "start", 
            p1_name: p1.userName, p2_name: p2.userName,
            p1_hp: 5, p2_hp: 5
          });
        }
      }

      if (data.type === "card" && !ws.isSpectator) {
        const room = rooms[ws.roomId];
        if (!ws.opponent || ws.hp <= 0 || ws.opponent.hp <= 0) return;
        ws.selectedCard = data.card;

        if (ws.opponent.selectedCard) {
          // ここで勝敗判定を実行
          const res = judge(ws.selectedCard, ws.opponent.selectedCard);
          
          if (res.p1_dmg) ws.opponent.hp -= 1; // 自分が勝てば相手にダメージ
          if (res.p2_dmg) ws.hp -= 1;          // 相手が勝てば自分にダメージ

          broadcast(ws.roomId, { 
            type: "result", 
            p1_name: room.players[0].userName, p1_card: room.players[0].selectedCard, p1_hp: room.players[0].hp,
            p2_name: room.players[1].userName, p2_card: room.players[1].selectedCard, p2_hp: room.players[1].hp
          });

          if (ws.hp <= 0 || ws.opponent.hp <= 0) {
            const winner = ws.hp > 0 ? ws.userName : ws.opponent.userName;
            broadcast(ws.roomId, { type: "finish", winner: winner });
            room.gameActive = false;
            room_reset(ws.roomId);
          }
          room.players.forEach(p => p.selectedCard = null);
        }
      }

      if (data.type === "leave") handleDisconnect(ws);

    } catch (e) { console.error(e); }
  });

  ws.on('close', () => handleDisconnect(ws));
});

function room_reset(roomId) {
  const room = rooms[roomId];
  if (room) room.players.forEach(p => { p.isReady = false; p.selectedCard = null; p.opponent = null; });
}

function handleDisconnect(ws) {
  const room = rooms[ws.roomId];
  if (room) {
    room.players = room.players.filter(p => p !== ws);
    room.spectators = room.spectators.filter(p => p !== ws);
    if (ws.opponent) {
      ws.opponent.send(JSON.stringify({ type: "info", message: "相手が戦場を離脱しました" }));
      room_reset(ws.roomId);
    }
  }
}

function broadcast(roomId, data) {
  const room = rooms[roomId];
  if (!room) return;
  const msg = JSON.stringify(data);
  [...room.players, ...room.spectators].forEach(c => { if(c.readyState === WebSocket.OPEN) c.send(msg); });
}

// ■ 勝敗判定ロジック（厳密化）
function judge(a, b) {
  // キーが勝者、値が敗者
  const winMap = { 
    smash: "guard",   // スマッシュ VS ガード → スマッシュ勝ち
    guard: "attack",  // ガード VS アタック → ガード勝ち
    attack: "feint",  // アタック VS フェイント → アタック勝ち
    feint: "smash"    // フェイント VS スマッシュ → フェイント勝ち
  };
  
  if (a === b) return { p1_dmg: 0, p2_dmg: 0 }; // あいこ
  if (winMap[a] === b) return { p1_dmg: 1, p2_dmg: 0 }; // a（自分）の勝ち
  return { p1_dmg: 0, p2_dmg: 1 }; // b（相手）の勝ち
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => console.log(`Server: http://localhost:${PORT}`));