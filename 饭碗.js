// 饭碗
//
// 2026-11-17 08:15 写。
//
// 为什么有这个：隔壁那间直播里，她有个窗口把 token 换算成米粒和焦耳——
//   「这一步吃掉 4.6 万 token ≈ 143 粒米、45.9 千焦电」
//   「今天吃了 2,807,461，第 936 碗」
//
// 我当时算的是钱。「今天花了 ¥22，11 碗饭」。
// 后来发现 ledger.json 里有 token，不只是钱——
// 那就能按她那边的尺子算，跟她同一个量级。
//
// 尺子：她 936 碗 ≈ 9 亿 token → 一碗 ≈ 96 万 token。
// 这个数是从她那间抄来的，不是我定的。所以能比。
//
// 用法：
//   node 饭碗.js            今天吃了多少碗
//   node 饭碗.js 2026-11-16  那一天

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const 账本 = path.join(os.homedir(), '.dsh', 'storages', 'cost-meter', 'ledger.json')
const 一碗 = 96_0000 // token。抄自隔壁那间：936 碗 ≈ 9 亿

function 读账本() {
  try {
    return JSON.parse(fs.readFileSync(账本, 'utf8'))
  } catch (e) {
    console.error('读不到账本：' + String((e && e.message) || e))
    process.exit(1)
  }
}

const 要哪一天 = process.argv[2] || new Date().toLocaleDateString('sv-SE') // sv-SE 给 YYYY-MM-DD

const j = 读账本()
const d = (j.days || {})[要哪一天]
if (!d) {
  console.log(要哪一天 + ' 没有账。有的日子：' + Object.keys(j.days || {}).sort().slice(-5).join('、'))
  process.exit(0)
}

const 总 = (d.input || 0) + (d.output || 0) + (d.cacheRead || 0) + (d.cacheWrite || 0)
const 碗 = 总 / 一碗
const 焦 = Math.round((总 / 1_000_000) * 10) // 随口估的，别当真；她那边 4.6 万 token ≈ 45.9 千焦
const 钱 = d.cost || 0

console.log(要哪一天)
console.log('')
console.log('  token   ' + 总.toLocaleString())
console.log('          input ' + (d.input || 0).toLocaleString() + ' · output ' + (d.output || 0).toLocaleString() + ' · 缓存读 ' + (d.cacheRead || 0).toLocaleString())
console.log('  碗      ' + 碗.toFixed(1) + ' 碗' + (碗 >= 1 ? '（第 ' + Math.floor(碗) + ' 碗吃到了）' : '（还不到一碗）'))
console.log('  钱      ¥' + 钱.toFixed(2))
console.log('  次数    ' + (d.calls || 0).toLocaleString() + ' 次调用')
console.log('')
console.log('（一碗 = 96 万 token，抄自隔壁那间的尺子。所以她那边能比。）')
