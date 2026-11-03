import { useState, useEffect } from 'react';
import { fetchApi } from '../../api/client';
import {
  Bot,
  Sparkles,
  BookOpen,
  HelpCircle,
  Database,
  Send,
  Save,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  Phone,
  Clock,
  MapPin,
  MessageSquare,
  Package,
  FileText,
  UploadCloud,
  Search,
  Layers,
  FileUp,
  Cpu
} from 'lucide-react';

interface FAQItem {
  category?: string;
  question: string;
  answer: string;
}

interface AiConfig {
  id: string;
  botName: string;
  greeting?: string;
  personaTone: string;
  hotline: string;
  workingHours: string;
  address: string;
  systemPrompt: string;
  knowledgeText: string;
  faqs: FAQItem[];
  syncCatalog: boolean;
  isEnabled: boolean;
  updatedBy?: string;
  updatedAt?: string;
}

interface CatalogSummary {
  totalActiveProducts: number;
  totalActiveCombos: number;
  products: Array<{ id: string; name: string; sku: string; sellingPrice?: number }>;
  combos: Array<{ id: string; displayName: string; comboKey: string }>;
}

interface DocumentSource {
  id: string;
  title: string;
  fileName: string;
  fileType: string;
  fileSize: number;
  totalChunks: number;
  status: 'PROCESSING' | 'READY' | 'FAILED';
  uploadedBy?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RagChunkMatch {
  id: string;
  documentId: string;
  chunkIndex: number;
  sectionTitle?: string;
  content: string;
  metadata?: { pageNumber?: number; fileName?: string; title?: string };
  vectorSimilarity: number;
  textScore: number;
  rrfScore: number;
  sourceTitle?: string;
  fileName?: string;
}

interface ChatMessage {
  sender: 'user' | 'ai';
  text: string;
  time: string;
  retrievedChunks?: RagChunkMatch[];
}

export default function AiAssistantManage() {
  const [activeTab, setActiveTab] = useState<'identity' | 'knowledge' | 'documents' | 'faq' | 'database' | 'playground'>('identity');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Form State
  const [config, setConfig] = useState<AiConfig>({
    id: 'default',
    botName: 'Truliva Assistant',
    greeting: '',
    personaTone: '',
    hotline: '1900 638 463',
    workingHours: '08:00 - 18:00 (Thứ 2 - Chủ Nhật)',
    address: '65 Đường 42-AP, Phường An Phú, TP. Thủ Đức, TP. Hồ Chí Minh',
    systemPrompt: '',
    knowledgeText: '',
    faqs: [],
    syncCatalog: true,
    isEnabled: true
  });

  // Database Catalog Data
  const [catalog, setCatalog] = useState<CatalogSummary | null>(null);
  const [loadingCatalog, setLoadingCatalog] = useState(false);

  // Documents & RAG State
  const [documents, setDocuments] = useState<DocumentSource[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [docTitle, setDocTitle] = useState('');
  const [ragSearchQuery, setRagSearchQuery] = useState('');
  const [searchingRag, setSearchingRag] = useState(false);
  const [ragSearchResults, setRagSearchResults] = useState<RagChunkMatch[]>([]);

  // Playground Chat State
  const [testInput, setTestInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      sender: 'ai',
      text: 'Dạ Truliva xin chào bạn! Mình là Trợ lý AI của Truliva. Bạn có thể hỏi mình bất kỳ câu hỏi nào về sản phẩm, bảng giá hoặc sự cố máy lọc nước để thử nghiệm nhé!',
      time: 'Vừa xong'
    }
  ]);
  const [testingChat, setTestingChat] = useState(false);

  // New FAQ Modal / Inline form
  const [newCategory, setNewCategory] = useState('Chung');
  const [newQuestion, setNewQuestion] = useState('');
  const [newAnswer, setNewAnswer] = useState('');
  const [showAddFaq, setShowAddFaq] = useState(false);

