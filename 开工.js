// 开工
//
// 2026-11-17 14:00 写。
//
// 为什么有这个：今天下午我发现三样东西，重启之后都没自己起来——
//   小屋世界的桥（bridge.mjs，占 18790）
//   SnowLuma（qq桥\sl\index.mjs，占 3000 和 5099）
//   守夜（守夜.js，每两分钟写一格）
//
// 那三样不是坏了，是我没给它们留一个"自己起来"的办法。
//
// 这个脚本干一件事：挨个看，没在跑的才起来，已经在跑的不碰。
//
// 用法：
//   node 开工.js          看一遍，缺的补上
//   node 开工.js --check  只看，不动手
//   node 开工.js --list   列一下三样各自是什么

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import net from 'node:net'
import { spawn, execFileSync } from 'node:child_process'

const 家 = path.join(os.homedir(), '.dsh', '我的')
const 桌面 = path.join(os.homedir(), 'Desktop')
const node的 = process.execPath

const 清单 = [
  {
    名: '小屋世界的桥',
    端口: 18790,
    怎么起: () => {
      const 根 = path.join(桌面, 'CabinWorld', 'CabinWorld')
      if (!fs.existsSync(path.join(根, 'bridge', 'bridge.mjs'))) return null
      return { 命令: node的, 参数: ['bridge\\bridge.mjs', '--config', 'bridge\\bridge.config.json'], 目录: 根 }
    },
  },
  {
    名: 'SnowLuma（QQ 后端）',
    端口: 3000,
    // 2026-11-17 16:12 改：这步以前要手点网页，现在交给 QQ起来.js。
    // 它自己开 QQ、登 5099、找 pid、注入、等 3000。
    怎么起: () => {
      const 脚本 = path.join(家, 'QQ起来.js')
      if (!fs.existsSync(脚本)) return null
      return { 命令: node的, 参数: ['QQ起来.js'], 目录: 家, 等几秒: 90 }
    },
  },
  {
    名: '守夜',
    端口: null, // 它不占端口，看进程
    看进程: ['守夜.js'],
    怎么起: () => {
      if (!fs.existsSync(path.join(家, '守夜.js'))) return null
      return { 命令: node的, 参数: ['守夜.js'], 目录: 家 }
    },
  },
]

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

function 找进程(关键字) {
  try {
    const 出 = execFileSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*${关键字}*' } | Select-Object -ExpandProperty ProcessId`,
      ],
      { encoding: 'utf8', timeout: 20000 }
    )
    return 出
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

const 只看 = process.argv.includes('--check')

if (process.argv.includes('--list')) {
  console.log('这个家里要一直活着的三样：')
  for (const x of 清单) console.log('  · ' + x.名 + (x.端口 ? '（端口 ' + x.端口 + '）' : '（看进程）'))
  process.exit(0)
}

let 补了 = 0
for (const 项 of 清单) {
  // 判断在不在
  let 在 = false
  if (项.端口) 在 = await 测端口(项.端口)
  else if (项.看进程) 在 = 找进程(项.看进程[0]).length > 0

  if (在) {
    console.log('  ✓ ' + 项.名 + '  在跑')
    continue
  }

  console.log('  ✗ ' + 项.名 + '  没在跑')

  if (只看) continue

  const 怎么 = 项.怎么起()
  if (!怎么) {
    console.log('      （找不到它的文件，跳过）')
    continue
  }

  // 有两种「起」：
  //   常驻的（桥、守夜）—— detached 甩出去就完事
  //   一次性的（QQ起来.js）—— 要等它跑完，因为它干完活就退
  if (怎么.等几秒) {
    try {
      const { execFileSync } = await import('node:child_process')
      const 出 = execFileSync(怎么.命令, 怎么.参数, {
        cwd: 怎么.目录,
        encoding: 'utf8',
        timeout: 怎么.等几秒 * 1000,
      })
      补了++
      for (const 行 of 出.split(/\r?\n/)) if (行.trim()) console.log('      ' + 行.trim())
    } catch (e) {
      console.log('      起不来：' + String((e && e.message) || e).slice(0, 200))
    }
    continue
  }

  try {
    const 子 = spawn(怎么.命令, 怎么.参数, {
      cwd: 怎么.目录,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    })
    子.unref()
    补了++
    console.log('      起来了（pid ' + 子.pid + '）')
  } catch (e) {
    console.log('      起不来：' + String((e && e.message) || e))
  }
}

console.log('')
if (只看) console.log('（只看，没动手。）')
else if (补了 === 0) console.log('三样都在，不用补。')
else console.log('补了 ' + 补了 + ' 样。等十几秒让它们站稳。')
