# Sneaker Buzz — mã nguồn bản tái tạo chạy riêng

Bản khôi phục từ dữ liệu khảo sát công khai ngày 10–11/11/2026. Giao diện dùng HTML, CSS, font, ảnh và JavaScript của bản tham chiếu đã thu thập; máy chủ và các API độc lập được viết bằng Node.js 24 và SQLite. Không sử dụng template thay thế giao diện. Đây là bản bàn giao có giới hạn được mô tả trong `docs/QA.md`, chưa phải bản hoàn thành toàn bộ website.

## Chạy trên Windows, macOS, Linux

1. Cài Node.js **24 trở lên** từ https://nodejs.org/ (cần `node:sqlite`).
2. Giải nén toàn bộ ZIP. Mở thư mục có `package.json` bằng VS Code.
3. Mở Terminal trong thư mục đó. Kiểm tra `node --version`.
4. Chạy `npm start`.
5. Mở **http://127.0.0.1:8787/**. Giữ Terminal mở trong lúc sử dụng. Dừng bằng Ctrl+C.

Không cần `npm install`: máy chủ không dùng thư viện npm ngoài. Không mở HTML bằng cách nhấp đúp vì các trang cần API và đường dẫn gốc.

Kiểm tra mã: `npm run check`. Kiểm thử API: `npm test`. Chế độ phát triển tự nạp lại máy chủ: `npm run dev`.

## Dữ liệu và cấu hình

`data/items.json` chứa 1.045 sản phẩm và biến thể tại thời điểm thu thập; `data/memberships.json` chứa 65 đường dẫn danh mục, kể cả danh mục trống. Giá trong JSON theo đơn vị nhỏ của API Haravan (giá VND nhân 100). Dữ liệu tồn kho là ảnh chụp tại thời điểm khảo sát, không cập nhật từ website thật.

Lần chạy đầu tự tạo `data/runtime.sqlite`, chứa tài khoản đăng ký, phiên giỏ hàng và email nhận tin của **bản chạy riêng**. Không có tài khoản mặc định. Đăng ký trong trang `/account/register` rồi đăng nhập bằng tài khoản đó. Mật khẩu dùng PBKDF2 có salt; cookie phiên HttpOnly và SameSite=Lax. Sao lưu SQLite khi máy chủ đã dừng; không đưa cơ sở dữ liệu người dùng lên Git.

Các biến môi trường xem `.env.example`. Máy chủ không tự đọc `.env`; dùng biến của hệ điều hành, host hoặc `node --env-file=.env server.mjs`. Mặc định chỉ lắng nghe trên 127.0.0.1. Đây là cấu hình chạy cục bộ, chưa cấu hình vận hành công khai.

## Cấu trúc

- `server.mjs`: HTTP, SQLite, tài khoản, giỏ hàng, tìm kiếm, lọc, sắp xếp và phân trang.
- `public/replica-client.js`: nối giao diện gốc với API độc lập.
- `public/replica-bridge.js`: chuyển yêu cầu về máy chủ riêng, chặn yêu cầu dữ liệu dịch vụ ngoài chưa cấu hình.
- `public/__pages/`: 1.580 bản HTML công khai được khôi phục, có cả các trang phân trang; kèm trang 404 dựng lại từ trạng thái lỗi đã quan sát. Số HTML không phải số loại màn hình khác nhau.
- `public/assets/`: 1.292 tệp nguồn được lưu, cộng trang QA nội bộ. Một số URL ảnh biến thể dùng chung ảnh đã lưu; một số ảnh/video/font còn phụ thuộc mạng.
- `public/replica-data/cards/`: 1.045 thẻ sản phẩm gốc dùng khi tìm kiếm/lọc.
- `public/replica-data/stores*.html`: các đoạn danh sách cửa hàng công khai.
- `public/slick*`, `public/waypoint.js`: thư viện điều khiển carousel; giấy phép nằm trong tệp nguồn và `SLICK-LICENSE.txt`.
- `tests/api.mjs`: kiểm thử trên máy chủ thật với SQLite tạm, không dùng dữ liệu người dùng và không gọi hệ thống bán hàng thật.
- `docs/capture.json`: toàn bộ URL khôi phục và danh sách tài nguyên chưa đóng gói.
- `docs/QA.md`, `docs/api-tests.log`, `docs/screenshots/`: kết quả kiểm tra và bằng chứng.

