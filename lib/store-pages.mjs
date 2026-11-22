export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g,char => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
})[char]);
const money = amount => new Intl.NumberFormat('vi-VN').format(amount / 100) + '₫';
function imageUrl(value) {
  const url = typeof value === 'string' ? value : value?.src;
  return /^(https:\/\/|\/\/cdn\.hstatic\.net\/|\/assets\/)/.test(url || '') ? escapeHtml(url) : '';
}

export function productCard(product) {
  const title = escapeHtml(product.title);
  const href = '/products/' + encodeURIComponent(product.handle);
  const image = imageUrl(product.featured_image);
  return `<div class="product-box"><a class="image_thumb" href="${href}">${image ? `<img src="${image}" alt="${title}" loading="lazy">` : ''}</a>
    <h3 class="product-name"><a href="${href}">${title}</a></h3><p>${money(product.price)}${product.available ? '' : ' · Hết hàng'}</p></div>`;
}

export function shell(title, content, {admin=false}={}) {
  return `<!doctype html><html lang="vi"><head><meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} | SneakerBuzz</title>
    <link rel="stylesheet" href="/store.css"><script defer src="/store.js"></script>${admin?'':'<script defer src="/product-chat.js"></script>'}
    </head><body><header class="top"><nav>
      <a class="brand" href="/">SNEAKER BUZZ</a><a href="/collections/all">Sản phẩm</a>
      <a href="/cart">Giỏ hàng</a><a href="/account">Tài khoản</a>${admin?'<a href="/admin/reviews">Kiểm duyệt</a>':''}
    </nav></header><main class="wrap">${content}</main></body></html>`;
}

export function productPage(product) {
  const title = escapeHtml(product.title);
  const image = imageUrl(product.featured_image);
  const options = product.variants.map(v => `<option value="${v.id}" ${v.available?'':'disabled'}>
    ${escapeHtml(v.title || 'Mặc định')} · ${money(v.price)}${v.available?'':' · Hết hàng'}</option>`).join('');
  const description = product.description_text ?? String(product.description || '').replace(/<[^>]*>/g,' ').trim();
  return shell(product.title,`<section class="product-layout">
    ${image?`<img class="product-image" src="${image}" alt="${title}">`:''}
    <div><p>${escapeHtml(product.vendor)}</p><h1>${title}</h1><p><strong>${money(product.price)}</strong></p>
      <p class="product-description">${escapeHtml(description)}</p>
      <form data-purchase><label>Biến thể<select name="id" required><option value="">Chọn biến thể</option>${options}</select></label>
      <label>Số lượng<input name="quantity" type="number" min="1" max="99" value="1" required></label>
      <button ${product.available?'':'disabled'}>${product.available?'Thêm vào giỏ hàng':'Hết hàng'}</button></form>
      <p role="status" data-message></p>
    </div></section><div id="review-anchor"></div><script defer src="/reviews.js"></script>`);
}
