// Page Agent Bookmarklet — 拖到书签栏，任何页面点击即注入
// Demo 模式：使用阿里免费测试后端（Qwen + DeepSeek），每日有额度
javascript:(function(){
  var s=document.createElement('script');
  s.src='https://cdn.jsdelivr.net/npm/page-agent@1.11.0/dist/iife/page-agent.demo.js';
  s.crossOrigin='anonymous';
  s.onload=function(){
    if(window.PageAgent && !window.__pa){
      window.__pa=new window.PageAgent({language:'zh-CN'});
    }
  };
  document.body.appendChild(s);
})();
