import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import { useUIStore } from './ui.store';

export type McpAgentMessageRole = 'user' | 'assistant' | 'system' | 'error';

export interface McpAgentMessage {
	id: string;
	role: McpAgentMessageRole;
	content: string;
	timestamp: string;
	trace?: McpAgentTraceEntry[];
}

type McpAgentEventType =
	| 'assistant_message'
	| 'tool_call'
	| 'tool_result'
	| 'thought'
	| 'system_notice';

interface McpAgentEvent {
	type: McpAgentEventType;
	content?: unknown;
	metadata?: Record<string, unknown> | null;
}

interface McpAgentTraceEntry {
	id: string;
	type: McpAgentEventType;
	summary: string;
	timestamp: string;
}

const DEFAULT_CHAT_WIDTH = 360;
const MIN_CHAT_WIDTH = 280;
const MAX_CHAT_WIDTH = 520;
export const TRACE_PLACEHOLDER_SUMMARY = 'Waiting for response…';

function sanitizeBaseUrl(raw: string | undefined): string {
	if (!raw) return 'http://localhost:8000';
	return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

export const useMcpAgentStore = defineStore('mcpAgent', () => {
	const uiStore = useUIStore();

	const chatWidth = ref<number>(DEFAULT_CHAT_WIDTH);
	const isOpen = ref(false);
	const isSending = ref(false);
	const hasError = ref<string | null>(null);
	const sessionId = ref<string | null>(null);
	const messages = ref<McpAgentMessage[]>([]);
	const draft = ref('');
	const trace = ref<McpAgentTraceEntry[]>([]);
	const isTraceExpanded = ref(false);
	const userApiKey = ref<string | null>(null);
	const isApiKeyModalOpen = ref(false);
	const isUpgradeModalOpen = ref(false);
	const rateLimitError = ref<{ limit: number; reset_at: string } | null>(null);
	const plans = ref<
		Array<{
			id: string;
			name: string;
			price: number;
			currency: string;
			interval: string;
			description: string;
			features: string[];
			rate_limit: number;
			price_id: string | null;
			popular?: boolean;
		}>
	>([]);

	const baseUrl = computed(() =>
		sanitizeBaseUrl(import.meta.env.VITE_MCP_AGENT_API_URL as string | undefined),
	);

	const chatEndpoint = computed(() => `${baseUrl.value}/chat`);
	const apiToken = import.meta.env.VITE_MCP_AGENT_API_TOKEN as string | undefined;
	const apiKeyGenerationUrl =
		(import.meta.env.VITE_MCP_AGENT_KEY_URL as string | undefined) || 'https://vibe8n.io/dashboard';

	const shouldRequireAuth = computed(() => {
		const apiUrl = baseUrl.value.toLowerCase();

		// Cloud URLs (vibe8n.io) always require auth
		if (apiUrl.includes('vibe8n.io')) {
			return true;
		}

		// For localhost/self-hosted: only require auth if explicitly enabled
		const requireAuthFlag = import.meta.env.VITE_MCP_AGENT_REQUIRE_AUTH as string | undefined;
		console.log('[McpAgent] shouldRequireAuth check:', {
			apiUrl,
			requireAuthFlag,
			result: requireAuthFlag === 'true',
		});
		return requireAuthFlag === 'true';
	});

	const isAuthenticated = computed(() => {
		// If auth is not required, always consider authenticated
		if (!shouldRequireAuth.value) {
			console.log('[McpAgent] isAuthenticated: true (auth not required)');
			return true;
		}
		// If auth is required, check for user API key
		const result = !!userApiKey.value;
		console.log('[McpAgent] isAuthenticated:', result, 'userApiKey:', userApiKey.value);
		return result;
	});
	const eventStream = ref<EventSource | null>(null);
	const hasReceivedStreamEvent = ref(false);
	const isBrowser = typeof window !== 'undefined';
	const eventStreamUrl = computed(() => {
		if (!sessionId.value) return null;
		const base = `${baseUrl.value}/sessions/${sessionId.value}/events`;

		// Prefer user API key over environment token
		const token = userApiKey.value || apiToken;
		if (!token) {
			return base;
		}
		const separator = base.includes('?') ? '&' : '?';
		return `${base}${separator}token=${encodeURIComponent(token)}`;
	});

	const canSubmit = computed(() => draft.value.trim().length > 0 && !isSending.value);
	const hasTrace = computed(() => trace.value.length > 0);
	const thinkingTrace = computed(() => trace.value);

	function disconnectEventStream() {
		if (eventStream.value) {
			eventStream.value.close();
			eventStream.value = null;
		}
	}

	function connectEventStream() {
		if (!isBrowser) return;
		const url = eventStreamUrl.value;
		if (!url) return;
		if (eventStream.value) {
			eventStream.value.close();
		}
		try {
			const source = new EventSource(url);
			source.onmessage = (event) => {
				if (!event.data) return;
				try {
					const parsed = JSON.parse(event.data) as McpAgentEvent & { session_id?: string };
					if (parsed.session_id && parsed.session_id !== sessionId.value) {
						return;
					}
					const { session_id: _ignored, ...agentEvent } = parsed as McpAgentEvent & {
						session_id?: string;
					};
					if (!('type' in agentEvent)) return;
					handleStreamedEvent(agentEvent as McpAgentEvent);
				} catch (error) {
					console.warn('[McpAgent] Failed to parse event stream payload', error);
				}
			};
			source.onerror = (error) => {
				console.warn('[McpAgent] Event stream error', error);
			};
			eventStream.value = source;
		} catch (error) {
			console.warn('[McpAgent] Unable to open event stream', error);
		}
	}

	function startNewSession() {
		disconnectEventStream();
		sessionId.value = crypto.randomUUID();
		hasReceivedStreamEvent.value = false;
		if (isBrowser) {
			connectEventStream();
		}
	}

	function ensureSession() {
		if (!sessionId.value) {
			startNewSession();
			return;
		}
		if (isBrowser && !eventStream.value) {
			connectEventStream();
		}
	}

	function timestamp(): string {
		return new Date().toISOString();
	}

	function resetTrace(options: { collapse?: boolean } = {}): void {
		trace.value = [];
		if (options.collapse) {
			isTraceExpanded.value = false;
		}
	}

	function seedTracePlaceholder(): void {
		trace.value.push({
			id: crypto.randomUUID(),
			type: 'system_notice',
			summary: TRACE_PLACEHOLDER_SUMMARY,
			timestamp: timestamp(),
		});
	}

	function removeTracePlaceholder(): void {
		if (trace.value.length && trace.value[0]?.summary === TRACE_PLACEHOLDER_SUMMARY) {
			trace.value.shift();
		}
	}

	function recordTrace(event: McpAgentEvent, summary: string): void {
		trace.value.push({
			id: crypto.randomUUID(),
			type: event.type,
			summary,
			timestamp: timestamp(),
		});
	}

	function toggleTrace(): void {
		isTraceExpanded.value = !isTraceExpanded.value;
	}

	function expandTrace(): void {
		isTraceExpanded.value = true;
	}

	function collapseTrace(): void {
		isTraceExpanded.value = false;
	}

	function appendMessage(
		role: McpAgentMessageRole,
		content: string,
		traceEntries?: McpAgentTraceEntry[],
	) {
		messages.value.push({
			id: crypto.randomUUID(),
			role,
			content: role === 'assistant' ? formatAssistantMessage(content) : content,
			timestamp: timestamp(),
			trace: traceEntries && traceEntries.length > 0 ? traceEntries : undefined,
		});
	}

	function formatAssistantMessage(content: string): string {
		const trimmed = content.trim();
		if (!trimmed) {
			return content;
		}

		const structured = extractStructuredJson(trimmed);
		if (!structured) {
			return content;
		}

		const { json, index } = structured;
		const prefix = trimmed.slice(0, index).trimEnd();

		if (typeof json === 'object' && json !== null) {
			const obj = json as Record<string, unknown>;

			if (obj.type === 'response' && typeof obj.content === 'string') {
				return prefix ? `${prefix}\n\n${obj.content}` : obj.content;
			}

			if (obj.type === 'tool_call') {
				const toolName = typeof obj.tool === 'string' && obj.tool ? obj.tool : 'tool';
				const actionText = `Running ${toolName}…`;
				return prefix ? `${prefix}\n\n${actionText}` : actionText;
			}
		}

		return content;
	}

	function extractStructuredJson(raw: string): { json: unknown; index: number } | null {
		const trimmed = raw.trimEnd();
		let searchIndex = trimmed.lastIndexOf('{');
		while (searchIndex !== -1) {
			const candidate = trimmed.slice(searchIndex);
			try {
				const parsed = JSON.parse(candidate);
				return {
					json: parsed,
					index: searchIndex,
				};
			} catch (error) {
				searchIndex = trimmed.lastIndexOf('{', searchIndex - 1);
			}
		}
		return null;
	}

	function openPanel() {
		if (isOpen.value) return;
		ensureSession();
		isOpen.value = true;
		messages.value = messages.value.map((msg) => ({ ...msg }));
		uiStore.appGridDimensions = {
			...uiStore.appGridDimensions,
			width: window.innerWidth - chatWidth.value,
		};
	}

	function closePanel() {
		if (!isOpen.value) return;
		isOpen.value = false;
		setTimeout(() => {
			uiStore.appGridDimensions = {
				...uiStore.appGridDimensions,
				width: window.innerWidth,
			};
		}, 350);
	}

	function togglePanel() {
		if (isOpen.value) {
			closePanel();
		} else {
			openPanel();
		}
	}

	function updateWidth(width: number) {
		const clamped = Math.min(Math.max(width, MIN_CHAT_WIDTH), MAX_CHAT_WIDTH);
		chatWidth.value = clamped;
		if (isOpen.value) {
			uiStore.appGridDimensions = {
				...uiStore.appGridDimensions,
				width: window.innerWidth - clamped,
			};
		}
	}

	function clearConversation() {
		messages.value = [];
		hasError.value = null;
		resetTrace({ collapse: true });
		startNewSession();
	}

	function loadApiKeyFromStorage(): void {
		if (!isBrowser) return;
		try {
			const stored = localStorage.getItem('mcpAgentApiKey');
			if (stored) {
				userApiKey.value = stored;
			}
		} catch (error) {
			console.warn('[McpAgent] Failed to load API key from localStorage', error);
		}
	}

	function saveApiKeyToStorage(apiKey: string): void {
		if (!isBrowser) return;
		try {
			localStorage.setItem('mcpAgentApiKey', apiKey);
			userApiKey.value = apiKey;
		} catch (error) {
			console.warn('[McpAgent] Failed to save API key to localStorage', error);
		}
	}

	function clearApiKey(): void {
		if (!isBrowser) return;
		try {
			localStorage.removeItem('mcpAgentApiKey');
			userApiKey.value = null;
		} catch (error) {
			console.warn('[McpAgent] Failed to clear API key', error);
		}
	}

	function setApiKey(apiKey: string): void {
		saveApiKeyToStorage(apiKey);
		isApiKeyModalOpen.value = false;
		// Reconnect event stream with new auth token
		if (sessionId.value && isBrowser) {
			disconnectEventStream();
			connectEventStream();
		}
	}

	function openApiKeyModal(): void {
		isApiKeyModalOpen.value = true;
	}

	function closeApiKeyModal(): void {
		isApiKeyModalOpen.value = false;
	}

	function toggleApiKeyModal(): void {
		isApiKeyModalOpen.value = !isApiKeyModalOpen.value;
	}

	function handleAgentEvents(events: McpAgentEvent[], finalMessage?: string) {
		let assistantMessageContent: string | null = null;
		let assistantMessageEmitted = false;
		removeTracePlaceholder();
		const collectedTrace: McpAgentTraceEntry[] = [];

		// First pass: collect all trace entries and find assistant message
		for (const event of events) {
			if (event.type === 'assistant_message') {
				const content = coerceContent(event.content);
				if (content) {
					assistantMessageContent = content;
				}
				continue;
			}

			const summary = summariseEvent(event);
			if (summary) {
				const traceEntry = {
					id: crypto.randomUUID(),
					type: event.type,
					summary,
					timestamp: timestamp(),
				};
				collectedTrace.push(traceEntry);
				recordTrace(event, summary);
			}
		}

		// Second pass: append assistant message with collected trace
		if (assistantMessageContent) {
			appendMessage(
				'assistant',
				assistantMessageContent,
				collectedTrace.length > 0 ? [...collectedTrace] : undefined,
			);
			assistantMessageEmitted = true;
		}

		if (!assistantMessageEmitted && finalMessage) {
			appendMessage(
				'assistant',
				finalMessage,
				collectedTrace.length > 0 ? [...collectedTrace] : undefined,
			);
		}

		if (!events.length) {
			removeTracePlaceholder();
		}
	}

	function handleStreamedEvent(event: McpAgentEvent) {
		hasReceivedStreamEvent.value = true;
		handleAgentEvents([event]);
	}

	async function sendDraft() {
		const text = draft.value.trim();
		if (!text || isSending.value) return;

		ensureSession();
		appendMessage('user', text);
		draft.value = '';
		hasError.value = null;

		const expandedBeforeSend = isTraceExpanded.value;
		resetTrace({ collapse: !expandedBeforeSend });
		if (expandedBeforeSend) {
			isTraceExpanded.value = true;
		}
		hasReceivedStreamEvent.value = false;
		seedTracePlaceholder();

		isSending.value = true;

		try {
			const headers: Record<string, string> = {
				'Content-Type': 'application/json',
			};

			if (userApiKey.value) {
				headers['Authorization'] = `Bearer ${userApiKey.value}`;
			}

			const response = await fetch(chatEndpoint.value, {
				method: 'POST',
				headers,
				body: JSON.stringify({
					prompt: text,
					session_id: sessionId.value,
				}),
			});

			if (!response.ok) {
				// Handle rate limit errors (429)
				if (response.status === 429) {
					const errorData = await response.json().catch(() => ({}));
					rateLimitError.value = errorData.detail || {};
					isUpgradeModalOpen.value = true;
					throw new Error(
						errorData.detail?.message || 'Rate limit exceeded. Please upgrade your plan.',
					);
				}
				throw new Error(`Request failed with status ${response.status}`);
			}

			const data = await response.json();
			if (typeof data.session_id === 'string') {
				const newSessionId = data.session_id;
				if (newSessionId && newSessionId !== sessionId.value) {
					sessionId.value = newSessionId;
					if (isBrowser) {
						connectEventStream();
					}
				}
			}
			const events = Array.isArray(data.events) ? (data.events as McpAgentEvent[]) : [];
			const finalMessage =
				typeof data.final === 'string'
					? data.final
					: typeof data.response === 'string'
						? data.response
						: undefined;

			if (!hasReceivedStreamEvent.value) {
				if (events.length > 0) {
					handleAgentEvents(events, finalMessage);
				} else if (finalMessage) {
					appendMessage('assistant', finalMessage);
					removeTracePlaceholder();
				} else {
					appendMessage('assistant', JSON.stringify(data));
					removeTracePlaceholder();
				}
			} else {
				if (finalMessage) {
					const normalisedFinal = finalMessage.trim();
					const lastAssistantMessage = [...messages.value]
						.reverse()
						.find((message) => message.role === 'assistant');
					if (!lastAssistantMessage || lastAssistantMessage.content.trim() !== normalisedFinal) {
						// Attach accumulated trace to the final message
						const currentTrace = trace.value.length > 0 ? [...trace.value] : undefined;
						appendMessage('assistant', finalMessage, currentTrace);
						// Clear the global trace now that it's attached to the message
						resetTrace();
					}
				}
				removeTracePlaceholder();
			}
		} catch (error) {
			const message = error instanceof Error ? error.message : 'Unknown error';
			hasError.value = message;
			appendMessage('error', message);
			removeTracePlaceholder();
			recordTrace(
				{ type: 'system_notice', content: message },
				truncateSummary(`Error: ${message}`),
			);
		} finally {
			isSending.value = false;
		}
	}

	async function fetchPlans() {
		try {
			const response = await fetch(`${baseUrl.value}/subscriptions/plans`);
			if (response.ok) {
				const data = await response.json();
				plans.value = data.plans || [];
			}
		} catch (error) {
			console.error('Failed to fetch plans:', error);
		}
	}

	async function openUpgradeModal() {
		isUpgradeModalOpen.value = true;
		// Fetch latest prices from Stripe when modal opens
		await fetchPlans();
	}

	function closeUpgradeModal() {
		isUpgradeModalOpen.value = false;
		rateLimitError.value = null;
	}

	async function createCheckoutSession(plan: 'starter' | 'scale') {
		if (!userApiKey.value) {
			throw new Error('User not authenticated');
		}

		const response = await fetch(`${baseUrl.value}/subscriptions/checkout`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${userApiKey.value}`,
			},
			body: JSON.stringify({
				plan,
				success_url: `${window.location.origin}?payment=success`,
				cancel_url: `${window.location.origin}?payment=cancel`,
			}),
		});

		if (!response.ok) {
			const error = await response.json().catch(() => ({}));
			throw new Error(error.detail || 'Failed to create checkout session');
		}

		const data = await response.json();
		// Redirect to Stripe Checkout
		window.location.href = data.checkout_url;
	}

	// Initialize: load API key from localStorage
	loadApiKeyFromStorage();

	return {
		chatWidth,
		isOpen,
		isSending,
		hasError,
		messages,
		draft,
		canSubmit,
		openPanel,
		closePanel,
		togglePanel,
		updateWidth,
		sendDraft,
		clearConversation,
		thinkingTrace,
		hasTrace,
		isTraceExpanded,
		toggleTrace,
		expandTrace,
		collapseTrace,
		shouldRequireAuth,
		isAuthenticated,
		userApiKey,
		isApiKeyModalOpen,
		setApiKey,
		openApiKeyModal,
		closeApiKeyModal,
		toggleApiKeyModal,
		clearApiKey,
		apiKeyGenerationUrl,
		isUpgradeModalOpen,
		rateLimitError,
		plans,
		fetchPlans,
		openUpgradeModal,
		closeUpgradeModal,
		createCheckoutSession,
	};
});

function coerceContent(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value === null || value === undefined) return '';
	if (typeof value === 'object') {
		try {
			return JSON.stringify(value, null, 2);
		} catch (error) {
			return String(value);
		}
	}
	return String(value);
}

function summariseEvent(event: McpAgentEvent): string | null {
	switch (event.type) {
		case 'thought': {
			// Don't truncate thoughts - users want to see full reasoning
			const content = coerceContent(event.content);
			return content || 'Thinking…';
		}
		case 'tool_call': {
			const toolName = extractToolName(event) || 'tool';
			return `Invoked ${toolName}`;
		}
		case 'tool_result': {
			const toolName = extractToolName(event);
			return toolName ? `${toolName} completed` : 'Tool completed';
		}
		case 'system_notice': {
			// Keep truncation for system notices (usually short anyway)
			const content = truncateSummary(coerceContent(event.content));
			return content || 'System notice';
		}
		default:
			return null;
	}
}

function extractToolName(event: McpAgentEvent): string | undefined {
	// For tool_call events, the tool name is in the content field
	if (event.type === 'tool_call') {
		const content = event.content;
		if (typeof content === 'string') {
			const trimmed = content.trim();
			if (trimmed) return trimmed;
		}
	}

	// For tool_result events, the tool name is in metadata.tool
	if (event.metadata && typeof event.metadata === 'object') {
		const metadata = event.metadata as Record<string, unknown>;
		if (typeof metadata.tool === 'string' && metadata.tool) {
			return metadata.tool;
		}
	}

	return undefined;
}

function truncateSummary(value: string, limit = 200): string {
	const trimmed = value.trim();
	if (trimmed.length <= limit) {
		return trimmed;
	}
	return `${trimmed.slice(0, Math.max(0, limit - 1))}…`;
}
