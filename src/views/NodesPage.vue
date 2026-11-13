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
            <div class="flex items-center gap-1 px-3 py-2 md:min-h-15 md:px-0 md:py-0">
              <div
                class="text-base-content w-35 shrink-0 overflow-hidden px-2.5 text-sm font-medium md:w-30 md:px-5"
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
                  !expandedGroups.has(g) && 'max-h-7.5 overflow-hidden',
                ]"
              >
                <div
                  v-for="nodeName in proxyMap[g]?.all"
                  :key="nodeName"
                  :class="
                    errSet.has(nodeKey(g, nodeName))
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
                    <!-- 与上游 ProxyNodeCard 一致：点延迟条也能单节点测速（触屏没有右键） -->
                    <LatencyTag
                      :name="nodeName"
                      :group-name="g"
                      :loading="testingSet.has(nodeKey(g, nodeName))"
                      class="h-4! w-8! shrink-0 rounded-md!"
                      @click.stop="singleNodeTest(g, nodeName)"
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

      <!-- ===== Section B: Nodes（平铺网格；按提供商分组在弹窗里查看） ===== -->
      <div>
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-base-content/60 text-sm">
            {{ $t('proxies') }}
          </h2>
          <!-- 提供商分组（弹窗） / 排序 / 测速 / 刷新：胶囊左右等宽内边距(px-4)，按钮右缘落在页面右边距 12 + 16 处。 -->
          <div class="bg-base-100 flex items-center gap-1.5 rounded-full px-4 py-0.5">
            <button
              v-if="providers.length"
              class="btn btn-circle btn-ghost btn-sm"
              :aria-label="$t('groupProxiesByProvider')"
              :title="$t('groupProxiesByProvider')"
              @click="providersModalOpen = true"
            >
              <RectangleGroupIcon class="h-3.5 w-3.5 opacity-60" />
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
                isRefreshing && 'animate-spin',
              ]"
              :aria-label="$t('refresh')"
              @click="handleRefreshProxies"
            >
              <ArrowPathIcon class="h-3.5 w-3.5 opacity-60" />
            </button>
          </div>
        </div>
        <div class="bg-base-100 rounded-box p-4 shadow-sm">
          <ProxiesContent
            ref="proxiesContentRef"
            :render-proxies="renderProxies"
          />
        </div>
      </div>

      <!-- ===== Providers modal: 按提供商分组查看节点（叠加在平铺网格之上的视角） ===== -->
      <DialogWrapper
        v-model="providersModalOpen"
        :title="$t('proxyProvider')"
        :no-padding="true"
        box-class="w-full max-w-2xl"
      >
        <template #title-right>
          <button
            v-if="can('proxyProviderUpdate')"
            class="btn btn-ghost btn-xs absolute top-2 right-10"
            @click="handleUpdateAllProviders"
          >
            <ArrowPathIcon
              :class="['h-4 w-4', isAllProvidersUpdating && 'animate-spin']"
            />
          </button>
        </template>
        <div class="flex h-[80dvh] flex-col overflow-hidden">
          <div class="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
            <ProxyProvider
              v-for="p in providers"
              :key="p.name"
              :name="p.name"
            />
          </div>
        </div>
      </DialogWrapper>
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
} from '@heroicons/vue/24/outline'
import { notifyRequestError } from '@/helper/request-error'
import { useSessionStorage } from '@vueuse/core'
import { usePaddingForViews } from '@/composables/use-padding-for-views'
import { useRenderProxyList } from '@/composables/use-render-proxy-list'
import { proxySortType } from '@/store/settings'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import DialogWrapper from '@/components/common/DialogWrapper.vue'
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
// 而 Section A 的高度会变(策略组展开/折叠/测速换行)，偏移失效会算错行位置 → 用 ResizeObserver 观察它，变化时重算。
const proxiesContentRef = ref<InstanceType<typeof ProxiesContent> | null>(null)
const syncScrollMargin = () => proxiesContentRef.value?.syncScrollMargin()
const layoutObserver = new ResizeObserver(syncScrollMargin)
const observeGroupsLayout = (el: unknown) => {
  layoutObserver.disconnect()

  if (el instanceof Element) {
    layoutObserver.observe(el)
  } else {
    // 容器被 v-if 卸载时没有 ResizeObserver 回调，主动重算一次
    nextTick(syncScrollMargin)
  }
}

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
// 点胶囊首个按钮：弹窗查看「按提供商分组」的节点，页面本身始终是平铺网格
const providersModalOpen = ref(false)

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

// Independent nodes: exclude strategy groups, providers themselves, GLOBAL, and special built-in types.
// 提供商下发的节点也进平铺网格（弹窗里的提供商卡片是另一种视角，不改变本网格的数据范围）。
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

// tag 的状态是「组 + 节点」维度的：独立测速下同名节点在不同组各有独立的 url 桶，
// 只按节点名索引会让同名 tag 串组（A 组的失败/测速中会连累 B 组）。
const nodeKey = (groupName: string, nodeName: string) => `${groupName}\u0000${nodeName}`

// =============================
// Expand / collapse for group tags
// =============================
const expandedGroups = reactive(new Set<string>())
const overflowGroups = reactive(new Map<string, boolean>())
const tagContainerRefs = new Map<string, HTMLElement>()
const tagNameByElement = new WeakMap<Element, string>()
const tagRefSetters = new Map<string, (el: unknown) => void>()

const checkOverflow = (name: string, el: HTMLElement) => {
  // 展开状态下没有 max-height，量不出真实溢出 → 保持已有标记，否则「收起」按钮会消失
  if (expandedGroups.has(name)) return

  if (el.scrollHeight > el.clientHeight) {
    overflowGroups.set(name, true)
  } else {
    overflowGroups.delete(name)
  }
}

