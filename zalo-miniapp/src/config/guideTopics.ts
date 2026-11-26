// Nội dung hướng dẫn sử dụng Mini App. Mỗi bước trỏ tới phần tử có thuộc tính data-tour="<target>".
// Bước nào không tìm thấy phần tử (vd. khách chưa có máy thì không có thẻ máy) sẽ tự bỏ qua.
import type { MainTabType } from '../components/BottomNavBar';
import { FEATURES } from './features';

export interface GuideStep {
  target: string;
  tab: MainTabType;
  title: string;
  text: string;
}

export interface GuideTopic {
  id: string;
  title: string;
  desc: string;
  steps: GuideStep[];
}

const shopLabel = FEATURES.ENABLE_ECOMMERCE ? 'Cửa hàng' : 'Sản phẩm';

const S = {
  // Chưa có máy
  homeScan: { target: 'home-scan', tab: 'home', title: 'Thêm máy lọc nước', text: 'Chưa thấy máy của bạn? Nhấn "Kích hoạt" và nhập số Serial trên thân máy để kích hoạt bảo hành điện tử. Máy sẽ tự động hiển thị ở đây sau khi kích hoạt.' },
  // Thẻ máy (chỉ có khi khách đã có máy)
  homePicker: { target: 'home-device-picker', tab: 'home', title: 'Chọn máy', text: 'Bạn có nhiều máy? Nhấn vào tên máy để xem thông tin của máy đó.' },
  deviceTabs: { target: 'device-tabs', tab: 'home', title: 'Máy của tôi & Cài đặt Wi-Fi', text: '"Máy của tôi" hiện tình trạng nước và lõi lọc. "Cài đặt Wi-Fi" để xem hoặc kết nối lại mạng cho máy.' },
  deviceInfo: { target: 'device-info', tab: 'home', title: 'Bảo hành & số serial', text: 'Bên trái là hạn bảo hành của máy. Bên phải là số serial, nhấn biểu tượng bên cạnh để sao chép khi cần báo cho Truliva.' },
  deviceStatus: { target: 'device-status', tab: 'home', title: 'Trạng thái kết nối', text: 'Chấm xanh là máy đang gửi dữ liệu qua Wi-Fi, kèm giờ cập nhật gần nhất. Chấm xám là máy chưa kết nối nên số liệu có thể chưa mới.' },
  deviceWater: { target: 'device-water', tab: 'home', title: 'Chất lượng nước', text: 'TDS là lượng chất hoà tan trong nước sau lọc, số càng thấp nước càng tinh khiết. Bên dưới là phần trăm tuổi thọ còn lại của lõi RO.' },
  deviceFilters: { target: 'device-filters', tab: 'home', title: 'Tuổi thọ từng lõi lọc', text: 'Mỗi lõi có thanh phần trăm và chu kỳ thay gợi ý. Khi lõi báo cần thay, hãy gọi Truliva hoặc nhấn "Yêu cầu KTV".' },
  deviceWarranty: { target: 'device-warranty', tab: 'home', title: 'Bảo hành của máy', text: 'Xem hoặc kích hoạt bảo hành điện tử cho đúng máy này.' },
  deviceWifi: { target: 'device-wifi', tab: 'home', title: 'Cài đặt lại Wi-Fi', text: 'Dùng khi nhà bạn đổi mạng hoặc mật khẩu Wi-Fi, hoặc máy báo mất kết nối. Ứng dụng sẽ hướng dẫn từng bước.' },
  deviceKtv: { target: 'device-ktv', tab: 'home', title: 'Yêu cầu kỹ thuật viên', text: 'Cần thay lõi, máy rò nước hay chạy bất thường? Nhấn để Truliva cử kỹ thuật viên đến hỗ trợ.' },
  homeShare: { target: 'home-share', tab: 'home', title: 'Chia sẻ máy cho người nhà', text: 'Nhập số điện thoại người thân để họ cũng xem được tình trạng máy trên Zalo của mình. Họ không xem được địa chỉ hay đơn hàng của bạn.' },
  // Trang chủ
  homeWarranty: { target: 'home-warranty', tab: 'home', title: 'Kích hoạt bảo hành', text: 'Kích hoạt và tra cứu bảo hành điện tử bằng số serial in trên thân máy.' },
  homeHotline: { target: 'home-hotline', tab: 'home', title: 'Gọi tổng đài', text: 'Cần hỗ trợ kỹ thuật? Nhấn để gọi ngay 1900 63 84 63.' },
  homeShop: { target: 'home-shop', tab: 'home', title: shopLabel, text: 'Xem các dòng máy lọc nước, lõi lọc và thông số của từng máy.' },
  homeNews: { target: 'home-news', tab: 'home', title: 'Tin tức & Cẩm nang', text: 'Mẹo dùng máy, lịch thay lõi và kiến thức về nước sạch.' },
  // Thanh điều hướng
  navHome: { target: 'nav-home', tab: 'home', title: 'Trang chủ', text: 'Nhấn để quay về màn hình chính bất cứ lúc nào.' },
  navShop: { target: 'nav-shop', tab: 'home', title: shopLabel, text: 'Danh mục máy lọc nước, lõi lọc và sản phẩm bếp của Truliva.' },
  navOa: { target: 'nav-oa', tab: 'home', title: 'Tư vấn qua Zalo', text: 'Nhắn tin trực tiếp với nhân viên Truliva qua Zalo Official Account.' },
  navProfile: { target: 'nav-profile', tab: 'home', title: 'Cá nhân', text: 'Thông tin tài khoản, danh sách máy và lịch sử bảo trì.' },
  // Sản phẩm
  shopCategories: { target: 'shop-categories', tab: 'shop', title: 'Chọn danh mục', text: 'Chuyển giữa Máy lọc nước, Lõi lọc và Sản phẩm bếp.' },
  shopSearch: { target: 'shop-search', tab: 'shop', title: 'Tìm sản phẩm', text: 'Gõ tên máy hoặc mã lõi lọc để tìm nhanh.' },
  shopList: { target: 'shop-list', tab: 'shop', title: 'Xem chi tiết', text: 'Nhấn vào một sản phẩm để xem thông số và hướng dẫn sử dụng.' },
  // Cá nhân
  profileDevices: { target: 'profile-devices', tab: 'profile', title: 'Tất cả máy của bạn', text: 'Kéo xuống dưới mục này để xem mọi máy đứng tên bạn, kèm số serial, hạn bảo hành và chỉ số của từng máy.' },
  profileHistory: { target: 'profile-history', tab: 'profile', title: 'Lịch sử bảo trì & thay lõi', text: 'Xem lại các lần kỹ thuật viên lắp đặt, bảo trì và thay lõi cho máy của bạn.' },
  profileLegal: { target: 'profile-legal', tab: 'profile', title: 'Chính sách & điều khoản', text: 'Điều khoản sử dụng, chính sách bảo mật và đổi trả của Truliva.' },
} satisfies Record<string, GuideStep>;

