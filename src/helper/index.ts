import { can } from '@/assembly/backend'
import { connectionAccessor } from '@/assembly/connections'
import { hiddenGroupMap, proxyMap } from '@/assembly/proxies'
import { NOT_CONNECTED, PROXY_CHAIN_DIRECTION, PROXY_TYPE, ROUTE_NAME } from '@/constant'
import { showNotification } from '@/helper/notification'
import { prettyBytesHelper } from '@/helper/utils'
import {
  customThemes,
  lowLatency,
  mediumLatency,
  proxyChainDirection,
  splitOverviewPage,
} from '@/store/settings'
import type { Connection, Proxy, SubscriptionInfo } from '@/types'
import * as ipaddr from 'ipaddr.js'
import dayjs from 'dayjs'
import { toFinite } from 'lodash'
import { computed } from 'vue'

export const isProxyGroup = (name: string) => {
  const proxyNode = proxyMap.value[name]

  if (!proxyNode) {
    return false
  }

  if (proxyNode.all?.length) {
    return true
  }

  return [
    PROXY_TYPE.Dns,
    PROXY_TYPE.Compatible,
    PROXY_TYPE.Direct,
    PROXY_TYPE.Reject,
    PROXY_TYPE.RejectDrop,
    PROXY_TYPE.Pass,
    PROXY_TYPE.Fallback,
    PROXY_TYPE.URLTest,
    PROXY_TYPE.LoadBalance,
    PROXY_TYPE.Selector,
    PROXY_TYPE.Smart,
    PROXY_TYPE.PassRule,
  ].includes(proxyNode.type.toLowerCase() as PROXY_TYPE)
}

// 以下 getConnectionXxx 均委托给 assembly 层「按当前后端动态选用」的访问器,
// view / store 直接读取这些 view 友好的派生值,无需感知后端差异。
export const getConnectionChains = (connection: Connection) =>
  connectionAccessor().chains(connection)

export const getConnectionDownload = (connection: Connection) =>
  connectionAccessor().download(connection)

export const getConnectionUpload = (connection: Connection) =>
  connectionAccessor().upload(connection)

export const getConnectionStart = (connection: Connection) => connectionAccessor().start(connection)

export const getConnectionRule = (connection: Connection) => connectionAccessor().rule(connection)

export const getConnectionRulePayload = (connection: Connection) =>
  connectionAccessor().rulePayload(connection)

export const getConnectionSourceIP = (connection: Connection) =>
  connectionAccessor().sourceIP(connection)

export const getConnectionSourcePort = (connection: Connection) =>
  connectionAccessor().sourcePort(connection)

export const getConnectionNetwork = (connection: Connection) =>
  connectionAccessor().network(connection)

export const getConnectionSmartBlock = (connection: Connection) =>
  connectionAccessor().smartBlock(connection)

export const getConnectionHostname = (connection: Connection) =>
  connectionAccessor().hostname(connection)

export const getHostFromConnection = (connection: Connection) =>
  connectionAccessor().host(connection)

export const getProcessFromConnection = (connection: Connection) =>
  connectionAccessor().process(connection)

export const getDestinationFromConnection = (connection: Connection) =>
  connectionAccessor().destination(connection)

export const getNetworkTypeFromConnection = (connection: Connection) =>
  connectionAccessor().networkType(connection)

export const getInboundUserFromConnection = (connection: Connection) =>
  connectionAccessor().inboundUser(connection)

export const getDestinationTypeFromConnection = (connection: Connection) => {
  const destination = getDestinationFromConnection(connection)

  if (ipaddr.IPv4.isIPv4(destination)) {
    return 'IPv4'
  } else if (ipaddr.IPv6.isIPv6(destination)) {
    return 'IPv6'
  } else {
    return 'FQDN'
  }
}

export const getChainsStringFromConnection = (connection: Connection) => {
  const chains = [...getConnectionChains(connection)]

  if (proxyChainDirection.value === PROXY_CHAIN_DIRECTION.NORMAL) {
    chains.reverse()
  }

  return chains.join('')
}

