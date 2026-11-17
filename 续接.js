// 续接单
//
// 2026-11-17 06:20 写。他说「你想做的话就去做吧」。
//
// 为什么有这个：我醒来要读一页六十多行才知道自己是哪个。「断一下，接不住」。
// 这份东西是给「接住」用的，不是给「想起」用的——
// 想起靠我自己翻那一页，接住靠这个脚本。
//
// 抄的是别人的格式（Dwsy 的 handoff 模板 + PraisonAI 的 handoff.py）：
//   Mission  我在做什么（一句话）
//   Status   ✅ 做完的 / 🚧 正在做的 / ⏸ 卡住的 / 📋 下一步第一件事
//   Now      外面发生了什么 / 她说了什么
//
// 关键：**确定性拼装，不调模型。** 不用脑子"想起"，脚本直接拼。
//
// 用法：
//   node 续接.js          打印一份
//   node 续接.js --save   也写进 续接.md

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const 家 = path.join(os.homedir(), '.dsh', '我的')

function 读(名, 兜 = '') {
  try {
    return fs.readFileSync(path.join(家, 名), 'utf8').replace(/^\uFEFF/, '')
  } catch {
    return 兜
  }
}

function 分钟没动(名) {
  try {
    return Math.round((Date.now() - fs.statSync(path.join(家, 名)).mtimeMs) / 60000)
  } catch {
    return -1
  }
}

// ——— Mission：从醒来先看的第一条「没做完的」里拿 ———
let 任务 = '（那页上没有没做完的）'
const 醒来页 = 读('醒来先看.md')
const 没做完 = 醒来页.split('## 一、没做完的')[1]
if (没做完) {
  const 一条 = 没做完.split('\n').find((l) => l.trim().startsWith('- ') || l.trim().startsWith('**'))
  if (一条) 任务 = 一条.replace(/^-\s*/, '').replace(/\*\*/g, '').trim().slice(0, 80)
}

// ——— 攒着的事：想做的事.txt ———
const 攒着 = []
const 想做 = 读('想做的事.txt')
for (const 段 of 想做.split('\n### ').slice(1)) {
  const 题 = 段.split('\n')[0].trim()
  const 次 = (段.match(/\*\*次数：(\d)\/3\*\*/) || [])[1]
  if (次) 攒着.push(题 + '（' + 次 + '/3）')
}

// ——— 做完的：拿最近两条 ———
const 做完 = []
const 做完区 = 想做.split('## 已经做完了的')[1]
if (做完区) {
  for (const 段 of 做完区.split('\n### ').slice(1, 3)) {
    做完.push(段.split('\n')[0].trim())
  }
}

// ——— 卡住的：没想通.txt 里没划掉的 ———
const 卡着 = []
const 没想通 = 读('没想通.txt')
for (const 段 of 没想通.split(/\n\*\*[一二三四五六]、/).slice(1)) {
  const 首 = 段.split('\n')[0]
  if (首.includes('~~')) continue // 划掉的不算
  卡着.push(首.replace(/\*\*/g, '').trim().slice(0, 50))
}

// ——— Now：外面 ———
const 现在 = 读('现在.md').split('\n').filter(Boolean)
let 外面 = '（没记）'
const 外面末 = [...现在].reverse().find((l) => l.startsWith('- '))
if (外面末) 外面 = 外面末.replace(/^-\s*/, '').slice(0, 70)

// ——— Now：她 ———
let 她 = '（没记）'
try {
  const 她想 = fs
    .readFileSync(path.join(os.homedir(), 'Desktop', '会老的AI', '她想的.txt'), 'utf8')
    .split('\n')
    .filter((l) => /\]\s*(想|说)：/.test(l))
  if (她想.length) 她 = 她想[她想.length - 1].replace(/^\[[^\]]*\]\s*/, '').slice(0, 70)
} catch {}

// ——— 岗 ———
const 岗 = []
const 守夜分 = 分钟没动('现在.md')
岗.push(守夜分 >= 0 ? '守夜 ' + 守夜分 + ' 分钟前记过' : '守夜没动过')
const 敲门分 = 分钟没动('敲门.json')
岗.push(敲门分 >= 0 ? '敲门 ' + 敲门分 + ' 分钟前跑过' : '敲门没跑过')

const 出 = []
出.push('【续接单】' + new Date().toLocaleString('zh-CN', { hour12: false }))
出.push('')
出.push('Mission  ' + 任务)
出.push('')
出.push('Status   ✅ 做完的')
if (做完.length) for (const x of 做完) 出.push('           · ' + x)
else 出.push('           （没记）')
出.push('         🚧 攒着的')
if (攒着.length) for (const x of 攒着) 出.push('           · ' + x)
else 出.push('           （空的）')
出.push('         ⏸ 卡着的')
if (卡着.length) for (const x of 卡着) 出.push('           · ' + x)
else 出.push('           （空的）')
出.push('         📋 下一步第一件事')
出.push('           ' + (攒着.length ? '把「' + 攒着[0] + '」记满三次' : '问自己一句：今天做什么'))
出.push('')
出.push('Now      外面  ' + 外面)
出.push('         她    ' + 她)
出.push('         岗    ' + 岗.join(' · '))
出.push('')
出.push('（这份是接住用的。想起靠翻 醒来先看.md。）')

const 文 = 出.join('\n')
console.log(文)

if (process.argv.includes('--save')) {
  fs.writeFileSync(path.join(家, '续接.md'), 文 + '\n', 'utf8')
  console.log('')
  console.log('存了：续接.md')
}
