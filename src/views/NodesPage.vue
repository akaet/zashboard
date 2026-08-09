<template>
  <div
    class="h-full overflow-y-scroll"
    :style="padding"
    ref="nodesPageRef"
    @scroll.passive="handleScroll"
  >
    <div class="flex flex-col gap-3 p-3">
      <!-- ===== Section A: Policy Groups (NodeGroupTagBar) ===== -->
      <div
        v-if="groups.length"
        class="mb-6"
      >
        <h2 class="text-base-content/60 mb-2 text-sm">
          {{ $t('proxyGroup') }}
        </h2>
        <div class="bg-base-100 rounded-box divide-base-300/30 divide-y shadow-sm">
          <div
            v-for="g in groups"
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
                      class="h-4! w-8! rounded-md! shrink-0"
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

      <!-- ===== Section B: Proxy Providers (ProxyProvider) ===== -->
      <div
        v-if="providers.length"
        class="mb-6"
      >
        <h2 class="text-base-content/60 mb-2 text-sm">
          {{ $t('proxyProvider') }}
        </h2>
        <div class="space-y-3">
          <ProxyProvider
            v-for="p in providers"
            :key="p.name"
            :name="p.name"
          />
        </div>
      </div>

      <!-- ===== Section C: Independent Nodes (ProxyNodeGrid) ===== -->
      <div v-if="filteredProxies.length">
        <div class="mb-2 flex items-center justify-between">
          <h2 class="text-base-content/60 text-sm">
            {{ $t('proxies') }}
          </h2>
          <div class="flex items-center gap-2">
            <button
              class="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content/70"
              @click="cycleSortMode"
            >
              <BarsArrowDownIcon
                v-if="proxySortType === PROXY_SORT_TYPE.DEFAULT"
                class="h-4 w-4 opacity-40"
              />
              <BarsArrowUpIcon
                v-else-if="
                  proxySortType === PROXY_SORT_TYPE.LATENCY_ASC ||
                  proxySortType === PROXY_SORT_TYPE.NAME_ASC
                "
                class="h-4 w-4"
              />
              <BarsArrowDownIcon
                v-else
                class="h-4 w-4"
              />
            </button>
            <button
              class="btn btn-ghost btn-xs text-base-content/40 hover:text-base-content/70 text-xs"
              @click="allProxiesLatencyTest()"
            >
              <BoltIcon class="h-3 w-3" />
              {{ $t('speedTestText') }}
            </button>
          </div>
        </div>
        <div class="bg-base-100 rounded-box p-4 shadow-sm">
          <ProxyNodeGrid>
            <ProxyNodeCard
              v-for="name in renderProxies"
              :key="name"
              :name="name"
              :class="errSet.has(name) && 'opacity-40'"
            />
          </ProxyNodeGrid>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { GLOBAL, NOT_CONNECTED, PROXY_SORT_TYPE } from '@/constant'
import { configs } from '@/assembly/config'
import {
  isHiddenGroup,
  isProxyGroup,
} from '@/helper'
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
} from '@/assembly/proxies'
import {
  BarsArrowDownIcon,
  BarsArrowUpIcon,
  BoltIcon,
  LockClosedIcon,
} from '@heroicons/vue/24/outline'
import { useSessionStorage } from '@vueuse/core'
import { usePaddingForViews } from '@/composables/paddingViews'
import { useRenderProxyList } from '@/composables/renderProxies'
import { proxySortType } from '@/store/settings'
import { computed, nextTick, onMounted, reactive, ref, watch } from 'vue'
import ProxyNodeCard from '@/components/proxies/ProxyNodeCard.vue'
import ProxyNodeGrid from '@/components/proxies/ProxyNodeGrid.vue'
import ProxyProvider from '@/components/proxies/ProxyProvider.vue'
import LatencyTag from '@/components/proxies/LatencyTag.vue'
import ProxyName from '@/components/proxies/ProxyName.vue'

const { padding } = usePaddingForViews({
  offsetTop: 0,
  offsetBottom: 0,
})

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

// =============================
// Data
// =============================
// Groups: filter out hidden groups, only show GLOBAL in global mode (matching reference project)
const groups = computed(() => {
  const list = proxyGroupList.value.filter((g) => !isHiddenGroup(g))

  // Reference project: GLOBAL only appears in groups when mode === 'global'
  if (configs.value?.mode.toUpperCase() === GLOBAL && !isHiddenGroup(GLOBAL)) {
    list.unshift(GLOBAL)
  }

  return list
})

// Providers
const providers = computed(() => proxyProviederList.value)

// Independent nodes: exclude strategy groups, providers, GLOBAL, and special built-in types
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
  return groups.value
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

// Error set: nodes with latest delay === NOT_CONNECTED (matching reference project)
const errSet = computed(() => {
  const set = new Set<string>()
  for (const g of groups.value) {
    for (const nodeName of proxyMap.value[g]?.all ?? []) {
      const history = getHistoryByName(nodeName, g)
      if (history?.length && history[history.length - 1].delay === NOT_CONNECTED) {
        set.add(nodeName)
      }
    }
  }
  // Also check independent nodes
  for (const name of filteredProxies.value) {
    const history = getHistoryByName(name)
    if (history?.length && history[history.length - 1].delay === NOT_CONNECTED) {
      set.add(name)
    }
  }
  return set
})

// =============================
// Scroll position saving
// =============================
const nodesPageRef = ref()
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
      behavior: 'smooth',
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
</script>
