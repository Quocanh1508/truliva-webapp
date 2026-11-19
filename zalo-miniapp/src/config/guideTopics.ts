// Nội dung hướng dẫn sử dụng Mini App. Mỗi bước trỏ tới phần tử có thuộc tính data-tour="<target>".
// Bước nào không tìm thấy phần tử (vd. khách chưa có máy thì không có khung chia sẻ) sẽ tự bỏ qua.
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
  homeDevice: { target: 'home-device', tab: 'home', title: 'Máy lọc nước của bạn', text: 'Xem độ sạch của nước (chỉ số TDS) và tuổi thọ từng lõi lọc. Có nhiều máy thì chọn máy ở hàng nút phía trên. Chưa thấy máy? Nhấn "Quét mã" để kích hoạt bảo hành.' },
  homeShare: { target: 'home-share', tab: 'home', title: 'Chia sẻ máy cho người nhà', text: 'Thêm số điện thoại người thân để họ cũng xem được tình trạng máy trên Zalo của mình.' },
  homeWarranty: { target: 'home-warranty', tab: 'home', title: 'Kích hoạt bảo hành', text: 'Kích hoạt và tra cứu bảo hành điện tử bằng số serial in trên thân máy.' },
  homeHotline: { target: 'home-hotline', tab: 'home', title: 'Gọi tổng đài', text: 'Cần hỗ trợ kỹ thuật? Nhấn để gọi ngay 1900 63 84 63.' },
  homeShop: { target: 'home-shop', tab: 'home', title: shopLabel, text: 'Xem các dòng máy lọc nước, lõi lọc và thông số của từng máy.' },
  homeNews: { target: 'home-news', tab: 'home', title: 'Tin tức & Cẩm nang', text: 'Mẹo dùng máy, lịch thay lõi và kiến thức về nước sạch.' },
  navHome: { target: 'nav-home', tab: 'home', title: 'Trang chủ', text: 'Nhấn để quay về màn hình chính bất cứ lúc nào.' },
  navShop: { target: 'nav-shop', tab: 'home', title: shopLabel, text: 'Danh mục máy lọc nước, lõi lọc và sản phẩm bếp của Truliva.' },
  navOa: { target: 'nav-oa', tab: 'home', title: 'Tư vấn qua Zalo', text: 'Nhắn tin trực tiếp với nhân viên Truliva qua Zalo Official Account.' },
  navProfile: { target: 'nav-profile', tab: 'home', title: 'Cá nhân', text: 'Thông tin tài khoản, danh sách máy và lịch sử bảo trì.' },
  shopCategories: { target: 'shop-categories', tab: 'shop', title: 'Chọn danh mục', text: 'Chuyển giữa Máy lọc nước, Lõi lọc và Sản phẩm bếp.' },
  shopSearch: { target: 'shop-search', tab: 'shop', title: 'Tìm sản phẩm', text: 'Gõ tên máy hoặc mã lõi lọc để tìm nhanh.' },
  shopList: { target: 'shop-list', tab: 'shop', title: 'Xem chi tiết', text: 'Nhấn vào một sản phẩm để xem thông số và hướng dẫn sử dụng.' },
  profileDevices: { target: 'profile-devices', tab: 'profile', title: 'Máy lọc nước của tôi', text: 'Tất cả máy đứng tên bạn, kèm số serial và hạn bảo hành. Nhấn "Làm mới" nếu vừa kích hoạt máy mới.' },
  profileHistory: { target: 'profile-history', tab: 'profile', title: 'Lịch sử bảo trì & thay lõi', text: 'Xem lại các lần kỹ thuật viên lắp đặt, bảo trì và thay lõi cho máy của bạn.' },
  profileLegal: { target: 'profile-legal', tab: 'profile', title: 'Chính sách & điều khoản', text: 'Điều khoản sử dụng, chính sách bảo mật và đổi trả của Truliva.' },
} satisfies Record<string, GuideStep>;

export const GUIDE_TOPICS: GuideTopic[] = [
  { id: 'device', title: 'Theo dõi máy lọc nước', desc: 'Chỉ số nước, lõi lọc, chia sẻ cho người nhà', steps: [S.homeDevice, S.homeShare, S.profileDevices] },
  { id: 'warranty', title: 'Bảo hành & bảo trì', desc: 'Kích hoạt bảo hành, xem lịch sử thay lõi', steps: [S.homeWarranty, S.profileHistory] },
  { id: 'support', title: 'Liên hệ hỗ trợ', desc: 'Gọi tổng đài hoặc chat với Truliva', steps: [S.homeHotline, S.navOa] },
  { id: 'shop', title: `Xem ${shopLabel.toLowerCase()}`, desc: 'Tìm và xem thông tin sản phẩm', steps: [S.homeShop, S.shopCategories, S.shopSearch, S.shopList] },
  { id: 'nav', title: 'Các mục trong ứng dụng', desc: 'Thanh điều hướng, tin tức, chính sách', steps: [S.navHome, S.navShop, S.navOa, S.navProfile, S.homeNews, S.profileLegal] },
];

// Tour đầy đủ cho lần đăng nhập đầu: giữ ngắn, chỉ những gì khách dùng nhiều nhất
export const FIRST_TOUR: GuideStep[] = [
  S.homeDevice, S.homeShare, S.homeWarranty, S.homeHotline,
  S.navShop, S.navOa, S.navProfile, S.profileHistory,
];
