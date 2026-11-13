---
name: "follow-upstream"
description: "Reapplies the custom 'Nodes page' feature onto the latest upstream release tag for the zashboard project. Invoke when upstream publishes a new version, after a rebase conflict, or when reviewing the nodes page behaviour. 上游发布新版本后 / rebase 冲突后 / 需要 review nodes 页面功能时触发。"
---

# Follow Upstream — zashboard 自定义功能迁移

## 背景与初衷

zashboard 是一个 Vue3 + pnpm 开源项目。本项目（分支 `custom`）在开源代码上维护了一个自定义功能：**Nodes 页面**（`NodesPage.vue`）。

- **初衷（用户原话）**："nodes 页面其实就是代理页面换了一种展示方式，因为我更喜欢 nodes 页面的这种展示方式。"
- 即：NodesPage 是 ProxiesPage 的另一种视角/布局，**不是新功能域**。
- 上游更新时，用户要求把**上游的更新放在当前改动的前面**（rebase），本地功能要在新代码上快速、正确地重建。

## 核心指导原则（用户反复强调）

1. **改动范围尽量小且合理**，因为每次上游更新后都要 rebase/重建当前改动。
2. **风格、功能、公共函数尽量使用上游提供的**，不要自己造轮子。
3. 上游能复用的组件/管线/composable 一律优先复用。
4. 新增文件（如 `NodesPage.vue`）天然不产生冲突，是低风险改动；修改既有文件时尽量把新增行放在**数组/枚举末尾**，避免行号偏移导致冲突。
5. **不许为"抽象/整理"去改上游文件**（v3.29.1 教训，见决策 #12）：只有当**本地有第 2 个真实调用方**时才值得抽公共函数或改上游组件；否则照抄上游实现，哪怕看着重复。判断标准是"这次改动对功能有没有用"，不是"代码好不好看"。
6. **改既有文件时只允许纯新增行、力求 0 删除行**：主要形态是「3 个上游文件（constant / router / proxies 门面）各追加几行 + 4 份 i18n 各加 3 个 key + 1 个新页面」，`git diff <tag> --stat` 基本只有 `+`；除此之外只有下面两处例外。出现其它删除行（i18n 覆盖翻译除外）就说明改了上游的实现，先质疑一下是否必要。
   - **例外 1**：`components/proxies/ProxyNodeCard.vue` 的失败灰化（决策 #14）——需要改 2 行 import 并新增 `isFailed`，因为卡片由 `ProxiesContent` 内部渲染，父层无法下发 class。合并 import 行时保持上游原有排布，只在末尾追加符号。
   - **例外 2**：`src/assembly/proxies/latency.ts` 的批量测速超时（决策 #18）——单节点超时由硬编码 2s 改为跟随「测速超时」设置，只替换一行参数、保留上游原格式。

## 迁移流程

上游更新后的标准动作：

0. **同步 custom 远程分支，并记下回滚锚点**：
   ```bash
   git fetch origin
   git status -sb                 # 看 custom 与 origin/custom 的关系（ahead/behind）
   git rev-parse HEAD             # 记下 rebase 前 SHA —— 唯一可靠的回滚锚点
   ```
   - `## custom...origin/custom`（无 ahead/behind）→ 已同步，继续。
   - `[behind N]`（远程有新代码，可能是另一台机器 push 的）→ 先 `git pull --rebase origin custom` 同步，再继续。
   - `[ahead N]`（本地有未 push 的提交）→ 确认这些提交是否都应保留/是否要先 push，避免与后续 rebase 纠缠。
   - **为什么要记 SHA**：`git rebase --abort` 只能救"进行中"的 rebase。rebase 已成功、事后才发现功能坏了，此时只能靠这个 SHA（`git reset --hard <SHA>`）或 reflog 回滚。SHA 更可靠。
1. **检查上游是否有新版本（幂等前置）**：
   ```bash
   git fetch upstream --tags
   git tag --sort=-creatordate | head -n 1      # 最新发布 tag
   git describe --tags --abbrev=0 HEAD          # 本地基线 tag（--abbrev=0 只输出 tag 名）
   ```
   - 两条命令输出一致 → **无新版本，跳过迁移，直接结束**。
   - 想更稳可以复核一次，但**别把"不包含"当成异常**：
     ```bash
     git merge-base --is-ancestor <最新 tag> HEAD && echo "已包含" || echo "有新版本"
     ```
     - 输出"已包含" → HEAD 已经在最新 tag 上或其之后，确实无需迁移。
     - 输出"有新版本" → **这是有新版本时的正常结果**（新 tag 不可能已是当前 HEAD 的祖先），继续第 2 步即可。
   - **真正要防的异常是本地分支混入了非自有提交**（例如曾被 rebase 到未发布的 main 提交上）：确认本地基线 tag 到 HEAD 之间只有那 1 个 nodes commit
     ```bash
     git log --oneline <本地基线 tag>..HEAD    # 应只列出 nodes commit 这一行
     ```
     多出提交就先查清来源再 rebase——`git rebase <tag>` 会把这些提交一并重放。
   - 本地有未提交改动时 git 会拒绝 rebase（保护机制），先 `git stash` 或提交。
   - rebase 到已包含的 tag 是幂等的（`Current branch custom is up to date.`），重复执行零风险。
2. **rebase 到最新发布 tag**：
   ```bash
   git rebase <最新发布的 tag>
   ```
   **注意**：rebase 基线是**最新发布的 tag**，不是 `upstream/main`——main 上可能还有未发布的代码。哪个是最新发布版本以 `git tag --sort=-creatordate | head -n 1` 实测为准（不要相信文档里写死的版本号）。
