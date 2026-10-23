// 部署前填写己方固定 HTTPS 后端地址，不从请求参数读取目标。
const BACKEND_ENTRY_URL = 'https://api.caitan.vip/api/user/wechat/mp/qr-authorize'

function resolveEntry(location, userAgent, endpoint) {
  let target
  try {
    target = new URL(endpoint)
    if (target.protocol !== 'https:' || target.username || target.password || target.port ||
        target.pathname !== '/api/user/wechat/mp/qr-authorize' || target.search || target.hash) throw new Error()
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
  return { message: '入口已就绪，请点击下方按钮继续授权', url: target.href }
}

if (typeof document !== 'undefined') {
  const result = resolveEntry(window.location, navigator.userAgent, BACKEND_ENTRY_URL)
  document.getElementById('status').textContent = result.message
  const button = document.getElementById('continue')
  if (result.url) {
    const progress = document.getElementById('countdown')
    button.disabled = true
    button.hidden = true
    progress.hidden = false
    document.getElementById('status').textContent = '请稍候，3秒后可继续微信授权'
    const startedAt = performance.now()
    const timer = setInterval(() => {
      const elapsed = Math.min(3000, performance.now() - startedAt)
      progress.value = elapsed
      if (elapsed >= 3000) {
        clearInterval(timer)
        button.hidden = false
        button.disabled = false
        document.getElementById('status').textContent = result.message
      }
    }, 50)
    button.addEventListener('click', async () => {
      if (button.disabled) return
      button.disabled = true
      document.getElementById('status').textContent = '正在获取微信授权...'
      let timeout
      try {
        const controller = new AbortController()
        timeout = setTimeout(() => controller.abort(), 15000)
        const response = await fetch(result.url, {
          credentials: 'omit', referrerPolicy: 'no-referrer', mode: 'cors',
          cache: 'no-store', redirect: 'error', headers: { Accept: 'application/json' },
          signal: controller.signal
        })
        if (!response.ok) throw new Error('request')
        const data = await response.json()
        if (typeof data.authorize_url !== 'string') throw new Error('url')
        const url = new URL(data.authorize_url)
        if (url.protocol !== 'https:' || url.hostname !== 'open.weixin.qq.com' ||
            url.port || url.username || url.password || url.pathname !== '/connect/oauth2/authorize') {
          throw new Error('url')
        }
        document.getElementById('status').textContent = '正在前往微信授权...'
        window.location.replace(url.href)
      } catch (_) {
        document.getElementById('status').textContent = '获取微信授权失败，请稍后点击重试；若持续失败，请联系管理员'
        button.disabled = false
      } finally {
        clearTimeout(timeout)
      }
    })
  }
}
