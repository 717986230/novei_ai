# 提示词与去 AI 味调研（2026-11）

本项目的写作提示词、去 AI 味规则和质检流水线参考了以下资料。

## 1. Google 官方 Gemini 提示词指南
来源：https://ai.google.dev/gemini-api/docs/prompting-strategies

落地到代码的要点：
- **Gemini 3 保持默认采样参数**：官方强烈建议 temperature / top_p / top_k 用默认值，低于 1.0 可能出现循环、质量下降。
  → `gemini.ts` 对 `gemini-3.x` 及以上模型不再发送 temperature（`usesDefaultSampling`）。
- **长上下文在前，指令在后**：先放材料，最后用 “Based on the material above…” 提问。
  → 账本提取、一致性检查、改写、扩写、去 AI 味提示词都改成“正文在前、指令在后”。
- **最重要的规则放 system instruction**：角色、硬约束、输出格式。
  → 连贯性契约 + 去 AI 味规则都在 `systemPrompt()`。
- 直接、明确，避免含糊用语；复杂 JSON 用结构化输出（已使用 `responseSchema`）。

## 2. NousResearch/autonovel
来源：https://github.com/nousresearch/autonovel （`ANTI-SLOP.md`、`ANTI-PATTERNS.md`）

一个从种子概念到成书的全自动小说流水线：机械检测（正则扫禁词、陈词滥调、句长单调）+ 独立模型打分 + 对抗式删改 + 复审循环。

采纳的结构性反模式（写进 `HUMAN_PROSE_RULES` 和检测器）：
1. 过度解释（场景已经表现的情绪，下一句又解释一遍）——头号问题
2. 三连列举（三个形容词/三个感官细节），每章 > 2 次即为模式
3. “the way X did Y” 明喻依赖，每章最多 2 个
4. 场景分隔滥用，每章最多 2 个
5. 段落长度单调；句长缺乏起伏（burstiness）
6. 情绪节拍完全按大纲顺序到达 → 每章要有一个意外
7. 章节结尾结构重复
8. 对白像书面语：要有打断、口误、说一半
9. 多个角色共用 “not X, but Y” 修辞
10. 概述多于现场：至少 70% 在场景里

## 3. sam-paech/antislop-sampler 与 Antislop 论文
来源：https://github.com/sam-paech/antislop-sampler ，论文 https://arxiv.org/abs/2510.15061

- 论文统计：部分“slop”套话在 LLM 输出中的频率是人类文本的 1000 倍以上。
- 采纳了其小说类 slop 列表中的高频项：barely above a whisper、shivers down the spine、ministrations、palpable、practiced ease、eyes never leaving、with a mixture of、what seemed like an eternity、maybe just maybe、symphony/dance of……
- 采纳了 AI 小说高频人名黑名单（Elara、Lyra、Kael、Jaxon、Elias、Aria 等），写进设定生成提示词。
- 注：它用采样时回溯来禁词，需要本地模型；我们用 Gemini API，所以改为“生成后检测 + 定向润色”。

## 4. blader/humanizer 等 “Humanizer” 技能
来源：https://github.com/blader/humanizer （基于维基百科 “Signs of AI writing”）

- 破折号过多、三段式、否定式平行结构、AI 词汇是公认痕迹。
- 重要提醒：**只去痕迹会变得干瘪**，好文字要有“人”的声音；如果有作者样本，样本优先于规则。
  → 后续可加入“作者文风样本”功能。

## 5. 国内同类开源项目（架构参考）
- YILING0013/AI_NovelGenerator：向量检索 + 一致性检查 + 伏笔管理
- leenbj/novel-creator-skill：章节质量门禁、RAG、知识图谱、去 AI 味
- RhythmicWave/NovelForge：Neo4j 知识图谱跟踪人物关系

本项目对应的做法：故事设定（正典）+ 每章连续性账本 + 自动一致性检查/修正 + AI 味检测/润色 + 质量门禁（通过才标“待发布”）。

## 当前流水线
```
写章（system: 连贯性契约 + 平台风格 + 去AI味规则）
 → 字数不足自动扩写
 → AI 味检测（aitells.ts，≥5 分触发定向润色，润色后分数必须下降、字数变化 <15% 才采用）
 → 生成摘要 + 连续性账本
 → 一致性检查 → 自动修正严重/中等问题 → 复查
 → 通过：状态“待发布”；不通过：留草稿并在章节页列出问题
发布：仍由作者确认后手动（或让 Claude 代为在浏览器中）发布
```