3. **核对本功能依赖的上游 API/组件是否变化**：逐项对照下方 [依赖清单](#依赖清单唯一来源)——那是**唯一来源**，本步骤不再重复罗列文件，避免两处各自腐烂。
4. **对比上游新实现**：若上游为某个能力新增了更好的组件/函数，优先切换到上游实现（替换自写逻辑）。
5. **复查"上游已有实现 vs 本地重复实现"**（对照 [已知重复实现清单](#已知重复实现清单)）：
   - **与第 4 步的区分**：第 4 步针对上游**新增**的能力（本地缺失、主动切换补上）；本步针对上游**已有**而 NodesPage 重复实现的能力（本地已有、判断是否值得改用上游）。
   - **⚠️ 只在本次上游 diff 触及相关文件时才复查**，不要每次全量过一遍。清单里多数结论的依据是"上游实现是页面内联逻辑"——这类前提只有在上游重构、把逻辑抽成可复用模块时才可能改变：
     ```bash
     git diff <旧 tag> <新 tag> --stat | grep -E 'composables/|helper/|ProxiesPage|ProxyNodeCard|ProxiesContent'
     ```
     没有相关文件改动 → 直接跳过本步，在汇总里写"清单未变（无相关 diff）"。
   - **继承决策规则**（依据：继承是否会扩大改动范围）：
     - **建议继承**：上游已提供可复用模块（组件/composable/helper），切换改动小、不扩大冲突面 → 直接切换到上游实现，删除自写逻辑。
     - **不建议继承**：上游实现是页面/组件内联逻辑（未抽成可复用模块），继承需改动上游文件或重构 → 维持本地复刻，说明理由后跳过，并把结论记入清单。
6. **验证（仅静态检查）**：
   - `npx vue-tsc --noEmit` 无错误、`GetDiagnostics` 无 lint 错误。
   - 改动涉及 scoped CSS 的 `v-bind()`（动态注入的 CSS 变量）时，再跑一次 `npx vite build`：类型检查不覆盖这种 CSS 变量注入，构建才能暴露模板/样式编译错误。
   - **不做实机走查**：UI 行为由用户自行测试，需要时用户会明确要求。若本次上游 diff 命中下方 [需要提醒用户自测的上游改动](#需要提醒用户自测的上游改动)，在第 7 步汇总里点名提出来即可，不要自己去开浏览器验证。
7. **汇总本次执行结果**（推送**前**汇报，等用户明确指示再推）：
   - rebase 结果：目标 tag、冲突文件数与解决方式（或无冲突）、回滚锚点 SHA
   - 依赖核对结论：哪些 API/组件变化、NodesPage 是否需适配
   - 第 4/5 步结论：是否切换/删除自写逻辑、清单是否更新（未查则说明原因）
   - 验证结论：静态检查结果；若上游 diff 命中"影响观感但不冲突"的改动，列出建议用户自测的点
   - message 一致性检查结论：是否 amend、原因
   - 分支状态：ahead/behind

## 冲突处理

rebase 遇到冲突是常态，按以下流程处理：

1. **先看冲突清单**：
   ```bash
   git status          # 列出冲突文件（Unmerged paths）
   ```
2. **解决原则：上游新代码为基线，本地改动是"重新应用"而不是"覆盖"**。
   打开冲突文件，会看到标记：
   ```
   <<<<<<< HEAD          ← 新基线（最新发布 tag 的代码，rebase 时 HEAD 指向它）
   =======
   >>>>>>> <commit>      ← 本地 nodes 功能改动
   ```
   保留上游部分，把本功能的改动（通常是数组/枚举末尾的追加行）重新放到正确位置。
   - **注意 import 区冲突**：双方各自增删了 import 时，自动合并后可能留下**两边都用不到的僵尸 import**（v3.26 的 `LatencyTag.vue` 就是：上游弃用 `twMerge`、我们弃用 `dayjs`，合并后两个都成了死代码）。解决后检查该文件实际用到了哪些 import。
3. **本项目容易冲突的位置**：
   - `src/constant/index.ts` — `ROUTE_NAME` 枚举末尾、`ROUTE_ICON_MAP`、`NOT_CONNECTED`
     - 上游会换 `ROUTE_ICON_MAP` 的图标（v3.30.0 把 overview 的 `ServerStackIcon` 换成 `Squares2X2Icon`）→ 冲突落在顶部 heroicons import 区：**两边图标都保留**（上游的在原位置、本地的 `ServerStackIcon` 紧邻其前，按字母序即可），`ROUTE_ICON_MAP` 本身不冲突。
   - `src/router/index.ts` — `childrenRouter` 数组末尾
   - `src/i18n/*.ts`、`src/assembly/proxies/index.ts`
   - `src/assembly/proxies/latency.ts` — `testLatencyOneByOneWithTip` 的 timeout 参数行（决策 #18），冲突时保留 `speedtestTimeout.value`
   - 若上游也在末尾新增了条目，两个"末尾追加"相遇 → 顺序拼接：上游的在上，本地的在下。
   - **`src/helper/index.ts` 与 `components/proxies/LatencyTag.vue` / `ProxyProvider.vue` 已不在改动范围内**（v3.29.1 全部回退上游原样，见决策 #12）——历史上它们是最贵的冲突点，别再往里加东西。
   - **v3.29.0 起上游会批量改文件名/路径**（`composables/*` 连字符化并部分迁到 `helper/`，如 `paddingViews` → `use-padding-for-views`、`renderProxies` → `use-render-proxy-list`、`requestError` → `request-error`、`useTooltip` 从 `helper/tooltip` 迁到 `composables/use-tooltip`）。解决冲突后按 **上游那侧的新路径** 取值，别把旧路径留下。
4. **每解决一个文件就标记**：
   ```bash
   git add <file>
   ```
5. **继续 rebase**：
   ```bash
   GIT_EDITOR=true git rebase --continue   # true 跳过编辑器（非 TTY 环境默认编辑器会挂起），直接采用原提交信息
   ```
6. **想放弃**：
   ```bash
   git rebase --abort      # 回到 rebase 前状态（仅限 rebase 进行中）
   # rebase 已成功后要回滚：git reset --hard <第 0 步记下的 SHA>
   ```
7. 全部解决后，进入"迁移流程"第 3~6 步逐项核对（依赖核对 → 对比上游新实现 → 重复实现复查 → 验证），最后执行第 7 步汇总。

## Nodes 页面实现蓝图

### 布局（两区块）

- **Section A：策略组标签栏**（自写形态，上游无此组件）——每个策略组一行：左侧组名 + 类型徽标，右侧组内节点 tag 列表（支持展开/折叠、溢出检测、点击选择、右键单节点测速、fixed 锁图标、错误节点标红）。标题行 `flex min-h-8 items-center`，区块 `mb-2`。
- **Section B：节点**——只有一个标题行 + 一个胶囊（见决策 #15），内容固定为**一个平铺网格**（全部节点交给一个 `ProxiesContent`）；「按提供商分组」不再切换整页视图，而是点胶囊第一个按钮弹出 `DialogWrapper`（见决策 #17）。
  - 平铺网格的数据范围见决策 #10（排除策略组 / 提供商条目 / GLOBAL / 内置特殊类型，提供商下发的节点照常进网格）。
  - 弹窗里一个提供商一张 `ProxyProvider` 卡片（决策 #16）；弹窗是叠加在平铺网格之上的另一种视角，页面本身永远不会被替换 —— **不要**退回"整页切换分组视图"或"两个区块并列"的旧结构。

### 依赖清单（唯一来源）

核对上游 API/组件变化时**只看这张表**（迁移流程第 3 步）。

| 依赖 | 路径 | 说明 |
|------|------|------|
| 节点卡片容器 | `src/components/proxies/ProxiesContent.vue`（v3.30.0 后） | props：`render-proxies` / `name?` / `now?`。虚拟滚动，需祖先滚动容器带 `PROXIES_PARENT_CLASS`，并保证 scrollMargin 及时刷新（见决策 #10） |
| 节点卡片 | `src/components/proxies/ProxyNodeCard.vue` | props：`name` / `active?` / `groupName?`。**唯一有本地逻辑改动的上游文件**：新增 `isFailed` + `opacity-40` 灰化（见决策 #14），其余保持上游原样 |
| Provider 卡片 | `src/components/proxies/ProxyProvider.vue` | props：`name`。仅提供商弹窗使用，保持上游原样（批量按钮写在弹窗标题行，见决策 #15）。内部用 `ProxiesContent`，其节点同样受 `ProxyNodeCard` 灰化影响 |
| 弹窗壳 | `src/components/common/DialogWrapper.vue` | props：`title` / `boxClass` / `noPadding` / `v-model`，slots：default + `title-right`。提供商弹窗见决策 #17 |
| 延迟标签（CountUp + 三态） | `src/components/proxies/LatencyTag.vue` | props：`name?` / `loading?` / `groupName?` |
| 组名（图标/搜索高亮） | `src/components/proxies/ProxyName.vue` | props：`name` / `iconSize?` / `iconMargin?` / `filter?` |
| 渲染管线（排序/过滤/搜索） | `src/composables/use-render-proxy-list.ts` → `useRenderProxyList(proxies, groupName?)` | **v3.29.0 改名**（原 `composables/renderProxies.ts`）。签名未变过；新增 `proxyGroupFilterMap[groupName]` 过滤，NodesPage 不传 groupName 故不生效 |
| 视图内边距 | `src/composables/use-padding-for-views.ts` → `usePaddingForViews` | **v3.29.0 改名**（原 `composables/paddingViews.ts`）；`ctrlsBottom` / `dockTop` 移到 `src/helper/padding-views.ts` |
| 路由与图标 | `src/constant/index.ts` → `ROUTE_NAME.nodes` / `ROUTE_ICON_MAP` / `PROXY_SORT_TYPE` / `NOT_CONNECTED` / `GLOBAL` | 菜单项由 `renderRoutes`（`src/helper/index.ts`）+ `ROUTE_ICON_MAP` 驱动渲染（`views/HomePage.vue`、`components/sidebar/SideBar.vue` → `components/common/NavMenu.vue`）。上游换导航实现时（v3.28.0 就重构过 SideBar）需确认 nodes 菜单项仍出现 |
| 设置项 | `src/store/settings.ts` → `proxySortType` / `proxyCardSize` / `minProxyCardWidth` | 排序与卡片尺寸由 `useRenderProxyList` + `ProxiesContent` 内部读取；NodesPage 自己不再直接用 `minProxyCardWidth`（网格已交回 `ProxiesContent`）。`hideUnavailableProxies` 同样由上游内部读取 |
| 视图级本地状态 | `providersModalOpen`（`ref<boolean>`） | 提供商弹窗开关，纯内存、不持久化；滚动位置用 `useSessionStorage('cache/nodes-scroll-status')` |
| 代理数据与门面 | `src/assembly/proxies/index.ts` → `proxyMap` / `proxyGroupList` / `proxyProviederList` / `fetchProxies` / `handlerProxySelect` / `proxyLatencyTest` / `proxyGroupLatencyTest` / `allProxiesLatencyTest` / `updateProxyProvider` / `getHistoryByName` / `getTestUrl` / `deleteFixedProxyAPI` / `selectProxyAPI` | NodesPage 一律经门面取用；`deleteFixedProxyAPI` / `selectProxyAPI` 是 re-export 出来的 Clash REST 专属接口。**v3.29.0 起门面拆成 `actions` / `latency` / `smart` / `state` 四个模块，index.ts 只剩 `export *`**，本地那行 Clash 专属 re-export 追加在 index.ts 末尾。本地另有 `latency.ts` 一处改动（批量测速超时，见决策 #18） |
| 后端配置 | `src/assembly/config` → `configs`（读 `mode` 判断是否 global） | v3.29.0 起 `assembly/config/` 目录合并为单文件 `assembly/config.ts`，路径不变 |
| helper | `src/helper/index.ts` → `isProxyGroup` / `isHiddenGroup` | **本文件零本地改动**（v3.29.1 起）：NodesPage 只读上游实现，不往里加东西（见决策 #12） |
| 单实现说明 | `src/assembly/driver/clash.ts`（v3.29.0 起） | 上游 v3.29.0 引入 driver 抽象（mihomo/honk/dae），原 `assembly/proxies/clash.ts` 删除。view 层仍**不得**直接 import `@/assembly/driver`（上游视图层零引用），一律走门面 |

### 需要提醒用户自测的上游改动

**这类改动不产生 git 冲突，`vue-tsc` 也查不出来**，只会悄悄改变观感或弄坏页面。迁移时顺带扫一眼；命中就在第 7 步汇总里点名告诉用户去验：

| 上游改动对象 | 对 Nodes 页的影响 |
|------|------|
| daisyUI 语义类定义（`src/assets/styles/components/daisyui.css`） | NodesPage 大量用 `bg-base-100` / `text-base-content` / `bg-base-200` / `bg-error/30` / `bg-primary/30` / `bg-neutral` / `rounded-box` / `divide-base-300/30` / `btn btn-ghost`——上游改配色或类语义会改变整页观感 |
| 全局动效（`src/assets/styles/utilities/motion.css`、`appearance.css`） | v3.26 上游删掉了 `.proxy-node-*` FLIP 类；Section B 直接复用上游 `ProxiesContent`，同样没有排序动画（属预期） |
| `LatencyTag.vue` 的根元素尺寸/类 | Section A 用 `h-4! w-8! rounded-md!` 覆盖默认尺寸（tag 内更小），上游改默认尺寸或结构会影响覆盖率 |
| `ProxyNodeCard.vue` 内部布局 | Section B 每张卡片的高度直接决定网格行高；上游改卡片结构（v3.26 起它 `inject(scrollNodeIntoViewKey, null)`，无 provider 时不追卡）。**该文件本地已改**（决策 #14），冲突点在 `cardClass` 与 import 行 |
| 主题/字体变量（`useAppearanceVars` / `store/settings`） | App.vue 全局生效，NodesPage 自动继承，一般无需改动 |
| 主题调色板（`assets/styles/theme/presets.css`、`tokens.css`） | **v3.29.0 改了 neutral 系主题的 accent/primary 调色板**（`dark-neutral` 的 primary 由深色翻成浅色 #c1bcb6），并新增全局 `--color-medium-latency`。NodesPage 的 `bg-primary/30`（选中 tag）、`bg-neutral`（类型徽标）、`LatencyTag` 延迟配色会随之变化 |
| `views/HomePage.vue` 的页面底色与底部导航 | **v3.29.0 给 `.home-page` 加了 `bg-base-200`**，Section A/B 的 `bg-base-100` 卡片对比度随之改变；移动端底栏从 daisyUI `dock` 重写为自绘 `.tab-bar`（用 `--tab-count` / `--tab-index` 定位指示器），**7 个页面共用一栏、标签更挤**——需在窄屏确认 nodes 项不溢出 |
| `store/settings.ts` 新增设置项 `proxyCardSize` | **v3.29.0 新增**（Proxies 设置里可见，LARGE/SMALL）。它通过 `minProxyCardWidth = getMinCardWidth(proxyCardSize)` 作用于 Section B 网格，同时改变 `ProxyNodeCard` 内部尺寸——换尺寸时需确认网格与卡片同步 |
| `components/common/NavMenu.vue` 侧栏图标动效 | **v3.30.0 新增** `ICON_MOTION` 映射（点击图标播 CSS 动画），未登记的图标走默认 `motion-pop`——nodes 的 `ServerStackIcon` 走默认弹跳，无需改动，但需确认侧栏点 nodes 时有动画且不错位 |
| daisyUI `btn-sm` / `btn-xs` 的尺寸（`--size-field`） | Section B 标题行是 `btn-sm` 圆形按钮胶囊（2rem 高），Section A 用 `min-h-8` 对齐。上游若改按钮尺寸或 `--size-field`，标题到卡片的间距会再次不一致，届时同步调整 `min-h-*` |

### 关键实现决策（含踩坑记录）

1. **路由/图标顺序**：`ROUTE_NAME` 枚举中 `nodes` 追加在末尾；`childrenRouter`（`src/router/index.ts`）中 nodes 条目也放数组末尾（settings 之后）；`ROUTE_ICON_MAP` 的 `[ROUTE_NAME.nodes]` 同样放映射末尾（v3.27.0 起，原先插在 overview 之前——上游 v3.27 改动了 overview 图标导致该处冲突，移到末尾后冲突面归零）。菜单顺序由 `renderRoutes = Object.values(ROUTE_NAME)` 驱动，与数组/映射位置无关。
2. **view 层禁止直接判断内核 / 直连 api 层**：具体屏蔽项以 `eslint.config.js` 的 `app/view-layer-boundaries` 为准（不要背规则清单，读文件）。**必须**通过数据驱动判断能力，或用 `can()`（`src/assembly/backend.ts`）。
   - 例：URLTest 固定/取消固定用 `'fixed' in group` 判断（clash 组有 fixed 键，无该字段的组走通用分支），与上游 `driver/clash.ts` 的 `if (proxyNode.fixed)` 模式一致。v3.29.0 起上游把该动作抽成了 driver 级 `proxies.clearFixed(group)`（dae 侧是空实现），但仍只在 assembly 内部使用 —— 保持本地经门面 re-export `@/api/clash` 的写法，行为等价且改动面最小。
   - 无 fixed 字段的组 → 点击 urltest 节点走通用 `handlerProxySelect`（now===name 时是无害 no-op）；`selectProxyAPI` / `deleteFixedProxyAPI` 是 Clash REST 专属，只能经 `@/assembly/proxies` 门面取用，**绝不能**从 view 直接 import（eslint 会拦）。
3. **NOT_CONNECTED = 0**（`src/constant/index.ts`）：测速失败哨兵值，错误集合用 `getHistoryByName(...).delay === NOT_CONNECTED` 判断。错误集合的 key 必须是「组 + 节点」复合值（`group\u0000name`）：独立测速下同名节点在各组有独立的 url 桶，只按节点名会让 A 组的失败串到 B 组。
4. **axios 全局拦截器**（`src/api/http.ts`，v3.20 起重构）：不再有 url 黑名单，拦截器只处理 401（打开后端编辑框），其余错误一律 reject、**不再自动弹通知**。错误提示改由业务层 `notifyRequestError`（v3.29.0 起路径为 `src/helper/request-error.ts`）决定；`proxyLatencyTest` / `proxyGroupLatencyTest` / 门面 `handlerProxySelect` 内部已 catch + 提示，不再 re-throw。NodesPage 侧：`singleNodeTest` 保留 try/catch/finally 兜底（防 `fetchProxies` reject）；直接调用 Clash 专属 API（`selectProxyAPI` / `deleteFixedProxyAPI`）仍必须做能力判断（`'fixed' in group`）。
5. **单节点测速用 `testingSet`（reactive Set）驱动 loading**；key 同样是「组 + 节点」复合值（与错误集合一致，否则同名节点在别组也会转圈/被挡住）。右键触发 `proxyLatencyTest(nodeName, getTestUrl(groupName))`；Section A 的 `LatencyTag` 还要接 `@click.stop="singleNodeTest(...)"`，对齐上游 `ProxyNodeCard`——触屏没有右键，不接就没有单节点测速入口。
6. **Section A 组名/延迟复用 `ProxyName`/`LatencyTag`**；tag 本身（选中高亮、fixed 锁、错误高亮、折叠）是自写内联逻辑（上游无此形态）。溢出检测用 ResizeObserver 跟随容器宽度（窗口缩放 / 侧栏折叠 / md 断点），并在收起后 `nextTick` 复测；函数 ref 的 setter 要按组缓存，收到 null 时解绑并清理。折叠态用 `max-h-7.5`（30px ≈ tag 单行高度）；tag 的 `py-1` / `text-xs` 尺寸若变化，需同步这个高度。
7. **Section B 排序**：`useRenderProxyList(filteredProxies)`（`string[]`），`cycleSortMode` 循环 `proxySortType`（DEFAULT → LATENCY_ASC → LATENCY_DESC → NAME_ASC → NAME_DESC）。默认设置下行为与 Proxies 页共享。
8. **辅助函数只读不写上游**：`isProxyGroup` / `isHiddenGroup` 等一律直接复用上游 `src/helper/index.ts` 的实现，**不要在 helper 里新增本地函数**（见决策 #12）。
9. **i18n**：`nodes` / `expandText` / `collapseText` **三个 key 全部为本地新增**（上游 en.ts 没有 `nodes`，只有个无关的 `folder_builtin_nodes`），需在 `zh.ts` / `zh-tw.ts` / `en.ts` / `ru.ts` 全部补齐。所有胶囊按钮都是纯图标（无文字）。上游 `ProxiesCtrl` 的「全部更新提供商」按钮本身也没有 title/aria-label，弹窗标题行的同名按钮照上游保持纯图标、**不新增文案 key**。
   - 目前每个文件有**两处**插入点（顶部 `nodes`、中部 `expandText` / `collapseText`）；合并成一处可把冲突区域从 2 减到 1，属可选的优化。
10. **节点网格用上游 `ProxiesContent`（虚拟滚动）**：上游 v3.26.0 删除 `ProxyNodeGrid`、把虚拟滚动内联进 `ProxiesContent.vue`；它是 Proxies 页 / 策略组 / 提供商共用的标准网格，所以 Section B 直接用它（页面平铺网格一个；弹窗里提供商卡片内部由上游自己用）。
   - 前提：它用 `closest('.proxies-scrollable-parent')` 找滚动容器，并按 scrollMargin 排布行 → NodesPage 根节点（整页滚动容器）要加 `PROXIES_PARENT_CLASS`。
   - scrollMargin 失效风险：它的偏移只在挂载和滚动容器 resize 时重算，而 Section A（策略组展开/折叠）高度会变 → 用 `ResizeObserver` 观察 Section A，变化时对页面网格调 `syncScrollMargin()`（`syncScrollMargin`）。
   - Section A 被 `v-if` 卸载时 ResizeObserver 不会回调 → 在 ref 回调拿到 `null` 时 `nextTick` 补一次。
   - 滚动位置恢复必须用 `behavior: 'instant'`：虚拟列表行高渲染后才测量，`smooth` 会在测量过程中把滚动位置带偏。
   - 数据范围：`filteredProxies` 只排除 GLOBAL、策略组自身、提供商条目本身（`proxyProviederList`）与特殊内置类型（`isProxyGroup`）；**提供商下发的节点照常进网格**（分组查看走弹窗，不再从页面网格里摘出去）。

11. **nodes 有菜单项，但没有键盘快捷键**（已知限制，暂不补）：侧边栏导航由 `renderRoutes` + `ROUTE_ICON_MAP` 驱动（`SideBar.vue` → `NavMenu.vue`），新增路由会自动出现；但 `PAGE_SHORTCUT_ACTION_INDEX_MAP`（v3.29.0 起移到 `src/helper/keyboard.ts`，由 `src/composables/use-keyboard.ts` 消费）只映射索引 0–5（6 个页面），而 `renderRoutes` 现在有 7 项，nodes 排在第 7 位 → 没有对应的 `PAGE_n` 快捷键。要补就得改上游 `keyboard.ts` 的枚举与映射，会引入冲突面，**维持现状**。
12. **不做零收益的上游改动（v3.29.1 经验，重要）**：曾经把 `ProxyProvider` 的订阅信息格式化、`LatencyTag` 的延迟历史 tooltip 抽成 `helper/index.ts` 里的 `getProviderSubscriptionInfo` / `createLatencyHistoryTip`，NodesPage 后来并没用到它们（只有那两个被改的上游组件在用）→ 等于**为了抽象而改上游文件**：零功能收益，却让每次 rebase 都要在这三处解 import 冲突（v3.29 的 4 个冲突里 3 个来自它们）。
   - 已全部回退：`components/proxies/LatencyTag.vue`、`components/proxies/ProxyProvider.vue`、`src/helper/index.ts` 恢复上游原样。回退后整体 diff 从"5 个上游文件（含删改行）"变为"**3 个上游文件 + 4 份 i18n + 1 个新页面，且全部是纯新增行、0 删除行**"。后续新增的唯一改动是 `ProxyNodeCard.vue` 的灰化（见决策 #14）。
   - 唯一代价：tooltip 里时间/延迟的 `text-xs` 是本地加的、上游从来就没有，回退后 tooltip 文字恢复默认大小（用户已确认接受）。
   - **判断标准**：只有当"本地有第 2 个真实调用方"时才值得抽公共函数；否则照抄上游内联实现，哪怕看起来重复。
13. **Section A 的组列表继承上游 `renderProxyGroups`（v3.29.1 起）**：原先本地自写 `groups` computed（只判断 `configs.mode === GLOBAL`，无视 `displayGlobalByMode`）。改用 `src/helper/proxies.ts` 导出的 `renderProxyGroups` 后与 Proxies 页完全同源，`displayGlobalByMode` / `manageHiddenGroup` / 搜索关键词全部随上游。
   - 行为变化（用户已自测通过）：`displayGlobalByMode` 默认 `false` → 只要 `proxyMap` 里有 GLOBAL 就**追加在组列表末尾**（旧实现只在 global 模式插到最前）；开启 + 模式为 global 时只显示 GLOBAL 的 `now` 链。
   - 已知耦合：Proxies 页搜索框的关键词会一起过滤 Section A（Section B 的 `useRenderProxyList` 本来就是这个行为），可接受。
14. **失败节点灰化下沉到上游 `ProxyNodeCard`（唯一改上游实现的点）**：Section B 与提供商卡片都由 `ProxiesContent` 在组件内部 `v-for` 渲染 `ProxyNodeCard`，父组件拿不到卡片元素，也没法逐卡下发 class；CSS `:has()` 也不行——`LatencyTag` 的 `empty` 态同时表示"测速失败"和"从未测速"（[LatencyTag.vue](src/components/proxies/LatencyTag.vue) 的 `state` computed）。
   - 做法：`ProxyNodeCard.vue` 新增 `isFailed`（`getHistoryByName(name, groupName)` 最新一条 `delay === NOT_CONNECTED` 且 history 非空 → 未测速不算失败），`cardClass` 末尾追加 `opacity-40`。
   - 影响：页面平铺网格、弹窗里的提供商卡片、Proxies 页全部一致；NodesPage 里**不要**再给卡片加 `opacity-40`（会叠乘成 0.16）。
   - Section A 的 tag 用本地 `errSet` 标红（tag 不是 `ProxyNodeCard`）。
   - 代价：rebase 冲突点在 `cardClass` computed 与 import 行；这是除 `constant` / `router` / 门面之外唯一改上游实现的文件，**不要再扩大**。
   - 曾考虑并放弃：本地网格 + 本地下发 class（可行但要放弃虚拟滚动）；MutationObserver 按文本给 DOM 加 class（会和虚拟滚动/折叠动画抢 DOM，同名节点会误判）。
15. **Section B 标题行的单个胶囊**：`bg-base-100 flex items-center gap-1.5 rounded-full px-4 py-0.5`，内部按钮 `btn btn-circle btn-ghost btn-sm`，图标 `h-3.5 w-3.5 opacity-60`，顺序固定为 **提供商弹窗 → 排序 → 测速 → 刷新**。
   - 提供商弹窗：`v-if="providers.length"`（没提供商就没得分组），图标固定 `RectangleGroupIcon`，点击 `providersModalOpen = true`；复用上游 key `groupProxiesByProvider` 作 title/aria-label。**不再**有 `aria-pressed` / 视图状态。
   - 排序：循环 `proxySortType`，图标必须与状态一一对应：`DEFAULT → Bars3Icon`（无方向，代表配置顺序）、`*_ASC → BarsArrowUpIcon`、`*_DESC → BarsArrowDownIcon`，`title="$t(proxySortType)"` 直接复用上游的 5 个枚举文案。
   - 测速：`can('latencyTest')` + spinner + `allProxiesLatencyTest()`（会弹右上角进度/结果提示）。
   - 刷新：**只拉内核数据**（`handleRefreshProxies` → `fetchProxies()`），spinner 跟 `isRefreshing`。「更新全部提供商」不在页面胶囊里，已移到弹窗标题行（`handleUpdateAllProviders`，见决策 #16/#17）。
   - 胶囊不设外边距，长度靠 `px-4` 内边距撑出来：右缘贴页面右边距（12），按钮右缘落在 12 + 16 处；左右内边距相同，否则看起来偏。
   - 纯图标按钮必须给 `aria-label`。
   - **不要**改上游 `ProxyProvider.vue` 的卡片内按钮（批量动作只放弹窗标题行）。
16. **提供商弹窗（原「分组视图」的替代，决策 #17）**：一个提供商一张 `ProxyProvider` 全宽卡片（`flex flex-col gap-3`），不再做多列网格/表格布局，也不再追加「不分组」卡片——平铺网格本身已包含全部节点（含无归属节点），弹窗只是叠加视角。
   - 标题行右侧（`#title-right`）放「更新全部提供商」按钮：`btn btn-ghost btn-xs absolute top-2 right-10`（避开绝对定位的关闭按钮）+ `ArrowPathIcon` spinner 跟 `isAllProvidersUpdating`，复现上游 ProxiesCtrl 的 `Promise.all(updateProxyProvider)` → `fetchProxies` 行为。**文案与上游一致：纯图标，不给 title / aria-label，不新增 i18n key**。
   - 卡片自身的订阅信息/健康检查/更新按钮全部沿用上游 `ProxyProvider`，不要改它。
17. **提供商弹窗用上游 `DialogWrapper`（不再有整页视图切换）**：
   - 结构：`DialogWrapper(no-padding, box-class="w-full max-w-2xl")`（与设置页 `SettingsCustomizationDialog.vue` 同宽，42rem）→ `flex h-[80dvh] flex-col overflow-hidden` → `flex-1 overflow-y-auto p-4` → `ProxyProvider v-for`。高度固定 `80dvh`。
   - 滚动：弹窗列表层 `flex-1 overflow-y-auto` 自建滚动；卡片展开后的 `ProxiesContent` 以 `ProxyProvider` 内部 `CollapseCard` 的 `max-h-108 overflow-y-auto`（带 `PROXIES_PARENT_CLASS`）为滚动源，不需要额外 `syncScrollMargin` 调用。
   - 页面始终只有一个 `ProxiesContent`，弹窗打开不会重挂页面网格，滚动位置天然保持（无需视图切换的滚动恢复逻辑）。
   - 移动端由 `DialogWrapper` 自动变底部全宽面板（`max-md:w-full`、下滑关闭、ESC/点遮罩关闭），不要自己写 modal。

18. **批量逐节点测速超时跟随设置（本地唯一一处 1 行上游逻辑改动）**：上游 `latency.ts` 的 `testLatencyOneByOneWithTip` 把单节点超时硬编码成 `Math.min(2000, speedtestTimeout.value)`，即使「测速超时」设为 5000，批量测速仍按 2s 判超时（节点页闪电按钮 / 全量测速、以及面板控制下 Selector / LoadBalance / Smart 组的组测速都走这里）。本地改为 `speedtestTimeout.value`，保留上游原多行格式，`git diff` 只有参数行 1 删 1 增。
   - 影响：单节点超时 = 设置值（默认 5s）；批量总耗时相应变长，最坏 `ceil(节点数/5) × 5s`（并发仍是上游的 `pLimit(5)`）。与「独立延迟测试」「测速方式」无关，这条路径本来就是面板逐节点。
   - 已评估并放弃的零上游改动方案：在 NodesPage 里遍历 `proxyGroupList`（`pLimit(3)`）调 `proxyGroupLatencyTest()`。核心控制下每组 ≥5s，但会按组弹多条汇总、只覆盖组内节点、没有逐节点进度，行为变化大于收益。
   - 这是第二处改上游实现的点（第一处见决策 #14），rebase 冲突点在该参数行：上游若重写这段（例如参数化超时），优先采用上游实现并把 2s 上限去掉（或改用上游新参数）。

### 待决事项（open items）

| 事项 | 现状 | 待定 |
|------|------|------|
| ~~`displayGlobalByMode` 设置被无视~~ | **已解决（v3.29.1）**：Section A 改用上游 `renderProxyGroups`，设置随上游生效，见决策 #13 | — |

## 已知重复实现清单

迁移流程第 5 步的核对结果沉淀。**只在本次上游 diff 触及右侧"上游等价实现"所在文件时才复查**（见流程第 5 步），否则直接沿用。

| 本地逻辑（NodesPage 自写） | 上游等价实现 | 结论 |
|------|------|------|
| `waitTickUntilReady` + 滚动位置保存（raw `scrollTop` + sessionStorage） | `ProxiesPage.vue` 的锚点式恢复（v3.30 起：存 `{ item, offset, scrollTop }`，靠卡片上的 `data-proxy-page-item` 与 `VirtualColumnRef.scrollToItem` 定位） | **不建议继承**：它依赖 ProxiesPage 自己渲染的列组件与 data 属性，`ProxiesContent` 不产出这些；继承需改上游页面或改成自渲染列，改动面远大于收益。用 raw `scrollTop` + 轮询等 `scrollHeight` 就绪即可，但要保留本地这三条：`restoringScroll` 守卫（恢复期间不写 sessionStorage）、保存用 rAF 合帧、恢复循环在卸载时 `cancelAnimationFrame`（超时 1000ms，与上游一致） |
| `singleNodeTest`（右键单节点测速，loading 守卫 + `proxyLatencyTest` + try/catch/finally） | `ProxyNodeCard.vue` 的 `handlerLatencyTest`（逻辑几乎一致，内联在组件内） | **不建议继承**：同上，上游未抽可复用模块；tag 形态也无法直接用 ProxyNodeCard |
| ~~`groups` computed 的 GLOBAL 过滤~~ | `src/helper/proxies.ts` 的 `renderProxyGroups`（含 `displayGlobalByMode` + `manageHiddenGroup` + 搜索关键词过滤） | **已继承（v3.29.1）**：本地 computed 删除，Section A 直接用上游 computed，见决策 #13。它确实绑定了 Proxies 页的搜索关键词、GLOBAL 语义/位置也与旧实现不同——用户评估后接受 |
| 曾自写的 `createLatencyHistoryTip` / `getProviderSubscriptionInfo`（抽出后放 `helper/index.ts`） | 上游 `LatencyTag.vue` / `ProxyProvider.vue` 的组件内联实现 | **已回退（v3.29.1）**：所谓"复用"没有第 2 个调用方（NodesPage 根本没用），纯属为抽象改上游文件 → 恢复上游原样，见决策 #12。**不要再抽** |
| urltest 固定/取消固定（`handleGroupNodeClick`） | 上游 `handlerProxySelect` 无 fixed 逻辑 | **非重复**：本地独有能力 |
| tag 行溢出检测 + 展开/折叠 | `CollapseCard` 整卡折叠 | **非重复**：形态不同 |
| `cycleSortMode` 排序循环 | ProxiesCtrl 用下拉选择排序 | **非重复**：交互形态不同 |
| 错误节点灰化 | 上游 `ProxyPreview` 的错误高亮（预览点） | **已下沉到上游组件**：`ProxyNodeCard` 内新增 `isFailed` + `opacity-40`，平铺网格 / 弹窗里的提供商卡片 / Proxies 页共用（决策 #14）；Section A 的 tag 仍用本地 `errSet` |

> 版本留痕：v3.19.0→v3.21.0 后结论未变；v3.26.0 新增 `ProxyNodeGrid` 移除项（见决策 #10）；v3.27.0 复查未变；v3.28.0 diff 仅触及 `ProxyNodeCard.vue` 的一处 class（选中态透明度）与无关 composables，结论仍未变；v3.29.0 复查结论未变（`renderProxyGroups` 提升为 helper 导出、继承成本降低）；**v3.29.1 收尾：`groups` 改为继承上游、两个自写 helper 连同被改的两个上游组件全部回退**（决策 #12/#13），清单里两条结论随之改写；v3.30.0 复查未变（diff 触及 `ProxiesContent.vue` 但只是给滚动容器套了 `pt-1`、`helper/utils.ts` 只是拆出 backend URL 解析，均未把页面内联逻辑抽成可复用模块）。

## 提交规范

- **迁移成功后通常无需新 commit**：rebase 会原样重放本地 nodes commit，提交信息自动保留。只有在**重建**（从上游干净状态重新实现）时才需要按下面格式提交。
- **message 一致性检查**：rebase 重放后，对比"重放后的 commit 内容"与"message 要点描述"是否一致。若迁移中切换了实现（第 4/5 步建议继承删掉自写逻辑）、冲突解决改变了功能行为、或**上游删除了 message 里提到的概念**（如 v3.22 移除 sing-box，而 message 曾写"falls back to generic select on sing-box"）→ 用 `git commit --amend -m "<新信息>" --no-verify` 同步更新；一致则原样保留（amend 修正代码时用 `GIT_EDITOR=true git commit --amend --no-verify` 保留原信息）。
- **目标**：仅领先上游 **1 个 commit**，所有 nodes 改动合成一个提交。
- **commit message 格式**（参考上游）：
  ```
  feat: add Nodes page as an alternative view of proxies

  <要点列表，按 Section A/B + 提供商弹窗 + 复用说明列出>
  ```
- **husky pre-commit 钩子**：非 TTY 环境下 `pnpm install` 会失败，用 `git commit --no-verify` 跳过。
- **`.agents/skills/**` 随功能一起提交**（用户决定，v3.29.1 起）：它是仓库里全新的路径，上游永远不会创建同名文件 → **零冲突**，一起提交不会增加 rebase 成本，文档也能跟着 rebase 自动迁移。
  - 每次迁移后若本文件有更新，`git add .agents/skills/follow-upstream/SKILL.md` 并用 `--amend` 并进同一个 commit，以维持"领先上游 1 个 commit"。
  - **不要 `git add -A`**：`.agents/skills/.DS_Store` 是 macOS 垃圾文件，会被误带进去。逐个点名文件，或把它写进 `.git/info/exclude`（本地私有，不改仓库的 `.gitignore`）。
  - commit message 保持聚焦功能，不必为本文件单列要点。
- **`reset 到 tag 后重建`的场景**：若用户把分支 reset 到最新 tag 后保留工作区改动（`git reset [--soft] <tag>`），HEAD 就在 tag 上、改动全在工作区/索引 —— 此时是**新提交**而不是 amend，`git commit -m "<新 message>" --no-verify` 即可；顺手核对 message 是否还成立（例如 v3.29.1 删掉 helper 抽取后，原 message 里"extract shared helpers into helper module"就必须去掉）。
- **push**：custom 是自己分支，本地是最终状态，用 `git push --force-with-lease`（比裸 `--force` 多一层防覆盖保护）。**但必须先汇报、等用户明确指示再推**——不要自行推送。

## 参考文件

- 页面本体：`src/views/NodesPage.vue`
- 上游参考实现：`src/views/ProxiesPage.vue`（对比布局/交互的上游写法）
- 其余依赖路径见上方 [依赖清单](#依赖清单唯一来源)，不在此重复罗列
