# Kết quả kiểm tra và giới hạn

## Phạm vi khôi phục

Bản mã nguồn trước khi gián đoạn và ZIP cũ không còn sau khi môi trường bị dọn. Dữ liệu khảo sát, HTML và tài nguyên trong cache còn nguyên đã được tận dụng. Máy chủ, lớp nối API và bộ kiểm thử được viết khôi phục trong lần tiếp tục này; không tuyên bố giữ nguyên từng byte mã nguồn đã mất.

Đã phục hồi 1.045 sản phẩm, 1.045 thẻ sản phẩm, 65 đường dẫn danh mục (bao gồm danh mục trống), 1.580 HTML có cả trang phân trang, 1.292 tệp tài nguyên nguồn. Trang 404 bổ sung dựa trên nội dung lỗi quan sát trước đó, dùng bố cục chung. Bốn đường dẫn nguồn đã quan sát lỗi: `/blogs/news/news`, `/collections/palladium`, `/pages/h`, `/products/giay-vans-mn-skate-half-cab-1`; bản tái tạo tiếp tục trả HTTP 404.

Chín trang sản phẩm dùng HTML thu hồi qua DOM trình duyệt, có độ chắc chắn thấp hơn về trạng thái động sau khi khởi tạo: non-kangol-washed-baseball-cordova-165ht, non-kangol-washed-bucket-blac-224ht, non-kangol-tropic-507-blac-915bc, non-kangol-washed-bucket-khak-224ht, tui-kangol-shoulder-bag-blac-70620, giay-vans-slip-on-white, giay-vans-slip-on-black, giay-vans-slip-on-checkerbroad, tui-kangol-shoulder-bag-blac-70820.

## Kiểm thử tự động

`npm test` chạy 14 nhóm trên tiến trình Node thật và cơ sở dữ liệu tạm: trang chủ và theme, đủ 1.045 sản phẩm/Vans 56, tìm kiếm/sắp xếp/phân trang/lọc/thẻ gốc, phiên và giỏ trống, giá và cập nhật giỏ phía server, biến thể hết hàng/số lượng không hợp lệ, cách ly phiên, chặn mutation từ origin khác, đăng ký/hash/đổi phiên/giữ giỏ, đăng nhập/đăng xuất/email trùng, lưu nhận tin, thông báo tích hợp thiếu, xóa dòng cuối, HTTP 404 và chặn đường dẫn vượt thư mục. Kết quả chi tiết tại `api-tests.log`.

Kiểm tra cú pháp máy chủ và hai script riêng bằng `npm run check`. Tệp ZIP kiểm tra CRC và đối chiếu mã máy chủ/client/test với bản đã thử.

## Kiểm tra trình duyệt lần khôi phục

Đã mở bản chạy thật trên desktop, quan sát carousel trang chủ và sửa lỗi thiếu Waypoint sau khi đổi URL tài nguyên. Sau sửa thấy 5 vùng carousel được khởi tạo. Đã thao tác sắp xếp giá tăng ở Vans: 24 sản phẩm, sản phẩm đầu là Vớ Vans W Check Canoodles, URL cập nhật `sort_by=price-asc`. Đã mở trang Áo Paul Frank Long Sleeve T-Shirt White, nhấn Mua ngay, mở giỏ và thấy biến thể S / White / 47%Cotton/47%Rayon/6%Spandex với giá 800.000đ.

Đã xem bản tái tạo trong iframe rộng 390 và 768 px: header chuyển sang menu nhỏ, banner và lưới danh mục thay đổi theo CSS nguồn. Đây là kiểm tra khung nội dung, KHÔNG phải phép đối chiếu trực tiếp website gốc trên điện thoại/tablet. API trình duyệt không cung cấp thay đổi viewport thật trong phiên này. Chưa đo tràn ngang toàn bộ các trang ở mọi kích thước.

Ảnh `screenshots/original-home.jpg` và `replica-home.jpg` cùng kích thước desktop, ở đầu trang. Header, menu, chiều cao banner và vị trí các khu vực được xem đối chiếu; slide tự chạy, GIF và dải logo đang ở thời điểm khác nhau nên hai ảnh KHÔNG cùng trạng thái. Không dùng ảnh này để tính tỷ lệ giống hoặc sai khác pixel. Chưa có bộ ảnh đủ mọi trang/trạng thái.

## Chưa hoàn tất

- Chưa tái tạo/đối chiếu được luồng checkout, vận chuyển, mã giảm giá áp dụng vào đơn, đặt hàng và thanh toán hoàn chỉnh. Chưa có API nhà cung cấp. Không gọi hệ thống giao dịch thật.
- Đăng ký/đăng nhập dùng cơ sở dữ liệu riêng. Chưa khảo sát phần tài khoản riêng, lịch sử đơn, tra cứu đơn và nội dung loyalty yêu cầu đăng nhập. Không có dữ liệu khách hàng gốc.
- Khôi phục mật khẩu chưa có email provider. Nhận tin chỉ lưu email cục bộ, không gửi vào mailing list thật.
- Giao diện giỏ có sản phẩm/mini-cart, thông báo lỗi và kết quả tìm kiếm động được nối lại để hoạt động; chưa đủ bằng chứng để khẳng định giống giao diện gốc ở các trạng thái này.
- Telemetry, CAPTCHA, game khuyến mãi, widget chat và API quảng cáo ngoài chưa được tái tạo. Một số điều khiển phụ thuộc chúng có thể chưa hoạt động. Riêng Zalo nổi chưa xuất hiện như bản gốc.
- Không thu thập được toàn bộ ảnh ở mọi kích cỡ. `capture.json` liệt kê chính xác các URL chưa đóng gói; một số URL còn gọi CDN công khai. Không dùng ảnh thay thế ngẫu nhiên, nhưng cũng chưa bảo đảm chạy hoàn toàn offline hay không còn ảnh lỗi.
- Chưa kiểm tra toàn bộ từng nút, menu, bài viết, liên kết và console trên 1.580 URL. Không có phép đo pixel hay chứng cứ “giống 100%”.
- Chưa xuất bản website công khai; đây là mã chạy riêng bằng Node.js, không phải một bản triển khai trực tuyến đã xác minh.

Muốn hoàn thiện các phần chưa quan sát: cung cấp ảnh/video checkout, giỏ có hàng và tài khoản/đơn hàng ở desktop/tablet/điện thoại, cùng API/config cho các dịch vụ cần tích hợp. Giữ dữ liệu cá nhân và bí mật ngoài bản ghi hình và mã nguồn chia sẻ.
