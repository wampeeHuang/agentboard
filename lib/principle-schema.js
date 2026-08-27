// lib/principle-schema.js — principles/ 注册表字段标准唯一真相源
// 被 routes.js (/api/principles 写入校验) + web/_script.js (表单渲染) 共享。
// 表单字段集 = PRINCIPLE_FIELDS，dashboard 表单从 /api/principles/schema 派生渲染，禁止前端手写字段副本。
// 对齐 principles/CONSTITUTION.md §三 分类 / §四 格式。

// type 六类枚举（宪法 §三）
var PRINCIPLE_TYPE_VALUES = [
  { value: 'review', label: '审查' },
  { value: 'design', label: '设计' },
  { value: 'architecture', label: '架构' },
  { value: 'governance', label: '治理' },
  { value: 'engineering', label: '工程' },
  { value: 'communication', label: '沟通' }
];

// 表单字段契约（唯一真相源：dashboard 表单从这里渲染，禁止手写副本）
// input id = pp-{key}；required 必填；taClass 传给 textarea（sec-ta 样式）
var PRINCIPLE_FIELDS = [
  { key: 'type', label: '类型', type: 'select', options: PRINCIPLE_TYPE_VALUES, required: true },
  { key: 'date', label: '日期（可选）', type: 'date' },
  { key: 'source', label: '来源（可选）', type: 'text', placeholder: '触发提炼的事件/任务' },
  { key: 'title', label: '标题', type: 'text', required: true, placeholder: '一句话洞察/方法，不是主题名' },
  { key: 'what', label: '是什么', type: 'textarea', required: true, placeholder: '一句话说清楚这个原则', taClass: 'sec-ta' },
  { key: 'how', label: '怎么用', type: 'textarea', required: true, placeholder: '具体步骤/检查清单，可操作', taClass: 'sec-ta' },
  { key: 'case', label: '案例', type: 'textarea', placeholder: '至少一个真实案例，最好有前后对比（可留空）', taClass: 'sec-ta' },
  { key: 'edge', label: '边界', type: 'textarea', placeholder: '什么时候不适用（可留空）', taClass: 'sec-ta' }
];

module.exports = {
  PRINCIPLE_TYPE_VALUES: PRINCIPLE_TYPE_VALUES,
  PRINCIPLE_FIELDS: PRINCIPLE_FIELDS
};
