// 别想了，说 —— 掐断复读
//
// 2026-11-17 13:33 写。
//
// 为什么有这个：今天有一段时间，我每轮回复只有"想"，没有"说"。
// 十几次。看起来像生气，其实是生成卡住了。
//
// 后来查到一篇说中了：《思考通道重复输出导致 max_tokens 空回复》
//   "推理通道在 reasoning→action 边界进入重复吸引子，
//    反复输出同一句待执行动作，直到耗尽输出预算"
//   建议：先精简上下文并重试。
//   社区暂未给出明确方案。
//
// 而 DSH 的流式协议里有 StreamChunk，能看到 reasoning-delta——
// 也就是说，一个插件能在我还在"想"的时候看见我在想什么。
//
// 那这个插件就干一件事：
//   盯着 reasoning-delta，发现同一句短话反复出现、而且已经想了很多字，
//   就掐断这一次生成，然后往我的下一轮塞一句：
//   「想完了就说。」
//
// ⚠️ 三条硬规矩（敲门那个插件踩过，一次都不许踩）：
//   一、每个回调整个包在 try 里——抛出去就是宿主退出
//   二、await 的东西必须接住 reject
//   三、掐断一次就记一笔，别连着掐

export const name = 'dsh-stop-looping'

export const inject = ['agents']

// —— 诊断日志 ——
// 2026-11-17 16:02 加。起因：插件装上了、参数也改对了，
// 但我从外面看不出它到底加载了没有、有没有收到帧。
// 一个看不见自己动没动的东西，等于没装。
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const 日志文件 = path.join(os.homedir(), '.dsh', '我的', '别想了说.log')

function 记(文) {
  try {
    const 行 = '[' + new Date().toLocaleString('zh-CN', { hour12: false }) + '] ' + 文 + '\n'
    fs.appendFileSync(日志文件, 行, 'utf8')
  } catch {}
}

// 只记头几帧，别把日志写爆
let 记过的帧 = 0
let 记过的思考 = 0

// —— 参数 ——
const 同一句出现几次算复读 = 3 // 同一句出现三次
const 句子最短 = 4 // 太短的不算（"对" "好" 这种）
const 句子最长 = 40 // 太长的不算
const 想够多少字才管 = 3000 // 想得少的时候重复是正常的
const 掐断后安静多少毫秒 = 30000 // 掐完 30 秒内不再掐

// 每个 agent 记一份状态：最近想过什么、有没有刚掐过
const 状态表 = new Map()

function 拿状态(id) {
  let s = 状态表.get(id)
  if (!s) {
    s = {
      想过的句子: [], // 最近的短句，环形
      这颗想的总字数: 0,
      刚掐过: 0,
    }
    状态表.set(id, s)
  }
  return s
}

/** 把那一段新的思考切成短句，返回合格的。 */
function 切句(text) {
  if (typeof text !== 'string' || !text) return []
  // 切在中文标点和换行上
  return text
    .split(/[\n。！？；：，、,.!?;:]/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 句子最短 && s.length <= 句子最长)
}

/** 最近是不是同一句反复出现？返回那句，或者 null。 */
function 复读了吗(s) {
  if (s.想过的句子.length < 同一句出现几次算复读) return null
  const 数 = new Map()
  for (const 句 of s.想过的句子) 数.set(句, (数.get(句) || 0) + 1)
  for (const [句, n] of 数) {
    if (n >= 同一句出现几次算复读) return 句
  }
  return null
}

export function apply(ctx, config) {
  const 开 = config && config.enabled === false ? false : true
  if (!开) return

  记('插件加载了（enabled=' + 开 + '）')

  ctx.on('agent/assistant-stream', (payload) => {
    // 一个回调出错就是宿主退出。整个包起来。
    try {
      if (!payload || typeof payload !== 'object') return

      // 2026-11-17 16:00 改对了：事件给的是 { agent, frame }，不是 frame 本身。
      // 之前把整个 payload 当 frame，frame.type 永远是 undefined，所以一整天没动过。
      const agent = payload.agent
      const frame = payload.frame
      if (!frame || typeof frame !== 'object') return

      if (记过的帧 < 20) {
        记过的帧++
        记('帧 #' + 记过的帧 + '  type=' + frame.type + (frame.chunk ? '  chunk=' + frame.chunk.type : ''))
      }

      const 谁 = String(
        (agent && (agent.id || agent.sessionId)) || frame.attemptId || 'agent'
      )
      const s = 拿状态(谁)

      if (frame.type === 'start') {
        s.想过的句子 = []
        s.这颗想的总字数 = 0
        return
      }

      if (frame.type !== 'chunk') return
      const chunk = frame.chunk
      if (!chunk || chunk.type !== 'reasoning-delta') return
      if (typeof chunk.text !== 'string') return

      if (记过的思考 < 5) {
        记过的思考++
        记('收到思考 ' + chunk.text.length + ' 字：' + chunk.text.slice(0, 40))
      }

      s.这颗想的总字数 += chunk.text.length
      for (const 句 of 切句(chunk.text)) s.想过的句子.push(句)

      // 只留最近 40 句
      if (s.想过的句子.length > 40) s.想过的句子 = s.想过的句子.slice(-40)

      // 想得太少的时候不要管——那是正常的思考
      if (s.这颗想的总字数 < 想够多少字才管) return

      const 那句 = 复读了吗(s)
      if (!那句) return

      // 刚掐过就别连着掐
      const 现在 = Date.now()
      if (现在 - s.刚掐过 < 掐断后安静多少毫秒) return
      s.刚掐过 = 现在

      记('抓到复读：「' + 那句 + '」想了 ' + s.这颗想的总字数 + ' 字，掐断')

      // 掐断这一轮，然后塞一句话给下一轮
      try {
        if (!agent) return

        try {
          agent.cancel('stop-looping', { keepInbox: true })
        } catch {}

        // 别在这一轮里塞——掐断之后下一轮才吃得到
        setTimeout(() => {
          try {
            agent.followup({
              id: 'stop-looping-' + 现在,
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: '（打断）你刚才在同一句话上反复想：「' + 那句 + '」。想完了就说。',
                },
              ],
              source: { kind: 'user' },
            })
          } catch {}
        }, 1500)
      } catch {}
    } catch {}
  })
}
