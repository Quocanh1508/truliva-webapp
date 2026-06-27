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

// Lấy vị trí của người dùng qua GPS hoặc IP Geolocation làm fallback
async function getCoordinates(): Promise<Coordinates> {
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
      console.warn('GPS Geolocation failed or denied. Falling back to IP Geolocation...', gpsError);
    }
  }

  // 2. Fallback sang IP Geolocation (Sử dụng ipapi.co miễn phí hỗ trợ HTTPS)
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

  // 3. Mặc định
  return {
    latitude: DEFAULT_LAT,
    longitude: DEFAULT_LON,
    city: DEFAULT_CITY
  };
}

const CACHE_KEY = 'truliva_weather_cache';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 phút

export async function fetchCurrentWeather(forceRefresh = false): Promise<WeatherInfo | null> {
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
    const coords = await getCoordinates();

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
