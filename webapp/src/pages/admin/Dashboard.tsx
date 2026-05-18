import { useEffect, useState } from 'react';
import { fetchApi, getDashboardStats } from '../../api/client';
import { FileText, CheckCircle, Clock, Building } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, Legend, ResponsiveContainer, CartesianGrid } from 'recharts';
import { ComposableMap, Geographies, Geography } from 'react-simple-maps';
import { scaleQuantile } from 'd3-scale';

function removeVietnameseTones(str: string) {
    str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g,"a"); 
    str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g,"e"); 
    str = str.replace(/ì|í|ị|ỉ|ĩ/g,"i"); 
    str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g,"o"); 
    str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g,"u"); 
    str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g,"y"); 
    str = str.replace(/đ/g,"d");
    str = str.replace(/À|Á|Ạ|Ả|Ã|Â|Ầ|Ấ|Ậ|Ẩ|Ẫ|Ă|Ằ|Ắ|Ặ|Ẳ|Ẵ/g, "A");
    str = str.replace(/È|É|Ẹ|Ẻ|Ẽ|Ê|Ề|Ế|Ệ|Ể|Ễ/g, "E");
    str = str.replace(/Ì|Í|Ị|Ỉ|Ĩ/g, "I");
    str = str.replace(/Ò|Ó|Ọ|Ỏ|Õ|Ô|Ồ|Ố|Ộ|Ổ|Ỗ|Ơ|Ờ|Ớ|Ợ|Ở|Ỡ/g, "O");
    str = str.replace(/Ù|Ú|Ụ|Ủ|Ũ|Ư|Ừ|Ứ|Ự|Ử|Ữ/g, "U");
    str = str.replace(/Ỳ|Ý|Ỵ|Ỷ|Ỹ/g, "Y");
    str = str.replace(/Đ/g, "D");
    return str;
}

const geoUrl = '/vn-provinces.json';