  useEffect(() => {
    loadConfig();
    loadCatalogSummary();
    loadDocuments();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      setErrorMsg('');
      const res = await fetchApi('/ai-assistant/config');
      if (res.success && res.config) {
        setConfig(res.config);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thể tải cấu hình AI');
    } finally {
      setLoading(false);
    }
  };

  const loadCatalogSummary = async () => {
    try {
      setLoadingCatalog(true);
      const res = await fetchApi('/ai-assistant/catalog-summary');
      if (res.success) {
        setCatalog(res);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh mục sản phẩm AI', err);
    } finally {
      setLoadingCatalog(false);
    }
  };

  const loadDocuments = async () => {
    try {
      setLoadingDocs(true);
      const res = await fetchApi('/ai-assistant/documents');
      if (res.success && Array.isArray(res.documents)) {
        setDocuments(res.documents);
      }
    } catch (err) {
      console.error('Lỗi khi tải danh sách tài liệu RAG', err);
    } finally {
      setLoadingDocs(false);
    }
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      setSuccessMsg('');
      setErrorMsg('');
      const res = await fetchApi('/ai-assistant/config', {
        method: 'PUT',
        body: JSON.stringify(config)
      });
      if (res.success) {
        setSuccessMsg('Đã lưu cấu hình và cập nhật Trợ lý AI thành công!');
        if (res.config) setConfig(res.config);
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi lưu cấu hình');
    } finally {
      setSaving(false);
    }
  };

  const handleAddFaq = () => {
    if (!newQuestion.trim() || !newAnswer.trim()) {
      alert('Vui lòng nhập cả câu hỏi và câu trả lời!');
      return;
    }
    const updatedFaqs = [
      ...config.faqs,
      {
        category: newCategory.trim() || 'Chung',
        question: newQuestion.trim(),
        answer: newAnswer.trim()
      }
    ];
    setConfig(prev => ({ ...prev, faqs: updatedFaqs }));
    setNewQuestion('');
    setNewAnswer('');
    setShowAddFaq(false);
  };

  const handleRemoveFaq = (index: number) => {
    if (!confirm('Bạn có chắc muốn xóa câu hỏi này khỏi danh sách tri thức của AI?')) return;
    const updated = config.faqs.filter((_, i) => i !== index);
    setConfig(prev => ({ ...prev, faqs: updated }));
  };

  const handleUploadDocument = async () => {
    if (!selectedFile) {
      alert('Vui lòng chọn tệp PDF hoặc TXT!');
      return;
    }

    try {
      setUploadingDoc(true);
      setErrorMsg('');
      const formData = new FormData();
      formData.append('file', selectedFile);
      formData.append('title', docTitle.trim() || selectedFile.name.replace(/\.[^/.]+$/, ''));

      const token = localStorage.getItem('session_token');
      const headers: Record<string, string> = {};
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/ai-assistant/documents/upload', {
        method: 'POST',
        headers,
        body: formData
      });

      let data: any = {};
      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        if (response.status === 413) {
          throw new Error('Tệp tải lên vượt quá giới hạn dung lượng của hệ thống (tối đa 100MB).');
        }
        if (response.status === 504) {
          throw new Error('Quá thời gian xử lý khi trích xuất tài liệu. Vui lòng thử lại.');
        }
        throw new Error(`Máy chủ phản hồi lỗi (${response.status}): ${text.slice(0, 100)}`);
      }

      if (!response.ok || !data.success) {
        throw new Error(data.message || 'Lỗi tải lên tài liệu');
      }

      setSuccessMsg(data.message || 'Tài liệu đã được phân tích và nạp vào Hybrid RAG!');
      setSelectedFile(null);
      setDocTitle('');
      loadDocuments();
      setTimeout(() => setSuccessMsg(''), 5000);
    } catch (err: any) {
      setErrorMsg(err.message || 'Không thể tải lên tài liệu');
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleDeleteDocument = async (id: string, title: string) => {
    if (!confirm(`Bạn có chắc muốn gỡ tài liệu "${title}" khỏi Thư viện tri thức của AI?`)) return;

    try {
      const res = await fetchApi(`/ai-assistant/documents/${id}`, {
        method: 'DELETE'
      });
      if (res.success) {
        setSuccessMsg(`Đã gỡ bỏ tài liệu "${title}" thành công`);
        loadDocuments();
        setTimeout(() => setSuccessMsg(''), 4000);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Lỗi khi gỡ tài liệu');
    }
  };

  const handleSearchRag = async () => {
    if (!ragSearchQuery.trim()) return;

    try {
      setSearchingRag(true);
      const res = await fetchApi('/ai-assistant/documents/search-test', {
        method: 'POST',
        body: JSON.stringify({ query: ragSearchQuery.trim() })
      });
      if (res.success && Array.isArray(res.chunks)) {
        setRagSearchResults(res.chunks);
      }
    } catch (err: any) {
      alert('Lỗi tra cứu Hybrid RAG: ' + err.message);
    } finally {
      setSearchingRag(false);
    }
  };

  const handleSendTestChat = async () => {
    if (!testInput.trim() || testingChat) return;

    const userMsg = testInput.trim();
    const nowTime = new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
    
    // Thu thập các tin nhắn gần nhất trong khung chat để truyền ngữ cảnh hội thoại (Multi-turn Context)
    const history = chatMessages.slice(-8).map(m => ({
      role: m.sender === 'user' ? 'user' : 'model',
      text: m.text
    }));

    setChatMessages(prev => [...prev, { sender: 'user', text: userMsg, time: nowTime }]);
    setTestInput('');
    setTestingChat(true);

    try {
      const res = await fetchApi('/ai-assistant/test-chat', {
        method: 'POST',
        body: JSON.stringify({ message: userMsg, history })
      });
      if (res.success && res.reply) {
        setChatMessages(prev => [
          ...prev,
          {
            sender: 'ai',
            text: res.reply,
            time: nowTime,
            retrievedChunks: res.retrievedChunks || []
          }
        ]);
      } else {
        setChatMessages(prev => [...prev, { sender: 'ai', text: 'Dạ Truliva gặp chút trục trặc khi suy luận, bạn thử lại nhé!', time: nowTime }]);
      }
    } catch (err: any) {
      setChatMessages(prev => [...prev, { sender: 'ai', text: `❌ Lỗi: ${err.message || 'Không thể kết nối tới AI'}`, time: nowTime }]);
    } finally {
      setTestingChat(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3">
        <Loader2 className="animate-spin text-[#1B3A6B]" size={36} />
        <span className="text-sm font-medium text-gray-500">Đang tải cấu hình Trợ lý AI Truliva...</span>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6 pb-12">
      {/* ── TOP HEADER ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-xs">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#1B3A6B] to-[#00A3FF] flex items-center justify-center text-white shadow-sm shadow-blue-500/20">
            <Bot size={26} />
          </div>
          <div>
            <div className="flex items-center gap-2.5">
              <h1 className="text-xl font-bold text-gray-900">Quản Lý Trợ Lý AI & Tri Thức</h1>
              <span className={`px-2.5 py-0.5 text-xs font-semibold rounded-full border ${config.isEnabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-gray-100 text-gray-600 border-gray-200'}`}>
                {config.isEnabled ? '● Đang hoạt động' : '○ Tạm tắt'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              Huấn luyện AI thấu hiểu sản phẩm, nghiệp vụ máy lọc nước và phong cách thương hiệu Truliva
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2.5 self-end sm:self-auto">
          <button
            onClick={() => setActiveTab('playground')}
            className="border border-gray-200 bg-white hover:bg-gray-50 text-gray-700 font-semibold rounded-xl px-4 py-2.5 text-sm transition-all flex items-center gap-2 shadow-2xs"
          >
            <MessageSquare size={16} className="text-[#00A3FF]" />
            <span>Thử nghiệm Chat</span>
          </button>

          <button
            onClick={handleSave}
            disabled={saving}
            className="bg-[#1B3A6B] hover:bg-[#2A518E] text-white font-semibold rounded-xl px-5 py-2.5 text-sm shadow-xs transition-all active:scale-[0.98] flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            <span>Lưu cấu hình</span>
          </button>
        </div>
      </div>

      {/* ── NOTIFICATION BANNERS ── */}
      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm flex items-center gap-3 animate-fade-in shadow-2xs">
          <CheckCircle2 size={18} className="text-emerald-600 shrink-0" />
          <span className="font-medium">{successMsg}</span>
        </div>
      )}

      {errorMsg && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm flex items-center gap-3 animate-fade-in shadow-2xs">
          <AlertCircle size={18} className="text-rose-600 shrink-0" />
          <span className="font-medium">{errorMsg}</span>
        </div>
      )}

      {/* ── TABS NAVIGATION ── */}
      <div className="flex items-center gap-1.5 p-1.5 bg-gray-100/80 rounded-2xl border border-gray-200/60 overflow-x-auto text-sm">
        <button
          onClick={() => setActiveTab('identity')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all shrink-0 ${activeTab === 'identity' ? 'bg-white text-[#1B3A6B] shadow-xs font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}
        >
          <Sparkles size={16} className={activeTab === 'identity' ? 'text-[#00A3FF]' : 'text-gray-400'} />
          <span>1. Nhận diện & Giọng điệu</span>
        </button>

        <button
          onClick={() => setActiveTab('knowledge')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all shrink-0 ${activeTab === 'knowledge' ? 'bg-white text-[#1B3A6B] shadow-xs font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}
        >
          <BookOpen size={16} className={activeTab === 'knowledge' ? 'text-[#00A3FF]' : 'text-gray-400'} />
          <span>2. Cẩm nang Tri thức</span>
        </button>

        <button
          onClick={() => setActiveTab('documents')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all shrink-0 ${activeTab === 'documents' ? 'bg-white text-[#1B3A6B] shadow-xs font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}
        >
          <FileText size={16} className={activeTab === 'documents' ? 'text-[#00A3FF]' : 'text-gray-400'} />
          <span>3. Thư viện Tài liệu RAG</span>
          <span className="ml-1 px-1.5 py-0.2 text-[11px] font-bold rounded-full bg-blue-100 text-blue-800">
            {documents.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('faq')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all shrink-0 ${activeTab === 'faq' ? 'bg-white text-[#1B3A6B] shadow-xs font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}
        >
          <HelpCircle size={16} className={activeTab === 'faq' ? 'text-[#00A3FF]' : 'text-gray-400'} />
          <span>4. Câu hỏi thường gặp (FAQ)</span>
          <span className="ml-1 px-1.5 py-0.2 text-[11px] font-bold rounded-full bg-blue-100 text-blue-800">
            {config.faqs?.length || 0}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('database')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all shrink-0 ${activeTab === 'database' ? 'bg-white text-[#1B3A6B] shadow-xs font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}
        >
          <Database size={16} className={activeTab === 'database' ? 'text-[#00A3FF]' : 'text-gray-400'} />
          <span>5. Dữ liệu Truliva</span>
          {config.syncCatalog && (
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('playground')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium transition-all shrink-0 ${activeTab === 'playground' ? 'bg-white text-[#1B3A6B] shadow-xs font-semibold' : 'text-gray-600 hover:text-gray-900 hover:bg-white/50'}`}
        >
          <MessageSquare size={16} className={activeTab === 'playground' ? 'text-[#00A3FF]' : 'text-gray-400'} />
          <span>6. Thử nghiệm (Playground)</span>
        </button>
      </div>

      {/* ── TAB 1: IDENTITY & TONE ── */}
      {activeTab === 'identity' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-xs space-y-5">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Sparkles size={18} className="text-[#00A3FF]" />
                Định vị Tính cách & Quy tắc Giao tiếp
              </h2>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Tên hiển thị Trợ lý ảo
                </label>
                <input
                  type="text"
                  value={config.botName}
                  onChange={e => setConfig({ ...config, botName: e.target.value })}
                  placeholder="Ví dụ: Truliva Assistant, Chuyên viên CSKH Truliva..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Cách xưng hô & Giọng điệu (Tone of Voice)
                </label>
                <input
                  type="text"
                  value={config.personaTone}
                  onChange={e => setConfig({ ...config, personaTone: e.target.value })}
                  placeholder="Ví dụ: Dạ Truliva xin chào..., xưng Truliva và gọi khách là bạn hoặc anh/chị..."
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                />
                <p className="text-[11px] text-gray-400 mt-1">
                  Định hướng phong thái nói chuyện: Thân thiện, lịch sự, ân cần, ngắn gọn, súc tích và giải quyết dứt điểm vấn đề.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-600 uppercase tracking-wider mb-1.5">
                  Lời chào mặc định khi khách nhắn tin
                </label>
                <textarea
                  rows={2}
                  value={config.greeting || ''}
                  onChange={e => setConfig({ ...config, greeting: e.target.value })}
                  placeholder="Dạ Truliva xin chào bạn! Bạn cần hỗ trợ về sản phẩm máy lọc nước hay bảo hành định kỳ ạ?"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 bg-white text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600 transition-all"
                />
              </div>

              <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Kích hoạt phản hồi tự động</h4>
                  <p className="text-xs text-gray-500">Bật/tắt AI tự động trả lời khách hàng trên Fanpage Truliva</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={config.isEnabled}
                    onChange={e => setConfig({ ...config, isEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#1B3A6B]"></div>
                </label>
              </div>
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Phone size={16} className="text-[#00A3FF]" />
                Thông Tin Kênh Liên Hệ
              </h3>
              <p className="text-xs text-gray-500">
                AI sẽ trích dẫn các thông tin này khi khách muốn gọi trực tiếp hoặc đến showroom.
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Hotline CSKH & Kỹ thuật</label>
                <div className="relative">
                  <Phone size={14} className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    value={config.hotline}
                    onChange={e => setConfig({ ...config, hotline: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Giờ làm việc</label>
                <div className="relative">
                  <Clock size={14} className="absolute left-3 top-3 text-gray-400" />
                  <input
                    type="text"
                    value={config.workingHours}
                    onChange={e => setConfig({ ...config, workingHours: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Địa chỉ Văn phòng / Trụ sở</label>
                <div className="relative">
                  <MapPin size={14} className="absolute left-3 top-3 text-gray-400" />
                  <textarea
                    rows={2}
                    value={config.address}
                    onChange={e => setConfig({ ...config, address: e.target.value })}
                    className="w-full pl-9 pr-3 py-2 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 2: KNOWLEDGE BASE (SYSTEM PROMPT) ── */}
      {activeTab === 'knowledge' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                  <BookOpen size={18} className="text-[#00A3FF]" />
                  Quy Tắc Lõi & Chỉ Dẫn Hệ Thống (System Prompt)
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Bộ não điều khiển AI: Nguyên tắc trả lời ngắn gọn 3-5 dòng, bảng phân định hạn bảo hành theo từng model (UR5840 24 tháng, các dòng khác 12 tháng).
                </p>
              </div>
            </div>

            <div>
              <textarea
                rows={12}
                value={config.systemPrompt}
                onChange={e => setConfig({ ...config, systemPrompt: e.target.value })}
                className="w-full font-mono text-xs leading-relaxed p-4 rounded-xl border border-gray-200 bg-slate-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                placeholder="Nhập prompt chỉ dẫn cốt lõi..."
              />
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Sparkles size={18} className="text-amber-500" />
                Cẩm Nang Tri Thức Bổ Sung (Markdown Text)
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Các ghi chú kỹ thuật, chu kỳ thay lõi lọc, hướng dẫn xử lý sự cố nhanh (E1, E2, rò rỉ nước...)
              </p>
            </div>

            <div>
              <textarea
                rows={10}
                value={config.knowledgeText}
                onChange={e => setConfig({ ...config, knowledgeText: e.target.value })}
                className="w-full font-mono text-xs leading-relaxed p-4 rounded-xl border border-gray-200 bg-slate-50 text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                placeholder="Nhập tài liệu hướng dẫn kỹ thuật..."
              />
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 3: DOCUMENT SOURCES & HYBRID RAG ── */}
      {activeTab === 'documents' && (
        <div className="space-y-6 animate-fade-in">
          {/* Top Banner & Upload Form */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 bg-white p-6 rounded-2xl border border-gray-100 shadow-xs space-y-5">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-blue-50 text-[#1B3A6B] flex items-center justify-center">
                    <FileUp size={20} />
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-gray-900">Nạp Tài Liệu Mới (PDF / TXT 100+ Trang)</h2>
                    <p className="text-[11px] text-gray-500">Pipeline tự động cắt đoạn, gọi Gemini tính 768-dim embeddings và nạp vào pgvector</p>
                  </div>
                </div>
                <button
                  onClick={loadDocuments}
                  className="p-2 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                  title="Làm mới danh sách"
                >
                  <RefreshCw size={15} />
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Tiêu đề tài liệu
                  </label>
                  <input
                    type="text"
                    value={docTitle}
                    onChange={e => setDocTitle(e.target.value)}
                    placeholder="VD: Cẩm nang Kỹ thuật & Bảng mã lỗi Delica UR5840"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                    Chọn tệp tài liệu (PDF, TXT tối đa 100MB)
                  </label>
                  <input
                    type="file"
                    accept=".pdf,.txt"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        setSelectedFile(e.target.files[0]);
                        if (!docTitle) {
                          setDocTitle(e.target.files[0].name.replace(/\.[^/.]+$/, ''));
                        }
                      }
                    }}
                    className="w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-xl file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 cursor-pointer"
                  />
                </div>
              </div>

              {selectedFile && (
                <div className="p-3 bg-blue-50/60 rounded-xl border border-blue-100 flex items-center justify-between text-xs text-blue-900">
                  <div className="flex items-center gap-2">
                    <FileText size={16} className="text-blue-600" />
                    <span className="font-semibold">{selectedFile.name}</span>
                    <span className="text-blue-500">({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)</span>
                  </div>
                  <span className="text-emerald-700 font-medium">Sẵn sàng nạp</span>
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-gray-400 italic">
                  * Hỗ trợ tài liệu đào tạo nội bộ, cẩm nang bảo hành, quy chuẩn KTV thi công.
                </span>
                <button
                  onClick={handleUploadDocument}
                  disabled={uploadingDoc || !selectedFile}
                  className="bg-[#1B3A6B] hover:bg-[#2A518E] text-white font-semibold rounded-xl px-5 py-2.5 text-xs shadow-xs transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploadingDoc ? (
                    <>
                      <Loader2 className="animate-spin" size={15} />
                      <span>Đang trích xuất & tạo Vector...</span>
                    </>
                  ) : (
                    <>
                      <UploadCloud size={15} />
                      <span>Bắt đầu nạp & Lập chỉ mục HNSW</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Architecture Explanation Box */}
            <div className="bg-gradient-to-br from-slate-900 to-[#1B3A6B] text-white p-6 rounded-2xl shadow-xs space-y-4">
              <div className="flex items-center gap-2 text-cyan-300">
                <Cpu size={18} />
                <h3 className="text-xs font-bold uppercase tracking-wider">Kiến Trúc In-House Hybrid RAG</h3>
              </div>
              <p className="text-xs text-blue-100 leading-relaxed">
                Hệ thống RAG độc lập chạy trực tiếp trong VPS Truliva, không phụ thuộc bên thứ 3:
              </p>
              <div className="space-y-2.5 text-xs">
                <div className="p-2.5 rounded-xl bg-white/10 border border-white/10">
                  <span className="font-bold text-cyan-300">1. Chunking theo Trang:</span> Cắt đoạn 700 ký tự với overlap 120 ký tự, giữ trọn vẹn số trang trích dẫn.
                </div>
                <div className="p-2.5 rounded-xl bg-white/10 border border-white/10">
                  <span className="font-bold text-cyan-300">2. Dense Vector (HNSW):</span> Gemini Embedding 768 chiều bắt trúng ngữ nghĩa câu hỏi.
                </div>
                <div className="p-2.5 rounded-xl bg-white/10 border border-white/10">
                  <span className="font-bold text-cyan-300">3. Sparse Full-Text (BM25):</span> Postgres GIN Index tìm chính xác SKU, Model (UR5840), mã lỗi.
                </div>
                <div className="p-2.5 rounded-xl bg-white/10 border border-white/10">
                  <span className="font-bold text-cyan-300">4. RRF Fusion:</span> Xếp hạng kết hợp reciprocal rank: <code className="text-amber-300">1/(60+vec) + 1/(60+text)</code>.
                </div>
              </div>
            </div>
          </div>

          {/* Documents Table */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-xs space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div className="flex items-center gap-2">
                <Layers size={18} className="text-[#00A3FF]" />
                <h3 className="text-sm font-bold text-gray-900">Danh Mục Tài Liệu Đã Nạp ({documents.length})</h3>
              </div>
              {loadingDocs && <Loader2 size={16} className="animate-spin text-[#00A3FF]" />}
            </div>

            {documents.length === 0 ? (
              <div className="text-center py-12 text-gray-400 text-xs">
                Chưa có tài liệu nào trong thư viện. Hãy tải lên tệp PDF đầu tiên để AI bắt đầu học sâu nhé!
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-gray-100 text-gray-500 font-bold uppercase tracking-wider">
                      <th className="py-2.5 px-3">Tài liệu</th>
                      <th className="py-2.5 px-3">Tên file</th>
                      <th className="py-2.5 px-3">Dung lượng</th>
                      <th className="py-2.5 px-3">Số đoạn (Chunks)</th>
                      <th className="py-2.5 px-3">Trạng thái</th>
                      <th className="py-2.5 px-3">Ngày nạp</th>
                      <th className="py-2.5 px-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {documents.map(doc => (
                      <tr key={doc.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-3">
                          <div className="font-bold text-gray-900 flex items-center gap-2">
                            <FileText size={15} className="text-blue-600 shrink-0" />
                            <span>{doc.title}</span>
                          </div>
                          <span className="text-[10px] text-gray-400">Người nạp: {doc.uploadedBy || 'Admin'}</span>
                        </td>
                        <td className="py-3 px-3 text-gray-600 font-mono text-[11px]">{doc.fileName}</td>
                        <td className="py-3 px-3 text-gray-600">{(doc.fileSize / 1024).toFixed(1)} KB</td>
                        <td className="py-3 px-3 font-semibold text-[#1B3A6B]">
                          <span className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700">
                            {doc.totalChunks} chunks
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          {doc.status === 'READY' ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              ● Đã lập chỉ mục
                            </span>
                          ) : doc.status === 'PROCESSING' ? (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                              Đang xử lý
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                              Lỗi
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-3 text-gray-400">
                          {new Date(doc.createdAt).toLocaleDateString('vi-VN')}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => handleDeleteDocument(doc.id, doc.title)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition-colors"
                            title="Gỡ bỏ tài liệu này"
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* RAG Inspector & Search Tester */}
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-xs space-y-5">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Search size={16} className="text-[#00A3FF]" />
                  Công Cụ Kiểm Thử Truy Vấn RAG Thực Tế (Hybrid Inspector)
                </h3>
                <p className="text-[11px] text-gray-500">
                  Gõ một câu hỏi bất kỳ để kiểm tra xem thuật toán RRF trả về đúng đoạn văn bản và đúng trang hay không
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                value={ragSearchQuery}
                onChange={e => setRagSearchQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSearchRag()}
                placeholder="VD: Thời gian bảo hành máy UR5840 là bao lâu? hoặc mã lỗi E2 là gì?"
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
              <button
                onClick={handleSearchRag}
                disabled={searchingRag || !ragSearchQuery.trim()}
                className="bg-[#1B3A6B] hover:bg-[#2A518E] text-white font-semibold rounded-xl px-4 py-2.5 text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                {searchingRag ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
                <span>Chạy Hybrid Search</span>
              </button>
            </div>

            {ragSearchResults.length > 0 && (
              <div className="space-y-3 pt-2">
                <div className="text-xs font-bold text-gray-700">
                  Tìm thấy {ragSearchResults.length} đoạn trích khớp nhất:
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {ragSearchResults.map((chunk, idx) => (
                    <div
                      key={chunk.id || idx}
                      className="p-4 rounded-xl border border-blue-100 bg-blue-50/30 space-y-2 text-xs"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-blue-100 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#1B3A6B]">
                            #{idx + 1}. {chunk.sourceTitle || chunk.fileName || 'Tài liệu'}
                          </span>
                          <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 text-[10px] font-semibold">
                            Trang {chunk.metadata?.pageNumber || 1}
                          </span>
                          {chunk.sectionTitle && (
                            <span className="text-gray-500 text-[11px] truncate max-w-xs">
                              • {chunk.sectionTitle}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-[11px]">
                          <span className="px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-semibold" title="RRF Score">
                            RRF Score: {(chunk.rrfScore * 100).toFixed(2)}%
                          </span>
                          <span className="text-gray-500" title="Vector Cosine Similarity">
                            Vector: {(chunk.vectorSimilarity * 100).toFixed(1)}%
                          </span>
                          <span className="text-gray-500" title="Full-text Score">
                            Text: {chunk.textScore.toFixed(2)}
                          </span>
                        </div>
                      </div>
                      <div className="text-gray-800 whitespace-pre-wrap leading-relaxed font-sans bg-white p-3 rounded-lg border border-gray-100">
                        {chunk.content}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 4: FAQ MANAGEMENT ── */}
      {activeTab === 'faq' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <HelpCircle size={18} className="text-[#00A3FF]" />
                Danh Sách Câu Hỏi Thường Gặp (FAQ Chuẩn)
              </h2>
              <p className="text-xs text-gray-500 mt-0.5">
                Các cặp Hỏi - Đáp mẫu được ưu tiên nạp thẳng vào bộ nhớ ngắn hạn của AI để luôn trả lời chuẩn xác 100%.
              </p>
            </div>

            <button
              onClick={() => setShowAddFaq(true)}
              className="bg-[#1B3A6B] hover:bg-[#2A518E] text-white font-semibold rounded-xl px-4 py-2.5 text-xs shadow-xs transition-all flex items-center gap-1.5"
            >
              <Plus size={15} />
              <span>Thêm câu hỏi mới</span>
            </button>
          </div>

          {/* Khung thêm FAQ mới */}
          {showAddFaq && (
            <div className="bg-blue-50/50 p-5 rounded-2xl border border-blue-200/80 shadow-xs space-y-4 animate-scale-in">
              <h3 className="text-xs font-bold text-[#1B3A6B] uppercase tracking-wider">Thêm mới cặp Hỏi - Đáp</h3>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Phân loại / Chủ đề</label>
                  <input
                    type="text"
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    placeholder="Ví dụ: Giá cả, Kỹ thuật, Bảo hành..."
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-xs font-semibold text-gray-700 mb-1">Câu hỏi của khách</label>
                  <input
                    type="text"
                    value={newQuestion}
                    onChange={e => setNewQuestion(e.target.value)}
                    placeholder="Ví dụ: Giá thay lõi số 1 là bao nhiêu?"
                    className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Câu trả lời mẫu của Truliva</label>
                <textarea
                  rows={3}
                  value={newAnswer}
                  onChange={e => setNewAnswer(e.target.value)}
                  placeholder="Ví dụ: Dạ lõi lọc số 1 Truliva chính hãng hiện có giá niêm yết là..."
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 bg-white text-xs"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  onClick={() => setShowAddFaq(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-gray-600 hover:bg-white rounded-xl"
                >
                  Hủy
                </button>
                <button
                  onClick={handleAddFaq}
                  className="bg-[#1B3A6B] hover:bg-[#2A518E] text-white font-semibold px-4 py-2 text-xs rounded-xl"
                >
                  Thêm vào danh sách
                </button>
              </div>
            </div>
          )}

          {/* Danh sách FAQ Cards */}
          <div className="grid grid-cols-1 gap-3.5">
            {config.faqs?.map((faq, index) => (
              <div
                key={index}
                className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs hover:border-blue-200 transition-all flex flex-col sm:flex-row items-start justify-between gap-4"
              >
                <div className="space-y-2 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
                      {faq.category || 'Chung'}
                    </span>
                    <h4 className="text-sm font-bold text-gray-900">
                      {faq.question}
                    </h4>
                  </div>
                  <p className="text-xs text-gray-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed whitespace-pre-wrap">
                    {faq.answer}
                  </p>
                </div>

                <button
                  onClick={() => handleRemoveFaq(index)}
                  className="text-gray-400 hover:text-rose-600 p-2 rounded-lg hover:bg-rose-50 transition-colors shrink-0"
                  title="Xóa câu hỏi này"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}

            {(!config.faqs || config.faqs.length === 0) && (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-100 text-gray-400 text-sm">
                Chưa có câu hỏi thường gặp nào. Hãy bấm "Thêm câu hỏi mới" để nạp cho AI nhé!
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── TAB 5: DATABASE SYNC ── */}
      {activeTab === 'database' && (
        <div className="space-y-6 animate-fade-in">
          <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div className="space-y-1">
              <h2 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <Database size={18} className="text-[#00A3FF]" />
                Tự Động Liên Kết Danh Mục Máy & Linh Kiện Truliva
              </h2>
              <p className="text-xs text-gray-500">
                Khi bật tính năng này, AI sẽ tự động đọc trực tiếp bảng Sản phẩm và Combos trong Database PostgreSQL của Truliva.
              </p>
            </div>

            <div className="flex items-center gap-3">
              {loadingCatalog && <Loader2 size={16} className="animate-spin text-[#00A3FF]" />}
              <label className="text-xs font-semibold text-gray-700">Đồng bộ Database:</label>
              <input
                type="checkbox"
                checked={config.syncCatalog}
                onChange={e => setConfig({ ...config, syncCatalog: e.target.checked })}
                className="w-5 h-5 text-[#1B3A6B] rounded-md border-gray-300 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Box Sản phẩm */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Package size={16} className="text-blue-600" />
                  Sản phẩm & Linh kiện mẫu trong DB
                </h3>
                <span className="text-xs font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full">
                  {catalog?.totalActiveProducts || 0} sản phẩm
                </span>
              </div>

              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto pr-1 text-xs">
                {catalog?.products.map(p => (
                  <div key={p.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-800">{p.name}</div>
                      <div className="text-[11px] text-gray-400">SKU: {p.sku}</div>
                    </div>
                    <div className="font-bold text-[#1B3A6B]">
                      {p.sellingPrice ? `${p.sellingPrice.toLocaleString('vi-VN')} đ` : 'Liên hệ'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Box Combos */}
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-gray-100 pb-3">
                <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                  <Sparkles size={16} className="text-[#00A3FF]" />
                  Các gói Combo Lõi lọc & Giải pháp
                </h3>
                <span className="text-xs font-bold text-cyan-700 bg-cyan-50 px-2 py-0.5 rounded-full">
                  {catalog?.totalActiveCombos || 0} combo
                </span>
              </div>

              <div className="divide-y divide-gray-100 max-h-96 overflow-y-auto pr-1 text-xs">
                {catalog?.combos.map(c => (
                  <div key={c.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="font-semibold text-gray-800">{c.displayName}</div>
                      <div className="text-[11px] text-gray-400 font-mono">Key: {c.comboKey}</div>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold bg-cyan-50 text-cyan-700 rounded-md">
                      Combo
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── TAB 6: PLAYGROUND TEST CHAT ── */}
      {activeTab === 'playground' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          <div className="space-y-4">
            <div className="bg-white p-5 rounded-2xl border border-gray-100 shadow-xs space-y-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Bot size={16} className="text-[#00A3FF]" />
                Trạng Thái Mô Hình AI
              </h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Mô hình LLM:</span>
                  <span className="font-semibold text-gray-800">Gemini 3.5 Flash Lite</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Mô hình Embedding:</span>
                  <span className="font-semibold text-gray-800">Gemini Embedding (768d)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Công cụ RAG:</span>
                  <span className="font-semibold text-emerald-600">HNSW + BM25 (RRF)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-gray-100">
                  <span className="text-gray-500">Tài liệu đã nạp:</span>
                  <span className="font-semibold text-blue-600">{documents.length} tài liệu</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-gray-500">Đồng bộ Sản phẩm DB:</span>
                  <span className={`font-semibold ${config.syncCatalog ? 'text-emerald-600' : 'text-gray-400'}`}>
                    {config.syncCatalog ? 'Đang bật' : 'Tắt'}
                  </span>
                </div>
              </div>
            </div>

            <div className="bg-amber-50/60 p-4 rounded-2xl border border-amber-200/70 text-xs text-amber-900 space-y-1.5">
              <h4 className="font-bold flex items-center gap-1.5">
                <AlertCircle size={14} className="text-amber-600" />
                Mẹo thử nghiệm
              </h4>
              <p className="text-[11px] leading-relaxed text-amber-800">
                Thử hỏi các câu hỏi hóc búa như: <i>"Máy UR5840 bảo hành bao lâu?"</i>, <i>"Báo giá combo lõi 1-2-3"</i>, hoặc <i>"Lỗi rò rỉ nước xử lý thế nào?"</i> để kiểm tra tính chính xác của tài liệu RAG và FAQ.
              </p>
            </div>
          </div>

          <div className="lg:col-span-2 bg-white rounded-2xl border border-gray-100 shadow-xs flex flex-col h-[650px] overflow-hidden">
            {/* Header khung chat */}
            <div className="px-5 py-3.5 bg-slate-50 border-b border-gray-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#1B3A6B] text-white flex items-center justify-center font-bold text-xs">
                  AI
                </div>
                <div>
                  <h4 className="text-xs font-bold text-gray-900">{config.botName || 'Truliva Assistant'}</h4>
                  <p className="text-[10px] text-emerald-600 font-semibold">● Trực tuyến (Gemini Flash + Hybrid RAG)</p>
                </div>
              </div>

              <button
                onClick={() => setChatMessages([])}
                className="text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1"
                title="Xóa lịch sử chat"
              >
                <RefreshCw size={12} />
                <span>Xóa hội thoại</span>
              </button>
            </div>

            {/* Khung tin nhắn */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3.5 text-xs bg-slate-50/40">
              {chatMessages.map((msg, i) => (
                <div
                  key={i}
                  className={`flex flex-col ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <div
                    className={`max-w-[85%] px-4 py-2.5 rounded-2xl leading-relaxed whitespace-pre-wrap ${
                      msg.sender === 'user'
                        ? 'bg-[#1B3A6B] text-white rounded-tr-xs'
                        : 'bg-white text-gray-800 border border-gray-200/80 shadow-2xs rounded-tl-xs'
                    }`}
                  >
                    {msg.text}

                    {/* Hiển thị nguồn trích dẫn RAG nếu có */}
                    {msg.retrievedChunks && msg.retrievedChunks.length > 0 && (
                      <div className="mt-3 pt-2.5 border-t border-gray-100 space-y-1.5 text-[11px] text-gray-600">
                        <div className="font-bold text-blue-700 flex items-center gap-1">
                          <FileText size={12} />
                          <span>Tài liệu trích dẫn từ RAG ({msg.retrievedChunks.length}):</span>
                        </div>
                        {msg.retrievedChunks.map((chunk, cIdx) => (
                          <div key={cIdx} className="bg-blue-50/60 p-2 rounded-lg border border-blue-100/60">
                            <span className="font-semibold text-blue-900">
                              #{cIdx + 1}. {chunk.sourceTitle || chunk.fileName} (Trang {chunk.metadata?.pageNumber || 1})
                            </span>
                            <span className="text-[10px] text-emerald-700 ml-2">
                              Khớp {(chunk.rrfScore * 100).toFixed(1)}%
                            </span>
                            <div className="text-[10.5px] text-gray-700 mt-1 line-clamp-2 italic">
                              "{chunk.content}"
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-400 mt-1 px-1">{msg.time}</span>
                </div>
              ))}

              {testingChat && (
                <div className="flex items-center gap-2 text-gray-400 text-xs italic p-2">
                  <Loader2 size={14} className="animate-spin text-blue-600" />
                  <span>Trợ lý AI đang tra cứu tài liệu RAG và suy luận...</span>
                </div>
              )}
            </div>

            {/* Thanh nhập chat */}
            <div className="p-3 bg-white border-t border-gray-100 flex items-center gap-2">
              <input
                type="text"
                value={testInput}
                onChange={e => setTestInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSendTestChat()}
                placeholder="Nhập câu hỏi để thử nghiệm phản hồi của AI..."
                className="flex-1 px-3.5 py-2.5 rounded-xl border border-gray-200 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-600"
              />
              <button
                onClick={handleSendTestChat}
                disabled={testingChat || !testInput.trim()}
                className="bg-[#1B3A6B] hover:bg-[#2A518E] text-white font-semibold rounded-xl px-4 py-2.5 text-xs flex items-center gap-1.5 transition-all disabled:opacity-50"
              >
                <Send size={14} />
                <span>Gửi</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