export const GUIDE_TOPICS: GuideTopic[] = [
  {
    id: 'device', title: 'Theo dõi máy lọc nước', desc: 'Chỉ số nước, lõi lọc, Wi-Fi, chia sẻ cho người nhà',
    steps: [S.homeScan, S.homePicker, S.deviceTabs, S.deviceInfo, S.deviceStatus, S.deviceWater, S.deviceFilters, S.deviceWifi, S.homeShare, S.profileDevices],
  },
  { id: 'warranty', title: 'Bảo hành & bảo trì', desc: 'Kích hoạt bảo hành, gọi kỹ thuật viên, lịch sử thay lõi', steps: [S.homeWarranty, S.deviceWarranty, S.deviceKtv, S.profileHistory] },
  { id: 'support', title: 'Liên hệ hỗ trợ', desc: 'Gọi tổng đài, gọi kỹ thuật viên, chat với Truliva', steps: [S.homeHotline, S.deviceKtv, S.navOa] },
  { id: 'shop', title: `Xem ${shopLabel.toLowerCase()}`, desc: 'Tìm và xem thông tin sản phẩm', steps: [S.homeShop, S.shopCategories, S.shopSearch, S.shopList] },
  { id: 'nav', title: 'Các mục trong ứng dụng', desc: 'Thanh điều hướng, tin tức, chính sách', steps: [S.navHome, S.navShop, S.navOa, S.navProfile, S.homeNews, S.profileLegal] },
];

// Tour lần đăng nhập đầu: những gì khách dùng nhiều nhất
export const FIRST_TOUR: GuideStep[] = [
  S.homeScan, S.homePicker, S.deviceStatus, S.deviceWater, S.deviceFilters, S.deviceKtv, S.homeShare,
  S.homeWarranty, S.homeHotline, S.navShop, S.navOa, S.navProfile, S.profileHistory,
];