export const getColorForLatency = (latency: number) => {
  if (latency === NOT_CONNECTED) {
    return ''
  } else if (latency < lowLatency.value) {
    return 'text-low-latency'
  } else if (latency < mediumLatency.value) {
    return 'text-medium-latency'
  } else {
    return 'text-high-latency'
  }
}

// 节点延迟历史 tooltip 的公共构建器,供 LatencyTag / NodesPage 等复用。
export const createLatencyHistoryTip = (history: Proxy['history']) => {
  const container = document.createElement('div')
  container.classList.add('flex', 'flex-col', 'gap-1')

  for (const item of history) {
    const row = document.createElement('div')
    row.classList.add('flex', 'items-center', 'gap-2')
    const time = document.createElement('span')
    time.textContent = dayjs(item.time).format('YYYY-MM-DD HH:mm:ss')
    time.className = 'text-xs'
    const delay = document.createElement('span')
    delay.textContent = item.delay + 'ms'
    delay.className = getColorForLatency(item.delay) + ' text-xs'
    row.append(time, delay)
    container.append(row)
  }

  return container
}

// 订阅信息(流量/到期)的统一格式化,供 ProxyProvider / NodesPage 复用。
export const getProviderSubscriptionInfo = (
  info: SubscriptionInfo | undefined,
  t: (key: string) => string,
) => {
  if (!info) return null

  const { Download = 0, Upload = 0, Total = 0, Expire = 0 } = info

  if (Download === 0 && Upload === 0 && Total === 0 && Expire === 0) return null

  const total = prettyBytesHelper(Total, { binary: true })
  const used = prettyBytesHelper(Download + Upload, { binary: true })
  const percentage = toFinite((((Download + Upload) / Total) * 100).toFixed(2))
  const expireStr =
    Expire === 0
      ? `${t('expire')}: ${t('noExpire')}`
      : `${t('expire')}: ${dayjs(Expire * 1000).format('YYYY-MM-DD')}`

  const usedStr = `${used} / ${total}`
  const usageStr = Total === 0 ? usedStr : `${usedStr} ( ${percentage}% )`

  return {
    expireStr,
    usageStr,
    percentage: Math.min(percentage, 100),
  }
}

export const renderRoutes = computed(() => {
  // capability gate per route; routes not listed here are always shown
  const routeCapable: Partial<Record<ROUTE_NAME, boolean>> = {
    [ROUTE_NAME.rules]: can('rules'),
    [ROUTE_NAME.tools]: can('tools'),
  }
  return Object.values(ROUTE_NAME).filter((r) => {
    if (r === ROUTE_NAME.setup) return false
    if (!splitOverviewPage.value && r === ROUTE_NAME.overview) return false
    if (r in routeCapable && routeCapable[r] === false) return false
    return true
  })
})

export const applyCustomThemes = () => {
  document.querySelectorAll('.custom-theme').forEach((style) => {
    style.remove()
  })
  customThemes.value.forEach((theme) => {
    const style = document.createElement('style')
    const styleString = Object.entries(theme)
      .filter(([key]) => !['prefersdark', 'default', 'name', 'type', 'id'].includes(key))
      .map(([key, value]) => `${key}:${value}`)
      .join(';')

    style.innerHTML = `[data-theme="${theme.name}"] {
      ${styleString} 
    }`

    style.className = `custom-theme ${theme.name}`
    document.head.appendChild(style)
  })
}

export const applyKsuTheme = () => {
  if (window.ksu) {
    const link = document.createElement('link')
    link.rel = 'stylesheet'
    link.href = 'https://mui.kernelsu.org/internal/colors.css'
    document.head.appendChild(link)
  }
}

export const isHiddenGroup = (group: string) => {
  if (Reflect.has(hiddenGroupMap.value, group)) {
    return hiddenGroupMap.value[group]
  }

  return proxyMap.value[group]?.hidden
}

export const handlerUpgradeSuccess = () => {
  showNotification({
    content: 'upgradeSuccess',
    type: 'alert-success',
  })
}
