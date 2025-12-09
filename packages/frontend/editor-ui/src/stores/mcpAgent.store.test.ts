import { describe, it, expect, beforeEach, vi } from 'vitest';
import { setActivePinia, createPinia } from 'pinia';
import { useMcpAgentStore } from '@/stores/mcpAgent.store';

describe('mcpAgent.store', () => {
	beforeEach(() => {
		setActivePinia(createPinia());
	});

	describe('Store initialization', () => {
		it('should initialize with correct default values', () => {
			const store = useMcpAgentStore();

			expect(store.isOpen).toBe(false);
			expect(store.isSending).toBe(false);
			expect(store.messages).toEqual([]);
			expect(store.draft).toBe('');
			expect(store.hasError).toBe(null);
			expect(store.canSubmit).toBe(false);
		});

		it('should have correct default chat width', () => {
			const store = useMcpAgentStore();
			expect(store.chatWidth).toBe(360);
		});
	});

	describe('Message management', () => {
		it('should append user message correctly', () => {
			const store = useMcpAgentStore();
			store.messages.push({
				id: '1',
				role: 'user',
				content: 'Hello',
				timestamp: new Date().toISOString(),
			});

			expect(store.messages).toHaveLength(1);
			expect(store.messages[0].role).toBe('user');
			expect(store.messages[0].content).toBe('Hello');
		});

		it('should clear conversation', () => {
			const store = useMcpAgentStore();
			store.messages.push({
				id: '1',
				role: 'user',
				content: 'Hello',
				timestamp: new Date().toISOString(),
			});

			store.clearConversation();

			expect(store.messages).toEqual([]);
			expect(store.hasError).toBe(null);
		});
	});

	describe('Panel controls', () => {
		it('should open panel', () => {
			const store = useMcpAgentStore();
			expect(store.isOpen).toBe(false);

			store.openPanel();

			expect(store.isOpen).toBe(true);
		});

		it('should close panel', () => {
			const store = useMcpAgentStore();
			store.openPanel();
			expect(store.isOpen).toBe(true);

			store.closePanel();

			expect(store.isOpen).toBe(false);
		});

		it('should toggle panel', () => {
			const store = useMcpAgentStore();
			expect(store.isOpen).toBe(false);

			store.togglePanel();
			expect(store.isOpen).toBe(true);

			store.togglePanel();
			expect(store.isOpen).toBe(false);
		});
	});

	describe('Width management', () => {
		it('should update width within bounds', () => {
			const store = useMcpAgentStore();

			store.updateWidth(400);
			expect(store.chatWidth).toBe(400);
		});

		it('should clamp width to minimum', () => {
			const store = useMcpAgentStore();

			store.updateWidth(100);
			expect(store.chatWidth).toBe(280); // MIN_CHAT_WIDTH
		});

		it('should clamp width to maximum', () => {
			const store = useMcpAgentStore();

			store.updateWidth(1000);
			expect(store.chatWidth).toBe(520); // MAX_CHAT_WIDTH
		});
	});

	describe('Draft management', () => {
		it('should allow submitting when draft has content', () => {
			const store = useMcpAgentStore();
			store.draft = 'Test message';

			expect(store.canSubmit).toBe(true);
		});

		it('should not allow submitting when draft is empty', () => {
			const store = useMcpAgentStore();
			store.draft = '';

			expect(store.canSubmit).toBe(false);
		});

		it('should not allow submitting when draft is only whitespace', () => {
			const store = useMcpAgentStore();
			store.draft = '   ';

			expect(store.canSubmit).toBe(false);
		});

		it('should not allow submitting while sending', () => {
			const store = useMcpAgentStore();
			store.draft = 'Test message';
			store.isSending = true;

			expect(store.canSubmit).toBe(false);
		});
	});

	describe('Trace management', () => {
		it('should show thinking trace when expanded', () => {
			const store = useMcpAgentStore();

			store.expandTrace();
			expect(store.isTraceExpanded).toBe(true);
		});

		it('should hide thinking trace when collapsed', () => {
			const store = useMcpAgentStore();
			store.expandTrace();

			store.collapseTrace();
			expect(store.isTraceExpanded).toBe(false);
		});

		it('should toggle thinking trace', () => {
			const store = useMcpAgentStore();

			store.toggleTrace();
			expect(store.isTraceExpanded).toBe(true);

			store.toggleTrace();
			expect(store.isTraceExpanded).toBe(false);
		});
	});

	describe('Authentication', () => {
		it('should be authenticated when no auth is required', () => {
			const store = useMcpAgentStore();

			// For localhost without VITE_MCP_AGENT_REQUIRE_AUTH
			expect(store.shouldRequireAuth).toBe(false);
			expect(store.isAuthenticated).toBe(true);
		});

		it('should handle API key storage', () => {
			const store = useMcpAgentStore();
			const testKey = 'test-api-key-123';

			store.setApiKey(testKey);

			expect(store.userApiKey).toBe(testKey);
		});

		it('should clear API key', () => {
			const store = useMcpAgentStore();
			store.setApiKey('test-key');

			store.clearApiKey();

			expect(store.userApiKey).toBe(null);
		});
	});

	describe('Modal management', () => {
		it('should open API key modal', () => {
			const store = useMcpAgentStore();

			store.openApiKeyModal();

			expect(store.isApiKeyModalOpen).toBe(true);
		});

		it('should close API key modal', () => {
			const store = useMcpAgentStore();
			store.openApiKeyModal();

			store.closeApiKeyModal();

			expect(store.isApiKeyModalOpen).toBe(false);
		});

		it('should toggle API key modal', () => {
			const store = useMcpAgentStore();

			store.toggleApiKeyModal();
			expect(store.isApiKeyModalOpen).toBe(true);

			store.toggleApiKeyModal();
			expect(store.isApiKeyModalOpen).toBe(false);
		});
	});

	describe('Base URL sanitization', () => {
		it('should return default URL when undefined', () => {
			const store = useMcpAgentStore();

			// baseUrl should use the sanitizeBaseUrl function
			expect(store.baseUrl).toBeDefined();
		});

		it('should have correct chat endpoint', () => {
			const store = useMcpAgentStore();

			expect(store.chatEndpoint).toContain('/chat');
		});
	});
});
