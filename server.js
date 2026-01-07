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
        ws.userName = data.userName || "名無し";
        ws.roomId = roomId;
        if (!rooms[roomId]) rooms[roomId] = { players: [], spectators: [] };

        rooms[roomId].players = rooms[roomId].players.filter(p => p.readyState === WebSocket.OPEN);

        if (rooms[roomId].players.length < 2) {
          ws.isSpectator = false;
          ws.isReady = false;
          ws.hp = 10;
          rooms[roomId].players.push(ws);
          ws.send(JSON.stringify({ type: "joined", room: roomId, role: "player" }));
          broadcast(roomId, { type: "info", message: `👤 【${ws.userName}】が参戦しました` });
        } else {
          ws.isSpectator = true;
          rooms[roomId].spectators.push(ws);
          ws.send(JSON.stringify({ type: "joined", room: roomId, role: "spectator" }));
          broadcast(roomId, { type: "info", message: `👁 【${ws.userName}】が観戦中` });
        }
      }

      if (data.type === "leave") {
        handleDisconnect(ws);
        ws.send(JSON.stringify({ type: "left_success" }));
      }

      if (data.type === "ready" && !ws.isSpectator) {
        ws.isReady = true;
        ws.hp = 10;
        const room = rooms[ws.roomId];
        if (!room) return;

        broadcast(ws.roomId, { type: "info", message: `✅ 【${ws.userName}】準備完了` });

        const readyPlayers = room.players.filter(p => p.isReady);
        if (readyPlayers.length === 2) {
          const p1 = room.players[0];
          const p2 = room.players[1];
          p1.opponent = p2;
          p2.opponent = p1;
          
          broadcast(ws.roomId, { 
            type: "start", 
            p1_name: p1.userName, 
            p2_name: p2.userName 
          });
        }
      }

      if (data.type === "card" && !ws.isSpectator) {
        if (!ws.opponent || ws.hp <= 0 || ws.opponent.hp <= 0) return;
        ws.selectedCard = data.card;

        if (ws.opponent.selectedCard) {
          const res = judge(ws.selectedCard, ws.opponent.selectedCard);
          
          // ダメージ適用
          if (res.self === 1) ws.opponent.hp -= 1;
          if (res.opp === 1) ws.hp -= 1;

          broadcast(ws.roomId, { 
            type: "result", 
            p1_name: ws.userName, p1_card: ws.selectedCard, p1_hp: ws.hp,
            p2_name: ws.opponent.userName, p2_card: ws.opponent.selectedCard, p2_hp: ws.opponent.hp
          });

          if (ws.hp <= 0 || ws.opponent.hp <= 0) {
            const winner = ws.hp > 0 ? ws.userName : ws.opponent.userName;
            broadcast(ws.roomId, { type: "finish", winner: winner });
            room_reset(ws.roomId);
          }
          ws.selectedCard = null;
          ws.opponent.selectedCard = null;
        }
      }
    } catch (e) { console.error(e); }
  });

  ws.on('close', () => handleDisconnect(ws));
});

function room_reset(roomId) {
  const room = rooms[roomId];
  if (room) {
    room.players.forEach(p => {
      p.isReady = false;
      p.selectedCard = null;
      p.opponent = null;
    });
  }
}

function handleDisconnect(ws) {
  const roomId = ws.roomId;
  if (roomId && rooms[roomId]) {
    rooms[roomId].players = rooms[roomId].players.filter(p => p !== ws);
    rooms[roomId].spectators = rooms[roomId].spectators.filter(p => p !== ws);
    
    if (ws.opponent) {
      const opp = ws.opponent;
      opp.opponent = null;
      opp.isReady = false;
      opp.send(JSON.stringify({ type: "info", message: "相手との通信が途絶えました。" }));
    }
  }
  ws.roomId = null;
  ws.opponent = null;
}

function broadcast(roomId, data) {
  const room = rooms[roomId];
  if (!room) return;
  const msg = JSON.stringify(data);
  room.players.forEach(p => { if(p.readyState === WebSocket.OPEN) p.send(msg); });
  room.spectators.forEach(p => { if(p.readyState === WebSocket.OPEN) p.send(msg); });
}

/**
 * 相性判定ロジック
 * 💥(smash) -> 🛡️(guard)
 * 🛡️(guard) -> ⚔️(attack)
 * ⚔️(attack) -> 🃏(feint)
 * 🃏(feint) -> 💥(smash)
 */
function judge(a, b) {
  const winMap = {
    smash: "guard",   // スマッシュはガードにのみ勝つ
    guard: "attack",  // ガードはアタックにのみ勝つ
    attack: "feint",  // アタックはフェイントにのみ勝つ
    feint: "smash"    // フェイントはスマッシュにのみ勝つ
  };

  // 自分が勝つケース
  if (winMap[a] === b) return { self: 1, opp: 0 };
  // 相手が勝つケース
  if (winMap[b] === a) return { self: 0, opp: 1 };
  
  // それ以外（同手、または一つ飛ばしの関係）はすべて引き分け
  return { self: 0, opp: 0 };
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`MONOMAKIA Server running on port ${PORT}`);
});