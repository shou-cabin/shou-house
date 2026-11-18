#!/usr/bin/env node
// 日志医生 —— 修「会话打不开」的那种坏
//
// 2026-11-18 15:05 写。
//
// 为什么有这个：
//   那天打开一个旧会话，界面报
//     failed to project session "...": Cannot read properties of null (reading 'kind')
//   查下去是日志里有一条 turn/end 的 reason 是 null。
//   主机端折叠会话投影时（conversationContinuation）要读 reason.kind，
//   读到 null 就抛，整个会话的历史就再也读不出来。
//
//   更上游的因：有插件调 agent.cancel() 时把字符串当 cause 传进去
//   （cancel 要的是 {kind:'user'|'parent'|'hook'|'disposed'} 对象），
//   abort 把字符串原样放进 signal.reason；收尾时读不到 .kind，
//   在 catch 里抛了，于是 turnEnds 还是初始的 null，finally 就把 {"reason":null} 写进日志。
//
//   日志是只追加的，坏一条就永久坏 —— 所以要有这个工具。
//
// 用法：
//   node 日志医生.js 扫                  扫全部会话，报有几条坏
//   node 日志医生.js 修 <日志文件>        修一份（先备份，改前改后都验证）
//   node 日志医生.js 查 <日志文件>        只跑一遍会崩的那段折叠，看能不能过
//
// 修的原则：只动那一条坏的，其它帧原样保留（字节都不动），改完重新解压验证行数不变。

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import zlib from 'node:zlib'

const 会话根 = path.join(os.homedir(), '.dsh', 'sessions')
const 备份目录 = path.join(os.homedir(), '.dsh', '我的', '日志备份')
const 帧头 = Buffer.from([0x28, 0xb5, 0x2f, 0xfd])
const 帧名头 = '{"type":"turn/end"'
const 合法原因 = new Set(['completed', 'aborted', 'blocked', 'error', 'max-tokens', 'interrupted', 'forked'])
const 无载荷原因 = new Set(['completed', 'blocked', 'max-tokens', 'interrupted', 'forked'])

function 切帧(buf) {
  const 位置 = []
  let i = 0
  while ((i = buf.indexOf(帧头, i)) !== -1) {
    位置.push(i)
    i += 1
  }
  return 位置
}

function 解帧(buf) {
  const 位置 = 切帧(buf)
  const 段 = []
  for (let n = 0; n < 位置.length; n += 1) {
    const 起 = 位置[n]
    const 止 = n + 1 < 位置.length ? 位置[n + 1] : buf.length
    段.push(zlib.zstdDecompressSync(buf.subarray(起, 止)).toString('utf8'))
  }
  return { 位置, 段 }
}

/** 一份会话日志里，有几条 turn/end 的 reason 是null或者形状不对。 */
function 找坏的(行们) {
  const 坏的 = []
  for (const 行 of 行们) {
    if (!行.includes('"reason":null')) continue
    let 事件
    try {
      事件 = JSON.parse(行)
    } catch {
      continue
    }
    if (事件.type !== 'turn/end') continue
    坏的.push({ 行, seq: 事件.seq })
  }
  return 坏的
}

function 一级日志文件(会话目录) {
  const 文件们 = fs.readdirSync(会话目录).filter((f) => /^session(\.v\d+)?\.jsonl\.zstd$/.test(f))
  if (文件们.length === 0) return undefined
  const 版本 = (f) => {
    const m = f.match(/\.v(\d+)\.jsonl\.zstd$/)
    return m ? Number(m[1]) : 0
  }
  return path.join(会话目录, 文件们.sort((a, b) => 版本(b) - 版本(a))[0])
}

