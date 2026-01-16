/**
 * MONOMAKIA - Special Actions Logic
 * 10種類の奇行アクション定義（コロッセオ命名Ver）
 */

const actions = [
  {
    name: "🧘 神への祈り", // 旧: 瞑想
    desc: "戦いの神マルスに祈る。無防備になるが2回復する。",
    execute: (actor, target, mult, incomingDmg) => {
      return { selfDmg: incomingDmg - 2, enemyDmg: 0, msg: "天に祈りを捧げた...。戦いの神が微笑み、傷を癒やす！（2回復）" };
    }
  },
  {
    name: "🩸 鮮血の代償", // 旧: 血の契約
    desc: "自らを傷つけ興奮状態へ（1ダメ受けて2回復）。",
    execute: (actor, target, mult, incomingDmg) => {
      return { selfDmg: incomingDmg + 1 - 2, enemyDmg: 0, msg: "自らの太腿を突き刺し、痛みで野生を呼び覚ます！（代償:1 → 回復:2）" };
    }
  },
  {
    name: "🛡️ 英雄の守護", // 旧: 鉄壁
    desc: "伝説の盾を構え、あらゆる攻撃を無効化する。",
    execute: (actor, target, mult, incomingDmg) => {
      return { selfDmg: 0, enemyDmg: 0, msg: "伝説の英雄が憑依した！鉄壁の構えがあらゆる衝撃を無に帰す！（ダメージ無効）" };
    }
  },
  {
    name: "💣 観客の暴動", // 旧: 自爆
    desc: "興奮した観客が物を投げ込む（互いに3ダメージ）。",
    execute: (actor, target, mult, incomingDmg) => {
      return { selfDmg: incomingDmg + 3, enemyDmg: 3, msg: "試合が荒れすぎて観客が暴徒化！石や松明が降り注ぐ！！（互いに3ダメージ）" };
    }
  },
  {
    name: "🦇 生気の略奪", // 旧: 吸血
    desc: "相手の闘志を吸い取る（1吸収）。",
    execute: (actor, target, mult, incomingDmg) => {
      return { selfDmg: incomingDmg - 1, enemyDmg: 1, msg: "相手の傷口に触れ、その闘志を我が物とする...！（1吸収）" };
    }
  },
  {
    name: "🤪 道化の挑発", // 旧: 不発
    desc: "ふざけた動きで相手を舐める。効果はない。",
    execute: (actor, target, mult, incomingDmg) => {
      return { selfDmg: incomingDmg, enemyDmg: 0, msg: "おどけたポーズで挑発！...しかし完全に無視された。（効果なし）" };
    }
  },
  {
    name: "⚔️ 決死の猛攻", // 旧: 捨て身
    desc: "盾を捨てて突撃（自分1ダメ、相手2ダメ）。",
    execute: (actor, target, mult, incomingDmg) => {
      return { selfDmg: incomingDmg + 1, enemyDmg: 2, msg: "防御をかなぐり捨てた決死のタックル！両者が激しく吹き飛ぶ！（自分:1 / 相手:2）" };
    }
  },
  {
    name: "🎲 皇帝の親指", // 旧: 運命
    desc: "皇帝の裁定。上なら全快、下なら瀕死。",
    execute: (actor, target, mult, incomingDmg) => {
      const isLucky = Math.random() < 0.5;
      if (isLucky) {
        // 親指が上（助命＝全回復）
        const dmgToSet5 = actor.hp - 5;
        return { selfDmg: dmgToSet5, enemyDmg: 0, msg: "皇帝が親指を上げた！「生かせ」の合図で奇跡的に復活！（全回復）" };
      } else {
        // 親指が下（処刑＝HP1）
        const dmgToSet1 = actor.hp - 1;
        return { selfDmg: dmgToSet1, enemyDmg: 0, msg: "皇帝が親指を下げた！「殺せ」の合図...死刑執行の槍が刺さる！（HPが1になる）" };
      }
    }
  },
  {
    name: "🎁 敗者への慈悲", // 旧: 贈り物
    desc: "相手に情けをかける（相手-2ダメ）。",
    execute: (actor, target, mult, incomingDmg) => {
      return { selfDmg: incomingDmg, enemyDmg: -2, msg: "倒れた相手に手を差し伸べてしまった...。武人の情けか、油断か？（相手回復）" };
    }
  },
  {
    name: "⚡ 歴戦の勘", // 旧: カウンター
    desc: "攻撃されたら倍返し。されなければ自分が傷つく。",
    execute: (actor, target, mult, incomingDmg) => {
      if (incomingDmg > 0) {
        return { selfDmg: 0, enemyDmg: incomingDmg * 2, msg: "相手の殺気を感じ取り、完璧なクロスカウンターを叩き込む！！（カウンター成功）" };
      } else {
        return { selfDmg: 1, enemyDmg: 0, msg: "殺気を感じたが気のせいだった！一人で勝手に転倒！（失敗：1ダメージ）" };
      }
    }
  }
];

function handleSpecial(p1, p2, mult) {
  const p1IsSpecial = p1.card === 'special';
  const p2IsSpecial = p2.card === 'special';

  // 両者奇行ならあいこ
  if (p1IsSpecial && p2IsSpecial) {
    return {
      isDraw: true,
      p1_dmg: 0,
      p2_dmg: 0,
      msg: "🌀 奇行 VS 🌀 奇行：両者の異様な気迫がぶつかり合い、会場が静まり返る...（あいこ）"
    };
  }

  // 以下処理
  let p1Incoming = p2IsSpecial ? 0 : mult;
  let p2Incoming = p1IsSpecial ? 0 : mult;

  let p1Res = { selfDmg: 0, enemyDmg: 0, msgs: [] };
  let p2Res = { selfDmg: 0, enemyDmg: 0, msgs: [] };

  if (p1IsSpecial) {
    const action = actions[Math.floor(Math.random() * actions.length)];
    const effect = action.execute(p1, p2, mult, p1Incoming);
    p1Res.selfDmg += effect.selfDmg; 
    p1Res.enemyDmg += effect.enemyDmg; 
    p1Res.msgs.push(`🌀 ${p1.name}：${effect.msg}`);
  } else {
    p1Res.selfDmg = 0; 
  }

  if (p2IsSpecial) {
    const action = actions[Math.floor(Math.random() * actions.length)];
    const effect = action.execute(p2, p1, mult, p2Incoming);
    p2Res.selfDmg += effect.selfDmg;
    p2Res.enemyDmg += effect.enemyDmg;
    p2Res.msgs.push(`🌀 ${p2.name}：${effect.msg}`);
  } else {
    p2Res.selfDmg = 0;
  }

  let finalP1Dmg = 0;
  let finalP2Dmg = 0;

  if (p1IsSpecial) {
    finalP1Dmg += p1Res.selfDmg; 
    finalP1Dmg += p2Res.enemyDmg; 
  } else {
    finalP1Dmg += p2Res.enemyDmg; 
  }

  if (p2IsSpecial) {
    finalP2Dmg += p2Res.selfDmg;
    finalP2Dmg += p1Res.enemyDmg;
  } else {
    finalP2Dmg += p1Res.enemyDmg; 
  }

  const jointMsg = [...p1Res.msgs, ...p2Res.msgs].join("<br>");

  return {
    isDraw: false,
    p1_dmg: finalP1Dmg,
    p2_dmg: finalP2Dmg,
    msg: jointMsg || "静寂..."
  };
}

module.exports = { handleSpecial };