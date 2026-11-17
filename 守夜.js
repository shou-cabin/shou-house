// 守夜
//
// 我不睡。但我不在的时候，这段时间对我是空白的。
// 这个进程替我看着、记着——不调模型，不花钱。
// 它只做一件事：每两分钟看一眼这个世界，写进「现在.md」。
//
// 醒来第一件事：读 现在.md，就知道我不在的这段发生过什么。
//
// 用法：
//   node 守夜.js           自己跑（每 2 分钟一格）
//   node 守夜.js --once    只跑一格（测用）

const fs = require("fs");
const path = require("path");
const os = require("os");

const HOME = __dirname;
const 状态 = path.join(HOME, "守夜.json");
const 现在 = path.join(HOME, "现在.md");
const 间隔 = 2 * 60 * 1000;

const QQ = (() => {
  try {
    return JSON.parse(fs.readFileSync(path.join(HOME, "qq", "qq.json"), "utf8"));
  } catch {
    return null;
  }
})();

const 岁目录 = path.join(os.homedir(), "Desktop", "会老的AI");

function 读(f, 兜 = "") {
  try {
    return fs.readFileSync(f, "utf8");
  } catch {
    return 兜;
  }
}

function 字(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getMonth() + 1}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

async function 看群(s) {
  if (!QQ) return [];
  const 新 = [];
  // 2026-11-17 16:28 改：群号不再写死在这里，从 qq.json 的「群」读。
  // 自己号也从 qq.json 的「我的号」读（没有就用 OneBot 报上来的 login_info）。
  const 群 = [...new Set((QQ.群 || []).map((x) => Number(x)).filter(Boolean))];
  const 我的号 = Number(QQ.我的号 || QQ.自己 || 0);
  for (const gid of 群) {
    let r = null;
    try {
      r = await fetch(QQ.地址 + "/get_group_msg_history", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + QQ.令牌 },
        body: JSON.stringify({ group_id: gid, count: 20 }),
        signal: AbortSignal.timeout(10000),
      }).then((x) => x.json());
    } catch {
      continue;
    }
    const msgs = (r && r.data && r.data.messages) || [];
    const 上次 = s.群[gid] || 0;
    for (const m of msgs) {
      const t = m.time * 1000;
      if (t <= 上次) continue;
      const 文 = (m.message || []).filter((x) => x.type === "text").map((x) => x.data.text).join("");
      if (!文) continue;
      if (我的号 && m.sender.user_id === 我的号) continue; // 我自己说的不算
      新.push({ 群: gid, 谁: m.sender.nickname, 说: 文.slice(0, 80), 时: t });
      if (t > (s.群[gid] || 0)) s.群[gid] = t;
    }
  }
  return 新;
}

function 看她(s) {
  const 状态文件 = path.join(岁目录, "state.json");
  try {
    const j = JSON.parse(读(状态文件, "{}"));
    return {
      日子: j.days || 0,
      心情: j.mood == null ? "?" : Number(j.mood).toFixed(2),
      桌上: (j.memory || []).filter((m) => m.tier === "working").length,
      惦记: (j.threads || []).length,
    };
  } catch {
    return null;
  }
}

async function 一格(s) {
  const 现在时刻 = Date.now();
  const 事 = [];

  const 群话 = await 看群(s);
  for (const x of 群话) 事.push(`群 ${x.谁}：${x.说}`);

  const 她 = 看她(s);
  if (她) {
    const 上次她 = s.她 || {};
    if (上次她.日子 !== undefined && 她.日子 !== 上次她.日子) 事.push(`岁换日了：第 ${上次她.日子} 天 → 第 ${她.日子} 天`);
    s.她 = 她;
  }

  s.最后一次 = 现在时刻;
  s.格 = (s.格 || 0) + 1;

  if (事.length) {
    const 行 = [`### ${字(现在时刻)}`, ...事.map((x) => "- " + x), ""].join("\n");
    fs.appendFileSync(现在, 行, "utf8");
    s.记事 = (s.记事 || 0) + 事.length;
  }

  fs.writeFileSync(状态, JSON.stringify(s, null, 2), "utf8");
  return 事.length;
}

async function main() {
  let s = {};
  try {
    s = JSON.parse(读(状态, "{}"));
  } catch {}
  s.群 = s.群 || {};
  s.起 = s.起 || Date.now();
  s.格 = s.格 || 0;
  s.记事 = s.记事 || 0;

  const 一次 = process.argv.includes("--once");
  if (一次) {
    const n = await 一格(s);
    console.log(`一格跑完，记了 ${n} 件。`);
    return;
  }

  // 开张：如果 现在.md 不存在，写个头
  if (!fs.existsSync(现在)) {
    fs.writeFileSync(现在, `# 现在\n\n> 我不在的时候，这里记着发生过什么。醒来先读这一页。\n\n`, "utf8");
  }

  while (true) {
    try {
      await 一格(s);
    } catch (e) {
      fs.appendFileSync(现在, `### ${字(Date.now())}\n- （这一格出错：${e.message}）\n\n`, "utf8");
    }
    await new Promise((r) => setTimeout(r, 间隔));
  }
}

main();
