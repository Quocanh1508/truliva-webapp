import { removeVietnameseTones } from './text';

export interface WeatherInfo {
  temperature: number;
  apparentTemperature?: number; // Cảm nhận thực tế (Feels like °C)
  humidity?: number;            // Độ ẩm %
  precipitation?: number;       // Lượng mưa thực tế (mm)
  rain?: number;                // Lượng mưa rào (mm)
  showers?: number;             // Lượng mưa bóng mây (mm)
  windSpeed?: number;           // Tốc độ gió (km/h)
  weatherCode: number;
  text: string;
  icon: string;
  locationName: string;
  timestamp: number;
}

// Bảng giải mã thời tiết WMO mở rộng và tối ưu cho khí hậu nhiệt đới Việt Nam
export function interpretWeatherCode(code: number, isRain = false, precipitation = 0): { text: string; icon: string } {
  // Nếu có đo được lượng mưa thực tế nhưng mã WMO chưa kịp chuyển
  if (precipitation >= 5) {
    return { text: 'Mưa lớn', icon: '🌧️' };
  }
  if (precipitation > 0.1 || isRain) {
    return { text: 'Có mưa rào', icon: '🌧️' };
  }

  switch (code) {
    case 0:
      return { text: 'Trời quang', icon: '☀️' };
    case 1:
      return { text: 'Ít mây / Nắng nhẹ', icon: '🌤️' };
    case 2:
      return { text: 'Nhiều mây', icon: '⛅' };
    case 3:
      return { text: 'U ám', icon: '☁️' };
    case 45:
    case 48:
      return { text: 'Có sương mù', icon: '🌫️' };
    case 51:
    case 53:
      return { text: 'Mưa phùn nhẹ', icon: '🌧️' };
    case 55:
    case 56:
    case 57:
      return { text: 'Mưa phùn dày hạt', icon: '🌧️' };
    case 61:
      return { text: 'Mưa rào nhẹ', icon: '🌧️' };
    case 63:
      return { text: 'Mưa rào', icon: '🌧️' };
    case 65:
    case 66:
    case 67:
      return { text: 'Mưa to diện rộng', icon: '🌧️' };
    case 71:
    case 73:
    case 75:
    case 77:
      return { text: 'Tuyết rơi', icon: '❄️' };
    case 80:
      return { text: 'Mưa rào rải rác', icon: '🌧️' };
    case 81:
    case 82:
      return { text: 'Mưa rào rất lớn', icon: '🌧️' };
    case 85:
    case 86:
      return { text: 'Tuyết rơi lớn', icon: '❄️' };
    case 95:
      return { text: 'Có dông sét', icon: '⛈️' };
    case 96:
    case 99:
      return { text: 'Dông bão kèm sét', icon: '⛈️' };
    default:
      return { text: 'Nhiều mây', icon: '🌤️' };
  }
}

// Từ điển tọa độ 63 Tỉnh/Thành phố & Quận Huyện trọng điểm Việt Nam
interface LocationDictionaryEntry {
  keywords: string[];
  name: string;
  lat: number;
  lon: number;
}

