'use strict';

/* ============================================================
   模块通信总线（bus.js）

   为什么需要它：拆模块后最怕的就是「互相 import 成环」——
   data.js 想改完数据就刷新界面，而界面又要读数据。
   这里用一个几十行的发布订阅把两个方向彻底解开：

       数据层  --emit('change')-->  页面层
       页面层  --emit('onboard:open')-->  引导层

   约定：
   - on() 返回一个「取消订阅」函数，谁订阅谁负责在不需要时取消；
   - emit() 里任何订阅者抛错都只记录，不影响其它订阅者
     （一个视图渲染失败不该让整页崩掉）；
   - 只传字符串事件名和纯数据，不传 DOM 节点，避免调用方误改。
   ============================================================ */

window.SG = window.SG || {};

(function (SG) {
  /** @type {Object<string, Function[]>} 事件名 → 订阅者列表 */
  const listeners = {};

  /**
   * 订阅事件。
   * @param {string} event 事件名
   * @param {Function} fn 回调：(payload) => void
   * @returns {Function} 取消订阅
   */
  function on(event, fn) {
    if (!listeners[event]) listeners[event] = [];
    listeners[event].push(fn);
    return function off() {
      listeners[event] = listeners[event].filter((item) => item !== fn);
    };
  }

  /**
   * 触发事件。单个订阅者报错不会中断其余订阅者。
   * @param {string} event 事件名
   * @param {*} [payload] 附带数据
   */
  function emit(event, payload) {
    const list = listeners[event];
    if (!list) return;
    list.slice().forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`[bus] 事件 ${event} 的订阅者出错`, err);
      }
    });
  }

  SG.bus = { on, emit };
})(window.SG);