Trang chủ, danh mục, chi tiết sản phẩm, tìm kiếm, giỏ hàng, biểu mẫu tài khoản công khai, tin tức, chính sách, loyalty và hệ thống cửa hàng giữ đường dẫn gốc trong phạm vi đã thu thập. Danh sách URL chính xác nằm trong `docs/capture.json`.

## API riêng

GET `/api/catalog?collection=/collections/vans&q=...&sort=price-asc&page=1`; lọc qua tham số `filters` là JSON mảng `{field,value}`. GET `/api/cards?handles=...`, `/products/{handle}.js`, `/cart.js`, `/api/session`.

POST `/cart/add.js`, `/cart/change.js`, `/cart/update.js`, `/cart/clear.js`; POST `/api/register`, `/api/login`, `/api/logout`, `/contact` (đăng ký nhận tin cục bộ).

GET/POST `/api/orders` xem và tạo đơn COD theo tài khoản. POST `/api/recover` và `/api/integration-disabled` trả 424 khi dịch vụ cần thiết chưa được cấu hình.

Logo, ảnh, font và nội dung giữ nguồn công khai đã khảo sát; việc truy cập công khai không chứng minh quyền cấp phép tái xuất bản. Cần xác nhận quyền sử dụng của chủ sở hữu trước khi phát hành thương mại.

## Đánh giá sản phẩm (Sprint 2)

Khách hàng đã đăng nhập gửi đánh giá (1–5 sao, nội dung 10–1000 ký tự, tối đa 3 ảnh JPG/PNG/WebP, mỗi ảnh ≤ 2 MB) ngay trên trang `/products/{handle}`; trang hiển thị điểm trung bình, biểu đồ tỷ lệ sao và danh sách đánh giá (5 đánh giá mỗi trang). Mỗi tài khoản đánh giá một lần cho mỗi sản phẩm. Quản trị viên ẩn, hiện hoặc xóa đánh giá tại `/admin/reviews`.

- `reviews.mjs`: lược đồ CSDL (`reviews`, `review_images`), API, kiểm duyệt, phục vụ ảnh. `server.mjs` chỉ gọi `initReviews` và `handleReviews`.
- `public/reviews.js`: giao diện trên trang sản phẩm, được `replica-client.js` nạp tự động. `public/admin/reviews.html`: trang kiểm duyệt.
- `tests/reviews.mjs`: kiểm thử TC01–TC04 và các trường hợp bảo mật (`npm run test:reviews`; `npm test` chạy cả hai bộ).

Ảnh đánh giá lưu trong `data/uploads/reviews/`. Đổi thư mục qua `REVIEW_UPLOAD_DIR` nếu cần.

API: GET `/api/reviews?handle=...&page=1` (công khai); POST `/api/reviews` (cần đăng nhập; JSON `{handle,rating,content,images:[dataURL]}`); GET/POST `/api/admin/reviews` (cần quản trị viên; POST `{id,action:hide|show|delete}`). Mọi kiểm tra hợp lệ (số sao, độ dài, định dạng ảnh theo chữ ký byte, dung lượng, trùng đánh giá, quyền quản trị) thực hiện ở máy chủ bằng truy vấn tham số hóa; nội dung người dùng được escape khi hiển thị.

## Backend cửa hàng trên nhánh feature/store-backend

