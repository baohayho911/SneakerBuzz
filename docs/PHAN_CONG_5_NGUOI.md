# Phân công cho nhóm 5 người tiếp tục dự án

Khối lượng cần cân theo kiểm thử và độ khó, không chia đơn thuần theo số trang. Cả 5 người cùng đối chiếu ảnh của phần mình và chịu trách nhiệm sửa responsive.

| Người | Phạm vi chính | Mã/tài liệu phụ trách | Tiêu chí bàn giao |
|---|---|---|---|
| 1 | Header, footer, trang chủ, slideshow, menu và tài nguyên chung | `public/__pages/index.html`, CSS/JS theme dùng chung, asset manifest | Đối chiếu ảnh 3 kích thước, menu và slide hoạt động |
| 2 | Danh mục, tìm kiếm, lọc, sắp xếp, phân trang | `catalog()` trong server, `renderCatalog()` trong client, memberships/cards | Đúng số lượng, kết hợp bộ lọc, trạng thái trống và URL |
| 3 | Chi tiết sản phẩm, ảnh, biến thể, tồn kho và thêm hàng | HTML sản phẩm, API JSON sản phẩm, `addProduct()`, dữ liệu sản phẩm | Chọn đúng biến thể, giá, hết hàng và ảnh |
| 4 | Giỏ hàng và luồng checkout sau khi có khảo sát/API | API `/cart/*`, `refreshCart()`, SQLite giỏ, tích hợp đơn hàng | Cập nhật/xóa/giữ phiên, tổng tiền phía server, không gửi vào hệ thống thật |
| 5 | Tài khoản, tin tức, chính sách, cửa hàng, tích hợp và kiểm thử chung | API account/contact, HTML nội dung, store fragments, tests/docs | Đăng ký/đăng nhập, thông báo lỗi, kiểm tra liên kết, tổng hợp giới hạn |

Người 2–5 cùng sửa `server.mjs` hoặc `replica-client.js` phải thống nhất ranh giới hàm/commit trước khi ghép. Không ghi đè file của nhau. Dữ liệu người dùng và secrets không commit. Người 1 và 5 phối hợp kiểm tra hồi quy toàn site; người 2 và 3 hỗ trợ người 5 phần nội dung nếu khối lượng kiểm tra tăng. Danh sách chưa hoàn tất tại `QA.md` là backlog, không được đánh dấu hoàn thành khi chưa có bằng chứng.
