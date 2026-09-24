export * from './actions'
export * from './latency'
export * from './smart'
export * from './state'

// NodesPage 的 URLTest 固定/取消固定(Clash REST 专属),经门面暴露给 view。
export { deleteFixedProxyAPI, selectProxyAPI } from '@/api/clash'
