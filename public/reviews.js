// Giao diện Đánh giá sản phẩm: điểm trung bình, biểu đồ tỷ lệ sao, danh sách và form gửi đánh giá.
// Được nạp từ replica-client.js trên các trang /products/{handle}.
(() => {
  'use strict';
  const handle = location.pathname.split('/')[2];
  if (!handle || document.getElementById('product-reviews')) return;

  const MAX_IMAGES = 3, MIN_CONTENT = 10, MAX_CONTENT = 1000, MAX_SIDE = 1280;
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
  const stars = n => '★'.repeat(Math.round(n)) + '☆'.repeat(5 - Math.round(n));
  const dateText = iso => new Date(iso).toLocaleDateString('vi-VN');

  async function api(url, data) {
    const r = await fetch(url, data === undefined ? {} : {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(b.message || 'Yêu cầu không thành công.'), {status: r.status});
    return b;
  }

  const style = document.createElement('style');
  style.textContent = `
    #product-reviews{clear:both;margin:30px 0;padding:20px;border:1px solid #e5e5e5;background:#fff;color:#222;line-height:1.5}
    #product-reviews [hidden]{display:none!important}
    #product-reviews h2{font-size:22px;margin:0 0 16px;text-transform:uppercase}
    #product-reviews .rv-star{color:#f5a623;letter-spacing:2px}
    #product-reviews .rv-top{display:flex;flex-wrap:wrap;gap:24px;align-items:center;margin-bottom:20px}
    #product-reviews .rv-avg{text-align:center;min-width:130px}
    #product-reviews .rv-avg b{display:block;font-size:44px;line-height:1.1}
    #product-reviews .rv-bars{flex:1;min-width:220px}
    #product-reviews .rv-bar{display:flex;align-items:center;gap:8px;font-size:13px;margin:3px 0}
    #product-reviews .rv-bar i{flex:1;height:8px;background:#eee;border-radius:4px;overflow:hidden}
    #product-reviews .rv-bar i span{display:block;height:100%;background:#f5a623}
    #product-reviews .rv-bar em{font-style:normal;min-width:26px;text-align:right;color:#666}
    #product-reviews form{border:1px solid #eee;background:#fafafa;padding:16px;margin-bottom:24px}
    #product-reviews .rv-pick{position:relative;display:flex;flex-direction:row-reverse;justify-content:flex-end;gap:2px;margin:6px 0 12px}
    #product-reviews .rv-pick input{position:absolute;opacity:0;pointer-events:none}
    #product-reviews .rv-pick label{font-size:30px;line-height:1;color:#ccc;cursor:pointer;margin:0;transition:color .15s,transform .15s}
    #product-reviews .rv-pick label:hover{transform:scale(1.25)}
    #product-reviews .rv-pick input:checked~label,#product-reviews .rv-pick label:hover,#product-reviews .rv-pick label:hover~label{color:#f5a623}
    #product-reviews .rv-pick input:focus-visible+label{outline:2px solid #222}
    #product-reviews textarea{width:100%;min-height:90px;padding:8px;border:1px solid #ccc;resize:vertical;font:inherit}
    #product-reviews .rv-btn,#product-reviews input[type=file]::file-selector-button{display:inline-block;padding:11px 28px;background:#222;color:#fff;border:2px solid #222;border-radius:999px;cursor:pointer;font:inherit;font-weight:600;letter-spacing:.04em;text-transform:uppercase;transition:background-color .2s,color .2s,border-color .2s,transform .2s,box-shadow .2s}
    #product-reviews .rv-btn:hover:not([disabled]),#product-reviews input[type=file]::file-selector-button:hover{background:#f5a623;border-color:#f5a623;color:#222;transform:translateY(-2px);box-shadow:0 6px 14px rgba(245,166,35,.4)}
    #product-reviews .rv-btn:active:not([disabled]){transform:translateY(0);box-shadow:none}
    #product-reviews .rv-btn:focus-visible{outline:3px solid rgba(245,166,35,.6);outline-offset:2px}
    #product-reviews .rv-btn[disabled]{opacity:.55;cursor:not-allowed}
    #product-reviews .rv-btn-ghost{background:#fff;color:#222}
    #product-reviews .rv-btn-sm{padding:3px 12px;font-size:12px;border-width:1px;margin-top:4px}
    #product-reviews input[type=file]{font:inherit;padding:6px 0}
    #product-reviews input[type=file]::file-selector-button{padding:7px 18px;margin-right:12px;font-size:13px}
    @media (prefers-reduced-motion:reduce){#product-reviews .rv-btn,#product-reviews input[type=file]::file-selector-button,#product-reviews .rv-pick label{transition:none}#product-reviews .rv-btn:hover:not([disabled]),#product-reviews input[type=file]::file-selector-button:hover,#product-reviews .rv-pick label:hover{transform:none}}
    #product-reviews .rv-err{color:#b00020;margin:8px 0 0}
    #product-reviews .rv-ok{color:#1b7f3b;margin:8px 0 0}
    #product-reviews .rv-thumbs{display:flex;flex-wrap:wrap;gap:8px;margin:8px 0}
    #product-reviews .rv-thumbs img{width:84px;height:84px;object-fit:cover;border:1px solid #ddd}
    #product-reviews .rv-item{border-top:1px solid #eee;padding:14px 0}
    #product-reviews .rv-meta{font-size:13px;color:#777}
    #product-reviews .rv-text{margin:6px 0;white-space:pre-wrap;word-break:break-word}
    #product-reviews .rv-more{display:block;margin:14px auto 0}
    @media (max-width:600px){#product-reviews{padding:14px}#product-reviews .rv-avg{text-align:left}}
  `;
  document.head.append(style);

  const root = document.createElement('section');
  root.id = 'product-reviews';
  root.setAttribute('aria-label', 'Đánh giá sản phẩm');
  root.innerHTML = '<h2>Đánh giá sản phẩm</h2><div class="rv-top"></div><div class="rv-form"></div><div class="rv-list"></div><button type="button" class="rv-btn rv-btn-ghost rv-more" hidden>Xem thêm đánh giá</button>';
  const anchor = document.querySelector('.product-tab') || document.querySelector('.details-product') || document.querySelector('main') || document.body;
  anchor === document.body ? anchor.append(root) : anchor.after(root);

  const top = root.querySelector('.rv-top'), formBox = root.querySelector('.rv-form'), list = root.querySelector('.rv-list'), more = root.querySelector('.rv-more');
  let page = 0, pages = 1, customer = null;

  function renderSummary(s) {
    if (!s.count) {
      top.innerHTML = '<p>Chưa có đánh giá nào cho sản phẩm này. Hãy là người đầu tiên đánh giá!</p>';
      return;
    }
    const bars = [5, 4, 3, 2, 1].map(n => {
      const pct = Math.round(s.distribution[n] / s.count * 100);
      return `<div class="rv-bar"><span>${n} ★</span><i><span style="width:${pct}%"></span></i><em>${s.distribution[n]}</em></div>`;
    }).join('');
    top.innerHTML = `<div class="rv-avg"><b>${s.average.toLocaleString('vi-VN')}/5</b><span class="rv-star" aria-hidden="true">${stars(s.average)}</span><div>${s.count} đánh giá</div></div><div class="rv-bars">${bars}</div>`;
  }

  function reviewHtml(r) {
    const imgs = r.images.length ? '<div class="rv-thumbs">' + r.images.map(u => `<a href="${esc(u)}" target="_blank" rel="noopener"><img src="${esc(u)}" alt="Ảnh thực tế của khách hàng" loading="lazy"></a>`).join('') + '</div>' : '';
    return `<article class="rv-item"><div><strong>${esc(r.author)}</strong> <span class="rv-star" role="img" aria-label="${r.rating} trên 5 sao">${stars(r.rating)}</span></div><div class="rv-meta">${esc(dateText(r.created_at))}</div><p class="rv-text">${esc(r.content)}</p>${imgs}</article>`;
  }

  async function load(reset) {
    if (reset) { page = 0; list.innerHTML = ''; }
    const data = await api(`/api/reviews?handle=${encodeURIComponent(handle)}&page=${page + 1}`);
    page = data.page; pages = data.pages;
    renderSummary(data.summary);
    list.insertAdjacentHTML('beforeend', data.reviews.map(reviewHtml).join(''));
    more.hidden = page >= pages;
  }

  // Thu nhỏ ảnh ở trình duyệt trước khi gửi để giảm dung lượng; máy chủ vẫn kiểm tra lại toàn bộ.
  // Dùng FileReader (data:) thay cho blob: vì CSP của trang chỉ cho phép ảnh 'self', data: và https:.
  function toDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Không đọc được tệp ảnh.'));
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, MAX_SIDE / Math.max(img.width, img.height)), c = document.createElement('canvas');
          c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL('image/jpeg', 0.82));
        };
        img.onerror = () => reject(new Error('Không đọc được tệp ảnh.'));
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function renderForm() {
    if (!customer) {
      formBox.innerHTML = '<p>Vui lòng <a href="/account/login"><strong>đăng nhập</strong></a> để gửi đánh giá của bạn.</p>';
      return;
    }
    formBox.innerHTML = `<form novalidate>
      <strong>Gửi đánh giá của bạn</strong>
      <div class="rv-pick" role="radiogroup" aria-label="Số sao">${[5, 4, 3, 2, 1].map(n => `<input type="radio" name="rating" id="rv-r${n}" value="${n}"><label for="rv-r${n}" title="${n} sao">★</label>`).join('')}</div>
      <textarea name="content" maxlength="${MAX_CONTENT}" placeholder="Chia sẻ cảm nhận của bạn về sản phẩm (tối thiểu ${MIN_CONTENT} ký tự)"></textarea>
      <div><label>Ảnh thực tế (tối đa ${MAX_IMAGES} ảnh JPG, PNG hoặc WebP, mỗi ảnh tối đa 2 MB):<br><input type="file" name="images" accept="image/jpeg,image/png,image/webp" multiple></label></div>
      <div class="rv-thumbs"></div>
      <button type="submit" class="rv-btn">Gửi đánh giá</button>
      <p class="rv-err" role="alert" hidden></p><p class="rv-ok" role="status" hidden></p>
    </form>`;
    const form = formBox.querySelector('form'), fileInput = form.images, thumbs = form.querySelector('.rv-thumbs');
    const err = form.querySelector('.rv-err'), ok = form.querySelector('.rv-ok'), btn = form.querySelector('button');
    let images = []; // data URL đã thu nhỏ

    const showError = m => { ok.hidden = true; err.textContent = m; err.hidden = !m; };

    fileInput.addEventListener('change', async () => {
      showError('');
      const files = [...fileInput.files];
      fileInput.value = '';
      if (images.length + files.length > MAX_IMAGES) return showError(`Chỉ được tải tối đa ${MAX_IMAGES} ảnh.`);
      for (const f of files) {
        if (!/^image\/(jpeg|png|webp)$/.test(f.type)) return showError('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.');
        if (f.size > 10 * 1024 * 1024) return showError('Ảnh quá lớn, vui lòng chọn ảnh dưới 10 MB.');
      }
      try {
        for (const f of files) images.push(await toDataUrl(f));
      } catch (e) { return showError(e.message); }
      thumbs.innerHTML = images.map((u, i) => `<span><img src="${u}" alt="Ảnh xem trước ${i + 1}"><br><button type="button" data-rm="${i}" class="rv-btn rv-btn-ghost rv-btn-sm">Xóa</button></span>`).join('');
    });
    thumbs.addEventListener('click', e => {
      const i = e.target.dataset?.rm;
      if (i === undefined) return;
      images.splice(Number(i), 1);
      thumbs.querySelectorAll('span')[Number(i)].remove();
      thumbs.querySelectorAll('[data-rm]').forEach((b, k) => b.dataset.rm = k);
    });

    form.addEventListener('submit', async e => {
      e.preventDefault();
      const rating = Number(form.rating.value), content = form.content.value.trim();
      if (!rating) return showError('Vui lòng chọn số sao từ 1 đến 5.');
      if (content.length < MIN_CONTENT) return showError(`Nội dung đánh giá cần ít nhất ${MIN_CONTENT} ký tự.`);
      btn.disabled = true; btn.textContent = 'Đang gửi…'; showError('');
      try {
        await api('/api/reviews', {handle, rating, content, images});
        await load(true);
        formBox.innerHTML = '<p class="rv-ok" role="status">Cảm ơn bạn! Đánh giá của bạn đã được đăng.</p>';
      } catch (x) {
        showError(x.message);
      } finally { btn.disabled = false; btn.textContent = 'Gửi đánh giá'; }
    });
  }

  more.addEventListener('click', () => load(false).catch(() => {}));

  (async () => {
    try { customer = (await api('/api/session')).customer; } catch {}
    renderForm();
    try { await load(true); } catch (e) { top.innerHTML = '<p class="rv-err">Không tải được đánh giá. Vui lòng thử lại sau.</p>'; }
  })();
})();
