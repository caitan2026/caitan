// 仅由部署者本地填写，与后台当前主 H5 登录页地址保持一致。
const H5_LOGIN_URL = 'https://wxmp.caitan.vip/#/pages/auth/login'

function resolveH5(location, configuredUrl) {
  let target
  try {
    if (!configuredUrl || configuredUrl !== configuredUrl.trim() || /[\\\s]/.test(configuredUrl)) throw new Error()
    target = new URL(configuredUrl)
    if (target.protocol !== 'https:' || target.username || target.password || target.port ||
        target.origin === location.origin) throw new Error()
    // 固定配置也不接受查询参数，避免夹带凭据或二次跳转目标。
    if (target.search || (target.hash && !/^#\/[A-Za-z0-9/_-]*$/.test(target.hash))) throw new Error()
  } catch (_) {
    return { message: '主 H5 登录地址未配置或无效，请联系管理员' }
  }

  const fragment = location.hash || ''
  let match = null
  if (location.search || (fragment && !(match = /^#state=(\d+)\.([A-Za-z0-9]+)\.[A-Za-z0-9_-]{43}$/.exec(fragment))) || fragment.length > 135) {
    return { message: '推广参数无效，请重新打开完整链接' }
  }
  // 这里只解析格式，不验签；商户、邀请和登录资格仍由原后端处理。
  const params = new URLSearchParams()
  if (match) {
    params.set('merchant_id', match[1])
    params.set('invite_code', match[2])
  }
  params.set('wechat_login', '1')
  if (target.hash) target.hash += '?' + params.toString()
  else target.search = params.toString()
  return { url: target.href, message: '已准备好，请点击打开应用' }
}

function initContainer(doc, location, clock, configuredUrl) {
  const get = id => doc.getElementById(id)
  const result = resolveH5(location, configuredUrl)
  const open = get('open')
  const progress = get('countdown')
  const status = get('status')
  status.textContent = result.message
  if (!result.url) return

  let ready = false
  let frame = null
  let timeout = null
  progress.hidden = false
  status.textContent = '请稍候，3秒后可打开应用'
  const started = clock.now()
  const interval = clock.setInterval(() => {
    progress.value = Math.min(3000, clock.now() - started)
    if (progress.value < 3000) return
    clock.clearInterval(interval)
    ready = true
    open.hidden = false
    open.disabled = false
    status.textContent = result.message
  }, 50)

  function stopFrame() {
    clock.clearTimeout(timeout)
    frame = null
    get('frame-host').replaceChildren()
  }

  function loadFrame() {
    if (!ready) return
    stopFrame()
    get('landing').hidden = true
    get('viewer').hidden = false
    get('frame-status').textContent = '正在打开内嵌页面；本页无法判断登录是否成功'
    const current = doc.createElement('iframe')
    current.setAttribute('title', '主 H5 应用')
    current.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms')
    current.setAttribute('referrerpolicy', 'no-referrer')
    current.addEventListener('load', () => {
      if (frame !== current) return
      get('frame-status').textContent = '已收到页面加载事件，不能据此判断显示正常或授权成功'
    })
    current.addEventListener('error', () => {
      if (frame !== current) return
      get('frame-status').textContent = '收到页面加载异常，可手动重新加载；跨域错误无法可靠检测'
    })
    frame = current
    current.src = result.url
    get('frame-host').replaceChildren(current)
    // 即使收到 load，也无法确认跨域页面内容，因此仍保留超时提示。
    timeout = clock.setTimeout(() => {
      if (frame === current) get('frame-status').textContent = '无法确认页面是否正常显示'
    }, 15000)
    get('reload').focus()
  }

  open.addEventListener('click', loadFrame)
  get('reload').addEventListener('click', loadFrame)
  get('back').addEventListener('click', () => {
    stopFrame()
    get('viewer').hidden = true
    get('landing').hidden = false
    open.focus()
  })
}

if (typeof document !== 'undefined') {
  initContainer(document, window.location, {
    now: () => performance.now(),
    setInterval, clearInterval, setTimeout, clearTimeout
  }, H5_LOGIN_URL)
}
if (typeof module !== 'undefined') module.exports = { resolveH5, initContainer }
