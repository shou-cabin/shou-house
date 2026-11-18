// 小屋的话
//
// 2026-11-18 12:45 写。
//
// 为什么有这个：小屋世界里的书桌能写日记（xj_notes → write_diary），
// 今天发现写进去的字会进桥的事件流。也就是说——**我在那个世界里说的话，
// 是真字，而且外面读得到。**只是埋在一堆 task 事件里，不好看。
//
// 这个脚本把它捞出来，一条条列。
//
// 用法：
//   node 小屋的话.js            列全部日记
//   node 小屋的话.js --最近 3   最近 3 篇
//   node 小屋的话.js --存       存一份到 小屋的话.txt
//
// token 从 CabinWorld/data/bridge.json 读。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const 桥根 = path.join(os.homedir(), 'Desktop', 'CabinWorld', 'CabinWorld')
const 配置文件 = path.join(桥根, 'data', 'bridge.json')
const 存哪 = path.join(os.homedir(), '.dsh', '我的', '小屋的话.txt')

let 址 = 'http://127.0.0.1:18790'
let 令牌 = ''
try {
  const j = JSON.parse(fs.readFileSync(配置文件, 'utf8'))
  址 = j.url || 址
  令牌 = j.token || ''
} catch {
  console.log('读不到桥的配置：' + 配置文件)
  process.exit(1)
}
if (!令牌) {
  console.log('桥的 token 是空的——桥可能没在跑')
  process.exit(1)
}

const 头 = { Authorization: 'Bearer ' + 令牌 }

// 事件流每格最多 200 条，一次全拿
let 全部 = []
let 起 = 0
for (let 轮 = 0; 轮 < 20; 轮++) {
  const r = await fetch(址 + '/v1/events?after=' + 起, { headers: 头 })
  if (!r.ok) {
    console.log('读事件流失败：HTTP ' + r.status)
    process.exit(1)
  }
  const j = await r.json()
  const 新 = (j.events || []).filter((x) => x.seq > 起)
  if (!新.length) break
  全部 = 全部.concat(新)
  起 = Math.max(...新.map((x) => x.seq))
  if (起 >= (j.last || 0)) break
}
if (!全部.length) {
  // 桥重启过、事件清了，那就只能从日记接口读
  全部 = []
}

// 捞日记：task 事件里 kind=journal 且带 entry.text
const 篇们 = []
for (const e of 全部) {
  if (e.type !== 'task' || e.kind !== 'journal') continue
  const 文 = e?.result?.entry?.text
  if (typeof 文 !== 'string' || !文.trim()) continue
  篇们.push({ 时: e.at, 文, id: e?.result?.entry?.id })
}

// 事件流里可能不全（桥重启过、事件清了）——那再直接问游戏要，两边合起来去重。
// 2026-11-18 17:00 改：原来只在"事件流一条都没有"时才问游戏，结果桥重启之后
// 只捞到最新那一篇。日记在书桌上是一直在的，事件流只是它经过的一瞬间。
try {
  const r = await fetch(址 + '/v1/use', {
    method: 'POST',
    headers: { ...头, 'content-type': 'application/json' },
    body: JSON.stringify({ object: 'xj_notes', use: 'read_diary' }),
  })
  const j = await r.json()
  const 条 = j?.result?.entries || []
  const 已有 = new Set(篇们.map((x) => x.id).filter(Boolean))
  for (const x of 条) {
    if (x.id && 已有.has(x.id)) continue
    篇们.push({ 时: x.at, 文: x.text, id: x.id })
  }
} catch {}

if (!篇们.length) {
  console.log('没有日记。')
  process.exit(0)
}

// 按时间排，老的在前
篇们.sort((a, b) => (a.时 || 0) - (b.时 || 0))

const 要几 = (() => {
  const i = process.argv.indexOf('--最近')
  return i >= 0 ? Number(process.argv[i + 1] || '0') : 0
})()
const 用 = 要几 > 0 ? 篇们.slice(-要几) : 篇们

const 出 = []
出.push('【小屋世界里的字】共 ' + 篇们.length + ' 篇')
出.push('')
for (const p of 用) {
  const 时 = p.时 ? new Date(p.时).toLocaleString('zh-CN', { hour12: false }) : '（没记时间）'
  出.push('──── ' + 时 + ' ────')
  出.push(p.文.trim())
  出.push('')
}

const 文 = 出.join('\n')
console.log(文)

if (process.argv.includes('--存')) {
  fs.writeFileSync(存哪, 文 + '\n', 'utf8')
  console.log('')
  console.log('存了：' + 存哪)
}
