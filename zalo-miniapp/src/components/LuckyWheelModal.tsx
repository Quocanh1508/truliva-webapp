import React, { useState } from 'react';
import { Gift, X, Sparkles, Trophy, CheckCircle, MessageSquare } from 'lucide-react';

interface LuckyWheelModalProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
}

const REWARDS = [
  { id: 1, text: 'Voucher 50K Thay Lõi', color: '#2563eb', textColor: '#ffffff' },
  { id: 2, text: '100 Điểm Thưởng', color: '#3b82f6', textColor: '#ffffff' },
  { id: 3, text: 'Lõi Lọc Thô Số 1', color: '#1d4ed8', textColor: '#ffffff' },
  { id: 4, text: 'Voucher 100K Bảo Trì', color: '#60a5fa', textColor: '#ffffff' },
  { id: 5, text: 'Chúc Bạn May Mắn', color: '#93c5fd', textColor: '#1e3a8a' },
  { id: 6, text: '50 Điểm Thưởng', color: '#1e40af', textColor: '#ffffff' },
];

export default function LuckyWheelModal({ isOpen, onClose, user }: LuckyWheelModalProps) {
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [wonReward, setWonReward] = useState<any>(null);
  const [spinsLeft, setSpinsLeft] = useState(1);
  const [hasFollowedOa, setHasFollowedOa] = useState(false);

  if (!isOpen) return null;

  const handleSpin = () => {
    if (spinning || spinsLeft <= 0) return;

    setSpinning(true);
    setWonReward(null);

    const prizeIndex = Math.floor(Math.random() * REWARDS.length);
    const segmentAngle = 360 / REWARDS.length;
    const targetAngle = 360 * 5 + (360 - prizeIndex * segmentAngle - segmentAngle / 2);
    
    const newRotation = rotation + targetAngle;
    setRotation(newRotation);

    setTimeout(() => {
      setSpinning(false);
      setWonReward(REWARDS[prizeIndex]);
      setSpinsLeft(prev => Math.max(0, prev - 1));
    }, 4000);
  };

  const handleFollowOa = () => {
    setHasFollowedOa(true);
    setSpinsLeft(prev => prev + 1);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-sm rounded-3xl overflow-hidden shadow-2xl relative animate-in fade-in zoom-in duration-200">
        
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-blue-700 via-blue-600 to-indigo-700 text-white p-5 text-center relative overflow-hidden">
          <button 
            onClick={onClose}
            className="absolute top-3 right-3 p-1.5 bg-white/10 hover:bg-white/20 rounded-full text-white transition-colors"
          >
            <X size={18} />
          </button>
          
          <div className="inline-flex items-center space-x-1.5 bg-amber-400/20 text-amber-300 border border-amber-400/30 px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider mb-2">
            <Sparkles size={12} />
            <span>Mini Game Tri Ân</span>
          </div>

          <h2 className="text-xl font-extrabold text-amber-300 tracking-wide">
            VÒNG QUAY MAY MẮN
          </h2>
          <p className="text-xs text-blue-100 mt-1">
            Quay ngay - 100% Nhận quà bảo vệ sức khỏe Truliva
          </p>
        </div>

        {/* Wheel Container */}
        <div className="p-6 text-center space-y-5 bg-gradient-to-b from-blue-50/50 to-white">
          
          {/* Wheel Visual */}
          <div className="relative w-64 h-64 mx-auto flex items-center justify-center">
            {/* Pointer */}
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[14px] border-l-transparent border-r-[14px] border-r-transparent border-t-[24px] border-t-red-600 drop-shadow-md"></div>

            {/* Wheel Canvas */}
            <div 
              className="w-full h-full rounded-full border-4 border-amber-400 shadow-xl overflow-hidden transition-transform ease-out"
              style={{ 
                transform: `rotate(${rotation}deg)`,
                transitionDuration: spinning ? '4000ms' : '0ms'
              }}
            >
              <svg viewBox="0 0 100 100" className="w-full h-full transform -rotate-90">
                {REWARDS.map((reward, index) => {
                  const angle = 360 / REWARDS.length;
                  const startAngle = index * angle;
                  const endAngle = (index + 1) * angle;

                  const x1 = 50 + 50 * Math.cos((Math.PI * startAngle) / 180);
                  const y1 = 50 + 50 * Math.sin((Math.PI * startAngle) / 180);
                  const x2 = 50 + 50 * Math.cos((Math.PI * endAngle) / 180);
                  const y2 = 50 + 50 * Math.sin((Math.PI * endAngle) / 180);

                  const pathData = `M 50 50 L ${x1} ${y1} A 50 50 0 0 1 ${x2} ${y2} Z`;

                  return (
                    <g key={reward.id}>
                      <path d={pathData} fill={reward.color} stroke="#ffffff" strokeWidth="0.5" />
                      <text
                        x="70"
                        y="50"
                        fill={reward.textColor}
                        fontSize="4"
                        fontWeight="bold"
                        textAnchor="middle"
                        transform={`rotate(${startAngle + angle / 2}, 50, 50)`}
                      >
                        {reward.text}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Center Button */}
            <button
              onClick={handleSpin}
              disabled={spinning || spinsLeft <= 0}
              className="absolute z-10 w-16 h-16 rounded-full bg-gradient-to-tr from-amber-500 to-amber-300 text-blue-950 font-black text-xs shadow-lg border-2 border-white flex flex-col items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-50"
            >
              <span>{spinning ? '...' : 'QUAY'}</span>
            </button>
          </div>

          {/* Spin count badge */}
          <div className="flex justify-center items-center space-x-2 text-xs text-slate-600 font-semibold">
            <Trophy size={16} className="text-amber-500" />
            <span>Bạn còn <strong className="text-blue-600 text-sm">{spinsLeft}</strong> lượt quay</span>
          </div>

          {/* Follow OA Call to Action */}
          {!hasFollowedOa && (
            <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3.5 text-left text-xs space-y-2">
              <div className="flex items-center space-x-2 text-blue-900 font-bold">
                <MessageSquare size={16} className="text-blue-600" />
                <span>Nhận thêm 1 Lượt Quay Miễn Phí!</span>
              </div>
              <p className="text-slate-600 text-[11px]">
                Quan tâm Zalo OA <strong>Pure Vita / Truliva</strong> để cập nhật lịch thay lõi và nhận lượt quay quà tặng.
              </p>
              <button
                onClick={handleFollowOa}
                className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center space-x-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <CheckCircle size={14} />
                <span>Quan Tâm Zalo OA Nhận Lượt Quay</span>
              </button>
            </div>
          )}

          {/* Winner Notification Popup */}
          {wonReward && (
            <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl text-amber-900 text-xs space-y-2 animate-in fade-in slide-in-from-bottom-2">
              <p className="font-extrabold text-sm text-amber-800 flex items-center justify-center space-x-1">
                <Gift size={18} className="text-amber-600" />
                <span>CHÚC MỪNG BẠN TRÚNG THƯỞNG!</span>
              </p>
              <p className="font-bold text-base text-blue-700">{wonReward.text}</p>
              <p className="text-[11px] text-slate-500">Phần quà đã được lưu vào mục "Ưu đãi của tôi".</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