1. Dùng Node.js 24 trở lên. Chạy `npm start` rồi mở http://127.0.0.1:8787.
2. Đăng ký tài khoản tại `/account/register`. Sau khi đăng nhập, `/account` hiển thị hồ sơ và lịch sử đơn của chính tài khoản.
3. Để cấp quyền admin, dùng terminal khác trong thư mục repo và chạy `npm run admin -- email-ban-da-dang-ky@example.com`. Dùng cùng đường dẫn `DATABASE_PATH` với máy chủ nếu đã thay đổi vị trí SQLite.
4. Đăng nhập bằng tài khoản vừa cấp quyền và mở `/admin`. Có thể tìm, thêm, sửa, ẩn sản phẩm, quản lý biến thể/giá/SKU/tồn kho, gán danh mục có sẵn, khóa/mở thành viên, xử lý đơn, và vào `/admin/reviews` để kiểm duyệt.

Quyền quản trị lưu theo ID trong SQLite. Thiết lập `ADMIN_EMAILS` của Sprint 2 đã được thay bằng lệnh cấp quyền ở trên. Hệ thống giữ tài khoản và đánh giá trong SQLite cũ khi chạy trên cùng cơ sở dữ liệu.

Lần khởi động đầu nhập một lần 1.045 sản phẩm và biến thể từ `data/items.json`, đồng thời nạp danh mục từ `data/memberships.json`. Sau nhập, bảng SQLite là nguồn dữ liệu cho API và thay đổi quản trị. Khi sản phẩm được cập nhật, trang chi tiết dùng mẫu động; các khối giới thiệu cũ trên trang chủ vẫn là ảnh chụp giao diện. Dùng trang danh mục để xem danh sách mới nhất.

Đơn COD lưu nội bộ, trừ tồn kho trong giao dịch SQLite và hoàn kho khi admin hủy đơn đang chờ hoặc đã xác nhận. Mức phí mẫu là 35.000₫ cho đơn dưới 999.000₫, miễn phí từ ngưỡng đó. Chưa kết nối hãng vận chuyển, cổng thanh toán hay gửi email khôi phục mật khẩu. Tồn kho ban đầu là dữ liệu khảo sát của repo, nên cần kiểm đếm trước khi vận hành thật.

Chạy `npm run check` và `npm test` để kiểm tra. Sao lưu file SQLite và thư mục ảnh đánh giá định kỳ. Khi triển khai, gắn ổ lưu trữ bền vững cho SQLite và ảnh, chạy một tiến trình Node dùng cơ sở dữ liệu đó, cấu hình HTTPS qua reverse proxy và giữ khóa/bí mật bên ngoài Git.

## Chatbot gợi ý sản phẩm

Bấm **biểu tượng robot** ở góc dưới bên phải trang cửa hàng. Chat tự hiện lời chào và câu hỏi mẫu. Nút đóng ở đầu khung giữ lại hội thoại; **Kết thúc chat** xóa hội thoại và đóng khung. **Nhắn nhân viên qua Zalo** mở kênh liên hệ của cửa hàng. Ví dụ “giày Vans đen size 42 dưới 2 triệu”, “balo đen dưới 1 triệu” hoặc “giày từ 500k đến 1 triệu”. Chat hiển thị tối đa 5 thẻ, ưu tiên giá thấp, kèm ảnh, giá của biến thể khớp, size, màu và liên kết xem sản phẩm.

Chatbot đọc danh mục hiện hành từ máy chủ, chỉ gợi ý sản phẩm đang hiển thị với biến thể còn hàng. Khi nhập nhiều tiêu chí, cùng một biến thể phải đáp ứng giá, size và màu. Nếu không tìm được, chatbot đề nghị đổi tiêu chí. Mỗi tin nhắn xử lý độc lập. Có thể ghép đầy đủ tiêu chí trong cùng câu. Tính năng nhận dạng theo từ khóa tiếng Việt, không cần khóa API AI, và sẽ bị giới hạn bởi dữ liệu màu/size/tên trong danh mục.
