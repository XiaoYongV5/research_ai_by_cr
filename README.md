# research_ai_by_cr

基于琨云人工智能推理平台的竞品分析和产品研究资料库。当前项目已经沉淀了 Markdown 分析文档、本地截图资产、HTML 阅读页和自动化采集/生成脚本，适合用于产品经理视角的功能拆解、交互复盘、模块依赖分析和后续方案设计参考。

## 快速开始

最推荐的阅读入口：

```text
competitive_research/page/index.html
```

直接用浏览器打开该文件即可查看 HTML 阅读版。首页点击「立即开始」会进入 `00_研究总览.html`，之后可以通过左侧目录、右侧页面大纲、顶部/底部上一篇下一篇按钮在 00 到 07 文档之间切换。

如果只想编辑研究内容，请优先编辑：

```text
competitive_research/docs/*.md
```

编辑 Markdown 后，重新生成 HTML：

```powershell
node .\competitive_research\automation\generate_html_pages.mjs
```

生成完成后可检查：

```text
competitive_research/page/page_manifest.json
```

其中 `missingImages` 应为空数组，表示 HTML 中引用的本地图片都能正常找到。

## 预览
![](https://gitee.com/xiao_yong_Zhang/image-bed/raw/master/2026/XiaoYong_2026-06-18_18-37-02.jpg)
![](https://gitee.com/xiao_yong_Zhang/image-bed/raw/master/2026/XiaoYong_2026-06-18_18-37-31.jpg)
![](https://gitee.com/xiao_yong_Zhang/image-bed/raw/master/2026/XiaoYong_2026-06-18_18-38-08.jpg)

## 目录说明

```text
.
├─ README.md
├─ site_entry.html
└─ competitive_research/
   ├─ automation/
   ├─ docs/
   ├─ page/
   ├─ screenshots/
   ├─ screenshots_deep/
   ├─ screenshots_focused/
   ├─ raw/
   ├─ artifacts/
   └─ chrome_profile*/
```

### 根目录

`README.md`  
项目说明文档，也就是当前文件。用于说明目录结构、阅读方式、维护方式和常用命令。

`site_entry.html`  
原始站点入口/页面备份文件，可作为后续排查站点结构、页面资源或重新分析入口时的参考。

### `competitive_research/docs`

Markdown 源文档目录，是最重要的内容维护入口。当前包含 8 份文档：

```text
00_研究总览.md
01_数据看板模块.md
02_智能分析模块.md
03_数据中心模块.md
04_平台管理模块.md
05_新手引导弹窗模块.md
06_跨模块依赖与交集.md
07_深度截图索引.md
```

这些文档按照产品经理视角整理，主要覆盖信息架构、核心对象、按钮交互、弹窗流程、空状态反馈、跨模块依赖和可借鉴设计。后续如果要补充分析内容，优先改这里。

注意：文档里的图片路径依赖本地截图目录，移动或重命名图片后需要同步修改 Markdown 里的图片引用。

### `competitive_research/page`

HTML 阅读版输出目录。这里的文件由 `docs` 目录中的 Markdown 自动生成，适合给非技术同事浏览或作为本地交付物查看。

主要文件：

```text
index.html                HTML 阅读入口
00_研究总览.html          研究总览页面
01_数据看板模块.html       数据看板模块页面
02_智能分析模块.html       智能分析模块页面
03_数据中心模块.html       数据中心模块页面
04_平台管理模块.html       平台管理模块页面
05_新手引导弹窗模块.html    新手引导弹窗模块页面
06_跨模块依赖与交集.html    跨模块依赖分析页面
07_深度截图索引.html       全量截图索引页面
page_manifest.json        生成结果与图片校验信息
assets/                   HTML 页面统一样式与脚本
```

`page/assets/style.css` 控制统一视觉样式，包括首页 Hero、左侧目录、右侧大纲、图片展示、上一篇/下一篇导航等。  
`page/assets/lightbox.js` 控制图片点击放大、左侧菜单折叠、右侧大纲展开/固定等交互。

注意：`page` 是生成产物。一般不建议直接修改这里的 HTML，因为重新执行生成脚本后会被覆盖。如需长期保留修改，应改 `docs` 或 `automation/generate_html_pages.mjs`。

### `competitive_research/screenshots_deep`

深度采集截图目录，当前约 582 张图片。主要用于记录页面全貌、按钮交互、弹窗状态、hover 状态、滚动状态、配置流程等更完整的业务细节。

子目录按模块拆分：

```text
00_common
01_dashboard
02_smart_analysis
03_data_center
04_platform_management
05_guide
```

适合在做细粒度交互复盘、弹窗分析、操作链路说明时引用。

### `competitive_research/screenshots_focused`

聚焦采集截图目录，当前约 102 张图片。图片通常更关注业务区域、关键状态或重点页面，避免大量重复公共区域。

子目录按模块拆分：

```text
01_dashboard
02_smart_analysis
03_data_center
04_platform_management
05_guide
```

适合在模块文档中作为重点说明图使用。

### `competitive_research/screenshots`

早期或基础采集截图目录，包含登录页、登录后首页、模块页、子菜单页、新手引导弹窗等截图。它更像是初始采集结果和补充素材库。

如果要找某个页面最早的采集状态，可以先看这个目录；如果要找最终文档中大量引用的截图，优先看 `screenshots_deep` 和 `screenshots_focused`。

### `competitive_research/raw`

原始采集数据目录，保存自动化脚本采集到的页面结构、交互记录、接口摘要、页面索引等中间数据。

常见子目录：

```text
app_assets              应用静态资源采集
app_entries             应用入口相关数据
pages                   页面级采集数据
click_pages             点击采集数据
platform_pages          平台管理相关采集数据
guide                   新手引导相关采集数据
deep_interactions       深度交互采集记录
focused_interactions    聚焦交互采集记录
```

这些数据主要给自动化生成文档或问题追溯使用，普通阅读不需要打开。

### `competitive_research/automation`

自动化脚本目录，负责页面采集、截图、文档生成、HTML 生成和资源清理。

常用脚本：

```text
generate_html_pages.mjs      将 docs/*.md 生成 page/*.html
generate_docs.mjs            生成基础 Markdown 文档
generate_deep_docs.mjs       根据深度采集结果生成/补充深度分析文档
generate_focused_docs.mjs    根据聚焦采集结果生成/补充聚焦分析内容
check_deep_docs.mjs          检查深度文档与截图引用
prune_common_repeats.mjs     清理公共区域重复截图引用
sanitize_artifacts.mjs       清理/脱敏采集产物
sanitize_storage.mjs         清理/脱敏浏览器存储
```

采集类脚本：

```text
cdp_collect.mjs
click_collect.mjs
deep_collect.mjs
focused_collect.mjs
guide_collect.mjs
platform_collect.mjs
```

这些脚本通常需要目标站点可访问，并且需要通过环境变量提供登录信息。除非要重新采集竞品站点，否则日常只需要运行 `generate_html_pages.mjs`。

### `competitive_research/artifacts`

自动化过程中的补充产物目录。目前可作为临时输出目录或后续导出资料目录使用。当前目录没有核心阅读入口。

### `competitive_research/chrome_profile*`

浏览器自动化采集时使用的 Chrome 用户数据目录，包括不同采集阶段的登录态、缓存、扩展数据和浏览器本地状态。

这些目录不是最终阅读资料，主要用于复用采集上下文或调试自动化流程。一般情况下不要手动编辑其中的文件。

## 如何使用

### 1. 阅读 HTML 成果

打开：

```text
competitive_research/page/index.html
```

阅读页支持：

```text
左侧文档目录
右侧悬浮页面大纲
图片点击放大
上一篇/下一篇翻页
品牌区点击返回首页
```

### 2. 查看或编辑 Markdown 源文档

打开：

```text
competitive_research/docs/
```

建议按编号阅读：

```text
00 先看整体结论和研究范围
01-05 分模块看业务设计和交互细节
06 看跨模块依赖和能力复用关系
07 查找全量截图索引
```

如果要补充某个模块的分析，直接修改对应 `.md` 文件。修改后重新生成 HTML。

### 3. 重新生成 HTML 阅读版

在项目根目录执行：

```powershell
node .\competitive_research\automation\generate_html_pages.mjs
```

正常输出类似：

```text
HTML pages generated: 8 docs + index
Image refs: 1046, missing: 0
```

如果 `missing` 不为 0，说明有图片路径失效，需要根据终端提示或 `page_manifest.json` 修复图片引用。

### 4. 新增或替换截图

建议将截图放入对应模块目录：

```text
competitive_research/screenshots_deep/<模块目录>/
competitive_research/screenshots_focused/<模块目录>/
```

然后在 Markdown 中使用相对路径引用。由于 HTML 页面位于 `competitive_research/page`，当前文档中常见图片路径通常形如：

```markdown
![截图](../screenshots_deep/02_smart_analysis/xxx.png)
![截图](../screenshots_focused/04_platform_management/xxx.png)
```

修改图片路径后，务必重新执行 HTML 生成脚本，并检查 `missingImages`。

### 5. 修改 HTML 视觉或交互

如果只是临时预览，可以直接改：

```text
competitive_research/page/assets/style.css
competitive_research/page/assets/lightbox.js
```

如果希望修改能长期保留，应改生成器：

```text
competitive_research/automation/generate_html_pages.mjs
```

因为重新生成 HTML 时，`page/assets/style.css` 和 `page/assets/lightbox.js` 会由生成器重新写入。

### 6. 重新采集竞品站点

只有在目标站点内容变化、需要新增截图、需要补充按钮/弹窗/Tab 交互时，才需要重新运行采集脚本。

采集脚本位于：

```text
competitive_research/automation/
```

运行采集前需要确认：

```text
目标站点可以访问
登录账号可用
浏览器自动化环境可用
CR_RESEARCH_PASS 等环境变量已正确设置
```

采集会更新 `raw`、`screenshots`、`screenshots_deep` 或 `screenshots_focused` 等目录。完成后通常还需要重新生成 Markdown 和 HTML。

## 维护建议

1. 优先维护 `docs`，不要把长期内容只写在 `page` 生成产物里。
2. 新增截图时保持模块化目录，不要把不同模块图片混放。
3. 图片命名尽量包含模块、页面、操作、状态，方便后续检索。
4. 每次改完 Markdown 或生成器后，都运行 `generate_html_pages.mjs`。
5. 每次生成后检查 `page_manifest.json`，确认 `missingImages` 为空。
6. `chrome_profile*` 和 `raw` 多为采集中间态，清理或移动前要确认不再需要复盘采集过程。

