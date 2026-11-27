export type AgentChannel = 'FACEBOOK' | 'PLAYGROUND' | 'ZALO' | 'WEB';

export type AgentIntent =
  | 'INJECTION_BLOCKED'
  | 'GREETING_CHITCHAT'
  | 'WARRANTY_POLICY_CONTACT'
  | 'TROUBLESHOOT_URGENT'
  | 'VISUAL_INQUIRY'
  | 'PRODUCT_PRICE_SPEC'
  | 'GENERAL_INQUIRY';

export interface GeminiInlineData {
  mime_type: string;
  data: string;
}

export interface GeminiPart {
  text?: string;
  inline_data?: GeminiInlineData;
}

export interface GeminiTurn {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export interface ConversationState {
  sessionKey: string;
  channel: AgentChannel;
  lastActive: number;
  turnCount: number;
  activeModels: string[];
  lastIntent?: AgentIntent;
  turns: GeminiTurn[];
  hydratedFromDb: boolean;
}

export interface GuardrailResult {
  blocked: boolean;
  blockReason?: string;
  sanitizedText: string;
  truncated: boolean;
  imageParts: GeminiPart[];
  droppedImagesCount: number;
}

export type ToolName = 'lookup_catalog' | 'search_rag' | 'match_faq';

export interface ToolResult<T = any> {
  tool: ToolName;
  ok: boolean;
  data: T;
  errorCode?: string;
  errorMessage?: string;
  latencyMs: number;
  skippedAsDuplicate?: boolean;
}

export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ExecutionTrace {
  intent: AgentIntent;
  detectedModels: string[];
  activeModels: string[];
  toolResults: Array<Omit<ToolResult, 'data'>>;
  modelUsed: string;
  usedFallbackReply: boolean;
  fallbackReason?: string;
  totalLatencyMs: number;
}

export interface ClientHistoryEntry {
  role?: string;
  sender?: string;
  text?: string;
}

export interface AgentTurnInput {
  channel: AgentChannel;
  sessionKey: string;
  sessionId?: string;
  userId?: string | null;
  userName?: string;
  message: string;
  imageUrls?: string[];
  clientHistory?: ClientHistoryEntry[];
  turnBudgetMs?: number;
}

export interface AgentTurnOutput {
  reply: string;
  sessionId: string | null;
  retrievedChunks: any[];
  tokens: TokenUsage;
  latencyMs: number;
  model: string;
  trace: ExecutionTrace;
  skippedDisabled?: boolean;
}
