const fs = require('fs');

const appJs = fs.readFileSync('public/js/app.js', 'utf8');

let submitHandler = null;

const createMockEl = (val = '') => ({
  value: val,
  innerText: '',
  style: {},
  classList: {
    add: () => {},
    remove: () => {}
  },
  addEventListener: () => {}
});

const elements = {
  'detail-id': createMockEl('1'),
  'detail-category': createMockEl('电阻'),
  'detail-min-stock': createMockEl('20'),
  'detail-name': createMockEl('0805 10k'),
  'detail-package': createMockEl('0805'),
  'detail-quantity': createMockEl('100'),
  'detail-lcsc': createMockEl('C17414'),
  'detail-location': createMockEl('默认电阻盒'),
  'detail-notes': createMockEl('测试备注'),
  'detail-res-val': createMockEl('10k'),
  'detail-res-tol': createMockEl('1%'),
  'detail-cap-val': createMockEl(''),
  'detail-cap-volt': createMockEl(''),
  'detail-cap-tol': createMockEl(''),
  'detail-ind-val': createMockEl(''),
  'detail-ind-current': createMockEl(''),
  'detail-other-val': createMockEl(''),
  'drawer-detail-backdrop': { classList: { remove: () => console.log('抽屉已关闭！') } },
  'form-edit-comp': {
    addEventListener: (evt, fn) => {
      if (evt === 'submit') submitHandler = fn;
    }
  },
  'btn-delete-comp': { addEventListener: () => {} }
};

global.document = {
  getElementById: (id) => elements[id] || createMockEl(),
  querySelectorAll: () => [],
  documentElement: { getAttribute: () => 'light', setAttribute: () => {} },
  addEventListener: () => {}
};

global.window = {
  addEventListener: () => {},
  location: {},
  fetch: async (url, opts) => {
    console.log('发出网络请求:', url, opts.method, opts.body);
    return {
      json: async () => ({ success: true, data: { id: 1 } })
    };
  }
};
global.fetch = global.window.fetch;
global.allComponents = [{ id: 1, name: '0805 10k', category: '电阻' }];

eval(appJs);
initDetailDrawer();

// 触发提交
(async () => {
  console.log('准备触发 submitHandler...');
  await submitHandler({ preventDefault: () => {} });
  console.log('✔ submitHandler 顺利执行完毕！');
})();
