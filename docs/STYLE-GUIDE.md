# 文风指南：从经典里借什么

目的：让生成的英文网文读起来像“有人在写”，而不是模型在填词。
做法：不抄原文、不模仿某一位作家的句子，只提炼**可以迁移的手法**，写成规则 + 原创示范段，放进每本书的“文风要求”（styleNotes），每次写章都会进入系统提示词。

> 版权说明：《围城》（钱锺书）仍在版权期内；《小王子》在部分国家仍受保护。本指南只描述手法，示范段全部是为本项目原创的。奥斯汀作品已进入公有领域。

## 1. 《小王子》——简单的词说重的话
- **用最简单的词**：不用华丽形容词，句子短，像孩子说话一样直接。
- **一个小物件承载全部情感**：玫瑰、狐狸、一只箱子。情感不靠形容，靠一个具体的小东西被反复看见。
- **说得比感觉少**：最动人的句子往往最平静。不解释寓意，让读者自己懂。
- 迁移到网文：狼人言情里，用“那扇五年没修的裂窗”代替“心中翻涌的痛苦”。

## 2. 《围城》——机智、反讽、新鲜的比喻
- **比喻要新、要准、带点刻薄**，取材于叙述者自己的生活和眼光，而不是公共套话（“像飞蛾扑火”是套话）。
- **用小事拆台大场面**：庄严时刻被一个琐碎细节戳破，制造喜剧感。
- **叙述者冷静的判断**：一句干巴巴的评语，比三句形容词更有个性。
- **写人看社会身份和虚荣**：人物说的话和他想维持的体面之间的落差，就是笑点。
- 注意：比喻是双刃剑。每个场景最多一个，必须新鲜具体，否则宁可不用（这也和我们的去 AI 味规则一致）。

## 3. 简·奥斯汀——对白像交锋，感情藏在克制里（公版，适合言情）
- **对白是一场较量**：人物通过选择说什么、不说什么暴露自己。交锋要短、快、有来回。
- **自由间接引语带反讽**：叙述里混入人物的想法，作者站在旁边微笑。
- **感情靠小动作，不靠形容**：一次多余的拜访、一句改了口的话。
- **克制制造张力**：越不说破，读者越着急。

## 落到规则（英文，进入提示词）
见各书 styleNotes；共性部分：
1. Plain words. Short sentences carry weight. Say less than the character feels.
2. One small concrete object or detail carries the emotion of a scene; return to it.
3. Wit comes from precise observation of people and their pretensions; let the narrator make one dry judgment per scene.
4. Undercut grand moments with a small, real detail.
5. Comparisons: at most one per scene, specific to the narrator's world, never stock.
6. Dialogue is a duel: short exchanges, subtext, what is not said. Romance builds through restraint and small actions, not adjectives.
7. End scenes on an image or an understatement, not a moral.

## 原创示范段
写在 styleNotes 里，作为“少样本示例”（Google 指南建议给示例，但不要太多以免过拟合，所以每本只放一段）。