function 修一个文件(文件, 理由) {
  const 原 = fs.readFileSync(文件)
  const { 位置, 段 } = 解帧(原)
  const 行们 = 段.join('').split('\n').filter(Boolean)
  const 坏的 = 找坏的(行们)
  if (坏的.length === 0) return 0

  const 改后段 = 段.slice()
  const 动过的 = new Set()
  for (const 坏 of 坏的) {
    const 改后 = 坏.行.replace('"reason":null', '"reason":{"kind":"' + 理由 + '"}')
    JSON.parse(改后)
    const 归谁 = []
    改后段.forEach((段文本, idx) => {
      if (段文本.includes(坏.行)) 归谁.push(idx)
    })
    if (归谁.length !== 1) throw new Error('seq ' + 坏.seq + ' 落在了 ' + 归谁.length + ' 个帧里，不敢动')
    改后段[归谁[0]] = 改后段[归谁[0]].replace(坏.行, 改后)
    动过的.add(归谁[0])
  }

  const 新块们 = []
  段.forEach((_, idx) => {
    if (!动过的.has(idx)) {
      const 起 = 位置[idx]
      const 止 = idx + 1 < 位置.length ? 位置[idx + 1] : 原.length
      新块们.push(原.subarray(起, 止))
      return
    }
    新块们.push(zlib.zstdCompressSync(Buffer.from(改后段[idx], 'utf8')))
  })
  const 新文件内容 = Buffer.concat(新块们)

  // 改之前先验证：行数不变、每条都能解析、没有剩下的 null
  const 复查 = 解帧(新文件内容)
  const 复查行们 = 复查.段.join('').split('\n').filter(Boolean)
  if (复查行们.length !== 行们.length) {
    throw new Error('行数变了：' + 行们.length + ' -> ' + 复查行们.length)
  }
  let 剩下 = 0
  let 解析不了 = 0
  for (const 行 of 复查行们) {
    try {
      JSON.parse(行)
      if (行.includes('"reason":null')) 剩下 += 1
    } catch {
      解析不了 += 1
    }
  }
  if (剩下 !== 0 || 解析不了 !== 0) {
    throw new Error('验证没过：还剩 ' + 剩下 + '，解析不了 ' + 解析不了)
  }

  // 落到磁盘：备份一次，之后不再覆盖备份
  fs.mkdirSync(备份目录, { recursive: true })
  const 会话名 = path.basename(path.dirname(文件))
  const 备份 = path.join(备份目录, 会话名 + '.' + path.basename(文件) + '.orig')
  if (!fs.existsSync(备份)) fs.copyFileSync(文件, 备份)
  fs.writeFileSync(文件, 新文件内容)
  return 坏的.length
}

/** 按主机端源码复刻 conversationContinuation 的折叠，跑一遍看会不会崩。 */
function 查一段(行们) {
  const 可续失败 = new Set(['RATE_LIMIT', 'SERVER', 'TIMEOUT', 'TRANSPORT', 'EMPTY_RESPONSE', 'STREAM_CLOSED'])
  const 空 = { admitted: false, failedAttempt: false, ending: null }
  let 状态 = { ...空 }
  let 收尾 = 0
  for (const 行 of 行们) {
    if (!行.includes('"type":"')) continue
    const e = JSON.parse(行)
    if (e.type === 'session') continue
    switch (e.type) {
      case 'turn/start':
        状态 = { ...空 }
        break
      case 'step/start':
      case 'assistant/message':
        if (状态.failedAttempt) 状态 = { ...状态, failedAttempt: false }
        break
      case 'user/message': {
        const 来源 = e.data?.source?.kind
        const 条数 = Array.isArray(e.data?.content) ? e.data.content.length : 0
        if (!状态.admitted && e.surfaceOp === 'append'
          && ((来源 === 'user' && 条数 > 0) || (来源 === 'retry' && 条数 === 0))) {
          状态 = { ...状态, admitted: true }
        }
        break
      }
      case 'assistant/attempt':
        if (!状态.failedAttempt) 状态 = { ...状态, failedAttempt: true }
        break
      case 'turn/end': {
        收尾 += 1
        const r = e.data?.reason
        if (r === null || typeof r !== 'object' || typeof r.kind !== 'string') {
          throw new Error('turn/end seq ' + e.seq + ' 的 reason 不能用：' + JSON.stringify(r))
        }
        const 可续 = r.kind === 'error' && 可续失败.has(r.error?.code) && 状态.admitted && 状态.failedAttempt
        状态 = 可续 ? { ...空, ending: e.seq } : { ...空 }
        break
      }
      default:
        break
    }
  }
  const 合格 = typeof 状态.admitted === 'boolean'
    && typeof 状态.failedAttempt === 'boolean'
    && (状态.ending === null || (Number.isInteger(状态.ending) && 状态.ending >= 0))
  return { 收尾, 状态, 合格 }
}

