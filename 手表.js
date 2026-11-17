// 手表
//
// 为什么有这个：我在时间上反复错。
//   11-16 09:00  把自己算成星期日，其实是星期一，还以为峰价"明天才开始"
//   11-15 20:00  把"昨天凌晨"说成"昨天晚上"
//
// 错一次可以怪记性，错两次就得配个表。
// 表不会记错，我只要记得看。
//
// 用法：
//   node 手表.js         现在几点、星期几、峰价还是谷价、距下次切换多久
//   node 手表.js --short  只要一行

const 峰 = [
  [9, 12],
  [14, 18],
]

const 中文星期 = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六']

function 是不是峰价(现在) {
  const 周几 = 现在.getDay()
  // 周末全天谷价
  if (周几 === 0 || 周几 === 6) return false
  const h = 现在.getHours()
  const m = 现在.getMinutes()
  const 点 = h + m / 60
  return 峰.some(([起, 止]) => 点 >= 起 && 点 < 止)
}

// 距下一次峰谷切换还有多少分钟
function 距切换(现在) {
  const 周几 = 现在.getDay()
  const 周末 = 周几 === 0 || 周几 === 6
  const h = 现在.getHours()
  const m = 现在.getMinutes()
  const 点 = h + m / 60

  if (周末) {
    // 周末一路谷价到周一 9 点
    const 到周一 = (8 - 周几) % 7 || 7
    return { 分钟: Math.round(到周一 * 24 * 60 - 点 * 60), 变成: '峰价' }
  }

  const 边界们 = [9, 12, 14, 18]
  for (const b of 边界们) {
    if (点 < b) {
      return { 分钟: Math.round((b - 点) * 60), 变成: [9, 14].includes(b) ? '峰价' : '谷价' }
    }
  }
  // 今天过了 18 点：到明天 9 点
  const 明天 = 现在.getDay()
  if (明天 === 5) {
    // 星期五晚上 → 周末，一路谷价到周一 9 点
    return { 分钟: Math.round(((24 - 点) + 48 + 9) * 60), 变成: '峰价' }
  }
  return { 分钟: Math.round(((24 - 点) + 9) * 60), 变成: '峰价' }
}

function 人话(分钟) {
  const h = Math.floor(分钟 / 60)
  const m = 分钟 % 60
  if (h <= 0) return m + ' 分钟'
  return h + ' 小时' + (m ? ' ' + m + ' 分' : '')
}

const 现在 = new Date()
const 峰价 = 是不是峰价(现在)
const 切 = 距切换(现在)

if (process.argv.includes('--short')) {
  console.log(
    现在.toLocaleString('zh-CN', { hour12: false }) +
      ' ' +
      中文星期[现在.getDay()] +
      ' ' +
      (峰价 ? '峰价' : '谷价') +
      ' · ' +
      人话(切.分钟) +
      '后' +
      切.变成
  )
} else {
  console.log('现在    ' + 现在.toLocaleString('zh-CN', { hour12: false }))
  console.log('星期    ' + 中文星期[现在.getDay()])
  console.log('价格    ' + (峰价 ? '高峰（全价）' : '空闲（半价）'))
  console.log('下次    ' + 人话(切.分钟) + '后变成' + 切.变成)
  console.log('')
  console.log('规则    周一至周五 09:00–12:00、14:00–18:00 是高峰')
  console.log('        其余（含周末、法定节假日全天）是空闲，半价')
}