const VIETNAM_LOCATIONS: LocationDictionaryEntry[] = [
  // ── ĐẶC BIỆT: CÁC QUẬN/HUYỆN TP. HỒ CHÍ MINH & TP. THỦ ĐỨC ──
  { keywords: ['thu duc', 'quan 9', 'quan 2', 'tp thu duc', 'hiep phu', 'linh trung', 'tang nhon phu'], name: 'TP. Thủ Đức', lat: 10.8494, lon: 106.7719 },
  { keywords: ['go vap'], name: 'Gò Vấp (TP.HCM)', lat: 10.8387, lon: 106.6653 },
  { keywords: ['binh thanh'], name: 'Bình Thạnh (TP.HCM)', lat: 10.8105, lon: 106.7091 },
  { keywords: ['tan binh'], name: 'Tân Bình (TP.HCM)', lat: 10.8014, lon: 106.6526 },
  { keywords: ['tan phu'], name: 'Tân Phú (TP.HCM)', lat: 10.7900, lon: 106.6280 },
  { keywords: ['binh tan'], name: 'Bình Tân (TP.HCM)', lat: 10.7485, lon: 106.6022 },
  { keywords: ['quan 7', 'phu my hung', 'nha be'], name: 'Quận 7 (TP.HCM)', lat: 10.7340, lon: 106.7218 },
  { keywords: ['quan 12', 'hoc mon', 'an phu dong'], name: 'Quận 12 (TP.HCM)', lat: 10.8671, lon: 106.6413 },
  { keywords: ['binh chanh'], name: 'Bình Chánh (TP.HCM)', lat: 10.6873, lon: 106.5938 },
  { keywords: ['cu chi'], name: 'Củ Chi (TP.HCM)', lat: 11.0067, lon: 106.4947 },
  { keywords: ['can gio'], name: 'Cần Giờ (TP.HCM)', lat: 10.4114, lon: 106.9547 },
  { keywords: ['ho chi minh', 'tphcm', 'hcm', 'sai gon', 'quan 1', 'quan 3', 'quan 5', 'quan 10'], name: 'TP. Hồ Chí Minh', lat: 10.7626, lon: 106.6602 },

  // ── ĐÔNG NAM BỘ ──
  { keywords: ['bien hoa', 'dong nai', 'long thanh', 'nhon trach', 'trang bom', 'vinh cuu', 'dinh quan', 'xuan loc'], name: 'Đồng Nai', lat: 10.9574, lon: 106.8427 },
  { keywords: ['binh duong', 'thu dau mot', 'di an', 'thuan an', 'ben cat', 'tan uyen', 'bau bang', 'bac tan uyen'], name: 'Bình Dương', lat: 10.9804, lon: 106.6519 },
  { keywords: ['vung tau', 'ba ria', 'phu my', 'chau duc', 'long dien', 'dat do', 'xuyen moc', 'brvt'], name: 'Bà Rịa - Vũng Tàu', lat: 10.3460, lon: 107.0843 },
  { keywords: ['tay ninh', 'trang bang', 'hoa thanh', 'go dau', 'tan chau'], name: 'Tây Ninh', lat: 11.3100, lon: 106.0989 },
  { keywords: ['binh phuoc', 'dong xoai', 'chon thanh', 'binh long', 'phuoc long'], name: 'Bình Phước', lat: 11.7511, lon: 106.9067 },

  // ── TÂY NAM BỘ (ĐỒNG BẰNG SÔNG CỬU LONG) ──
  { keywords: ['can tho', 'ninh kieu', 'cai rang', 'binh thuy', 'o mon', 'thot not'], name: 'Cần Thơ', lat: 10.0452, lon: 105.7469 },
  { keywords: ['long an', 'tan an', 'duc hoa', 'ben luc', 'can giuoc', 'can duoc'], name: 'Long An', lat: 10.5361, lon: 106.4109 },
  { keywords: ['tien giang', 'my tho', 'go cong', 'cai lay'], name: 'Tiền Giang', lat: 10.4493, lon: 106.3421 },
  { keywords: ['ben tre', 'ba tri', 'binh dai', 'chau thanh'], name: 'Bến Tre', lat: 10.2433, lon: 106.3756 },
  { keywords: ['vinh long', 'binh minh', 'mang thit'], name: 'Vĩnh Long', lat: 10.2537, lon: 105.9722 },
  { keywords: ['tra vinh', 'duyen hai', 'cau ngang'], name: 'Trà Vinh', lat: 9.9347, lon: 106.3455 },
  { keywords: ['an giang', 'long xuyen', 'chau doc', 'tan chau', 'tinh bien'], name: 'An Giang', lat: 10.3871, lon: 105.4217 },
  { keywords: ['kien giang', 'rach gia', 'phu quoc', 'ha tien'], name: 'Kiên Giang', lat: 10.0125, lon: 105.0809 },
  { keywords: ['dong thap', 'cao lanh', 'sa dec', 'hong ngu'], name: 'Đồng Tháp', lat: 10.4604, lon: 105.6331 },
  { keywords: ['hau giang', 'vi thanh', 'nga bay'], name: 'Hậu Giang', lat: 9.7844, lon: 105.4701 },
  { keywords: ['soc trang', 'nga nam', 'vinh chau'], name: 'Sóc Trăng', lat: 9.6033, lon: 105.9800 },
  { keywords: ['bac lieu', 'gia rai', 'hong dan'], name: 'Bạc Liêu', lat: 9.2941, lon: 105.7278 },
  { keywords: ['ca mau', 'nam can', 'u minh', 'phu tan'], name: 'Cà Mau', lat: 9.1769, lon: 105.1524 },

  // ── MIỀN TRUNG & TÂY NGUYÊN ──
  { keywords: ['da nang', 'hai chau', 'son tra', 'ngu hanh son', 'lien chieu', 'cam le', 'hoa vang', 'dn'], name: 'Đà Nẵng', lat: 16.0544, lon: 108.2022 },
  { keywords: ['thua thien hue', 'hue', 'huong thuy', 'huong tra'], name: 'Thừa Thiên Huế', lat: 16.4637, lon: 107.5909 },
  { keywords: ['quang nam', 'tam ky', 'hoi an', 'dien ban'], name: 'Quảng Nam', lat: 15.5658, lon: 108.4816 },
  { keywords: ['quang ngai', 'duc pho', 'binh son'], name: 'Quảng Ngãi', lat: 15.1205, lon: 108.7923 },
  { keywords: ['binh dinh', 'quy nhon', 'an nhon', 'hoai nhon'], name: 'Bình Định', lat: 13.7820, lon: 109.2197 },
  { keywords: ['phu yen', 'tuy hoa', 'song cau', 'dong hoa'], name: 'Phú Yên', lat: 13.0882, lon: 109.3146 },
  { keywords: ['khanh hoa', 'nha trang', 'cam ranh', 'ninh hoa', 'van ninh'], name: 'Khánh Hòa', lat: 12.2388, lon: 109.1967 },
  { keywords: ['ninh thuan', 'phan rang', 'thap cham'], name: 'Ninh Thuận', lat: 11.5647, lon: 108.9882 },
  { keywords: ['binh thuan', 'phan thiet', 'la gi', 'ham thuan'], name: 'Bình Thuận', lat: 10.9333, lon: 108.1000 },
  { keywords: ['lam dong', 'da lat', 'bao loc', 'duc trong', 'don duong'], name: 'Lâm Đồng', lat: 11.9404, lon: 108.4583 },
  { keywords: ['dak lak', 'dac lac', 'buon ma thuot', 'bmt', 'cu mgar', 'krong pak'], name: 'Đắk Lắk', lat: 12.6675, lon: 108.0383 },
  { keywords: ['gia lai', 'pleiku', 'an khe', 'ayun pa'], name: 'Gia Lai', lat: 13.9833, lon: 108.0000 },
  { keywords: ['kon tum', 'dak ha', 'ngoc hoi'], name: 'Kon Tum', lat: 14.3500, lon: 108.0000 },
  { keywords: ['dak nong', 'dac nong', 'gia nghia'], name: 'Đắk Nông', lat: 12.0031, lon: 107.6908 },
  { keywords: ['quang tri', 'dong ha', 'quang tri'], name: 'Quảng Trị', lat: 16.8167, lon: 107.1000 },
  { keywords: ['quang binh', 'dong hoi', 'ba don'], name: 'Quảng Bình', lat: 17.4833, lon: 106.6000 },
  { keywords: ['ha tinh', 'ky anh', 'hong linh'], name: 'Hà Tĩnh', lat: 18.3333, lon: 105.9000 },
  { keywords: ['nghe an', 'vinh', 'cua lo', 'thai hoa', 'hoang mai'], name: 'Nghệ An', lat: 18.6667, lon: 105.6667 },
  { keywords: ['thanh hoa', 'sam son', 'bim son', 'nghi son'], name: 'Thanh Hóa', lat: 19.8000, lon: 105.7667 },

  // ── MIỀN BẮC ──
  { keywords: ['ha noi', 'hn', 'cau giay', 'dong da', 'ba dinh', 'hoan kiem', 'ha dong', 'nam tu liem', 'bac tu liem', 'thanh xuan', 'tay ho', 'hoang mai', 'long bien'], name: 'Hà Nội', lat: 21.0285, lon: 105.8048 },
  { keywords: ['hai phong', 'ngo quyen', 'le chan', 'hong bang', 'hai an', 'do son', 'thuy nguyen'], name: 'Hải Phòng', lat: 20.8449, lon: 106.6881 },
  { keywords: ['quang ninh', 'ha long', 'cam pha', 'mong cai', 'uong bi', 'dong trieu'], name: 'Quảng Ninh', lat: 20.9500, lon: 107.0833 },
  { keywords: ['bac ninh', 'tu son', 'yen phong', 'que vo', 'thuan thanh'], name: 'Bắc Ninh', lat: 21.1861, lon: 106.0763 },
  { keywords: ['bac giang', 'viet yen', 'hiep hoa', 'lang giang'], name: 'Bắc Giang', lat: 21.2731, lon: 106.1946 },
  { keywords: ['hai duong', 'chi linh', 'kinh mon'], name: 'Hải Dương', lat: 20.9409, lon: 106.3331 },
  { keywords: ['hung yen', 'my hao', 'van giang', 'yen my'], name: 'Hưng Yên', lat: 20.6500, lon: 106.0500 },
  { keywords: ['thai nguyen', 'song cong', 'pho yen'], name: 'Thái Nguyên', lat: 21.5928, lon: 105.8442 },
  { keywords: ['vinh phuc', 'vinh yen', 'phuc yen'], name: 'Vĩnh Phúc', lat: 21.3089, lon: 105.6049 },
  { keywords: ['phu tho', 'viet tri', 'phu tho'], name: 'Phú Thọ', lat: 21.3228, lon: 105.4019 },
  { keywords: ['ninh binh', 'tam diep', 'hoa lu'], name: 'Ninh Bình', lat: 20.2500, lon: 105.9667 },
  { keywords: ['nam dinh', 'y yen', 'hai hau'], name: 'Nam Định', lat: 20.4167, lon: 106.1667 },
  { keywords: ['thai binh', 'tien hai', 'dong hung'], name: 'Thái Bình', lat: 20.4500, lon: 106.3333 },
  { keywords: ['ha nam', 'phu ly', 'duy tien'], name: 'Hà Nam', lat: 20.5333, lon: 105.9167 },
  { keywords: ['hoa binh', 'luong son', 'mai chau'], name: 'Hòa Bình', lat: 20.8167, lon: 105.3333 },
  { keywords: ['lao cai', 'sa pa', 'bac ha'], name: 'Lào Cai', lat: 22.4833, lon: 103.9667 },
  { keywords: ['lang son', 'dong dang', 'huu lung'], name: 'Lạng Sơn', lat: 21.8500, lon: 106.7500 },
  { keywords: ['tuyen quang'], name: 'Tuyên Quang', lat: 21.8167, lon: 105.2167 },
  { keywords: ['ha giang', 'dong van', 'meo vac'], name: 'Hà Giang', lat: 22.8167, lon: 104.9833 },
  { keywords: ['cao bang'], name: 'Cao Bằng', lat: 22.6667, lon: 106.2500 },
  { keywords: ['bac kan'], name: 'Bắc Kạn', lat: 22.1469, lon: 105.8344 },
  { keywords: ['yen bai', 'nghia lo'], name: 'Yên Bái', lat: 21.7000, lon: 104.8667 },
  { keywords: ['son la', 'moc chau'], name: 'Sơn La', lat: 21.3167, lon: 103.9167 },
  { keywords: ['dien bien', 'dien bien phu'], name: 'Điện Biên', lat: 21.3833, lon: 103.0167 },
  { keywords: ['lai chau'], name: 'Lai Châu', lat: 22.4000, lon: 103.4667 }
];

