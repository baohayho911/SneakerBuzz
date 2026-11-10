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

POST `/api/recover`, `/api/orders`, `/api/integration-disabled` trả 424 và nêu cấu hình còn thiếu. Chưa gửi thư khôi phục, chưa tạo đơn hàng hay giao dịch thanh toán. Không có trang quản trị bổ sung.

Để hoàn thiện phần còn thiếu cần: ảnh/video hoặc quyền quan sát hợp lệ của checkout, giỏ hàng có hàng, trang tài khoản/đơn hàng; hợp đồng API và thông tin cấu hình nhà cung cấp email, đơn hàng, vận chuyển, thanh toán. Không gửi khóa bí mật trong mã nguồn hoặc báo cáo.

Logo, ảnh, font và nội dung giữ nguồn công khai đã khảo sát; việc truy cập công khai không chứng minh quyền cấp phép tái xuất bản. Cần xác nhận quyền sử dụng của chủ sở hữu trước khi phát hành thương mại.