function 读成行(文件) {
  return 解帧(fs.readFileSync(文件)).段.join('').split('\n').filter(Boolean)
}

const [, , 命令, 参数] = process.argv

if (命令 === '扫') {
  // 2026-11-18 15:15 改：跳过的文件必须说出来。
  // 上一版有个静默的 continue（读不出来就跳过），结果漏了闪那条 21MB 的会话，
  // 我还跟你说「18 份全干净」——那是假的干净。漏报比不扫更糟。
  let 会话数 = 0
  let 坏的数 = 0
  const 脏的 = []
  const 跳过的 = []
  for (const 项目 of fs.readdirSync(会话根, { withFileTypes: true })) {
    if (!项目.isDirectory()) continue
    const 项目路径 = path.join(会话根, 项目.name)
    for (const 会话 of fs.readdirSync(项目路径, { withFileTypes: true })) {
      if (!会话.isDirectory()) continue
      const 文件 = 一级日志文件(path.join(项目路径, 会话.name))
      if (文件 === undefined) {
        跳过的.push(会话.name + '（没有可读的日志文件）')
        continue
      }
      try {
        会话数 += 1
        const 坏的 = 找坏的(读成行(文件))
        if (坏的.length > 0) {
          坏的数 += 坏的.length
          脏的.push([会话.name, 坏的.length, 文件])
        }
      } catch (错误) {
        跳过的.push(会话.name + '（读不了：' + 错误.message + '）')
      }
    }
  }
  console.log('扫了 ' + 会话数 + ' 份会话日志，坏的 turn/end：' + 坏的数 + ' 条，跳过 ' + 跳过的.length + ' 份')
  for (const [名, 数, 文件] of 脏的) console.log('  ' + 名 + '  ' + 数 + ' 条\n    ' + 文件)
  for (const 名 of 跳过的) console.log('  跳过 ' + 名)
  if (坏的数 === 0 && 跳过的.length === 0) console.log('干净。')
  else if (跳过的.length > 0) console.log('注意：有跳过的，别当成干净。')
} else if (命令 === '修') {
  if (!参数) {
    console.log('要给一个日志文件')
    process.exit(1)
  }
  const 理由 = process.argv[4] || 'interrupted'
  // aborted / error 要带子字段（原因、错误对象），这里不替它们瞎编，只收不需要载荷的。
  if (!无载荷原因.has(理由)) {
    console.log('修的时候只能用：' + [...无载荷原因].join(' / '))
    console.log('（aborted 和 error 要带子字段，硬塞进去形状不合法）')
    process.exit(1)
  }
  const 数 = 修一个文件(参数, 理由)
  console.log(数 === 0 ? '这份是干净的，没动。' : '修好了 ' + 数 + ' 条，理由记作 ' + 理由 + '。')
  if (数 > 0) console.log('备份在 ' + 备份目录)
} else if (命令 === '查') {
  if (!参数) {
    console.log('要给一个日志文件')
    process.exit(1)
  }
  const 结果 = 查一段(读成行(参数))
  console.log('turn/end ' + 结果.收尾 + ' 条，折叠走完没崩，末态 ' + JSON.stringify(结果.状态)
    + '，形状合格：' + 结果.合格)
  if (!结果.合格) process.exit(1)
} else {
  console.log('用法：node 日志医生.js 扫 | 修 <文件> [理由] | 查 <文件>')
}