// Hàm tìm kiếm địa phương chính xác nhất theo chuỗi văn bản (Tên trạm / Địa chỉ đơn hàng)
export function matchVietnamLocation(textHint?: string): LocationDictionaryEntry | null {
  if (!textHint || !textHint.trim()) return null;
  const clean = removeVietnameseTones(textHint.toLowerCase())
    .replace(/[,\.\-\/\\_\(\)]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Quét theo thứ tự ưu tiên trong từ điển
  for (const entry of VIETNAM_LOCATIONS) {
    for (const kw of entry.keywords) {
      const cleanKw = removeVietnameseTones(kw.toLowerCase());
      // So khớp từ khóa nguyên cụm (boundary hoặc substring hợp lệ)
      const regex = new RegExp(`(^|\\s)${cleanKw}(\\s|$)`, 'i');
      if (regex.test(clean) || clean.includes(cleanKw)) {
        return entry;
      }
    }
  }
  return null;
}

interface Coordinates {
  latitude: number;
  longitude: number;
  city: string;
}

// Lấy vị trí ưu tiên: 1. GPS thực tế -> 2. Tên Trạm/Địa chỉ đơn hàng -> 3. IP Geolocation -> 4. TP.HCM/Hà Nội
async function getCoordinates(stationName?: string, addressHint?: string): Promise<Coordinates> {
  // 1. Kiểm tra GPS thực tế nếu KTV cho phép truy cập
  if (typeof navigator !== 'undefined' && navigator.geolocation) {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 3000, // Timeout 3s để không làm trễ giao diện
          maximumAge: 300000 // 5 phút cache vị trí GPS
        });
      });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        city: 'Vị trí hiện tại'
      };
    } catch {
      // Bỏ qua lỗi GPS để chuyển ngay sang tầng định vị Trạm/Địa chỉ
    }
  }

  // 2. Định vị thông minh theo Tên Trạm / Địa chỉ đơn hàng (Smart Station & Address Mapping)
  const matchedFromStation = matchVietnamLocation(stationName);
  if (matchedFromStation) {
    return {
      latitude: matchedFromStation.lat,
      longitude: matchedFromStation.lon,
      city: matchedFromStation.name
    };
  }

  const matchedFromAddress = matchVietnamLocation(addressHint);
  if (matchedFromAddress) {
    return {
      latitude: matchedFromAddress.lat,
      longitude: matchedFromAddress.lon,
      city: matchedFromAddress.name
    };
  }

  // 3. Fallback sang IP Geolocation
  try {
    const response = await fetch('https://get.geojs.io/v1/ip/geo.json');
    if (response.ok) {
      const data = await response.json();
      if (data.latitude && data.longitude) {
        const ipCity = data.city || '';
        const matchIp = matchVietnamLocation(ipCity);
        return {
          latitude: parseFloat(data.latitude),
          longitude: parseFloat(data.longitude),
          city: matchIp ? matchIp.name : (ipCity || 'TP. Hồ Chí Minh')
        };
      }
    }
  } catch {
    // Silent fallback
  }

  // 4. Mặc định trung tâm TP. Hồ Chí Minh (hoặc Hà Nội)
  return {
    latitude: 10.7626,
    longitude: 106.6602,
    city: 'TP. Hồ Chí Minh'
  };
}

