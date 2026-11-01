<template>
  <div
    class="h-full overflow-y-scroll"
    :class="PROXIES_PARENT_CLASS"
    :style="padding"
    ref="nodesPageRef"
    @scroll.passive="handleScroll"
  >
    <div class="flex flex-col gap-3 p-3">
      <!-- ===== Section A: Policy Groups (NodeGroupTagBar) ===== -->
      <div
        v-if="renderProxyGroups.length"
        :ref="observeGroupsLayout"
        class="mb-2"
      >
        <h2 class="text-base-content/60 mb-2 flex min-h-8 items-center text-sm">
          {{ $t('proxyGroup') }}
        </h2>
        <div class="bg-base-100 rounded-box divide-base-300/30 divide-y shadow-sm">
          <div
            v-for="g in renderProxyGroups"
            :key="g"
            class="flex flex-col md:flex-row md:items-start"
          >
            <!-- Left: group name + type -->
            <div class="flex items-center gap-1 px-3 py-2 md:min-h-[60px] md:px-0 md:py-0">
              <div
                class="text-base-content w-[140px] shrink-0 overflow-hidden px-2.5 text-sm font-medium md:w-[120px] md:px-5"
              >
                <ProxyName :name="g" />
              </div>
              <span
                class="bg-neutral text-neutral-content shrink-0 rounded px-2 py-0.5 text-[10px]"
                >{{ proxyMap[g]?.type }}</span
              >
            </div>
            <!-- Right: node tags + expand -->
            <div class="ml-2 flex flex-1 items-start gap-2 py-2 pr-2 md:ml-5 md:py-4 md:pr-4">
              <div
                :ref="setTagContainerRef(g)"
                :class="[
                  'flex flex-1 flex-wrap gap-1.5',
                  !expandedGroups.has(g) && 'max-h-[30px] overflow-hidden',
                ]"
              >
                <div
                  v-for="nodeName in proxyMap[g]?.all"
                  :key="nodeName"
                  :class="
                    errSet.has(nodeName)
                      ? 'bg-error/30 text-base-content cursor-pointer rounded px-2.5 py-1 text-xs transition-colors select-none'
                      : [
                          'cursor-pointer rounded px-2.5 py-1 text-xs transition-colors select-none',
                          nodeName === proxyMap[g]?.now
                            ? 'bg-primary/30 text-base-content'
                            : 'bg-base-200 text-base-content hover:bg-base-300',
                        ]
                  "
                  @click="handleGroupNodeClick(g, nodeName)"
                  @contextmenu.prevent.stop="singleNodeTest(g, nodeName)"
                >
                  <div class="flex items-center gap-1.5 whitespace-nowrap">
                    <LockClosedIcon
                      v-if="proxyMap[g]?.fixed === nodeName"
                      class="h-3 w-3 shrink-0"
                    />
                    {{ nodeName }}
                    <LatencyTag
                      :name="nodeName"
                      :group-name="g"
                      :loading="testingSet.has(nodeName)"
                      class="h-4! w-8! shrink-0 rounded-md!"
                    />
                  </div>
                </div>
              </div>
              <button
                v-if="overflowGroups.get(g)"
                class="text-base-content/40 hover:text-base-content/70 shrink-0 self-start px-1 py-1 text-xs"
                @click="toggleGroupExpand(g)"
              >
                {{ expandedGroups.has(g) ? $t('collapseText') : $t('expandText') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ===== Section B: Nodes (flat / group view) ===== -->
      <div>
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-base-content/60 text-sm">
            {{ $t('proxies') }}
          </h2>
          <!-- 视图切换 / 排序 / 测速 / 刷新：胶囊左右等宽内边距(px-4)，按钮右缘落在页面右边距 12 + 16 处。 -->
          <div class="bg-base-100 flex items-center gap-1.5 rounded-full px-4 py-0.5">
            <button
              v-if="providers.length"
              class="btn btn-circle btn-ghost btn-sm"
              :aria-label="$t('groupProxiesByProvider')"
              :aria-pressed="isGroupView"
              :title="$t('groupProxiesByProvider')"
              @click="toggleGroupView"
            >
              <RectangleGroupIcon
                v-if="isGroupView"
                class="h-3.5 w-3.5 opacity-60"
              />
              <Squares2X2Icon
                v-else
                class="h-3.5 w-3.5 opacity-60"
              />
            </button>
            <button
              class="btn btn-circle btn-ghost btn-sm"
              :aria-label="$t('sortBy')"
              :title="$t(proxySortType)"
              @click="cycleSortMode"
            >
              <Bars3Icon
                v-if="proxySortType === PROXY_SORT_TYPE.DEFAULT"
                class="h-3.5 w-3.5 opacity-60"
              />
              <BarsArrowUpIcon
                v-else-if="
                  proxySortType === PROXY_SORT_TYPE.LATENCY_ASC ||
                  proxySortType === PROXY_SORT_TYPE.NAME_ASC
                "
                class="h-3.5 w-3.5 opacity-60"
              />
              <BarsArrowDownIcon
                v-else
                class="h-3.5 w-3.5 opacity-60"
              />
            </button>
            <button
              v-if="can('latencyTest')"
              class="btn btn-circle btn-ghost btn-sm"
              :aria-label="$t('latency')"
              @click="handleLatencyTestAll"
            >
              <span
                v-if="isAllLatencyTesting"
                class="loading loading-spinner loading-sm"
              ></span>
              <BoltIcon
                v-else
                class="h-3.5 w-3.5 opacity-60"
              />
            </button>
            <button
              :class="[
                'btn btn-circle btn-ghost btn-sm',
                (isGroupView && can('proxyProviderUpdate')
                  ? isAllProvidersUpdating
                  : isRefreshing) && 'animate-spin',
              ]"
              :aria-label="$t('refresh')"
              @click="handleRefresh"
            >
              <ArrowPathIcon class="h-3.5 w-3.5 opacity-60" />
            </button>
          </div>
        </div>
        <div
          v-if="!isGroupView"
          class="bg-base-100 rounded-box p-4 shadow-sm"
        >
          <ProxiesContent
            ref="proxiesContentRef"
            :render-proxies="renderProxies"
          />
        </div>
        <template v-else>
          <div
            :ref="observeProvidersLayout"
            class="flex flex-col gap-3"
          >
            <ProxyProvider
              v-for="p in providers"
              :key="p.name"
              :name="p.name"
            />
          </div>
          <div
            v-if="orphanProxies.length"
            class="bg-base-100 rounded-box mt-3 p-4 shadow-sm"
          >
            <p class="text-base-content/60 mb-2 text-xs">{{ $t('noGrouping') }}</p>
            <ProxiesContent
              ref="orphanContentRef"
              :render-proxies="orphanProxies"
            />
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { GLOBAL, NOT_CONNECTED, PROXY_SORT_TYPE } from '@/constant'
import { can } from '@/assembly/backend'
import { isProxyGroup } from '@/helper'
import { PROXIES_PARENT_CLASS } from '@/helper/utils'
import { renderProxyGroups } from '@/helper/proxies'
import {
  allProxiesLatencyTest,
  deleteFixedProxyAPI,
  fetchProxies,
  getHistoryByName,
  getProviderNameByProxy,
  getTestUrl,
  handlerProxySelect,
  proxyGroupLatencyTest,
  proxyLatencyTest,
  proxyMap,
  proxyGroupList,
  proxyProviederList,
  selectProxyAPI,
  updateProxyProvider,
} from '@/assembly/proxies'
import {
  ArrowPathIcon,
  Bars3Icon,
  BarsArrowDownIcon,
  BarsArrowUpIcon,
  BoltIcon,
  LockClosedIcon,
  RectangleGroupIcon,
  Squares2X2Icon,
} from '@heroicons/vue/24/outline'
import { notifyRequestError } from '@/helper/request-error'
import { useLocalStorage, useSessionStorage } from '@vueuse/core'
import { usePaddingForViews } from '@/composables/use-padding-for-views'
import { useRenderProxyList } from '@/composables/use-render-proxy-list'
import { proxySortType } from '@/store/settings'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import ProxiesContent from '@/components/proxies/ProxiesContent.vue'
import ProxyProvider from '@/components/proxies/ProxyProvider.vue'
import LatencyTag from '@/components/proxies/LatencyTag.vue'
import ProxyName from '@/components/proxies/ProxyName.vue'

const { padding } = usePaddingForViews({
  offsetTop: 0,
  offsetBottom: 0,
})
const nodesPageRef = ref()

// 节点网格用上游 ProxiesContent 做虚拟滚动：它按"自己在滚动容器内的偏移"(scrollMargin)排布行，
// 而 Section A 的高度会变(策略组展开/折叠/测速换行)、分组视图里提供商卡片也会伸缩，
// 偏移失效会算错行位置 → 用 ResizeObserver 观察这些容器，变化时重算。
const proxiesContentRef = ref<InstanceType<typeof ProxiesContent> | null>(null)
const orphanContentRef = ref<InstanceType<typeof ProxiesContent> | null>(null)
const syncSectionMargins = () => {
  proxiesContentRef.value?.syncScrollMargin()
  orphanContentRef.value?.syncScrollMargin()
}
const layoutObserver = new ResizeObserver(syncSectionMargins)
// 保持引用稳定，避免每次渲染都触发 ref 重新绑定
const layoutTargets = new Map<string, Element>()
const observeLayout = (key: string) => (el: unknown) => {
  const previous = layoutTargets.get(key)

  if (previous === el) return

  if (previous) {
    layoutObserver.unobserve(previous)
    layoutTargets.delete(key)
  }

  if (el instanceof Element) {
    layoutTargets.set(key, el)
    layoutObserver.observe(el)
  } else {
    // 容器被 v-if 卸载时没有 ResizeObserver 回调，主动重算一次
    nextTick(syncSectionMargins)
  }
}
const observeGroupsLayout = observeLayout('groups')
const observeProvidersLayout = observeLayout('providers')

// =============================
// Sort (shared with Proxies page via global proxySortType)
// =============================
const cycleSortMode = () => {
  const order: PROXY_SORT_TYPE[] = [
    PROXY_SORT_TYPE.DEFAULT,
    PROXY_SORT_TYPE.LATENCY_ASC,
    PROXY_SORT_TYPE.LATENCY_DESC,
    PROXY_SORT_TYPE.NAME_ASC,
    PROXY_SORT_TYPE.NAME_DESC,
  ]
  const idx = order.indexOf(proxySortType.value)
  proxySortType.value = order[(idx + 1) % order.length]
}

// 全量测速：测试中显示 spinner，重复点击被忽略
const isAllLatencyTesting = ref(false)
const handleLatencyTestAll = async () => {
  if (isAllLatencyTesting.value) return
  isAllLatencyTesting.value = true
  try {
    await allProxiesLatencyTest()
  } catch {
    // 上游已逐组兜住错误并提示,这里仅防意外 reject 导致 unhandled rejection
  } finally {
    isAllLatencyTesting.value = false
  }
}

// 刷新：只重新拉取代理数据(fetchProxies)，不更新订阅、不触发测速
const isRefreshing = ref(false)
const handleRefreshProxies = async () => {
  if (isRefreshing.value) return
  isRefreshing.value = true
  try {
    await fetchProxies()
  } catch (e) {
    notifyRequestError(e)
  } finally {
    isRefreshing.value = false
  }
}

// =============================
// Data
// =============================
// Groups: reuse the upstream pipeline (helper/proxies.ts → renderProxyGroups),
// which already handles hidden groups / manageHiddenGroup / displayGlobalByMode / search.
// Providers
const providers = computed(() => proxyProviederList.value)
// 视图模式：flat=平铺（全部节点一个网格），group=分组（按提供商分卡片）；状态存 localStorage，刷新后保持
const nodeViewMode = useLocalStorage<'flat' | 'group'>('cache/nodes-view-mode', 'flat')
// 没有提供商时分组视图退化为平铺，避免只剩一张「不分组」卡片
const isGroupView = computed(() => nodeViewMode.value === 'group' && providers.value.length > 0)
const toggleGroupView = () => {
  const scroller = nodesPageRef.value as HTMLElement | undefined
  const top = scroller?.scrollTop ?? 0

  nodeViewMode.value = isGroupView.value ? 'flat' : 'group'

  // 切换视图会重挂虚拟列表，浏览器可能把 scrollTop 夹到 0；且新列表的行高是渲染后才测量的，
  // 立刻定位会因内容还不够高被截短 → 下一帧起重试，等高度足够或稳定后再恢复
  nextTick(() => restoreScrollTop(top))
}

// 恢复切换前的滚动位置：内容高度足够容纳目标位置（或已稳定/超时）才落位
const restoreScrollTop = (top: number, startTime = performance.now(), lastMaxTop = -1) => {
  const scroller = nodesPageRef.value as HTMLElement | undefined

  if (!scroller) return

  const maxTop = Math.max(0, scroller.scrollHeight - scroller.clientHeight)
  const settled = maxTop >= top || maxTop === lastMaxTop || performance.now() - startTime > 300

  if (settled) {
    scroller.scrollTo({
      top: Math.min(top, maxTop),
      behavior: 'instant',
    })
    return
  }

  requestAnimationFrame(() => restoreScrollTop(top, startTime, maxTop))
}

// 全部提供商：更新（并发刷新所有提供商后统一 fetchProxies，与上游 ProxiesCtrl 行为一致）
const isAllProvidersUpdating = ref(false)
const handleUpdateAllProviders = async () => {
  if (isAllProvidersUpdating.value) return
  isAllProvidersUpdating.value = true
  try {
    await Promise.all(providers.value.map((p) => updateProxyProvider(p.name)))
  } catch (e) {
    notifyRequestError(e)
  } finally {
    await fetchProxies().catch(() => {})
    isAllProvidersUpdating.value = false
  }
}

// 胶囊刷新按钮：分组视图刷新提供商（更新订阅并重新拉取）；平铺视图、或缺少更新提供商能力时只拉取内核代理数据
const handleRefresh = () =>
  isGroupView.value && can('proxyProviderUpdate')
    ? handleUpdateAllProviders()
    : handleRefreshProxies()

// Independent nodes: exclude strategy groups, providers themselves, GLOBAL, and special built-in types.
// 提供商下发的节点也进平铺网格；分组视图下它们只由提供商卡片承载，不进「不分组」卡片。
const filteredProxies = computed(() => {
  return Object.values(proxyMap.value)
    .filter(
      (p) =>
        p.name !== GLOBAL &&
        !proxyGroupList.value.includes(p.name) &&
        !proxyProviederList.value.some((pr) => pr.name === p.name) &&
        !isProxyGroup(p.name),
    )
    .map((p) => p.name)
})

// Reuse upstream render pipeline: proxySortType / hideUnavailableProxies / search filter
const { renderProxies } = useRenderProxyList(filteredProxies)

// 分组视图里不属于任何提供商的节点（renderProxies 已排序/过滤），单独一张卡片展示
const orphanProxies = computed(() =>
  renderProxies.value.filter((name) => !getProviderNameByProxy(name)),
)

// =============================
// Expand / collapse for group tags
// =============================
const expandedGroups = reactive(new Set<string>())
const overflowGroups = reactive(new Map<string, boolean>())
const tagContainerRefs = new Map<string, HTMLElement>()

const setTagContainerRef = (groupName: string) => (el: unknown) => {
  if (el instanceof HTMLElement) {
    tagContainerRefs.set(groupName, el)
  }
}

const checkOverflow = (name: string, el: HTMLElement) => {
  // 展开状态下没有 max-height，量不出真实溢出 → 保持已有标记，否则「收起」按钮会消失
  if (expandedGroups.has(name)) return

  if (el.scrollHeight > el.clientHeight) {
    overflowGroups.set(name, true)
  } else {
    overflowGroups.delete(name)
  }
}

const toggleGroupExpand = (name: string) => {
  if (expandedGroups.has(name)) {
    expandedGroups.delete(name)
  } else {
    expandedGroups.add(name)
  }
}

// Re-check overflow when group tags change (e.g. nodes added/removed).
// Uses a lightweight digest to avoid deep-watching the entire proxyMap.
const groupTagsDigest = computed(() => {
  return renderProxyGroups.value
    .map((g) => {
      const proxy = proxyMap.value[g]
      return `${g}:${proxy?.all?.length ?? 0}:${proxy?.fixed ?? ''}`
    })
    .join('|')
})

watch(
  groupTagsDigest,
  () => {
    nextTick(() => {
      for (const [name, el] of tagContainerRefs) {
        checkOverflow(name, el)
      }
    })
  },
  { immediate: true },
)

// =============================
// Single node speed test (group context)
// =============================
const testingSet = reactive(new Set<string>())
const singleNodeTest = async (groupName: string, nodeName: string) => {
  if (testingSet.has(nodeName)) return
  testingSet.add(nodeName)
  try {
    // 上游 v3.24+ 门面 proxyLatencyTest 已去掉 groupName 参数(sing-box 移除后直连 clash)
    await proxyLatencyTest(nodeName, getTestUrl(groupName))
  } catch {
    // proxyLatencyTest 内部已兜住错误并提示(上游 v3.20+),这里仅防 fetchProxies 等意外 reject
  } finally {
    testingSet.delete(nodeName)
  }
}

const handleGroupNodeClick = async (groupName: string, nodeName: string) => {
  const group = proxyMap.value[groupName]
  const isUrlTest = group?.type?.toLowerCase() === 'urltest'
  // fixed 字段是 Clash/mihomo 专属能力(URLTest 固定/取消固定);singbox 组无此字段,走通用 handlerProxySelect
  const supportsFixed = group !== undefined && 'fixed' in group

  if (supportsFixed && isUrlTest) {
    // URLTest: click pinned node → unpin + test all
    if (group.fixed === nodeName) {
      await deleteFixedProxyAPI(groupName)
      await fetchProxies()
      await proxyGroupLatencyTest(groupName)
      return
    }
    // URLTest: click auto-selected (not pinned) → pin it
    // handlerProxySelect skips when now === name, so bypass it here
    if (group.now === nodeName && group.fixed !== nodeName) {
      await selectProxyAPI(groupName, nodeName)
      await fetchProxies()
      return
    }
  }
  await handlerProxySelect(groupName, nodeName)
}

// Error set: nodes with latest delay === NOT_CONNECTED
// 只用于 Section A 的组内 tag；节点卡片灰化由上游 ProxyNodeCard 的 isFailed 负责
const errSet = computed(() => {
  const set = new Set<string>()
  for (const g of renderProxyGroups.value) {
    for (const nodeName of proxyMap.value[g]?.all ?? []) {
      const history = getHistoryByName(nodeName, g)
      if (history?.length && history[history.length - 1].delay === NOT_CONNECTED) {
        set.add(nodeName)
      }
    }
  }
  return set
})

// =============================
// Scroll position saving
// =============================
const scrollStatus = useSessionStorage('cache/nodes-scroll-status', 0)

const handleScroll = () => {
  if (!nodesPageRef.value) return
  scrollStatus.value = nodesPageRef.value.scrollTop
}

const waitTickUntilReady = (startTime = performance.now()) => {
  const el = nodesPageRef.value
  const isTimedOut = performance.now() - startTime > 300

  if (isTimedOut || (el && el.scrollHeight > scrollStatus.value)) {
    if (!el) return
    el.scrollTo({
      top: scrollStatus.value,
      // 用 instant：节点网格是虚拟滚动,行高在渲染后才测量,平滑滚动会在测量过程中移出目标位置
      behavior: 'instant',
    })
  } else {
    requestAnimationFrame(() => {
      waitTickUntilReady(startTime)
    })
  }
}

// =============================
// Lifecycle
// =============================
onMounted(() => {
  setTimeout(() => {
    nextTick(() => {
      waitTickUntilReady()
      fetchProxies()
    })
  })
})

onBeforeUnmount(() => {
  layoutObserver.disconnect()
})
</script>
