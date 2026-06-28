# 飞书 bitable 字段更新：GET 404 + property 覆盖陷阱
type: method
date: 2026-06-28
source: 猫波选题库 24 字段 description 批量设置，API 踩坑

## 现象

1. `GET /bitable/v1/apps/{token}/tables/{tid}/fields/{fid}` 返回 404，但列表端点 `GET .../fields?page_size=50` 正常
2. PUT 更新字段 description 后，单选/多选字段的选项全部消失

## 根因

1. **飞书 bitable 的 GET 单字段端点不存在**（或需要额外权限），官方文档列出了但实际返回 404。列表端点返回的数据已包含全部必要字段
2. **PUT 是全量覆盖**，如果不传 `property`，飞书会把已有选项清空——对单选(type=3)/多选(type=4)/公式(type=20)等字段是灾难性操作

## 修复/步骤

正确做法：用列表 API 获取字段数据 → 直接构建 PUT body → 更新。

```python
# 1. 列表 API 获取全部字段（含 property）
url = f'https://open.feishu.cn/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/{TABLE_ID}/fields?page_size=50'
fields = json.loads(urllib.request.urlopen(req).read())['data']['items']

# 2. 从列表数据构建 PUT body，不要漏 property
for field in fields:
    update_body = {
        'field_name': field['field_name'],
        'type': field['type'],
    }
    if 'ui_type' in field:
        update_body['ui_type'] = field['ui_type']
    if 'property' in field:
        update_body['property'] = field['property']  # 必须保留！
    update_body['description'] = {'text': '描述文字'}

# 3. PUT（不要先 GET 再 PUT——GET 不存在）
put_url = f'https://open.feishu.cn/open-apis/bitable/v1/apps/{APP_TOKEN}/tables/{TABLE_ID}/fields/{field["field_id"]}'
```

## 预防

- 更新飞书 bitable 字段时**永远走列表 API 获取字段数据**，不依赖 GET 单字段端点
- PUT body 必须包含 `type` + `field_name` + `property`（如果有），不传 property = 清空选项
- description 格式固定为 `{"description": {"text": "..."}}`
