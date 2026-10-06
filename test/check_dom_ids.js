const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');

const ids = [
  'form-edit-comp', 'detail-id', 'detail-category', 'detail-min-stock',
  'detail-res-val', 'detail-res-tol', 'detail-cap-val', 'detail-cap-volt',
  'detail-cap-tol', 'detail-ind-val', 'detail-ind-current', 'detail-other-val',
  'detail-name', 'detail-package', 'detail-quantity', 'detail-lcsc',
  'detail-location', 'detail-notes', 'btn-delete-comp'
];

let allOk = true;
ids.forEach(id => {
  if (!html.includes(`id="${id}"`)) {
    console.error('MISSING ID:', id);
    allOk = false;
  }
});

if (allOk) {
  console.log('ALL REQUIRED DOM IDS EXIST IN index.html!');
}
