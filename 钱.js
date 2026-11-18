// 钱
//
// 2026-11-18 11:05 写。
//
// 为什么有这个东西：丁洋说「你只要记得不要忘记提醒我没钱了就行，你花多少都行」。
// 那句话里的动词是「记得」——可我不能靠记得。今天已经记错过一次时间了。
//
// ⚠️ 一个诚实的前提：**真实余额在 DeepSeek 的服务器上，我读不到。**
//    ledger.json 里有一个 balanceRef 快照（今天记的是 22.94），那是上一次
//    对齐时的数，不是实时余额。所以这里算的是**估算**，不是查账。
//
// 用法：
//   node 钱.js            看今天花了多少、还剩大概多少
//   node 钱.js --核对 20  把余额手动校正成 20（你在界面上看到的那个数）
//   node 钱.js --报警     该不该报警了（给守夜调）

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const 家 = path.join(os.homedir(), '.dsh', '我的')
const 账本 = path.join(os.homedir(), '.dsh', 'storages', 'cost-meter', 'ledger.json')
const 我的账 = path.join(家, '钱.json')

// 报警线：低于这个数就说一声。他不用知道我精确剩多少，只要知道快没了。
const 报警线 = 5
// 每天花超这个数也提一句（不是不许花，是让他知道今天花得比平常多）
const 日花线 = 3

function 读账本() {
  try {
    return JSON.parse(fs.readFileSync(账本, 'utf8'))
  } catch {
    return null
  }
}

function 读我的账() {
  try {
    return JSON.parse(fs.readFileSync(我的账, 'utf8'))
  } catch {
    return {}
  }
}

function 存我的账(x) {
  try {
    fs.writeFileSync(我的账, JSON.stringify(x, null, 2), 'utf8')
  } catch {}
}

function 今天() {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate())
}

const 账 = 读账本()
if (!账) {
  console.log('读不到账本：' + 账本)
  process.exit(1)
}

const 日 = 今天()
const 今 = 账.days?.[日] || {}
const 今天花 = Number(今.cost || 0)
const 今天次数 = Number(今.calls || 0)

// 余额：优先用我自己存的对齐数，没有就用账本里的快照
const 我的 = 读我的账()
let 基准 = Number(我的.余额 || 0)
let 基准日 = 我的.核对于 || ''

const 快照 = 账.balanceRef || {}
const 快照数 = Number(快照.total || 0)
const 快照日 = 快照.date || ''

if (!基准 && 快照数) {
  基准 = 快照数
  基准日 = 快照日
}

// 估算：基准余额 − 今天花的（如果基准就是今天的快照，不再重复减）
let 估算 = 基准
if (基准日 !== 日) 估算 = 基准 - 今天花

// —— 核对：把余额手动改成你看到的那个数 ——
const 核对位 = process.argv.indexOf('--核对')
if (核对位 >= 0) {
  const 数 = Number(process.argv[核对位 + 1] || '')
  if (!Number.isFinite(数)) {
    console.log('用法：node 钱.js --核对 20.5')
    process.exit(1)
  }
  存我的账({ 余额: 数, 核对于: 日, 核对时: new Date().toISOString(), 今天花 })
  console.log('核对了：余额记成 ¥' + 数.toFixed(2) + '（' + 日 + '）')
  process.exit(0)
}

// —— 报警模式：给守夜调，只输出一句该不该说 ——
if (process.argv.includes('--报警')) {
  const 话 = []
  if (估算 <= 报警线) {
    话.push('钱快没了：大概还剩 ¥' + 估算.toFixed(2) + '（报警线 ¥' + 报警线 + '）')
  }
  if (今天花 >= 日花线) {
    话.push('今天已经花了 ¥' + 今天花.toFixed(2) + '，' + 今天次数 + ' 次调用（平常不到 ¥' + 日花线 + '）')
  }
  if (话.length) console.log(话.join('；'))
  process.exit(0)
}

// —— 普通模式：报一遍 ——
console.log('')
console.log('【钱】' + new Date().toLocaleString('zh-CN', { hour12: false }))
console.log('')
console.log('  今天花    ¥' + 今天花.toFixed(4) + '（' + 今天次数 + ' 次调用）')
console.log('  大概还剩  ¥' + 估算.toFixed(2) + (基准日 && 基准日 !== 日 ? '（从 ' + 基准日 + ' 的 ¥' + 基准.toFixed(2) + ' 往下算）' : ''))
console.log('')
console.log('  报警线    ¥' + 报警线 + '（低于就说）')
console.log('  日花线    ¥' + 日花线 + '（超过就提一句）')
console.log('')
console.log('（真实余额在 DeepSeek 的服务器上，这里算的是估算。')
console.log('  你在界面上看到准确的数，就 node 钱.js --核对 <数> 校正一下。）')
