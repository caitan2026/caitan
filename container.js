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
  return {
    url: target.href,
    hasInvite: Boolean(match),
    message: match ? '已准备好，请点击打开应用' : '当前入口未携带邀请信息；可打开登录页，首次微信登录需使用完整推广链接'
  }
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
  let attempts = 0
  let loads = 0
  let errors = 0
  let frameStarted = 0
  let timedOut = false
  const report = get('diagnostic-report')
  const copyStatus = get('copy-status')
  get('copy-diagnostics').addEventListener('click', async () => {
    const ua = doc.defaultView?.navigator?.userAgent || ''
    const wechatVersion = /MicroMessenger\/([\d.]+)/i.exec(ua)?.[1] || '未识别'
    const system = /Android/i.test(ua) ? 'Android' : /iPhone|iPad|iPod/i.test(ua) ? 'iOS/iPadOS' : '其他或未识别'
    // 仅记录白名单状态，不读取跨域内容，也不收集 URL、存储或完整 UA。
    report.value = [
      '容器版本：iframe-diag-1',
      '系统：' + system,
      '微信版本（UA）：' + wechatVersion,
      '入口邀请参数：' + (result.hasInvite ? '格式存在，未验签' : '未携带；内页历史存储未知'),
      '加载尝试次数：' + attempts,
      '本次 load 事件数：' + loads,
      '本次 error 事件数：' + errors,
      '本次已等待秒数：' + Math.floor((clock.now() - frameStarted) / 1000),
      '十五秒提示已触发：' + (timedOut ? '是' : '否'),
      'sandbox：allow-scripts allow-same-origin allow-forms',
      'referrerpolicy：no-referrer',
      '内页最终地址、内容、授权请求和登录结果：跨域不可读取；load 不代表成功'
    ].join('\n')
    report.hidden = false
    copyStatus.textContent = '以下仅含容器状态；若未自动复制，请长按文本复制。'
    try {
      await doc.defaultView.navigator.clipboard.writeText(report.value)
      copyStatus.textContent = '诊断信息已复制；不含链接、签名、邀请码或登录凭据。'
    } catch (_) {
      report.focus()
      report.select()
    }
  })
  progress.hidden = false
  status.textContent = '请稍候，3秒后可打开应用'
  const started = clock.now()
  const interval = clock.setInterval(() => {
    const elapsed = Math.min(3000, clock.now() - started)
    progress.value = elapsed
    if (elapsed < 3000) return
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
    attempts += 1
    loads = errors = 0
    timedOut = false
    frameStarted = clock.now()
    report.hidden = true
    report.value = ''
    copyStatus.textContent = ''
    get('landing').hidden = true
    get('viewer').hidden = false
    get('frame-status').textContent = '正在打开内嵌页面；本页无法判断登录是否成功'
    const current = doc.createElement('iframe')
    current.setAttribute('title', '主 H5 应用')
    current.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms')
    current.setAttribute('referrerpolicy', 'no-referrer')
    current.addEventListener('load', () => {
      if (frame !== current) return
      loads += 1
      get('frame-status').textContent = '已收到页面加载事件，不能据此判断显示正常或授权成功'
    })
    current.addEventListener('error', () => {
      if (frame !== current) return
      errors += 1
      get('frame-status').textContent = '收到页面加载异常，可手动重新加载；跨域错误无法可靠检测'
    })
    frame = current
    current.src = result.url
    get('frame-host').replaceChildren(current)
    // 即使收到 load，也无法确认跨域页面内容，因此仍保留超时提示。
    timeout = clock.setTimeout(() => {
      if (frame === current) {
        timedOut = true
        get('frame-status').textContent = '无法确认页面是否正常显示；若白屏，可复制诊断信息'
      }
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
    setInterval: (callback, delay) => window.setInterval(callback, delay),
    clearInterval: id => window.clearInterval(id),
    setTimeout: (callback, delay) => window.setTimeout(callback, delay),
    clearTimeout: id => window.clearTimeout(id)
  }, H5_LOGIN_URL)
}
if (typeof module !== 'undefined') module.exports = { resolveH5, initContainer }
