// Kiểm thử phân hệ Đánh giá sản phẩm trên máy chủ thật + SQLite tạm (TC01–TC04 trong báo cáo Sprint 2).
import {spawn} from 'node:child_process';
import {mkdtemp, rm, readdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const temp = await mkdtemp(path.join(os.tmpdir(), 'buzz-reviews-'));
const port = 42000 + Math.floor(Math.random() * 10000), base = 'http://127.0.0.1:' + port;
const adminEmail = 'admin@example.invalid', password = 'TestOnly9876';
const server = spawn(process.execPath, ['server.mjs'], {
  cwd: root,
  env: {...process.env, PORT: String(port), DATABASE_PATH: path.join(temp, 'test.sqlite'), REVIEW_UPLOAD_DIR: path.join(temp, 'uploads', 'reviews'), ADMIN_EMAILS: adminEmail},
  stdio: ['ignore', 'pipe', 'pipe']
});
let log = '';
server.stderr.on('data', x => log += x);

// PNG 1x1 hợp lệ.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const NOT_IMAGE = 'data:image/png;base64,' + Buffer.from('<?php echo 1; ?> day khong phai anh').toString('base64');

function client() {
  let cookie = '';
  return {
    async req(url, data, extra = {}) {
      const r = await fetch(base + url, {
        method: data === undefined ? 'GET' : 'POST',
        headers: {Cookie: cookie, ...(data === undefined ? {} : {'Content-Type': 'application/json'}), ...extra},
        body: data === undefined ? undefined : JSON.stringify(data)
      });
      const set = r.headers.get('set-cookie');
      if (set) cookie = set.split(';')[0];
      const text = await r.text();
      let body = text;
      try { body = JSON.parse(text); } catch {}
      return {status: r.status, body, headers: r.headers};
    }
  };
}

const results = [];
async function test(name, fn) { await fn(); results.push(name); console.log('PASS ' + name); }

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Server timeout ' + log)), 10000);
    server.once('exit', () => { clearTimeout(timer); reject(Error(log)); });
    server.stdout.on('data', () => { clearTimeout(timer); resolve(); });
  });

  const handle = 'giay-vans-old-skool-white', other = 'giay-vans-old-skool-navy';
  const anon = client(), alice = client(), bob = client(), admin = client();
  const register = (c, email, first) => c.req('/api/register', {email, password, first_name: first, last_name: 'Nguyen'});
  await register(alice, 'alice@example.invalid', 'Alice');
  await register(bob, 'bob@example.invalid', 'Bob');
  await register(admin, adminEmail, 'Quan');

  await test('Chưa có đánh giá: điểm trung bình bằng 0', async () => {
    const r = await anon.req(`/api/reviews?handle=${handle}`);
    assert.equal(r.status, 200);
    assert.equal(r.body.summary.count, 0);
    assert.equal(r.body.summary.average, 0);
    assert.deepEqual(r.body.reviews, []);
  });

  await test('Sản phẩm không tồn tại / handle sai định dạng', async () => {
    assert.equal((await anon.req('/api/reviews?handle=khong-ton-tai')).status, 404);
    assert.equal((await anon.req('/api/reviews?handle=../etc/passwd')).status, 404);
  });

  await test('Khách chưa đăng nhập không gửi được đánh giá', async () => {
    const r = await anon.req('/api/reviews', {handle, rating: 5, content: 'Giày rất đẹp và êm chân'});
    assert.equal(r.status, 401);
  });

  await test('TC02: thiếu/không hợp lệ số sao và nội dung bị chặn ở máy chủ', async () => {
    const good = {handle, rating: 5, content: 'Giày rất đẹp và êm chân'};
    for (const patch of [{rating: undefined}, {rating: 0}, {rating: 6}, {rating: 3.5}, {rating: 'abc'}, {content: ''}, {content: 'ngắn'}, {content: 'x'.repeat(1001)}, {handle: 'khong-co'}]) {
      const r = await alice.req('/api/reviews', {...good, ...patch});
      assert.ok([404, 422].includes(r.status), JSON.stringify(patch) + ' -> ' + r.status);
    }
    assert.equal((await anon.req(`/api/reviews?handle=${handle}`)).body.summary.count, 0);
  });

  await test('TC03: tệp sai định dạng, giả mạo MIME hoặc quá nhiều ảnh bị từ chối', async () => {
    const base = {handle, rating: 4, content: 'Giày rất đẹp và êm chân'};
    for (const images of [[NOT_IMAGE], ['data:text/html;base64,PGgxPng8L2gxPg=='], ['khong-phai-data-url'], [123], [PNG, PNG, PNG, PNG]]) {
      assert.equal((await alice.req('/api/reviews', {...base, images})).status, 422, JSON.stringify(images).slice(0, 60));
    }
    const big = 'data:image/png;base64,' + Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2 * 1024 * 1024 + 10)]).toString('base64');
    assert.equal((await alice.req('/api/reviews', {...base, images: [big]})).status, 422);
    assert.equal((await anon.req(`/api/reviews?handle=${handle}`)).body.summary.count, 0);
  });

  let reviewId, imageUrl;
  await test('TC01: gửi đánh giá hợp lệ kèm ảnh, điểm trung bình cập nhật ngay', async () => {
    const r = await alice.req('/api/reviews', {handle, rating: 5, content: 'Giày rất đẹp và êm chân', images: [PNG]});
    assert.equal(r.status, 201);
    assert.equal(r.body.summary.count, 1);
    assert.equal(r.body.summary.average, 5);
    const list = (await anon.req(`/api/reviews?handle=${handle}`)).body;
    assert.equal(list.reviews.length, 1);
    assert.equal(list.reviews[0].author, 'Alice N.'); // không lộ email hay họ tên đầy đủ
    assert.equal(list.reviews[0].images.length, 1);
    assert.ok(!JSON.stringify(list).includes('alice@example.invalid'));
    reviewId = list.reviews[0].id; imageUrl = list.reviews[0].images[0];
    const img = await fetch(base + imageUrl);
    assert.equal(img.status, 200);
    assert.equal(img.headers.get('content-type'), 'image/png');
  });

  await test('Điểm trung bình và biểu đồ tỷ lệ sao tính đúng với nhiều đánh giá', async () => {
    assert.equal((await bob.req('/api/reviews', {handle, rating: 2, content: 'Hơi chật so với size thường'})).status, 201);
    const s = (await anon.req(`/api/reviews?handle=${handle}`)).body.summary;
    assert.equal(s.count, 2);
    assert.equal(s.average, 3.5);
    assert.deepEqual(s.distribution, {1: 0, 2: 1, 3: 0, 4: 0, 5: 1});
    assert.equal((await anon.req(`/api/reviews?handle=${other}`)).body.summary.count, 0); // không lẫn sản phẩm khác
  });

  await test('Mỗi khách chỉ đánh giá một lần cho mỗi sản phẩm', async () => {
    const r = await alice.req('/api/reviews', {handle, rating: 1, content: 'Gửi lần hai thử xem sao'});
    assert.equal(r.status, 409);
    assert.equal((await alice.req('/api/reviews', {handle: other, rating: 4, content: 'Đôi khác thì được'})).status, 201);
  });

  await test('Nội dung chứa HTML được lưu nguyên văn dạng văn bản (giao diện tự escape)', async () => {
    const carol = client();
    await register(carol, 'carol@example.invalid', 'Carol');
    const payload = '<img src=x onerror=alert(1)> và "dấu nháy"';
    assert.equal((await carol.req('/api/reviews', {handle, rating: 3, content: payload})).status, 201);
    const found = (await anon.req(`/api/reviews?handle=${handle}`)).body.reviews.find(r => r.author === 'Carol N.');
    assert.equal(found.content, payload);
    const js = await fetch(base + '/reviews.js').then(r => r.text());
    assert.match(js, /const esc = /);
  });

  await test('Phân trang: 5 đánh giá mỗi trang', async () => {
    for (let i = 0; i < 5; i++) {
      const c = client();
      await register(c, `u${i}@example.invalid`, 'User' + i);
      assert.equal((await c.req('/api/reviews', {handle, rating: 4, content: 'Đánh giá số ' + i + ' để thử phân trang'})).status, 201);
    }
    const p1 = (await anon.req(`/api/reviews?handle=${handle}`)).body, p2 = (await anon.req(`/api/reviews?handle=${handle}&page=2`)).body;
    assert.equal(p1.reviews.length, 5);
    assert.equal(p1.pages, 2);
    assert.equal(p2.reviews.length, 3);
    assert.equal(new Set([...p1.reviews, ...p2.reviews].map(r => r.id)).size, 8);
  });

  await test('Kiểm duyệt: người dùng thường và khách không vào được API quản trị', async () => {
    assert.equal((await anon.req('/api/admin/reviews')).status, 401);
    assert.equal((await alice.req('/api/admin/reviews')).status, 403);
    assert.equal((await alice.req('/api/admin/reviews', {id: reviewId, action: 'delete'})).status, 403);
    assert.equal((await anon.req(`/api/reviews?handle=${handle}`)).body.summary.count, 8);
  });

  await test('TC04: admin ẩn đánh giá -> biến mất khỏi trang khách và điểm trung bình; hiện lại được', async () => {
    const before = (await anon.req(`/api/reviews?handle=${handle}`)).body.summary;
    assert.equal((await admin.req('/api/admin/reviews', {id: reviewId, action: 'hide'})).status, 200);
    const after = (await anon.req(`/api/reviews?handle=${handle}`)).body;
    assert.equal(after.summary.count, before.count - 1);
    assert.ok(![...after.reviews].some(r => r.id === reviewId));
    const hidden = (await admin.req('/api/admin/reviews?status=hidden')).body;
    assert.equal(hidden.total, 1);
    assert.equal(hidden.reviews[0].id, reviewId);
    assert.equal((await admin.req('/api/admin/reviews', {id: reviewId, action: 'show'})).status, 200);
    assert.equal((await anon.req(`/api/reviews?handle=${handle}`)).body.summary.count, before.count);
  });

  await test('TC04: admin xóa đánh giá -> mất khỏi CSDL và xóa tệp ảnh', async () => {
    const dir = path.join(temp, 'uploads', 'reviews');
    const filesBefore = await readdir(dir).catch(() => []);
    assert.equal(filesBefore.length, 1); // chỉ đánh giá này có ảnh
    assert.equal((await admin.req('/api/admin/reviews', {id: reviewId, action: 'delete'})).status, 200);
    const filesAfter = await readdir(dir);
    assert.equal(filesAfter.length, 0);
    assert.equal((await fetch(base + imageUrl)).status, 404);
    assert.equal((await anon.req(`/api/reviews?handle=${handle}`)).body.summary.count, 7);
    assert.equal((await admin.req('/api/admin/reviews', {id: reviewId, action: 'delete'})).status, 404);
    assert.equal((await admin.req('/api/admin/reviews', {id: reviewId, action: 'bogus'})).status, 404);
  });

  await test('Thao tác quản trị không hợp lệ và bộ lọc trạng thái', async () => {
    const any = (await admin.req('/api/admin/reviews')).body.reviews[0].id;
    assert.equal((await admin.req('/api/admin/reviews', {id: any, action: 'bogus'})).status, 422);
    assert.equal((await admin.req('/api/admin/reviews?status=xyz')).status, 422);
    const all = (await admin.req('/api/admin/reviews')).body;
    assert.equal(all.total, 8); // 7 ở sản phẩm 1 + 1 ở sản phẩm 2
    assert.equal(all.reviews.length, 8);
    assert.ok(all.reviews.every(r => r.email && r.product_title));
  });

  await test('Chặn yêu cầu khác origin, path traversal ở ảnh tải lên, trang quản trị phục vụ được', async () => {
    assert.equal((await alice.req('/api/reviews', {handle: other, rating: 5, content: 'Từ trang web khác gửi tới'}, {Origin: 'https://evil.example'})).status, 403);
    for (const p of ['/uploads/reviews/../../runtime.sqlite', '/uploads/reviews/%2e%2e%2fruntime.sqlite', '/uploads/reviews/abc.png', '/uploads/reviews/x.html']) {
      const r = await fetch(base + p);
      assert.equal(r.status, 404, p);
    }
    const page = await anon.req('/admin/reviews');
    assert.equal(page.status, 200);
    assert.match(page.body, /Kiểm duyệt đánh giá/);
  });

  await test('Trang sản phẩm nạp được phân hệ đánh giá', async () => {
    const html = await anon.req(`/products/${handle}`);
    assert.equal(html.status, 200);
    assert.match(html.body, /replica-client\.js/);
    const client = await fetch(base + '/replica-client.js').then(r => r.text());
    assert.match(client, /\/reviews\.js/);
    assert.equal((await fetch(base + '/reviews.js')).status, 200);
  });

  console.log(JSON.stringify({passed: results.length, results}, null, 2));
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  server.kill();
  await new Promise(r => server.once('exit', r));
  await rm(temp, {recursive: true, force: true});
}
