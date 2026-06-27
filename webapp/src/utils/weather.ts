export interface WeatherInfo {
  temperature: number;
  weatherCode: number;
  text: string;
  icon: string;
  locationName: string;
  timestamp: number;
}

// Bảng giải mã thời tiết WMO (World Meteorological Organization)
export function interpretWeatherCode(code: number): { text: string; icon: string } {
  switch (code) {
    case 0:
      return { text: 'Trời quang', icon: '☀️' };
    case 1:
      return { text: 'Ít mây', icon: '🌤️' };
    case 2:
      return { text: 'Nhiều mây', icon: '⛅' };
    case 3:
      return { text: 'U ám', icon: '☁️' };
    case 45:
    case 48:
      return { text: 'Có sương mù', icon: '🌫️' };
    case 51:
    case 53:
    case 55:
      return { text: 'Mưa phùn', icon: '🌧️' };
    case 56:
    case 57:
      return { text: 'Mưa phùn băng giá', icon: '🌧️' };
    case 61:
      return { text: 'Mưa rào nhẹ', icon: '🌧️' };
    case 63:
      return { text: 'Mưa rào', icon: '🌧️' };
    case 65:
      return { text: 'Mưa rào nặng', icon: '🌧️' };
    case 66:
    case 67:
      return { text: 'Mưa băng giá', icon: '🌧️' };
    case 71:
    case 73:
    case 75:
      return { text: 'Tuyết rơi', icon: '❄️' };
    case 77:
      return { text: 'Mưa tuyết', icon: '❄️' };
    case 80:
    case 81:
    case 82:
      return { text: 'Mưa lớn', icon: '🌧️' };
    case 85:
    case 86:
      return { text: 'Tuyết rơi lớn', icon: '❄️' };
    case 95:
      return { text: 'Có dông sét', icon: '⛈️' };
    case 96:
    case 99:
      return { text: 'Dông bão lớn', icon: '⛈️' };
    default:
      return { text: 'Không xác định', icon: '🌤️' };
  }
}

// Định nghĩa vị trí mặc định (Hà Nội)
const DEFAULT_LAT = 21.028511;
const DEFAULT_LON = 105.804817;
const DEFAULT_CITY = 'Hà Nội';

interface Coordinates {
  latitude: number;
  longitude: number;
  city: string;
}

// Lấy vị trí của người dùng qua GPS hoặc trạm kỹ thuật/IP Geolocation làm fallback
async function getCoordinates(stationName?: string): Promise<Coordinates> {
  // 1. Thử lấy qua GPS/Trình duyệt Geolocation
  if (navigator.geolocation) {
    try {
      const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 4000, // Timeout sau 4s để tránh treo
          maximumAge: 300000 // Sử dụng cache vị trí trong 5 phút
        });
      });
      return {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        city: 'Vị trí hiện tại'
      };
    } catch (gpsError) {
      console.warn('GPS Geolocation failed or denied. Falling back to Smart Station Mapping...', gpsError);
    }
  }

  // 2. Fallback sang Trạm kỹ thuật (Smart Station Mapping)
  if (stationName) {
    const sName = stationName.toLowerCase();
    if (sName.includes('hồ chí minh') || sName.includes('tphcm') || sName.includes('hcm') || sName.includes('sài gòn')) {
      return { latitude: 10.762622, longitude: 106.660172, city: 'TP. Hồ Chí Minh' };
    }
    if (sName.includes('vũng tàu')) {
      return { latitude: 10.34599, longitude: 107.08426, city: 'Vũng Tàu' };
    }
    if (sName.includes('đồng nai') || sName.includes('biên hòa')) {
      return { latitude: 10.95738, longitude: 106.84268, city: 'Đồng Nai' };
    }
    if (sName.includes('hà nội') || sName.includes('hn')) {
      return { latitude: 21.028511, longitude: 105.804817, city: 'Hà Nội' };
    }
    if (sName.includes('đà nẵng') || sName.includes('dn')) {
      return { latitude: 16.0544, longitude: 108.2022, city: 'Đà Nẵng' };
    }
  }

  // 3. Fallback sang IP Geolocation (Sử dụng ipapi.co miễn phí hỗ trợ HTTPS)
  try {
    const response = await fetch('https://ipapi.co/json/');
    if (response.ok) {
      const data = await response.json();
      if (data.latitude && data.longitude) {
        return {
          latitude: data.latitude,
          longitude: data.longitude,
          city: data.city || DEFAULT_CITY
        };
      }
    }
  } catch (ipError) {
    console.error('IP Geolocation failed. Using default coordinates (Hà Nội)...', ipError);
  }

  // 4. Mặc định
  return {
    latitude: DEFAULT_LAT,
    longitude: DEFAULT_LON,
    city: DEFAULT_CITY
  };
}

const CACHE_KEY = 'truliva_weather_cache';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 phút

export async function fetchCurrentWeather(forceRefresh = false, stationName?: string): Promise<WeatherInfo | null> {
  try {
    // 1. Kiểm tra cache
    if (!forceRefresh) {
      const cached = sessionStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed: WeatherInfo = JSON.parse(cached);
        const age = Date.now() - parsed.timestamp;
        if (age < CACHE_DURATION_MS) {
          return parsed;
        }
      }
    }

    // 2. Lấy vị trí
    const coords = await getCoordinates(stationName);

    // 3. Gọi Open-Meteo API
    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.latitude}&longitude=${coords.longitude}&current=temperature_2m,weather_code&timezone=auto`;
    const response = await fetch(weatherUrl);
    if (!response.ok) {
      throw new Error(`Open-Meteo API returned status ${response.status}`);
    }

    const data = await response.json();
    const current = data.current;
    if (!current) {
      throw new Error('Invalid Open-Meteo response structure');
    }

    const temp = Math.round(current.temperature_2m);
    const code = current.weather_code;
    const { text, icon } = interpretWeatherCode(code);

    const weatherInfo: WeatherInfo = {
      temperature: temp,
      weatherCode: code,
      text,
      icon,
      locationName: coords.city,
      timestamp: Date.now()
    };

    // 4. Lưu cache
    sessionStorage.setItem(CACHE_KEY, JSON.stringify(weatherInfo));
    return weatherInfo;

  } catch (err) {
    console.error('Failed to fetch weather:', err);
    return null;
  }
}
