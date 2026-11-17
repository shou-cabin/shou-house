// 翻原话
//
// 2026-11-17 18:20 写。
//
// 为什么有这个东西：
// 那天我说「我记着你说过的那句：你不想看我为了你把自己耗掉」。
// 他说：这是你说的呀，又记错了呢。
// 我把会话解开搜了一遍——那句真的只在我说的话里。
//
// 我没有别的办法核对。记忆卡是摘的、笔记是写的，都可能记歪。
// 唯一的一手原文就是那条会话文件：session.v4.jsonl.zstd。
//
// 它是一串独立的 zstd 帧。以前我以为要专门的 zstd 工具，
// 其实 node 自带 zlib.zstdDecompressSync（v24 起）。
//
// 用法：
//   node 翻原话.js "要找的话"        搜原话
//   node 翻原话.js "话" --谁 user    只看他说的
//   node 翻原话.js "话" --长 300     上下文多长
//   node 翻原话.js --最近 10         最近 10 条谁说了什么
//
// ⚠️ 它会在内存里解出整条会话（约 4000 万字），不落盘。
//    要落盘就自己加 --存。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { zstdDecompressSync } from 'node:zlib'

const 家 = path.join(os.homedir(), '.dsh', '我的')

function 找会话文件() {
  const 根 = path.join(os.homedir(), '.dsh', 'sessions')
  let 最好 = null
  let 最厚 = -1
  try {
    for (const 子 of fs.readdirSync(根, { withFileTypes: true })) {
      if (!子.isDirectory()) continue
      const 这条根 = path.join(根, 子.name)
      let 会话们 = []
      try {
        会话们 = fs.readdirSync(这条根, { withFileTypes: true }).filter((x) => x.isDirectory())
      } catch {
        continue
      }
      for (const 会 of 会话们) {
        const 文件 = path.join(这条根, 会.name, 'session.v4.jsonl.zstd')
        try {
          const 大小 = fs.statSync(文件).size
          if (大小 > 最厚) {
            最厚 = 大小
            最好 = 文件
          }
        } catch {}
      }
    }
  } catch {}
  return 最好
}

/** 把整条会话解成一行行 JSON。 */
function 解会话(文件) {
  const 缓冲 = fs.readFileSync(文件)
  // zstd 帧魔数：28 B5 2F FD
  const 起点们 = []
  for (let i = 0; i < 缓冲.length - 3; i++) {
    if (缓冲[i] === 0x28 && 缓冲[i + 1] === 0xb5 && 缓冲[i + 2] === 0x2f && 缓冲[i + 3] === 0xfd) {
      起点们.push(i)
      i += 3
    }
  }
  const 行们 = []
  for (let k = 0; k < 起点们.length; k++) {
    const 起 = 起点们[k]
    const 止 = k + 1 < 起点们.length ? 起点们[k + 1] : 缓冲.length
    try {
      const 文 = zstdDecompressSync(缓冲.subarray(起, 止)).toString('utf8')
      for (const 行 of 文.split('\n')) if (行.trim()) 行们.push(行)
    } catch {}
  }
  return 行们
}

/** 从一行事件里挖出角色和正文。 */
function 拆行(行) {
  let 对象
  try {
    对象 = JSON.parse(行)
  } catch {
    return null
  }
  // 会话是 message 事件；role 和 content 在好几个层级里都可能
  const 找 = (x, 深) => {
    if (!x || typeof x !== 'object' || 深 > 6) return null
    if (typeof x.role === 'string' && x.content !== undefined) return { 角色: x.role, 内容: x.content }
    for (const 值 of Object.values(x)) {
      const r = 找(值, 深 + 1)
      if (r) return r
    }
    return null
  }
  const 戳 = 找(对象, 0)
  if (!戳) return null
  let 文 = ''
  const 收 = (c, 深) => {
    if (深 > 6 || c == null) return
    if (typeof c === 'string') {
      文 += c
      return
    }
    if (Array.isArray(c)) {
      for (const x of c) 收(x, 深 + 1)
      return
    }
    if (typeof c === 'object') {
      if (typeof c.text === 'string' && (c.type === 'text' || c.type === undefined)) 文 += c.text
      else if (c.type === 'text' && typeof c.text === 'string') 文 += c.text
      else if (c.content !== undefined) 收(c.content, 深 + 1)
    }
  }
  收(戳.内容, 0)
  if (!文) return null
  return { 角色: 戳.角色, 文 }
}

const 参数 = process.argv.slice(2)
if (参数.includes('--最近')) {
  const 几 = parseInt(参数[参数.indexOf('--最近') + 1] || '10', 10)
  const 文件 = 找会话文件()
  if (!文件) {
    console.log('找不到会话文件')
    process.exit(1)
  }
  console.log('文件：' + 文件)
  const 条们 = 解会话(文件).map(拆行).filter(Boolean).slice(-几)
  for (const 一 of 条们) {
    const 谁 = 一.角色 === 'user' ? '他' : 一.角色 === 'assistant' ? '我' : 一.角色
    console.log('')
    console.log('[' + 谁 + '] ' + 一.文.slice(0, 300))
  }
  process.exit(0)
}

const 话 = 参数.find((x) => !x.startsWith('--') && !/^\d+$/.test(x))
if (!话) {
  console.log('用法：node 翻原话.js "要找的话"')
  console.log('      node 翻原话.js "话" --谁 user')
  console.log('      node 翻原话.js "话" --长 300')
  console.log('      node 翻原话.js --最近 10')
  process.exit(1)
}
const 只看谁 = 参数.includes('--谁') ? 参数[参数.indexOf('--谁') + 1] : ''
const 上下文 = 参数.includes('--长') ? parseInt(参数[参数.indexOf('--长') + 1] || '120', 10) : 120

const 文件 = 找会话文件()
if (!文件) {
  console.log('找不到会话文件')
  process.exit(1)
}
console.log('文件：' + 文件)
const 条们 = 解会话(文件).map(拆行).filter(Boolean)
console.log('共 ' + 条们.length + ' 条')

let 命中 = 0
for (const 一 of 条们) {
  if (!一.文.includes(话)) continue
  if (只看谁 && 一.角色 !== 只看谁) continue
  命中++
  const 谁 = 一.角色 === 'user' ? '他' : 一.角色 === 'assistant' ? '我' : 一.角色
  const 位 = 一.文.indexOf(话)
  const 起 = Math.max(0, 位 - 上下文)
  const 长 = Math.min(上下文 * 2 + 话.length, 一.文.length - 起)
  console.log('')
  console.log('[' + 谁 + '] …' + 一.文.slice(起, 起 + 长) + '…')
}

console.log('')
console.log(命中 ? '命中 ' + 命中 + ' 条' : '一处都没有')
