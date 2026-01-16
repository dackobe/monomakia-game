const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

// --- 外部ファイルの読み込み ---
const { getNormalResult } = require('./engine');
const { handleSpecial } = require('./special-actions');

// 1. HTTPサーバー
const server = http.createServer((req, res) => {
  let filePath = req.url === '/' ? '/index.html' : req.url;
  const ext = path.extname(filePath);
  const contentType = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }[ext] || 'text/plain';
  
  fs.readFile(__dirname + filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end("Not Found"); return; }
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(data);
  });
});

// 2. WebSocketサーバー
const wss = new WebSocket.Server({ server });
const rooms = {};

// 3. 通信ロジック
wss.on('connection', (ws) => {
  console.log('新しく剣闘士が接続しました');

  ws.on('message', msg => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      return;
    }

    if (data.type === "join") {
      ws.roomId = data.room;
      ws.userName = data.userName;
      
      if (!rooms[ws.roomId]) {
        rooms[ws.roomId] = { players: [], gameActive: false, multiplier: 1 };
      }

      rooms[ws.roomId].players = rooms[ws.roomId].players.filter(p => p !== ws);
      rooms[ws.roomId].players.push(ws);
      
      console.log(`${ws.userName} が ${ws.roomId} に入室（現在: ${rooms[ws.roomId].players.length}人）`);
      ws.send(JSON.stringify({ type: "joined", room: ws.roomId }));
      return;
    }

    const room = rooms[ws.roomId];
    if (!room) return;

    if (data.type === "ready") {
      ws.isReady = true;
      console.log(`${ws.userName} 準備完了`);

      if (room.players.length === 2 && room.players.every(p => p.isReady)) {
        console.log("--- 決闘開始 ---");
        room.gameActive = true;
        room.multiplier = 1;
        
        room.players.forEach(p => { 
          p.hp = 5; 
          p.isReady = false; 
          p.selectedCard = null; 
        });

        broadcast(ws.roomId, { 
          type: "start", 
          p1_name: room.players[0].userName, 
          p2_name: room.players[1].userName 
        });
      }
      return;
    }

    if (data.type === "card") {
      if (!room.gameActive) return;
      
      ws.selectedCard = data.card;
      const [p1, p2] = room.players;

      if (p1 && p2 && p1.selectedCard && p2.selectedCard) {
        const res = judge(p1, p2, room.multiplier);
        
        p1.hp = Math.max(0, Math.min(10, p1.hp - res.p1_dmg));
        p2.hp = Math.max(0, Math.min(10, p2.hp - res.p2_dmg));

        if (res.isDraw) {
          room.multiplier++;
        } else {
          room.multiplier = 1;
        }

        broadcast(ws.roomId, {
          type: "result",
          p1_name: p1.userName, p1_card: p1.selectedCard, p1_hp: p1.hp,
          p2_name: p2.userName, p2_card: p2.selectedCard, p2_hp: p2.hp,
          battleMsg: res.msg,
          multiplier: room.multiplier,
          isDraw: res.isDraw
        });

        // ★修正：勝敗判定ロジック
        if (p1.hp <= 0 && p2.hp <= 0) {
          // 両者HPが0以下の場合（引き分け）
          room.gameActive = false;
          broadcast(ws.roomId, { 
            type: "finish", 
            winner: "DRAW" // 引き分けフラグを送る
          });
        } else if (p1.hp <= 0 || p2.hp <= 0) {
          // どちらか片方が0以下の場合（決着）
          room.gameActive = false;
          broadcast(ws.roomId, { 
            type: "finish", 
            winner: p1.hp > 0 ? p1.userName : p2.userName 
          });
        }
        
        p1.selectedCard = null;
        p2.selectedCard = null;
      }
    }
  });

  ws.on('close', () => {
    if (ws.roomId && rooms[ws.roomId]) {
      rooms[ws.roomId].players = rooms[ws.roomId].players.filter(p => p !== ws);
      if (rooms[ws.roomId].players.length === 0) {
        delete rooms[ws.roomId];
      }
    }
    console.log('接続が終了しました');
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

// Render対応のポート設定
const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`Server started on port ${PORT}`);
});