export default function Dashboard() {
  const [stats, setStats] = useState<any>(null);
  const [dashStats, setDashStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tooltipContent, setTooltipContent] = useState('');

  useEffect(() => {
    Promise.all([
      fetchApi('/reports/stats'),
      getDashboardStats()
    ]).then(([reportsData, dashData]) => {
      setStats(reportsData);
      setDashStats(dashData);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-center py-10"><span className="spinner border-t-[#1B3A6B]"></span></div>;
  if (!stats || !dashStats) return <div className="alert alert-error">Lỗi tải dữ liệu</div>;

  // Prepare chart data (flatten stations)
  const chartData = dashStats.stationStats.map((main: any) => {
    let techTotal = 0;
    main.techStations.forEach((t: any) => techTotal += t.orders);
    return {
      name: main.name,
      MainOrders: main.totalOrders - techTotal,
      TechOrders: techTotal,
      Total: main.totalOrders
    };
  });

  // Prepare Map Color Scale
  const mapData = Object.keys(dashStats.mapDensity).map(key => ({
    id: key,
    value: dashStats.mapDensity[key]
  }));
  
  const colorScale = scaleQuantile<string>()
    .domain(mapData.map(d => d.value).length > 0 ? mapData.map(d => d.value) : [0, 1])
    .range([
      "#e0f2fe", 
      "#bae6fd",
      "#7dd3fc",
      "#38bdf8",
      "#0ea5e9",
      "#0284c7",
      "#0369a1", 
      "#075985"
    ]);

  return (
    <div className="animate-fade-in relative">
      <h2 className="font-bold text-2xl mb-6 text-[#1B3A6B]">Tổng quan hệ thống</h2>
      
      {/* Existing KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '32px' }}>
        <div className="card flex flex-col gap-2 border-l-4 border-blue-500">
          <div className="text-gray-500 font-medium flex items-center gap-2"><FileText size={18}/> Tổng báo cáo</div>
          <div className="text-3xl font-bold">{stats.totalReports}</div>
        </div>
        
        <div className="card flex flex-col gap-2 border-l-4 border-emerald-500">
          <div className="text-emerald-600 font-medium flex items-center gap-2"><CheckCircle size={18}/> Đã thanh toán</div>
          <div className="text-3xl font-bold">{stats.totalPaid}</div>
        </div>

        <div className="card flex flex-col gap-2 border-l-4 border-amber-500">
          <div className="text-amber-600 font-medium flex items-center gap-2"><Clock size={18}/> Chờ thanh toán</div>
          <div className="text-3xl font-bold">{stats.totalUnpaid}</div>
        </div>

        <div className="card flex flex-col gap-2 border-l-4 border-purple-500">
          <div className="text-purple-600 font-medium flex items-center gap-2"><Building size={18}/> Số trạm chính</div>
          <div className="text-3xl font-bold">{dashStats.stationStats.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* CHART: Orders by Station */}
        <div className="card flex flex-col">
          <h3 className="font-bold mb-6 text-gray-800">Thống kê đơn hàng theo Trạm</h3>
          <div className="flex-1 min-h-[350px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 5, right: 30, left: 0, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} angle={-45} textAnchor="end" height={60} />
                <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 12}} />
                <RechartsTooltip cursor={{fill: '#f3f4f6'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'}} />
                <Legend wrapperStyle={{paddingTop: '20px'}} />
                <Bar dataKey="TechOrders" name="Qua Trạm Kỹ Thuật" stackId="a" fill="#0ea5e9" radius={[0, 0, 4, 4]} />
                <Bar dataKey="MainOrders" name="Trực tiếp tại Trạm Chính" stackId="a" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* MAP: Order Density */}
        <div className="card flex flex-col relative">
          <h3 className="font-bold mb-2 text-gray-800">Bản đồ Mật độ Đơn hàng</h3>
          <p className="text-sm text-gray-500 mb-4">Màu sắc thể hiện số lượng đơn hàng tại từng tỉnh/thành</p>
          <div className="flex-1 min-h-[350px] w-full bg-blue-50/50 rounded-lg overflow-hidden flex items-center justify-center relative border border-blue-100">
            <ComposableMap
              projection="geoMercator"
              projectionConfig={{
                scale: 1600,
                center: [106, 16]
              }}
              style={{ width: "100%", height: "100%" }}
            >
              <Geographies geography={geoUrl}>
                {({ geographies }) =>
                  geographies.map(geo => {
                    const geoName = geo.properties.Name || geo.properties.name || geo.properties.ten_tinh;
                    
                    let matchedValue = 0;
                    if (geoName) {
                      const cleanGeoName = removeVietnameseTones(geoName)
                        .replace(/ Province| City/gi, '')
                        .trim()
                        .toLowerCase();

                      const found = mapData.find(d => {
                        const cleanDbName = removeVietnameseTones(d.id)
                          .replace(/^(Tỉnh |Thành phố |TP |TP\. )/i, '')
                          .trim()
                          .toLowerCase();
                        return cleanGeoName === cleanDbName || cleanGeoName.includes(cleanDbName) || cleanDbName.includes(cleanGeoName);
                      });
                      if (found) matchedValue = found.value;
                    }

                    return (
                      <Geography
                        key={geo.rsmKey}
                        geography={geo}
                        fill={matchedValue ? colorScale(matchedValue) : "#f8fafc"}
                        stroke="#94a3b8"
                        strokeWidth={0.5}
                        onMouseEnter={() => {
                          setTooltipContent(`${geoName || 'Không rõ'}: ${matchedValue} đơn hàng`);
                        }}
                        onMouseLeave={() => {
                          setTooltipContent("");
                        }}
                        style={{
                          default: { outline: "none" },
                          hover: { fill: "#f59e0b", outline: "none", cursor: "pointer", transition: "all 0.2s" },
                          pressed: { fill: "#d97706", outline: "none" }
                        }}
                      />
                    );
                  })
                }
              </Geographies>
            </ComposableMap>

            {tooltipContent && (
              <div className="absolute top-4 right-4 bg-gray-900/80 text-white px-3 py-1.5 rounded text-sm font-medium shadow-lg pointer-events-none animate-fade-in z-10 backdrop-blur-sm">
                {tooltipContent}
              </div>
            )}
            
            <div className="absolute bottom-4 left-4 text-[10px] text-gray-400 bg-white/80 px-2 py-1 rounded backdrop-blur-sm">
              * Dữ liệu lấy từ thông tin khách hàng
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
