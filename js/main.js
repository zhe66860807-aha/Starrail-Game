/* 星穹铁道身份局 - 启动 */
(function () {
  function boot() {
    if (window.SR && SR.manual && SR.manual.init) SR.manual.init();
    else if (window.SR && SR.ui && SR.ui.init) SR.ui.init();
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
