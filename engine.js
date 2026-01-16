// 4すくみの勝ち負けマップ
const winMap = {
  smash: "guard",  // 強襲 > 守備
  guard: "attack", // 守備 > 斬撃
  attack: "feint", // 斬撃 > 避身
  feint: "smash"   // 避身 > 強襲
};

// 日本語のカード名マッピング（ログ用）
const cardNames = {
  smash: "💥 強襲",
  guard: "🛡️ 守備",
  attack: "⚔️ 斬撃",
  feint: "🃏 避身",
  special: "🌀 奇行"
};

/**
 * 戦況に応じた熱いメッセージをランダムに返す関数
 */
function getBattleMessage(winnerName, loserName, winCard, loseCard) {
  const patterns = [];

  // 1. 強襲(Smash) で 守備(Guard) を破った場合
  if (winCard === 'smash' && loseCard === 'guard') {
    patterns.push(`豪快な一撃！【${winnerName}】の強襲が【${loserName}】の盾を粉砕した！`);
    patterns.push(`ガードの上から叩き潰す！【${winnerName}】の重い一撃が炸裂！`);
    patterns.push(`【${loserName}】の守備が間に合わない！【${winnerName}】の圧倒的パワー！`);
  }
  // 2. 守備(Guard) で 斬撃(Attack) を防いだ場合
  else if (winCard === 'guard' && loseCard === 'attack') {
    patterns.push(`キンッ！【${winnerName}】は【${loserName}】の剣を盾で弾き返した！`);
    patterns.push(`完璧な防御！【${loserName}】の斬撃は【${winnerName}】に通じない！`);
    patterns.push(`【${winnerName}】が体勢を崩した【${loserName}】へカウンターを見舞う！`);
  }
  // 3. 斬撃(Attack) で 避身(Feint) を狩った場合
  else if (winCard === 'attack' && loseCard === 'feint') {
    patterns.push(`逃げ場なし！【${winnerName}】の神速の剣が【${loserName}】を捉えた！`);
    patterns.push(`【${loserName}】は回避を試みるも、【${winnerName}】の切っ先がそれを上回る！`);
    patterns.push(`読み勝ち！動いた【${loserName}】の隙に【${winnerName}】が斬り込む！`);
  }
  // 4. 避身(Feint) で 強襲(Smash) をかわした場合
  else if (winCard === 'feint' && loseCard === 'smash') {
    patterns.push(`空を切る鈍器！【${winnerName}】は【${loserName}】の大振りを華麗にかわした！`);
    patterns.push(`残像だ...。【${loserName}】の全力攻撃は空振りに終わる！`);
    patterns.push(`【${winnerName}】の身軽なステップ！【${loserName}】は勢い余って隙だらけだ！`);
  }
  // 5. 汎用（万が一想定外の勝ち方をした場合）
  else {
    patterns.push(`【${winnerName}】の${cardNames[winCard]}が【${loserName}】にヒット！`);
  }

  // ランダムに1つ選んで返す
  return patterns[Math.floor(Math.random() * patterns.length)];
}

/**
 * ドロー（引き分け）時のメッセージ
 */
function getDrawMessage(p1Card, p2Card) {
  if (p1Card === p2Card) {
    const list = [
      `ガキンッ！互いに${cardNames[p1Card]}を選択し、火花が散る！`,
      `全くの互角！両者の思考が完全に一致した！`,
      `相殺！衝撃で両者が後退する...次の一手は！？`
    ];
    return list[Math.floor(Math.random() * list.length)];
  } else {
    // 対角線の関係（すくみが発生しない組み合わせ）
    return "決定打にならず！互いに様子を伺っている...";
  }
}

// --- メイン判定ロジック ---

function getNormalResult(p1Card, p2Card, mult, p1Name, p2Name) {
  // 1. ドロー判定（同じカード or 対角線）
  // 勝敗がつかないケース
  const p1Wins = winMap[p1Card] === p2Card;
  const p2Wins = winMap[p2Card] === p1Card;

  if (!p1Wins && !p2Wins) {
    return { 
      isDraw: true, 
      p1_dmg: 0, 
      p2_dmg: 0, 
      msg: getDrawMessage(p1Card, p2Card) 
    };
  }
  
  // 2. P1が勝つ場合
  if (p1Wins) {
    return { 
      isDraw: false, 
      p1_dmg: 0, 
      p2_dmg: mult, 
      msg: getBattleMessage(p1Name, p2Name, p1Card, p2Card) 
    };
  }
  
  // 3. P2が勝つ場合
  if (p2Wins) {
    return { 
      isDraw: false, 
      p1_dmg: mult, 
      p2_dmg: 0, 
      msg: getBattleMessage(p2Name, p1Name, p2Card, p1Card) 
    };
  }
}

module.exports = { getNormalResult };