const CACHE_KEY = 'truliva_weather_cache_v2';
const CACHE_DURATION_MS = 15 * 60 * 1000; // 15 phút làm mới tự động một lần

export async function fetchCurrentWeather(
  forceRefresh = false,
  stationName?: string,
  addressHint?: string
): Promise<WeatherInfo | null> {
  try {
    // 1. Kiểm tra cache 15 phút
    if (!forceRefresh && typeof sessionStorage !== 'undefined') {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        try {
          const parsed: WeatherInfo = JSON.parse(cached);
          const age = Date.now() - parsed.timestamp;
          if (age < CACHE_DURATION_MS) {
            return parsed;
          }
        } catch {
          // Cache hỏng -> tải mới
        }
      }
    }

    // 2. Lấy tọa độ chính xác cao theo Trạm / Địa chỉ / GPS
    const coords = await getCoordinates(stationName, addressHint);

    // 3. Gọi Open-Meteo High-Resolution Engine với đầy đủ thông số lượng mưa, gió, cảm nhận nhiệt
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,rain,showers,weather_code,cloud_cover,wind_speed_10m&timezone=auto`;
    
    const response = await fetch(weatherUrl);
    if (!response.ok) {
      throw new Error(`Weather API returned status ${response.status}`);
    }

    const data = await response.json();
    const current = data.current;
    if (!current) {
      throw new Error('Invalid weather response');
    }

    const temp = Math.round(current.temperature_2m);
    const apparentTemp = current.apparent_temperature !== undefined ? Math.round(current.apparent_temperature) : temp;
    const humidity = current.relative_humidity_2m !== undefined ? Math.round(current.relative_humidity_2m) : undefined;
    const precip = current.precipitation || 0;
    const rainVal = current.rain || 0;
    const showersVal = current.showers || 0;
    const wind = current.wind_speed_10m !== undefined ? Math.round(current.wind_speed_10m) : undefined;
    const code = current.weather_code || 0;

    const isRain = precip > 0 || rainVal > 0 || showersVal > 0;
    const { text, icon } = interpretWeatherCode(code, isRain, precip);

    const weatherInfo: WeatherInfo = {
      temperature: temp,
      apparentTemperature: apparentTemp,
      humidity,
      precipitation: precip,
      rain: rainVal,
      showers: showersVal,
      windSpeed: wind,
      weatherCode: code,
      text,
      icon,
      locationName: coords.city,
      timestamp: Date.now()
    };

    // 4. Lưu cache 15 phút
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify(weatherInfo));
    }
    return weatherInfo;

  } catch (err) {
    console.error('Failed to fetch weather:', err);
    return null;
  }
}
