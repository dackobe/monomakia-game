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

      // --- 入室処理 ---
      if (data.type === "join") {
        const roomId = data.room;
        ws.userName = data.userName || "名無し";
        ws.roomId = roomId;
        
        if (!rooms[roomId]) {
          rooms[roomId] = { 
            players: [], 
            spectators: [], 
            gameActive: false // 現在対戦中かどうかのフラグ
          };
        }

        const room = rooms[roomId];
        room.players = room.players.filter(p => p.readyState === WebSocket.OPEN);

        if (room.players.length < 2) {
          ws.isSpectator = false;
          ws.isReady = false;
          ws.hp = 10;
          room.players.push(ws);
          ws.send(JSON.stringify({ type: "joined", room: roomId, role: "player" }));
          broadcast(roomId, { type: "info", message: `👤 【${ws.userName}】が参戦しました` });
        } else {
          ws.isSpectator = true;
          room.spectators.push(ws);
          ws.send(JSON.stringify({ type: "joined", room: roomId, role: "spectator" }));
          
          // 【重要】観戦者が途中入室した場合、既に試合中なら現在の情報を送る
          if (room.gameActive && room.players.length === 2) {
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

      // --- 準備完了 ---
      if (data.type === "ready" && !ws.isSpectator) {
        ws.isReady = true;
        ws.hp = 10;
        const room = rooms[ws.roomId];
        if (!room) return;

        broadcast(ws.roomId, { type: "info", message: `✅ 【${ws.userName}】準備完了` });

        const readyPlayers = room.players.filter(p => p.isReady);
        if (readyPlayers.length === 2) {
          room.gameActive = true; // 対戦フラグON
          const p1 = room.players[0];
          const p2 = room.players[1];
          p1.opponent = p2;
          p2.opponent = p1;
          
          broadcast(ws.roomId, { 
            type: "start", 
            p1_name: p1.userName, 
            p2_name: p2.userName,
            p1_hp: 10,
            p2_hp: 10
          });
        }
      }

      // --- カード選択（相性判定とダメージログ） ---
      if (data.type === "card" && !ws.isSpectator) {
        const room = rooms[ws.roomId];
        if (!ws.opponent || ws.hp <= 0 || ws.opponent.hp <= 0) return;
        ws.selectedCard = data.card;

        if (ws.opponent.selectedCard) {
          const res = judge(ws.selectedCard, ws.opponent.selectedCard);
          
          // ダメージ適用
          if (res.self === 1) ws.opponent.hp -= 1;
          if (res.opp === 1) ws.hp -= 1;

          // 全員（観戦者含む）に結果を送信
          broadcast(ws.roomId, { 
            type: "result", 
            p1_name: room.players[0].userName, 
            p1_card: room.players[0].selectedCard, 
            p1_hp: room.players[0].hp,
            p2_name: room.players[1].userName, 
            p2_card: room.players[1].selectedCard, 
            p2_hp: room.players[1].hp
          });

          if (ws.hp <= 0 || ws.opponent.hp <= 0) {
            const winner = ws.hp > 0 ? ws.userName : ws.opponent.userName;
            broadcast(ws.roomId, { type: "finish", winner: winner });
            room.gameActive = false; // 対戦終了
            room_reset(ws.roomId);
          }
          
          // カードリセット
          room.players.forEach(p => p.selectedCard = null);
        }
      }

      if (data.type === "leave") {
        handleDisconnect(ws);
        ws.send(JSON.stringify({ type: "left_success" }));
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
    const room = rooms[roomId];
    room.players = room.players.filter(p => p !== ws);
    room.spectators = room.spectators.filter(p => p !== ws);
    
    if (ws.opponent) {
      const opp = ws.opponent;
      opp.opponent = null;
      opp.isReady = false;
      room.gameActive = false;
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
  // プレイヤーと観戦者全員に送信
  const allClients = [...room.players, ...room.spectators];
  allClients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) client.send(msg);
  });
}

/**
 * 💥(smash) -> 🛡️(guard)
 * 🛡️(guard) -> ⚔️(attack)
 * ⚔️(attack) -> 🃏(feint)
 * 🃏(feint) -> 💥(smash)
 */
function judge(a, b) {
  const winMap = {
    smash: "guard",
    guard: "attack",
    attack: "feint",
    feint: "smash"
  };
  if (winMap[a] === b) return { self: 1, opp: 0 }; // 自分が勝ち
  if (winMap[b] === a) return { self: 0, opp: 1 }; // 相手が勝ち
  return { self: 0, opp: 0 }; // その他は引き分け
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`MONOMAKIA Server running on port ${PORT}`);
});