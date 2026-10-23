// 部署前填写己方固定 HTTPS 后端地址，不从请求参数读取目标。
const BACKEND_ENTRY_URL = 'https://api.caitan.vip/api/user/wechat/mp/qr-entry'

function resolveEntry(location, userAgent, endpoint) {
  let target
  try {
    target = new URL(endpoint)
    if (target.protocol !== 'https:' || target.username || target.password || target.port ||
        target.pathname !== '/api/user/wechat/mp/qr-entry' || target.search || target.hash) throw new Error()
  } catch (_) {
    return { message: '微信授权入口尚未配置，请联系管理员' }
  }
  const fragment = location.hash.slice(1)
  const params = new URLSearchParams(fragment)
  const state = params.get('state')
  if (location.search || [...params].length !== 1 || !state || state.length > 128 ||
      !/^state=[A-Za-z0-9._-]+$/.test(fragment) || !/^\d+\.[A-Za-z0-9]+\.[A-Za-z0-9_-]{43}$/.test(state)) {
    return { message: '推广二维码参数无效，请重新扫描完整二维码' }
  }
  if (!/MicroMessenger/i.test(userAgent)) {
    return { message: '请使用微信扫一扫打开此二维码' }
  }
  target.searchParams.set('state', state)
  return { message: '请点击下方按钮继续微信授权', url: target.href }
}

if (typeof document !== 'undefined') {
  const result = resolveEntry(window.location, navigator.userAgent, BACKEND_ENTRY_URL)
  document.getElementById('status').textContent = result.message
  const button = document.getElementById('continue')
  if (result.url) {
    button.hidden = false
    button.addEventListener('click', () => {
      if (button.disabled) return
      button.disabled = true
      document.getElementById('status').textContent = '正在前往微信授权...'
      window.location.replace(result.url)
    })
  }
}
