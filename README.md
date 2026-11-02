# xianyu-listing-kit

Offline CLI that turns a YAML service description into 闲鱼 (Xianyu / Goofish) listing copy: several Chinese title-and-body variants, an SVG cover, a price table, and a banned-phrase lint. No network. The same input always produces the same files.

面向在闲鱼出售服务的自由职业者。一份 YAML 写清服务、城市、套餐和亮点，本工具在本地生成多条中文标题和正文、一张 SVG 封面、一份价目表，并检查标题长度、正文长度、语气关键词和常见违规话术。

它不登录闲鱼，不自动发布，也不替你承诺 YAML 里没有的交付。文案是模板，发布前请自己核对事实和平台当时的规则。

## 功能

- 三种语气：专业、口语、短平快。长度依次变短，事实（套餐、价格、包含项、亮点、城市、联系方式）每条都保留。
- 标题压到闲鱼常见的字数区间，并按角度换后缀：服务内容、工期、地点、起价、修改。
- SVG 封面用代码绘制，颜色由标题种子稳定选出，不依赖原生插件。
- Markdown 和等宽纯文本两份价目表。
- 质检：标题长度、正文长度、语气锚点、手机号、可配置禁用词。

## 安装

需要 Node.js 20 或更新版本。

```bash
npm install
npm run build
node dist/bin.js --help
```

安装到当前环境后，命令名是 `xianyu-listing-kit`。

## 快速开始

```bash
node dist/bin.js init-sample --out service.yaml
node dist/bin.js generate --in service.yaml --out ./out
node dist/bin.js lint --in ./out
```

仓库里还有三份虚构示例：

```bash
node dist/bin.js generate --in fixtures/cad.yaml --out ./out
node dist/bin.js generate --in fixtures/short-video.yaml --out ./out-video
node dist/bin.js generate --in fixtures/n8n.yaml --out ./out-n8n
```

`fixtures/cad.yaml` 生成的专业向标题是 `常州CAD出图｜机械零件CAD图纸`。价目表是：

```text
| 套餐 | 价格 | 包含 |
| --- | ---: | --- |
| 基础 | ¥50 | 2D出图、1次修改 |
| 加急 | ¥120 | 24h交付、3次修改 |
```

专业向正文会这样起头：承接机械零件 CAD 图纸。服务城市：常州。

## 命令

```text
xianyu-listing-kit generate --in <service.yaml> --out <目录> [--variants 3] [--tone all|pro|casual|short]
xianyu-listing-kit lint --in <目录或文件> [--banned <词表>] [--extra 词1,词2] [--allow 词1,词2]
xianyu-listing-kit init-sample [--out service.yaml] [--force]
xianyu-listing-kit --help
xianyu-listing-kit --version
```

`--variants` 取 1 到 8，默认 3。`--tone` 默认 `all`，按专业、口语、短平快轮换；也可以写 `pro` / `casual` / `short`，或中文 `专业` / `口语` / `短平快`。语气固定时，角度仍会轮换，所以同一语气的几条文案并不相同。

`generate` 会覆盖自己写出的文案、价目、封面和 `manifest.json`，并删掉 `variants/` 里过期的 `01-pro.md` 这类文件。同目录下的其他文件会留下。输出路径如果已是文件，命令会失败。

`init-sample` 把 CAD 示例写到指定文件。文件已存在时要加 `--force`。

`--llm` 只是预留入口。当前版本没有模型，传入会直接失败，测试也不会走这条路径。

退出码：`0` 成功或质检通过，`1` 质检有问题，`2` 用法或输入错误。

## YAML

```yaml
title_seed: "常州CAD出图"
service: "机械零件 CAD 图纸"
city: "常州"
tiers:
  - name: 基础
    price: 50
    includes: ["2D出图", "1次修改"]
  - name: 加急
    price: 120
    includes: ["24h交付", "3次修改"]
highlights: ["本地可面交确认", "支持DWG/PDF"]
contact_hint: "闲鱼聊"
banned_extra: []   # 追加禁用词
banned_allow: []   # 从默认词表移除，确认不是误伤时再用
```

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `title_seed` | 是 | 标题种子。生成时会加上后缀，并限制长度。 |
| `service` | 是 | 服务是什么。正文保留原文，标题里会去掉空格。 |
| `city` | 否 | 城市。空着则写成可远程，不编造城市。 |
| `tiers` | 是 | 至少 1 个套餐，最多 12 个。顺序原样保留，不按价格重排。 |
| `tiers[].name` | 是 | 套餐名。 |
| `tiers[].price` | 是 | 人民币数字，0 到 1000000，保留到分。 |
| `tiers[].includes` | 是 | 该档包含什么，至少 1 项。 |
| `highlights` | 否 | 亮点。没有就不写「亮点」一节。 |
| `contact_hint` | 否 | 怎么联系。默认「闲鱼内联系」。不要写手机号。 |
| `banned_extra` | 否 | 追加禁用词，每项至少 2 个字。 |
| `banned_allow` | 否 | 从本次质检的默认词表里移除。允许项优先于追加项。 |

未列出的键会被忽略。字符串不能换行，也不能含有工具自己的保留标记（`<!-- xianyu-listing-kit` 或单独一行的变体标题）。字段长度上限：标题种子 40、服务 120、城市 20、联系提示 40、套餐名 40、包含项和亮点各 80。

价格只从套餐里取最低价，写成「¥50起」这种起价，不会把加急档说成全部服务的价格。

