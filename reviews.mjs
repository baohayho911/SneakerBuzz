// Phân hệ Đánh giá sản phẩm (Sprint 2).
// Tách riêng khỏi server.mjs: lược đồ CSDL, API công khai, API kiểm duyệt và phục vụ ảnh tải lên.
import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';

export const LIMITS = {
  pageSize: 5,          // số đánh giá mỗi trang ở trang sản phẩm
  adminPageSize: 20,    // số đánh giá mỗi trang ở trang quản trị
  maxImages: 3,         // số ảnh tối đa cho mỗi đánh giá
  maxImageBytes: 2 * 1024 * 1024, // dung lượng tối đa mỗi ảnh sau khi giải mã
  minContent: 10,
  maxContent: 1000,
  maxBody: 9 * 1024 * 1024,       // 3 ảnh x 2 MB (base64) + nội dung
};

// Quản trị viên = tài khoản khách hàng có email nằm trong ADMIN_EMAILS (phân tách bằng dấu phẩy).
// Không có quản trị viên mặc định: nếu không cấu hình thì không ai vào được trang kiểm duyệt.
const adminEmails = new Set(
  (process.env.ADMIN_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
);

export function initReviews(db) {
  db.exec(`
    PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS reviews(
      id TEXT PRIMARY KEY,
      product_handle TEXT NOT NULL,
      customer_id TEXT NOT NULL REFERENCES customers(id),
      author_name TEXT NOT NULL,
      rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'visible' CHECK(status IN ('visible','hidden')),
      created_at TEXT NOT NULL,
      UNIQUE(customer_id, product_handle)
    );
    CREATE INDEX IF NOT EXISTS idx_reviews_product ON reviews(product_handle, status, created_at);
    CREATE TABLE IF NOT EXISTS review_images(
      id TEXT PRIMARY KEY,
      review_id TEXT NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
      filename TEXT NOT NULL,
      position INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_review_images_review ON review_images(review_id);
  `);
}

// Thư mục lưu ảnh tải lên; có thể đổi bằng REVIEW_UPLOAD_DIR (dùng khi triển khai hoặc chạy kiểm thử).
const uploadDir = ctx => process.env.REVIEW_UPLOAD_DIR || path.join(ctx.DATA, 'uploads', 'reviews');
const imageUrl = name => '/uploads/reviews/' + name;
const SAFE_FILENAME = /^[a-f0-9-]{36}\.(?:jpg|png|webp)$/;

// Nhận diện định dạng bằng chữ ký byte, không tin vào phần mở rộng hay MIME do client gửi.
function sniffImage(buf) {
  if (buf.length > 12 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 12 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length > 12 && buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

function parseImage(value, bad) {
  if (typeof value !== 'string') throw bad('Ảnh tải lên không hợp lệ.');
  const comma = value.indexOf(',');
  if (comma < 0 || !/^data:image\/(?:jpeg|png|webp);base64$/.test(value.slice(0, comma))) {
    throw bad('Chỉ chấp nhận ảnh JPG, PNG hoặc WebP.');
  }
  // Kiểm tra độ dài chuỗi base64 trước khi giải mã để tránh tốn bộ nhớ vô ích.
  if (value.length - comma - 1 > Math.ceil(LIMITS.maxImageBytes / 3) * 4) throw bad('Mỗi ảnh tối đa 2 MB.');
  const buf = Buffer.from(value.slice(comma + 1), 'base64');
  if (buf.length > LIMITS.maxImageBytes) throw bad('Mỗi ảnh tối đa 2 MB.');
  const ext = sniffImage(buf);
  if (!ext) throw bad('Tệp tải lên không phải ảnh JPG, PNG hoặc WebP hợp lệ.');
  return {buf, ext};
}

function displayName(c) {
  const last = [...String(c.last_name || '').trim()][0];
  return (String(c.first_name || '').trim() + (last ? ' ' + last + '.' : '')).trim() || 'Khách hàng';
}

function pageParam(url) {
  return Math.max(1, parseInt(url.searchParams.get('page') || '1') || 1);
}

function attachImages(db, rows) {
  if (!rows.length) return new Map();
  const marks = rows.map(() => '?').join(',');
  const found = db.prepare(`SELECT review_id, filename FROM review_images WHERE review_id IN (${marks}) ORDER BY position`)
    .all(...rows.map(r => r.id));
  const map = new Map(rows.map(r => [r.id, []]));
  for (const f of found) map.get(f.review_id).push(imageUrl(f.filename));
  return map;
}

function summary(db, handle) {
  const distribution = {1: 0, 2: 0, 3: 0, 4: 0, 5: 0};
  let count = 0, total = 0;
  for (const r of db.prepare("SELECT rating, COUNT(*) AS n FROM reviews WHERE product_handle=? AND status='visible' GROUP BY rating").all(handle)) {
    distribution[r.rating] = r.n; count += r.n; total += r.rating * r.n;
  }
  return {count, average: count ? Math.round(total / count * 10) / 10 : 0, distribution};
}

function requireAdmin(ctx, req, res) {
  const c = ctx.customer(ctx.getSession(req, res));
  if (!c) throw ctx.bad('Vui lòng đăng nhập bằng tài khoản quản trị.', 401);
  if (!adminEmails.has(String(c.email).toLowerCase())) throw ctx.bad('Tài khoản này không có quyền quản trị.', 403);
  return c;
}

function removeFiles(ctx, filenames) {
  for (const name of filenames) {
    if (SAFE_FILENAME.test(name)) fs.rmSync(path.join(uploadDir(ctx), name), {force: true});
  }
}

// Trả về true nếu yêu cầu đã được xử lý ở đây.
export async function handleReviews(req, res, url, pathname, ctx) {
  const {db, json, bad} = ctx;

  // --- Công khai: danh sách + điểm trung bình ---
  if (pathname === '/api/reviews' && req.method === 'GET') {
    const handle = url.searchParams.get('handle') || '';
    if (!/^[\w-]+$/.test(handle) || !ctx.byHandle.has(handle)) throw bad('Không tìm thấy sản phẩm.', 404);
    const stats = summary(db, handle), page = pageParam(url);
    const rows = db.prepare("SELECT id, author_name, rating, content, created_at FROM reviews WHERE product_handle=? AND status='visible' ORDER BY created_at DESC, id LIMIT ? OFFSET ?")
      .all(handle, LIMITS.pageSize, (page - 1) * LIMITS.pageSize);
    const images = attachImages(db, rows);
    json(res, {
      summary: stats, page, pages: Math.ceil(stats.count / LIMITS.pageSize),
      reviews: rows.map(r => ({id: r.id, author: r.author_name, rating: r.rating, content: r.content, created_at: r.created_at, images: images.get(r.id)}))
    });
    return true;
  }

  // --- Khách hàng gửi đánh giá ---
  if (pathname === '/api/reviews') {
    if (req.method !== 'POST') throw bad('Phương thức không hợp lệ.', 405);
    const c = ctx.customer(ctx.getSession(req, res));
    if (!c) throw bad('Vui lòng đăng nhập để gửi đánh giá.', 401);
    const b = await ctx.body(req, LIMITS.maxBody);

    // Mọi kiểm tra đều làm ở máy chủ; kiểm tra ở giao diện chỉ để báo lỗi sớm.
    const handle = String(b.handle || '');
    if (!ctx.byHandle.has(handle)) throw bad('Không tìm thấy sản phẩm.', 404);
    const rating = Number(b.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) throw bad('Vui lòng chọn số sao từ 1 đến 5.');
    const content = String(b.content ?? '').trim();
    if (content.length < LIMITS.minContent) throw bad(`Nội dung đánh giá cần ít nhất ${LIMITS.minContent} ký tự.`);
    if (content.length > LIMITS.maxContent) throw bad(`Nội dung đánh giá tối đa ${LIMITS.maxContent} ký tự.`);
    const rawImages = b.images == null ? [] : b.images;
    if (!Array.isArray(rawImages)) throw bad('Ảnh tải lên không hợp lệ.');
    if (rawImages.length > LIMITS.maxImages) throw bad(`Chỉ được tải tối đa ${LIMITS.maxImages} ảnh.`);
    const images = rawImages.map(v => parseImage(v, bad));
    if (db.prepare('SELECT 1 FROM reviews WHERE customer_id=? AND product_handle=?').get(c.id, handle)) {
      throw bad('Bạn đã đánh giá sản phẩm này rồi.', 409);
    }

    const id = randomUUID(), saved = [];
    fs.mkdirSync(uploadDir(ctx), {recursive: true});
    try {
      db.exec('BEGIN');
      db.prepare('INSERT INTO reviews(id,product_handle,customer_id,author_name,rating,content,created_at) VALUES(?,?,?,?,?,?,?)')
        .run(id, handle, c.id, displayName(c), rating, content, new Date().toISOString());
      images.forEach(({buf, ext}, i) => {
        const name = randomUUID() + '.' + ext;
        fs.writeFileSync(path.join(uploadDir(ctx), name), buf, {flag: 'wx'});
        saved.push(name);
        db.prepare('INSERT INTO review_images(id,review_id,filename,position) VALUES(?,?,?,?)').run(randomUUID(), id, name, i);
      });
      db.exec('COMMIT');
    } catch (e) {
      try { db.exec('ROLLBACK'); } catch {}
      removeFiles(ctx, saved);
      if (/UNIQUE/.test(e.message)) throw bad('Bạn đã đánh giá sản phẩm này rồi.', 409);
      throw e;
    }
    json(res, {ok: true, id, summary: summary(db, handle)}, 201);
    return true;
  }

  // --- Quản trị: trang kiểm duyệt + API ---
  if (pathname === '/admin/reviews') {
    if (req.method !== 'GET') throw bad('Phương thức không hợp lệ.', 405);
    if (ctx.file(req, res, path.join(ctx.PUBLIC, 'admin', 'reviews.html'))) return true;
    throw bad('Không tìm thấy trang.', 404);
  }

  if (pathname === '/api/admin/reviews') {
    requireAdmin(ctx, req, res);
    if (req.method === 'GET') {
      const status = url.searchParams.get('status') || 'all';
      if (!['all', 'visible', 'hidden'].includes(status)) throw bad('Trạng thái không hợp lệ.');
      const page = pageParam(url), where = status === 'all' ? '' : 'WHERE r.status=?', args = status === 'all' ? [] : [status];
      const total = db.prepare(`SELECT COUNT(*) AS n FROM reviews r ${where}`).get(...args).n;
      const rows = db.prepare(`SELECT r.id, r.product_handle, r.author_name, r.rating, r.content, r.status, r.created_at, c.email FROM reviews r JOIN customers c ON c.id=r.customer_id ${where} ORDER BY r.created_at DESC, r.id LIMIT ? OFFSET ?`)
        .all(...args, LIMITS.adminPageSize, (page - 1) * LIMITS.adminPageSize);
      const images = attachImages(db, rows);
      json(res, {
        total, page, pages: Math.ceil(total / LIMITS.adminPageSize),
        reviews: rows.map(r => ({...r, product_title: ctx.byHandle.get(r.product_handle)?.title || r.product_handle, images: images.get(r.id)}))
      });
      return true;
    }
    if (req.method !== 'POST') throw bad('Phương thức không hợp lệ.', 405);
    const b = await ctx.body(req);
    const id = String(b.id || ''), action = String(b.action || '');
    const review = db.prepare('SELECT id FROM reviews WHERE id=?').get(id);
    if (!review) throw bad('Không tìm thấy đánh giá.', 404);
    if (action === 'hide' || action === 'show') {
      db.prepare('UPDATE reviews SET status=? WHERE id=?').run(action === 'hide' ? 'hidden' : 'visible', id);
    } else if (action === 'delete') {
      const names = db.prepare('SELECT filename FROM review_images WHERE review_id=?').all(id).map(r => r.filename);
      db.prepare('DELETE FROM reviews WHERE id=?').run(id); // review_images bị xóa theo (ON DELETE CASCADE)
      removeFiles(ctx, names);
    } else {
      throw bad('Thao tác không hợp lệ.');
    }
    json(res, {ok: true});
    return true;
  }

  // --- Ảnh đánh giá đã tải lên ---
  const upload = pathname.match(/^\/uploads\/reviews\/([a-f0-9-]{36}\.(?:jpg|png|webp))$/);
  if (upload) {
    if (ctx.file(req, res, path.join(uploadDir(ctx), upload[1]))) return true;
    throw bad('Không tìm thấy tài nguyên.', 404);
  }
  return false;
}
