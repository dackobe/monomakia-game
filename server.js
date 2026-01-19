const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// 外部ファイルの読み込み (同階層にある前提)
const { getNormalResult } = require('./engine');
const { handleSpecial } = require('./special-actions');

const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  const ext = path.extname(filePath);
  const contentType = { 
    '.html': 'text/html', 
    '.js': 'text/javascript', 
    '.css': 'text/css',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.mp3': 'audio/mpeg'
  }[ext] || 'text/plain';
  
  fs.readFile(__dirname + filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not Found"); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server });
const rooms = {};

// ロビーのリスト配信
function broadcastRoomList() {
  const list = Object.keys(rooms).map(roomId => {
    const r = rooms[roomId];
    return {
      id: roomId,
      name: r.customName || roomId,
      count: r.players.length,
      status: r.gameActive ? 'playing' : (r.players.length >= 2 ? 'full' : 'open')
    };
  });
  wss.clients.forEach(client => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: "room_list", list: list }));
    }
  });
}

// 待機画面のメンバー更新
function broadcastRoomUpdate(roomId) {
  if (!rooms[roomId]) return;
  const room = rooms[roomId];
  const memberList = room.players.map(p => ({
    name: p.userName,
    image: p.userImage,
    isReady: p.isReady || false
  }));
  room.players.forEach(p => {
    if (p.readyState === WebSocket.OPEN) {
      p.send(JSON.stringify({ type: "room_update", members: memberList }));
    }
  });
}

// チャット配信
function broadcastChat(roomId, senderName, message) {
  if (!rooms[roomId]) return;
  rooms[roomId].players.forEach(p => {
    if (p.readyState === WebSocket.OPEN) {
      p.send(JSON.stringify({ type: "chat_receive", sender: senderName, message: message }));
    }
  });
}

wss.on('connection', (ws) => {
  console.log('新しく剣闘士が接続しました');
  broadcastRoomList();

  ws.on('message', msg => {
    let data;
    try { data = JSON.parse(msg); } catch (e) { return; }

    // ルーム作成
    if (data.type === "create_room") {
      const roomId = data.room;
      if (rooms[roomId]) {
        ws.send(JSON.stringify({ type: "error", message: "その名前のルームは既に存在します" }));
        return;
      }
      rooms[roomId] = { players: [], gameActive: false, multiplier: 1, customName: roomId };
      broadcastRoomList();
      return;
    }

    // 入室
    if (data.type === "join") {
      ws.roomId = data.room;
      ws.userName = data.userName;
      ws.userImage = data.userImage || "";
      
      if (!rooms[ws.roomId]) {
        rooms[ws.roomId] = { players: [], gameActive: false, multiplier: 1, customName: data.room };
      }

      if (rooms[ws.roomId].players.length >= 2) {
        ws.send(JSON.stringify({ type: "error", message: "満員です" }));
        return;
      }

      rooms[ws.roomId].players = rooms[ws.roomId].players.filter(p => p !== ws);
      rooms[ws.roomId].players.push(ws);
      
      ws.send(JSON.stringify({ type: "joined", room: ws.roomId }));
      
      broadcastRoomList();
      broadcastRoomUpdate(ws.roomId);
      broadcastChat(ws.roomId, "System", `${ws.userName} が入室しました`);
      return;
    }

    // 退出 (leave)
    if (data.type === "leave") {
      if (ws.roomId && rooms[ws.roomId]) {
        const room = rooms[ws.roomId];
        
        // リストから削除
        room.players = room.players.filter(p => p !== ws);
        broadcastChat(ws.roomId, "System", `${ws.userName} が退出しました`);
        
        if (room.players.length === 0) {
          delete rooms[ws.roomId];
        } else {
          broadcastRoomUpdate(ws.roomId);
        }
        
        ws.roomId = null;
        ws.isReady = false;
        ws.selectedCard = null;

        // ★重要: ロビーの人数表示を更新
        broadcastRoomList();
      }
      return;
    }

    const room = rooms[ws.roomId];
    if (!room) return;

    // チャット送信
    if (data.type === "chat_send") {
      broadcastChat(ws.roomId, ws.userName, data.message);
      return;
    }

    // 準備完了
    if (data.type === "ready") {
      ws.isReady = true;
      broadcastRoomUpdate(ws.roomId);

      if (room.players.length === 2 && room.players.every(p => p.isReady)) {
        console.log("--- 決闘開始 ---");
        room.gameActive = true;
        room.multiplier = 1;
        room.players.forEach(p => { p.hp = 5; p.isReady = false; p.selectedCard = null; });

        broadcast(ws.roomId, { 
          type: "start", 
          p1_name: room.players[0].userName, 
          p1_image: room.players[0].userImage,
          p2_name: room.players[1].userName, 
          p2_image: room.players[1].userImage
        });
        broadcastRoomList();
      }
      return;
    }

    // カード選択
    if (data.type === "card") {
      if (!room.gameActive) return;
      ws.selectedCard = data.card;
      const [p1, p2] = room.players;

      if (p1 && p2 && p1.selectedCard && p2.selectedCard) {
        const res = judge(p1, p2, room.multiplier);
        p1.hp = Math.max(0, Math.min(10, p1.hp - res.p1_dmg));
        p2.hp = Math.max(0, Math.min(10, p2.hp - res.p2_dmg));

        if (res.isDraw) { room.multiplier++; } else { room.multiplier = 1; }

        broadcast(ws.roomId, {
          type: "result",
          p1_name: p1.userName, p1_card: p1.selectedCard, p1_hp: p1.hp,
          p2_name: p2.userName, p2_card: p2.selectedCard, p2_hp: p2.hp,
          battleMsg: res.msg,
          multiplier: room.multiplier,
          isDraw: res.isDraw
        });

        if (p1.hp <= 0 && p2.hp <= 0) {
          room.gameActive = false;
          broadcast(ws.roomId, { type: "finish", winner: "DRAW" });
          broadcastRoomList();
        } else if (p1.hp <= 0 || p2.hp <= 0) {
          room.gameActive = false;
          broadcast(ws.roomId, { type: "finish", winner: p1.hp > 0 ? p1.userName : p2.userName });
          broadcastRoomList();
        }
        p1.selectedCard = null; p2.selectedCard = null;
      }
    }
  });

  ws.on('close', () => {
    if (ws.roomId && rooms[ws.roomId]) {
      const room = rooms[ws.roomId];
      room.players = room.players.filter(p => p !== ws);
      broadcastChat(ws.roomId, "System", `${ws.userName || '誰か'} が退出しました`);
      if (room.players.length === 0) {
        delete rooms[ws.roomId];
      } else {
        broadcastRoomUpdate(ws.roomId);
      }
      broadcastRoomList();
    }
  });
});

function judge(p1, p2, mult) {
  const p1Data = { name: p1.userName, card: p1.selectedCard, hp: p1.hp };
  const p2Data = { name: p2.userName, card: p2.selectedCard, hp: p2.hp };
  if (p1Data.card === 'special' || p2Data.card === 'special') {
    return handleSpecial(p1Data, p2Data, mult);
  }
  return getNormalResult(p1Data.card, p2Data.card, mult, p1Data.name, p2Data.name);
}

function broadcast(roomId, msg) {
  if (rooms[roomId]) {
    rooms[roomId].players.forEach(p => p.send(JSON.stringify(msg)));
  }
}

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});