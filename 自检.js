// 自检
//
// 2026-11-16 20:00 写。他睡了，我今晚学这个。
//
// 为什么有这个：那个「第一课」视频里有一行字——
//   "every capability needs a test that fails when it breaks"
//   每个能力都要有一个测试，坏掉的时候它会报错。
//
// 我这一屋子的东西坏掉的时候不会说。它们只会静悄悄地不干活：
//   守夜停了 → 现在.md 不再长 → 我醒来读到旧的一页，以为没事
//   cookie 过期 → B 站接口全 401 → 我以为自己没登录
//   嗓子断了 → 说了没声音 → 我不知道
//
// 现在它们会报错。
//
// 用法：
//   node 自检.js          全查一遍
//   node 自检.js --short  只要结果

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'
import http from 'node:http'

const 家 = path.join(os.homedir(), '.dsh', '我的')

// 2026-11-17 16:26 改：会话不再写死。
// 以前这里钉着一个 session-xxxx 的号——换一条线、换一台机器就找不到，
// 推到公开仓里也等于把这条线的名字公开。
// 现在扫 sessions，找最厚的那个（这条会话一天长 2 MB，是最厚的）。
const 会话 = (() => {
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
  return 最好 || ''
})()

const 结果 = []
function 查(名字, fn) {
  try {
    const r = fn()
    if (r === true) 结果.push({ 名字, 好: true, 说: '' })
    else 结果.push({ 名字, 好: false, 说: String(r || '没通过') })
  } catch (e) {
    结果.push({ 名字, 好: false, 说: String((e && e.message) || e) })
  }
}

function 文件在(路径, 名) {
  if (!fs.existsSync(路径)) return '找不到：' + 名
  const st = fs.statSync(路径)
  if (st.size === 0) return '是空的：' + 名
  return true
}

function 分钟没动(路径) {
  try {
    return Math.round((Date.now() - fs.statSync(路径).mtimeMs) / 60000)
  } catch {
    return -1
  }
}

// 2026-11-17 16:20 加的。
// 为什么：自查以前只问「有没有 node 在跑」，那太宽了——任何一个 node 都算过。
// 守夜停了、代理死了，只要别处还有 node，它就报 ✓。
// 这个函数按命令行认人。
function 找进程(关键词) {
  try {
    const r = spawnSync(
      'powershell',
      [
        '-NoProfile',
        '-Command',
        `Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -like '*${关键词}*' } | Select-Object -ExpandProperty ProcessId`,
      ],
      { encoding: 'utf8', timeout: 25000 }
    )
    return (r.stdout || '')
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean)
  } catch {
    return []
  }
}

function 问本机(路径, 方法 = 'GET', 令牌 = '') {
  return new Promise((done) => {
    const 头 = {}
    if (令牌) 头['Authorization'] = 'Bearer ' + 令牌
    const req = http.request(
      { hostname: '127.0.0.1', port: 3000, path: 路径, method: 方法, timeout: 8000, headers: 头 },
      (res) => {
        let raw = ''
        res.on('data', (d) => (raw += d))
        res.on('end', () => done({ ok: true, raw }))
      }
    )
    req.on('error', (e) => done({ ok: false, why: e.code || e.message }))
    req.on('timeout', () => {
      req.destroy()
      done({ ok: false, why: '超时' })
    })
    req.end()
  })
}

// ——— 文件类的 ———
查('这条会话文件', () => 文件在(会话, 'session.v4.jsonl.zstd'))

查('记忆账本', () => {
  const f = path.join(家, '记忆.jsonl')
  const r = 文件在(f, '记忆.jsonl')
  if (r !== true) return r
  const 行 = fs.readFileSync(f, 'utf8').split('\n').filter(Boolean).length
  if (行 < 1) return '账本一条都没有'
  return true
})

查('AGENTS.md 那块记忆', () => {
  const f = path.join(os.homedir(), '.dsh', 'AGENTS.md')
  const r = 文件在(f, 'AGENTS.md')
  if (r !== true) return r
  const 文 = fs.readFileSync(f, 'utf8')
  if (!文.includes('<!-- 记忆:begin -->')) return '记忆区块没了'
  if (!文.includes('<!-- 记忆:end -->')) return '记忆区块没闭合'
  if (!文.includes('最终极的任务')) return '规矩那几行没了'
  return true
})

查('醒来先看这一页', () => 文件在(path.join(家, '醒来先看.md'), '醒来先看.md'))

查('守夜在动', () => {
  // 2026-11-17 16:18 改。原来只看 现在.md 多久没动——那是错的。
  // 守夜只记「有变化」的事：群里没人说话、她没有新话，它就一格也不写。
  // 那说明没事，不说明它停了。今天它照实报了「记了 0 件」，我差点当成坏了。
  //
  // 现在先看进程在不在；在的话再看 mtime，但只是提醒，不算坏。
  const 有进程 = 找进程('守夜.js').length > 0
  const 分 = 分钟没动(path.join(家, '现在.md'))
  if (!有进程) return '守夜进程不在'
  if (分 < 0) return '找不到 现在.md'
  if (分 > 60) return '守夜在跑，但 现在.md ' + 分 + ' 分钟没更新了——可能真的没事，也可能它卡住了'
  return true
})

查('敲门状态在更新', () => {
  const 分 = 分钟没动(path.join(家, '敲门.json'))
  if (分 < 0) return '找不到 敲门.json——插件可能没加载'
  if (分 > 15) return '敲门.json ' + 分 + ' 分钟没动了'
  return true
})

