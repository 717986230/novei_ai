# Java Backend Skeleton

这个目录是把当前 Node/Express 后端迁到 Java 的第一步，技术选型是：

- Java 17
- Spring Boot 3
- Spring Web
- Spring JDBC
- MySQL

## 当前已落地

- `GET /api/health`
- `GET /api/config`
- `POST /api/save-config`
- `POST /api/test-connection`
- `GET /api/workflows`
- `GET /api/workflows/{id}`

这些接口会直接读取仓库根目录的 `config/settings.json`，默认路径由 `src/main/resources/application.yml` 里的 `app.settings-file` 指向：

```yaml
app:
  settings-file: ../config/settings.json
```

## 运行前提

当前机器还没有安装 `java` 和 `mvn`，所以这个工程在本机还不能直接编译运行。先安装：

1. JDK 17
2. Maven 3.9+

## 启动方式

在 `backend-java` 目录执行：

```bash
mvn spring-boot:run
```

默认端口是 `8080`。

## 当前真实状态

这还不是“整个后端已经完全迁完”。

已经迁好的，是最适合作为 Java 第一阶段的稳定能力：

- 配置读取/写入
- 健康检查
- AI 连通性测试
- 工作流只读查询

还没迁过去的，是生成、书籍管理、章节编辑、发布这些核心业务写操作。
下一步应该优先迁移：

1. 书籍与章节查询/编辑
2. 工作流创建与执行
3. AI 生成链路
4. MySQL 持久化仓储层