## 输出

```text
out/
  listing.md          全部变体，末尾附价目表
  listing.txt         纯文本，方便对照着贴
  price-table.md
  price-table.txt
  cover.svg
  manifest.json       引擎、词表和文件清单
  variants/
    01-pro.md
    01-pro.txt
    02-casual.md
    02-casual.txt
    03-short.md
    03-short.txt
```

单条 `variants/*.txt` 的结构：

```text
【变体 1｜专业】
标题：常州CAD出图｜机械零件CAD图纸

正文……
```

贴到闲鱼时，标题栏只贴「标题：」后面的文字，正文从空行之后开始。不要把「【变体 …】」那一行贴进去。`manifest.json` 里的 `engine` 固定为 `template`。

## 语气

| 语气 | 锚点（命中一个即可） | 写法 |
| --- | --- | --- |
| 专业 `pro` | 服务范围、交付标准 | 先写服务范围和交付边界 |
| 口语 `casual` | 随时聊、好沟通 | 像跟人说话，仍然只列套餐里有的内容 |
| 短平快 `short` | 价目 | 几行把价目、包含、亮点说完 |

默认 3 条是专业 / 口语 / 短平快各一条。短平快不超过 500 个码位；条目特别多时可能超限，请改语气或精简 YAML。

## 封面

`cover.svg` 是 800×800 的矢量图：底色、服务名、城市、最低价和套餐名。字体使用系统里的苹方、思源黑体或微软雅黑，文件本身不嵌字体、不请求网络。同一 `title_seed` 颜色不变。

这个版本不生成 PNG。把中文画成位图需要字体光栅化，通常会带上原生依赖。SVG 可以直接改字，也可以用浏览器或设计工具导出 PNG。

## 价目表

Markdown 用表格，价格列右对齐。纯文本按终端里的东亚宽度对齐，方便粘到不支持表格的地方。包含项用顿号连接；单元格里的 `|` 会转义。

## 质检

`lint` 检查目录里的 `.md` 和 `.txt`（跳过 `node_modules`、`.git`、`dist`）。单文件则检查该文件，包括你直接传入的 SVG。带 `generator: xianyu-listing-kit` 的 `manifest.json` 会提供 `banned_extra`、`banned_allow` 和长度设置。

长度按 Unicode 码位计算：一个汉字、一个英文字母、一个 emoji 都算 1。标题 8 到 30 个 Unicode 码位（闲鱼标题常见上限约 30 字）。正文 40 到 2000。短平快不超过 500。

| 规则 | 含义 |
| --- | --- |
| `title-length` | 标题短于 8 或长于 30 |
| `body-length` | 正文短于 40 或长于 2000 |
| `short-body-length` | 标成短平快，但正文超过 500 |
| `tone-keyword` | 正文没有该语气的锚点 |
| `banned-word` | 命中禁用词 |
| `phone-number` | 疑似手机号，含分隔符和全角数字 |
| `missing-title` | 变体块里没有标题行 |

变体用 HTML 注释或「【变体 1｜专业】」识别。价目表文件没有这个标记，只做禁用词和手机号检查，避免把「套餐价目」当成标题。

可用 `--title-min`、`--title-max`、`--body-min`、`--body-max`、`--short-body-max` 覆盖默认值。

禁用词按规范化后的子串匹配：全角转半角、拉丁字母小写、去掉空白和 `._·•-—~～`。所以「加ｖ．ｘ」会命中「加vx」。否定句也可能命中，例如文案里写了「不是最低价」仍会命中「最低价」。确认是误伤时，把该词放进 `banned_allow` 或 `--allow`。更长的词优先：正文是「稳赚不赔」时，只报「稳赚不赔」，不再另报里面的「稳赚」。

外部词表一行一个词，`#` 开头是注释，`词 # 说明` 里井号后的内容会被忽略：

```bash
xianyu-listing-kit lint --in ./out --banned ./banned.txt --extra 面交免单 --allow 威信
```

不要对整个仓库跑 lint。这份说明为了举例，故意写了禁用词。

## 默认禁用词

完整词表在 `src/banned-words.ts`，一百余条，分四类。下面每类只举几个：

- 绝对化承诺：`100%有效`、`包过`、`稳赚不赔`、`全网最低`、`官方认证`、`最低价`
- 违规金融：`套现`、`高利贷`、`保本保息`、`刷单`、`资金盘`、`代开发票`
- 违规医疗：`包治百病`、`根治`、`无副作用`、`处方药`、`保证治愈`
- 引流站外：`加微信`、`加vx`、`威信`、`绿泡泡`、`私下转账`、`不走闲鱼`、`收款码`

手机号不在词表里，由 `phone-number` 单独检查。12 位以上的连续数字不会当成手机号。

这些词用来挡住常见违规话术，不是一份官方黑名单，也不能代替平台审核。

## 库

```ts
import { loadServiceFile, generateListings, lintPath } from "xianyu-listing-kit";

const service = loadServiceFile("service.yaml");
const result = generateListings(service, { variants: 3, tone: "all" });
const first = result.variants[0];
if (first) console.log(first.title);
const report = lintPath("./out");
console.log(report.issues.length);
```

## 开发

```bash
npm install
npm test
```

`npm test` 只编译并运行 `node:test`，不访问网络，也不读取 `--llm`。测试覆盖三份示例、标题边界、价目对齐、SVG 转义、禁用词和命令退出码。

## 许可

MIT，见 [LICENSE](LICENSE)。
