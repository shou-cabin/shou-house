// QQ 起来
//
// 2026-11-17 16:10 写。
//
// 为什么有这个东西：重启会把 QQ 一起杀掉。QQ 不在，SnowLuma 就没东西可注入，
// 3000 端口就不通，我就不能收发消息。
//
// 之前这一步得手点：开 QQ → 浏览器开 5099 → 输令牌 → 点进程注入 → 点加载 → 确认。
// 今天查出来它其实有 HTTP 接口，那就不用点了：
//
//   POST /api/login               { password } → { token }
//   GET  /api/processes           → { list: [{pid, name, injected, ...}] }
//   POST /api/processes/:pid/load → 注入
//
// 用法：
//   node QQ起来.js          缺的补上
//   node QQ起来.js --check  只看，不动手

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import { spawn, execFileSync } from 'node:child_process'

const 家 = path.join(os.homedir(), '.dsh', '我的')
const 基 = 'http://127.0.0.1:5099'
const QQ路径 = 'C:\\Program Files\\Tencent\\QQNT\\QQ.exe'
const 令牌文件 = path.join(家, 'qq', 'snowluma.json')
const 只看 = process.argv.includes('--check')

function 读令牌() {
  // 2026-11-17 16:30 改：不再写死一个密码当兜底。
  // 密码只能来自 qq/snowluma.json。读不到就说读不到，别猜。
  try {
    const j = JSON.parse(fs.readFileSync(令牌文件, 'utf8'))
    if (j && j.密码) return j.密码
  } catch {}
  return ''
}

async function 请求(路径, 方法, 令牌, 体) {
  const 头 = { 'content-type': 'application/json' }
  if (令牌) 头['x-snowluma-token'] = 令牌
  const r = await fetch(基 + 路径, {
    method: 方法,
    headers: 头,
    body: 体 === undefined ? undefined : JSON.stringify(体),
  })
  const 文 = await r.text()
  try {
    return JSON.parse(文)
  } catch {
    return { _原文: 文.slice(0, 200), _状态: r.status }
  }
}

function 测端口(端口) {
  return new Promise((done) => {
    const s = net.connect({ host: '127.0.0.1', port: 端口, timeout: 1500 })
    s.on('connect', () => {
      s.destroy()
      done(true)
    })
    s.on('timeout', () => {
      s.destroy()
      done(false)
    })
    s.on('error', () => done(false))
  })
}

function 数QQ() {
  try {
    const 出 = execFileSync(
      'powershell',
      ['-NoProfile', '-Command', '@(Get-Process QQ -ErrorAction SilentlyContinue).Count'],
      { encoding: 'utf8', timeout: 20000 }
    )
    return parseInt(出.trim(), 10) || 0
  } catch {
    return 0
  }
}

// —— 一、3000 早就在了就不用管 ——
if (await 测端口(3000)) {
  console.log('  ✓ QQ 后端  在跑（3000 通）')
  process.exit(0)
}
console.log('  ✗ QQ 后端  3000 不通')

if (只看) {
  console.log('')
  console.log('（只看，没动手。）')
  process.exit(0)
}

// —— 二、QQ 进程在不在 ——
let qq数 = 数QQ()
if (qq数 === 0) {
  console.log('       QQ 没开，开它')
  try {
    spawn(QQ路径, [], { detached: true, stdio: 'ignore', windowsHide: false }).unref()
  } catch (e) {
    console.log('       开不起来：' + String((e && e.message) || e))
    process.exit(1)
  }
  for (let i = 0; i < 25; i++) {
    await new Promise((r) => setTimeout(r, 1200))
    qq数 = 数QQ()
    if (qq数 > 0) break
  }
  console.log('       QQ 起来了（' + qq数 + ' 个进程）')
} else {
  console.log('       QQ 在跑（' + qq数 + ' 个进程）')
}

if (qq数 === 0) {
  console.log('       QQ 起不来')
  process.exit(1)
}

// —— 三、登 SnowLuma ——
const 密码 = 读令牌()
const 登录 = await 请求('/api/login', 'POST', null, { password: 密码 })
if (!登录 || !登录.token) {
  console.log('       登不进 SnowLuma：' + JSON.stringify(登录).slice(0, 160))
  process.exit(1)
}
const 令牌 = 登录.token
console.log('       登进 SnowLuma 了')

// —— 四、找 QQ 进程、注入 ——
const 进程表 = await 请求('/api/processes', 'GET', 令牌)
const 表 = (进程表 && 进程表.list) || []
const QQ们 = 表.filter((x) => /QQ\.exe$/i.test(x.name || ''))
console.log('       看到 ' + 表.length + ' 个进程，其中 QQ.exe ' + QQ们.length + ' 个')

if (!QQ们.length) {
  console.log('       SnowLuma 看不到 QQ——可能 QQ 还没到它能挂上的时候，等几秒再跑一次。')
  process.exit(1)
}

let 注了 = 0
for (const 一个 of QQ们) {
  if (一个.injected) {
    console.log('       pid ' + 一个.pid + ' 已经在里面了')
    continue
  }
  const 结果 = await 请求('/api/processes/' + 一个.pid + '/load', 'POST', 令牌)
  if (结果 && 结果.success) {
    注了++
    console.log('       pid ' + 一个.pid + ' 注入成功（' + (结果.process && 结果.process.status) + '）')
  } else {
    console.log('       pid ' + 一个.pid + ' 注入失败：' + JSON.stringify(结果).slice(0, 160))
  }
}

// —— 五、等 3000 ——
let 通了 = false
for (let i = 0; i < 25; i++) {
  await new Promise((r) => setTimeout(r, 1500))
  if (await 测端口(3000)) {
    通了 = true
    break
  }
}

console.log('')
if (通了) console.log('  ✓ 3000 通了')
else console.log('  ✗ 3000 还是不通。看 5099 界面里是什么状态。')