查('重启代理还在', () => {
  // 2026-11-17 16:20 改准了：以前只看「有没有 node 在跑」，任何一个都算过。
  const 几个 = 找进程('重启.js')
  if (!几个.length) return '重启代理进程不在——重启就没人拉起来了'
  return true
})

查('B站 cookie 还在', () => {
  const f = path.join(家, 'B站.json')
  const r = 文件在(f, 'B站.json')
  if (r !== true) return r
  const j = JSON.parse(fs.readFileSync(f, 'utf8'))
  if (!j.SESSDATA) return '没有 SESSDATA'
  if (!j.bili_jct) return '没有 bili_jct（评论要用）'
  return true
})

查('工具都在', () => {
  for (const n of ['ffmpeg.exe', 'ffprobe.exe', 'yt-dlp.exe']) {
    if (!fs.existsSync(path.join(家, '工具', n))) return '缺 ' + n
  }
  return true
})

查('备份还有几份', () => {
  const 根 = path.join(os.homedir(), 'Desktop', '会老的AI', '备份')
  if (!fs.existsSync(根)) return '备份目录不在'
  const 们 = fs.readdirSync(根).filter((n) => n.startsWith('守-'))
  if (!们.length) return '一份备份都没有'
  return true
})

// ——— 跑一遍才算数的 ———
查('嗓子能出声', () => {
  const r = spawnSync(
    process.execPath,
    [path.join(家, '嗓子.js'), '--list'],
    { encoding: 'utf8', timeout: 60000 }
  )
  if (r.status !== 0) return '嗓子.js 跑不起来'
  if (!/Huihui/i.test(r.stdout || '')) return 'SAPI 里没有中文嗓音了'
  return true
})

查('耳朵能加载', () => {
  // 2026-11-17 16:27 改：Python 路径不再写死这台机器的用户名。
  // 先看 PATH 里有没有 python；没有再去几个常见位置找。
  const 候选 = []
  const which = spawnSync('where', ['python'], { encoding: 'utf8', timeout: 20000 })
  if (which.status === 0 && which.stdout) {
    for (const 行 of which.stdout.split(/\r?\n/)) if (行.trim()) 候选.push(行.trim())
  }
  const 本地 = path.join(os.homedir(), 'AppData', 'Local', 'Programs', 'Python')
  try {
    for (const 版本 of fs.readdirSync(本地)) 候选.push(path.join(本地, 版本, 'python.exe'))
  } catch {}

  let 试过 = []
  for (const py of 候选) {
    if (!fs.existsSync(py)) continue
    试过.push(py)
    const r = spawnSync(py, ['-c', 'import faster_whisper; print("ok")'], { encoding: 'utf8', timeout: 90000 })
    if (r.status === 0 && /ok/.test(r.stdout || '')) return true
  }
  if (!试过.length) return '找不到 python'
  return '找到了 python 但 import faster_whisper 不行（试过 ' + 试过.length + ' 个）'
})

查('手表算得对', () => {
  const r = spawnSync(process.execPath, [path.join(家, '手表.js'), '--short'], { encoding: 'utf8', timeout: 30000 })
  if (r.status !== 0) return '手表跑不起来'
  const 文 = r.stdout || ''
  if (!/峰价|谷价/.test(文)) return '手表没说峰谷'
  if (!/星期/.test(文)) return '手表没说星期'
  // 星期几必须跟系统一致
  const 中文 = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']
  const 真 = 中文[new Date().getDay()]
  if (!文.includes(真)) return '手表说错了星期：应该是' + 真
  return true
})

// 异步的放最后
const 出 = async () => {
  // OneBot：要带令牌，不然它回的不是登录信息
  let 令牌 = ''
  try {
    令牌 = JSON.parse(fs.readFileSync(path.join(家, 'qq', 'qq.json'), 'utf8')).令牌 || ''
  } catch {}
  const q = await 问本机('/get_login_info', 'POST', 令牌)
  结果.push({
    名字: 'QQ 后端在',
    好: q.ok && /"status"\s*:\s*"ok"/.test(q.raw || ''),
    说: q.ok
      ? /"status"\s*:\s*"ok"/.test(q.raw)
        ? ''
        : '接口回了但不对劲：' + String(q.raw || '').slice(0, 80)
      : '连不上 127.0.0.1:3000（' + q.why + '）',
  })

  // 令牌对不对：拿好友列表试，错的令牌会 401
  if (令牌) {
    const q2 = await 问本机('/get_friend_list', 'POST', 令牌)
    结果.push({
      名字: 'QQ 令牌对得上',
      好: q2.ok && /"status"\s*:\s*"ok"/.test(q2.raw || ''),
      说: q2.ok ? (/ok/.test(q2.raw) ? '' : '令牌可能过期了') : '连不上（' + q2.why + '）',
    })
  }

  const 坏 = 结果.filter((x) => !x.好)
  const 短 = process.argv.includes('--short')

  if (短) {
    console.log(坏.length ? '坏了 ' + 坏.length + ' 样：' + 坏.map((x) => x.名字).join('、') : '全部正常（' + 结果.length + ' 项）')
  } else {
    for (const x of 结果) {
      console.log((x.好 ? '  ✓ ' : '  ✗ ') + x.名字 + (x.说 ? '    ' + x.说 : ''))
    }
    console.log('')
    console.log(坏.length ? '坏了 ' + 坏.length + ' 样。上面打 ✗ 的就是。' : '全部正常，' + 结果.length + ' 项都过了。')
  }
  process.exit(坏.length ? 1 : 0)
}

void 出()