// 是否溢出还取决于容器宽度（窗口缩放 / 侧栏折叠 / md 断点切换），digest 不变时也要复测。
const tagResizeObserver = new ResizeObserver((entries) => {
  for (const entry of entries) {
    const name = tagNameByElement.get(entry.target)

    if (name) checkOverflow(name, entry.target as HTMLElement)
  }
})

// 每个组只创建一个 ref 函数：模板里若每次 render 都返回新闭包，Vue 会先以 null 解绑再重新绑定，
// 下面的 null 清理分支就会在每次渲染时误删引用。
const setTagContainerRef = (groupName: string) => {
  let setter = tagRefSetters.get(groupName)

  if (!setter) {
    setter = (el: unknown) => {
      if (el instanceof HTMLElement) {
        tagContainerRefs.set(groupName, el)
        tagNameByElement.set(el, groupName)
        tagResizeObserver.observe(el)
        checkOverflow(groupName, el)
        return
      }

      // 组被搜索过滤/隐藏时函数 ref 会收到 null：及时解绑，避免留着已卸载的 DOM。
      const previous = tagContainerRefs.get(groupName)

      if (previous) {
        tagResizeObserver.unobserve(previous)
        tagContainerRefs.delete(groupName)
      }
    }

    tagRefSetters.set(groupName, setter)
  }

  return setter
}

const toggleGroupExpand = (name: string) => {
  if (!expandedGroups.has(name)) {
    expandedGroups.add(name)
    return
  }

  expandedGroups.delete(name)
  // 收起后 max-height 重新生效，补测一次（展开态量不出溢出，期间节点数可能已变化）
  nextTick(() => {
    const el = tagContainerRefs.get(name)

    if (el) checkOverflow(name, el)
  })
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
  const key = nodeKey(groupName, nodeName)

  if (testingSet.has(key)) return
  testingSet.add(key)
  try {
    // 上游 v3.24+ 门面 proxyLatencyTest 已去掉 groupName 参数(sing-box 移除后直连 clash)
    await proxyLatencyTest(nodeName, getTestUrl(groupName))
  } catch {
    // proxyLatencyTest 内部已兜住错误并提示(上游 v3.20+),这里仅防 fetchProxies 等意外 reject
  } finally {
    testingSet.delete(key)
  }
}

// 连点守卫：同组的固定/取消固定是 REST 请求，快速重复点击会并发下发。
const selectingGroups = reactive(new Set<string>())

const handleGroupNodeClick = async (groupName: string, nodeName: string) => {
  if (selectingGroups.has(groupName)) return

  selectingGroups.add(groupName)
  try {
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
  } finally {
    selectingGroups.delete(groupName)
  }
}

// Error set: nodes with latest delay === NOT_CONNECTED
// 只用于 Section A 的组内 tag；节点卡片灰化由上游 ProxyNodeCard 的 isFailed 负责
// key 用「组 + 节点」复合值：独立测速下各组有独立的 url 桶，失败状态不能跨组串用。
const errSet = computed(() => {
  const set = new Set<string>()
  for (const g of renderProxyGroups.value) {
    for (const nodeName of proxyMap.value[g]?.all ?? []) {
      const history = getHistoryByName(nodeName, g)
      if (history?.length && history[history.length - 1].delay === NOT_CONNECTED) {
        set.add(nodeKey(g, nodeName))
      }
    }
  }
  return set
})

// =============================
// Scroll position saving
// =============================
const scrollStatus = useSessionStorage('cache/nodes-scroll-status', 0)

const SCROLL_RESTORE_TIMEOUT = 1000
let restoringScroll = false
let restoreFrame = 0
let saveFrame = 0

const handleScroll = () => {
  if (!nodesPageRef.value || restoringScroll) return
  // sessionStorage 是同步写，逐事件写会拖慢长列表滚动 → 合并到一帧里只写最后一次
  if (saveFrame) return

  saveFrame = requestAnimationFrame(() => {
    saveFrame = 0
    if (restoringScroll || !nodesPageRef.value) return
    scrollStatus.value = nodesPageRef.value.scrollTop
  })
}

const finishScrollRestore = () => {
  restoreFrame = 0
  restoringScroll = false
  syncScrollMargin()
}

const waitTickUntilReady = (startTime = performance.now()) => {
  const el = nodesPageRef.value
  const isTimedOut = performance.now() - startTime > SCROLL_RESTORE_TIMEOUT

  if (isTimedOut || (el && el.scrollHeight > scrollStatus.value)) {
    if (el) {
      el.scrollTo({
        top: Math.min(scrollStatus.value, Math.max(0, el.scrollHeight - el.clientHeight)),
        // 用 instant：节点网格是虚拟滚动,行高渲染后才测量,平滑滚动会在测量过程中移出目标位置
        behavior: 'instant',
      })
    }
    finishScrollRestore()
    return
  }

  restoreFrame = requestAnimationFrame(() => waitTickUntilReady(startTime))
}

// =============================
// Lifecycle
// =============================
onMounted(() => {
  restoringScroll = true
  setTimeout(() => {
    nextTick(() => {
      waitTickUntilReady()
      fetchProxies()
    })
  })
})

onBeforeUnmount(() => {
  layoutObserver.disconnect()
  tagResizeObserver.disconnect()
  if (restoreFrame) cancelAnimationFrame(restoreFrame)
  if (saveFrame) cancelAnimationFrame(saveFrame)
  tagContainerRefs.clear()
  tagRefSetters.clear()
})
</script>
