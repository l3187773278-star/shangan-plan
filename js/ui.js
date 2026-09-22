'use strict';

/* ============================================================
   UI 基础层（ui.js）

   放这里的东西有一个共同点：**只关心呈现，不关心业务数据怎么变**。
   - 格式化（日期、时长、时钟）
   - DOM 查询与转义
   - toast 与模态框
   - 科目 → 配色 / 选项 / 标签（读状态，但只读）
   - 统计小卡片的 HTML 片段

   依赖：core.js（日期与转义）、bus.js（不直接用）、SG.state（只读）
   ============================================================ */

window.SG = window.SG || {};

(function (SG) {
  const CORE = SG.core;
  const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  /* ---------------- 格式化 ---------------- */

  /**
   * 把 'YYYY-MM-DD' 显示成「9月17日 周三」。
   * @param {string} dateStr
   * @returns {string}
   */
  function fmtDateCN(dateStr) {
    const d = CORE.parseDate(dateStr);
    return `${d.getMonth() + 1}月${d.getDate()}日 ${WEEKDAYS[d.getDay()]}`;
  }

  /**
   * 秒 → 'mm:ss'，用于番茄钟显示。
   * @param {number} seconds
   * @returns {string}
   */
  function fmtClock(seconds) {
    const safe = Math.max(0, Math.floor(seconds));
    return `${CORE.pad2(Math.floor(safe / 60))}:${CORE.pad2(safe % 60)}`;
  }

  /**
   * 分钟 → 「45 分钟」/「1 小时 15 分」。
   * @param {number} minutes
   * @returns {string}
   */
  function fmtDur(minutes) {
    if (minutes < 60) return `${minutes} 分钟`;
    return `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分`;
  }

  /* ---------------- DOM 小工具 ---------------- */

  /**
   * querySelector 简写。
   * @param {string} selector
   * @param {ParentNode} [root]
   * @returns {Element|null}
   */
  function $(selector, root) {
    return (root || document).querySelector(selector);
  }

  /**
   * querySelectorAll 简写，返回真数组（可用 forEach/filter）。
   * @param {string} selector
   * @param {ParentNode} [root]
   * @returns {Element[]}
   */
  function $$(selector, root) {
    return Array.from((root || document).querySelectorAll(selector));
  }

  /* ---------------- 轻提示 ---------------- */

  let toastTimer = null;

  /**
   * 底部轻提示，2.3 秒后自动消失。连续调用会重置计时。
   * 元素不存在时静默返回——页面早期调用（如导入失败）不该再抛一次错。
   * @param {string} message
   */
  function toast(message) {
    const el = $('#toast');
    if (!el) return;
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 2300);
  }

  /* ---------------- 统计小卡片 ---------------- */

  /**
   * 「数字 + 单位标签」的组合卡片。
   * @param {string|number} value
   * @param {string} label
   * @returns {string} HTML
   */
  function msItem(value, label) {
    return `<div class="ms-item"><b>${value}</b><span>${label}</span></div>`;
  }

  /**
   * 统计页的大号数字块。
   * @param {number} num
   * @param {string} unit
   * @param {string} label
   * @param {string} [cls] 附加配色类名
   * @returns {string} HTML
   */
  function sgItem(num, unit, label, cls) {
    return (
      `<div class="sg-item"><div class="sg-num ${cls || ''}">${num}<small> ${unit}</small></div>` +
      `<div class="sg-label">${label}</div></div>`
    );
  }

  /* ---------------- 科目（只读） ---------------- */

  /**
   * 当前科目的配色对。取不到时退回第一组，保证永远有颜色。
   * @param {string} subject
   * @returns {{fg: string, bg: string}}
   */
  function subColor(subject) {
    const palette = SG.subjects();
    const idx = palette.indexOf(subject);
    return SG.PALETTE[(idx < 0 ? 0 : idx) % SG.PALETTE.length];
  }

  /**
   * 科目彩色标签。
   * @param {string} subject
   * @param {string} [extraCls]
   * @returns {string} HTML
   */
  function chipHTML(subject, extraCls) {
    const color = subColor(subject);
    return (
      `<span class="chip${extraCls ? ` ${extraCls}` : ''}" ` +
      `style="background:${color.bg};color:${color.fg}">${CORE.esc(subject)}</span>`
    );
  }

  /**
   * 生成科目的 <option> 列表。
   * @param {string} [selected]
   * @returns {string} HTML
   */
  function subjectOptions(selected) {
    return SG.subjects()
      .map((s) => `<option value="${CORE.esc(s)}"${s === selected ? ' selected' : ''}>${CORE.esc(s)}</option>`)
      .join('');
  }

  /**
   * 记忆量的文案随科目变化：有外语类科目才叫「新词」。
   * @returns {string}
   */
  function wordLabel() {
    const hasLanguage = SG.subjects().some(
      (s) => s.includes('英语') || s.includes('外语') || s === '词汇',
    );
    return hasLanguage ? '今日新词' : '今日记忆';
  }

  /* ---------------- 模态框 ---------------- */

  /**
   * 打开模态框。调用方传入的 HTML 必须是**已经转义过的**字符串，
   * 用户输入一律先用 CORE.esc() 处理。
   * @param {string} title
   * @param {string} bodyHTML
   * @param {string} [actionsHTML]
   */
  function openModal(title, bodyHTML, actionsHTML) {
    document.body.style.overflow = 'hidden';
    const root = $('#modal-root');
    root.innerHTML =
      '<div class="modal-mask"><div class="modal">' +
      `<div class="modal-head"><h3>${CORE.esc(title)}</h3>` +
      '<button class="modal-close" id="modal-close">×</button></div>' +
      bodyHTML +
      (actionsHTML ? `<div class="modal-actions">${actionsHTML}</div>` : '') +
      '</div></div>';

    $('#modal-close').onclick = closeModal;
    $$('[data-close]', root).forEach((btn) => {
      btn.onclick = closeModal;
    });
    const mask = $('.modal-mask', root);
    mask.addEventListener('click', (e) => {
      if (e.target === mask) closeModal();
    });
  }

  /** 关闭模态框并恢复页面滚动。 */
  function closeModal() {
    $('#modal-root').innerHTML = '';
    document.body.style.overflow = '';
  }

  /**
   * 二次确认框。
   * @param {string} title
   * @param {string} message
   * @param {Function} onOk 点「确定」后的回调
   * @param {string} [okLabel]
   */
  function confirmModal(title, message, onOk, okLabel) {
    openModal(
      title,
      `<p class="muted" style="margin:4px 0">${CORE.esc(message)}</p>`,
      '<button class="btn btn-ghost" data-close>取消</button>' +
        `<button class="btn btn-danger-ghost" id="confirm-yes">${CORE.esc(okLabel || '确定')}</button>`,
    );
    $('#confirm-yes').onclick = () => {
      closeModal();
      onOk();
    };
  }

  SG.ui = {
    fmtDateCN,
    fmtClock,
    fmtDur,
    $,
    $$,
    toast,
    msItem,
    sgItem,
    subColor,
    chipHTML,
    subjectOptions,
    wordLabel,
    openModal,
    closeModal,
    confirmModal,
  };
})(window.SG);
