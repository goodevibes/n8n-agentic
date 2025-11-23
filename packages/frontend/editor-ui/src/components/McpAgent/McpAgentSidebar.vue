<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import SlideTransition from '@/components/transitions/SlideTransition.vue';
import {
	N8nButton,
	N8nIconButton,
	N8nResizeWrapper,
	N8nInput,
	N8nMarkdown,
} from '@n8n/design-system';
import { useMcpAgentStore, TRACE_PLACEHOLDER_SUMMARY } from '@/stores/mcpAgent.store';

const store = useMcpAgentStore();
const {
	messages,
	isOpen,
	chatWidth,
	isSending,
	hasError,
	thinkingTrace,
	hasTrace,
	isTraceExpanded,
	isAuthenticated,
	userApiKey,
	isApiKeyModalOpen,
	isUpgradeModalOpen,
	rateLimitError,
	plans,
	pendingApproval,
} = storeToRefs(store);

const apiKeyGenerationUrl = computed(() => store.apiKeyGenerationUrl);

const upgradePlans = computed(() => plans.value.filter((p) => p.id !== 'free'));

const apiKeyInput = ref('');
const isSavingKey = ref(false);
const apiKeyError = ref<string | null>(null);
const vibeApiConfigured = ref(false);
const vibeApiUserEmail = ref<string | null>(null);
const maskedApiKey = computed(() => {
	if (!userApiKey.value) return '';
	return userApiKey.value.slice(0, 12) + '...';
});

// n8n credentials
const n8nApiUrl = ref('');
const n8nApiKey = ref('');
const isSavingN8n = ref(false);
const n8nError = ref<string | null>(null);
const n8nConfigured = ref(false);
const n8nConfiguredUrl = ref<string | null>(null);

// Auto-detect current n8n instance URL (used as default)
const currentN8nUrl = computed(() => {
	const { protocol, hostname, port } = window.location;
	const portSuffix = port && port !== '80' && port !== '443' ? `:${port}` : '';
	return `${protocol}//${hostname}${portSuffix}`;
});

const traceBadgeCount = computed(() =>
	Math.max(
		0,
		thinkingTrace.value.filter((entry) => entry.summary !== TRACE_PLACEHOLDER_SUMMARY).length,
	),
);
const shouldShowThinking = computed(() => isSending.value || hasTrace.value);
const thinkingButtonLabel = computed(() => {
	if (isTraceExpanded.value) return 'Hide thinking';
	return 'Thinking…';
});
const messagesContainer = ref<HTMLElement | null>(null);

function onResize(data: { width: number }) {
	store.updateWidth(data.width);
}

async function onSubmit() {
	await store.sendDraft();
}

function onClear() {
	store.clearConversation();
}

function toggleThinking() {
	store.toggleTrace();
}

function onInputKeydown(event: KeyboardEvent) {
	if (event.key === 'Enter' && !event.shiftKey) {
		event.preventDefault();
		void onSubmit();
	}
}

function scrollToBottom() {
	nextTick(() => {
		const container = messagesContainer.value;
		if (container) {
			container.scrollTop = container.scrollHeight;
		}
	});
}

watch(
	() => messages.value.length,
	() => {
		if (messages.value.length > 0) {
			scrollToBottom();
		}
	},
);

watch(isOpen, (opened) => {
	if (opened) {
		scrollToBottom();
	}
});

watch(isTraceExpanded, (expanded) => {
	if (expanded) {
		scrollToBottom();
	}
});

watch(
	() => thinkingTrace.value.length,
	() => {
		if (isTraceExpanded.value) {
			scrollToBottom();
		}
	},
);

function openKeyGenerationWebsite() {
	window.open(apiKeyGenerationUrl.value, '_blank');
}

async function validateVibeApiKey() {
	if (!userApiKey.value) {
		vibeApiConfigured.value = false;
		vibeApiUserEmail.value = null;
		return;
	}

	try {
		const response = await fetch(`${store.baseUrl}/users/me`, {
			headers: {
				Authorization: `Bearer ${userApiKey.value}`,
			},
		});

		if (response.ok) {
			const data = await response.json();
			vibeApiConfigured.value = true;
			vibeApiUserEmail.value = data.email;
		} else {
			vibeApiConfigured.value = false;
			vibeApiUserEmail.value = null;
		}
	} catch (error) {
		console.error('Failed to validate vibe8n API key:', error);
		vibeApiConfigured.value = false;
		vibeApiUserEmail.value = null;
	}
}

function toggleApiKeySettings() {
	if (!isApiKeyModalOpen.value) {
		// Opening settings - clear the inputs and initialize n8n URL
		apiKeyInput.value = '';
		apiKeyError.value = null;
		n8nApiUrl.value = currentN8nUrl.value; // Initialize with auto-detected URL
		n8nApiKey.value = '';
		n8nError.value = null;
		// Validate both API key statuses
		void validateVibeApiKey();
		void fetchN8nCredentials();
	}
	store.toggleApiKeyModal();
}

async function handleSaveApiKey() {
	const key = apiKeyInput.value.trim();
	if (!key) {
		apiKeyError.value = 'Please enter a valid API key';
		return;
	}

	isSavingKey.value = true;
	apiKeyError.value = null;

	try {
		store.setApiKey(key);
		apiKeyInput.value = '';
		// Validate the new key
		await validateVibeApiKey();

		if (!vibeApiConfigured.value) {
			apiKeyError.value = 'Invalid API key. Please check and try again.';
		}
	} catch (error) {
		apiKeyError.value = error instanceof Error ? error.message : 'Failed to save API key';
	} finally {
		isSavingKey.value = false;
	}
}

function handleRemoveApiKey() {
	store.clearApiKey();
	store.closeApiKeyModal();
}

const errorMessage = computed(() => apiKeyError.value || hasError.value);

async function handleUpgrade(plan: 'starter' | 'scale') {
	try {
		await store.createCheckoutSession(plan);
	} catch (error) {
		console.error('Upgrade error:', error);
	}
}

const rememberChoice = ref<'once' | 'session' | 'always'>('once');
const processingApprovalId = ref<string | null>(null);
const removingApprovalIds = ref<Set<string>>(new Set());

async function handleApprove(approvalId: string) {
	processingApprovalId.value = approvalId;
	await store.respondToApproval(true, rememberChoice.value);
	rememberChoice.value = 'once'; // Reset for next approval

	// Mark as removing to trigger fade animation
	removingApprovalIds.value.add(approvalId);
	await nextTick();

	// Remove from DOM after animation
	setTimeout(() => {
		store.removeApprovalMessage(approvalId);
		removingApprovalIds.value.delete(approvalId);
		processingApprovalId.value = null;
	}, 500); // Match animation duration (400ms + 100ms buffer)
}

async function handleReject(approvalId: string) {
	processingApprovalId.value = approvalId;
	await store.respondToApproval(false);
	rememberChoice.value = 'once'; // Reset for next approval

	// Mark as removing to trigger fade animation
	removingApprovalIds.value.add(approvalId);
	await nextTick();

	// Remove from DOM after animation
	setTimeout(() => {
		store.removeApprovalMessage(approvalId);
		removingApprovalIds.value.delete(approvalId);
		processingApprovalId.value = null;
	}, 500); // Match animation duration (400ms + 100ms buffer)
}

function getRiskLevelColor(riskLevel: string): string {
	switch (riskLevel) {
		case 'destructive':
			return 'var(--color-danger)';
		case 'moderate':
			return 'var(--color-warning)';
		default:
			return 'var(--color-success)';
	}
}

// n8n credentials management
async function fetchN8nCredentials() {
	if (!userApiKey.value) return;

	try {
		const response = await fetch(`${store.baseUrl}/users/me/n8n-credentials`, {
			headers: {
				Authorization: `Bearer ${userApiKey.value}`,
			},
		});

		if (response.ok) {
			const data = await response.json();
			n8nConfigured.value = data.configured;
			n8nConfiguredUrl.value = data.n8n_api_url;
		}
	} catch (error) {
		console.error('Failed to fetch n8n credentials:', error);
	}
}

async function handleSaveN8nCredentials() {
	if (!userApiKey.value) return;

	const url = n8nApiUrl.value.trim(); // Use editable URL
	const key = n8nApiKey.value.trim();

	if (!url) {
		n8nError.value = 'URL is required';
		return;
	}

	if (!key) {
		n8nError.value = 'API key is required';
		return;
	}

	isSavingN8n.value = true;
	n8nError.value = null;

	try {
		const response = await fetch(`${store.baseUrl}/users/me/n8n-credentials`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				Authorization: `Bearer ${userApiKey.value}`,
			},
			body: JSON.stringify({
				n8n_api_url: url,
				n8n_api_key: key,
			}),
		});

		if (!response.ok) {
			const error = await response.json();
			// Handle both string and object error formats
			const errorMessage =
				typeof error.detail === 'string'
					? error.detail
					: error.detail?.message || error.detail?.error || 'Failed to save n8n credentials';
			throw new Error(errorMessage);
		}

		// Clear form and refresh status
		n8nApiUrl.value = '';
		n8nApiKey.value = '';
		await fetchN8nCredentials();
	} catch (error) {
		n8nError.value = error instanceof Error ? error.message : 'Failed to save n8n credentials';
		// Don't clear fields on error so user can see what they entered
	} finally {
		isSavingN8n.value = false;
	}
}

async function handleRemoveN8nCredentials() {
	if (!userApiKey.value) return;

	try {
		const response = await fetch(`${store.baseUrl}/users/me/n8n-credentials`, {
			method: 'DELETE',
			headers: {
				Authorization: `Bearer ${userApiKey.value}`,
			},
		});

		if (!response.ok) {
			throw new Error('Failed to remove credentials');
		}

		n8nConfigured.value = false;
		n8nConfiguredUrl.value = null;
		n8nApiKey.value = '';
	} catch (error) {
		console.error('Failed to remove n8n credentials:', error);
	}
}

// Fetch n8n credentials when authenticated
watch(
	() => isAuthenticated.value,
	(authenticated) => {
		if (authenticated) {
			void fetchN8nCredentials();
		}
	},
	{ immediate: true },
);
</script>

<template>
	<SlideTransition>
		<N8nResizeWrapper
			v-if="isOpen"
			class="panel-wrapper"
			:supported-directions="['left']"
			:width="chatWidth"
			@resize="onResize"
		>
			<div class="panel" :style="{ width: `${chatWidth}px` }">
				<header class="panel__header">
					<div>
						<h3 class="panel__title">vibe8n</h3>
						<p v-if="isAuthenticated" class="panel__subtitle">{{ maskedApiKey }}</p>
						<p v-else class="panel__subtitle">Configure API key to get started</p>
					</div>
					<div class="panel__actions">
						<N8nButton v-if="isAuthenticated" text @click="onClear">Reset</N8nButton>
						<N8nIconButton
							v-if="isAuthenticated"
							icon="cog"
							type="tertiary"
							size="small"
							@click="toggleApiKeySettings"
						/>
						<N8nIconButton icon="x" type="tertiary" size="medium" @click="store.closePanel" />
					</div>
				</header>

				<!-- API Key Configuration Screen -->
				<section v-if="!isAuthenticated && !isApiKeyModalOpen" class="panel__body panel__auth">
					<div class="auth-form">
						<div class="auth-form__content">
							<h4 class="auth-form__title">Configure vibe8n</h4>
							<p class="auth-form__description">
								Get your API key to start using AI-powered workflows
							</p>

							<N8nButton type="secondary" size="large" @click="openKeyGenerationWebsite">
								Get API Key
							</N8nButton>

							<div class="auth-form__divider"></div>

							<form @submit.prevent="handleSaveApiKey" autocomplete="off">
								<p class="auth-form__input-label">Then paste your key below</p>
								<N8nInput
									v-model="apiKeyInput"
									type="password"
									placeholder="v8_..."
									:disabled="isSavingKey"
									autocomplete="new-password"
								/>
								<N8nButton
									type="primary"
									size="large"
									:loading="isSavingKey"
									:disabled="!apiKeyInput.trim()"
									@click="handleSaveApiKey"
								>
									Save API Key
								</N8nButton>
							</form>
						</div>
					</div>
				</section>

				<!-- Settings Screen -->
				<section v-else-if="isApiKeyModalOpen" class="panel__body panel__settings">
					<div class="settings-content">
						<!-- vibe8n API Key Section -->
						<div class="settings-section">
							<h4 class="settings-section__title">vibe8n API</h4>
							<p
								v-if="vibeApiConfigured"
								class="settings-section__status settings-section__status--success"
							>
								✓ Connected as <code>{{ vibeApiUserEmail }}</code>
							</p>
							<p v-else-if="userApiKey" class="settings-section__status">
								Current: <code>{{ maskedApiKey }}</code>
							</p>
							<form @submit.prevent="handleSaveApiKey" autocomplete="off" class="settings-form">
								<N8nInput
									v-model="apiKeyInput"
									type="password"
									placeholder="Enter new API key..."
									:disabled="isSavingKey"
									autocomplete="new-password"
								/>
								<div class="settings-actions">
									<N8nButton
										type="primary"
										:loading="isSavingKey"
										:disabled="!apiKeyInput.trim()"
										@click="handleSaveApiKey"
									>
										Update
									</N8nButton>
									<N8nButton type="tertiary" @click="openKeyGenerationWebsite"> Get Key </N8nButton>
								</div>
							</form>
						</div>

						<!-- n8n Connection Section -->
						<div class="settings-section">
							<h4 class="settings-section__title">n8n Connection</h4>
							<p
								v-if="n8nConfigured"
								class="settings-section__status settings-section__status--success"
							>
								✓ Connected to <code>{{ n8nConfiguredUrl }}</code>
							</p>
							<form
								@submit.prevent="handleSaveN8nCredentials"
								autocomplete="off"
								class="settings-form"
							>
								<N8nInput
									id="n8nApiUrl"
									name="n8nApiUrl"
									v-model="n8nApiUrl"
									type="text"
									placeholder="n8n instance URL (e.g., http://localhost:5678)"
									:disabled="isSavingN8n || n8nConfigured"
									autocomplete="url"
								/>
								<N8nInput
									id="n8nApiKey"
									name="n8nApiKey"
									v-model="n8nApiKey"
									type="password"
									placeholder="Enter your n8n API key..."
									:disabled="isSavingN8n || n8nConfigured"
									autocomplete="new-password"
								/>
								<p v-if="n8nError" class="form-error">{{ n8nError }}</p>
								<div class="settings-actions">
									<N8nButton
										v-if="!n8nConfigured"
										type="primary"
										:loading="isSavingN8n"
										:disabled="!n8nApiUrl.trim() || !n8nApiKey.trim()"
										@click="handleSaveN8nCredentials"
									>
										Connect
									</N8nButton>
									<N8nButton
										v-else
										type="secondary"
										:disabled="isSavingN8n"
										@click="handleRemoveN8nCredentials"
									>
										Disconnect
									</N8nButton>
									<N8nButton
										type="tertiary"
										tag="a"
										href="https://docs.n8n.io/api/authentication/"
										target="_blank"
										rel="noopener noreferrer"
										@click.prevent="
											() => window.open('https://docs.n8n.io/api/authentication/', '_blank')
										"
									>
										Get Key
									</N8nButton>
								</div>
							</form>
						</div>
					</div>
				</section>

				<!-- Chat Screen -->
				<section v-else ref="messagesContainer" class="panel__body">
					<ul class="messages">
						<template v-for="message in messages" :key="message.id">
							<li
								v-if="message.role === 'assistant' && message.trace && message.trace.length > 0"
								class="thinking-item"
							>
								<div class="thinking">
									<N8nButton
										type="tertiary"
										size="small"
										:class="['thinking__toggle', { 'thinking__toggle--active': isTraceExpanded }]"
										@click="toggleThinking"
									>
										{{ isTraceExpanded ? 'Hide thinking' : 'Show thinking' }}
										<span v-if="message.trace.length > 0" class="thinking__badge">{{
											message.trace.length
										}}</span>
									</N8nButton>
									<transition name="fade">
										<ul v-if="isTraceExpanded" class="thinking__timeline">
											<li v-for="entry in message.trace" :key="entry.id" class="thinking__item">
												<span class="thinking__summary">{{ entry.summary }}</span>
												<time>{{ new Date(entry.timestamp).toLocaleTimeString() }}</time>
											</li>
										</ul>
									</transition>
								</div>
							</li>

							<!-- Approval Request Card -->
							<li
								v-if="message.role === 'approval' && message.metadata"
								class="messages__item messages__item--approval"
								:class="{
									'messages__item--removing': removingApprovalIds.has(
										String(message.metadata.approval_id),
									),
								}"
							>
								<div
									class="approval-card"
									:class="{
										'approval-card--processing':
											processingApprovalId === message.metadata.approval_id,
									}"
								>
									<div class="approval-card__content">
										<span class="approval-card__title"
											>Approve <code>{{ message.metadata.tool_name }}</code
											>?</span
										>
										<div class="approval-card__actions">
											<N8nButton
												type="primary"
												size="mini"
												:loading="processingApprovalId === message.metadata.approval_id"
												:disabled="processingApprovalId === message.metadata.approval_id"
												@click="handleApprove(String(message.metadata.approval_id))"
											>
												Approve
											</N8nButton>
											<N8nButton
												type="secondary"
												size="mini"
												:disabled="processingApprovalId === message.metadata.approval_id"
												@click="handleReject(String(message.metadata.approval_id))"
											>
												Reject
											</N8nButton>
										</div>
									</div>
								</div>
							</li>

							<li
								v-if="message.role !== 'approval'"
								:class="['messages__item', `messages__item--${message.role}`]"
							>
								<span class="messages__label">
									{{
										message.role === 'user'
											? 'You'
											: message.role === 'assistant'
												? 'Agent'
												: 'System'
									}}
								</span>
								<div class="messages__bubble">
									<N8nMarkdown
										v-if="message.role === 'assistant'"
										:content="message.content"
										:options="{
											markdown: {
												breaks: true,
												linkify: true,
											},
											tasklists: {
												enabled: false,
											},
											linkAttributes: {
												attrs: {
													target: '_blank',
													rel: 'noopener',
												},
											},
											youtube: {
												width: '100%',
												height: '315',
											},
										}"
										class="messages__markdown"
									/>
									<pre v-else>{{ message.content }}</pre>
									<time>{{ new Date(message.timestamp).toLocaleTimeString() }}</time>
								</div>
							</li>
						</template>
						<li v-if="shouldShowThinking" class="thinking-item">
							<div class="thinking">
								<N8nButton
									type="tertiary"
									size="small"
									:class="['thinking__toggle', { 'thinking__toggle--active': isTraceExpanded }]"
									@click="toggleThinking"
								>
									{{ thinkingButtonLabel }}
									<span v-if="traceBadgeCount > 0" class="thinking__badge">{{
										traceBadgeCount
									}}</span>
								</N8nButton>
								<transition name="fade">
									<ul v-if="isTraceExpanded" class="thinking__timeline">
										<li v-for="entry in thinkingTrace" :key="entry.id" class="thinking__item">
											<span class="thinking__summary">{{ entry.summary }}</span>
											<time>{{ new Date(entry.timestamp).toLocaleTimeString() }}</time>
										</li>
									</ul>
								</transition>
							</div>
						</li>
					</ul>
				</section>
				<footer class="panel__footer">
					<form class="panel__form" @submit.prevent="onSubmit">
						<N8nInput
							v-model="store.draft"
							type="textarea"
							placeholder="Ask the agent to inspect workflows, search data, or run tools..."
							:rows="3"
							@keydown="onInputKeydown"
						></N8nInput>
						<N8nButton
							type="primary"
							:loading="isSending"
							:disabled="!store.canSubmit"
							@click="onSubmit"
						>
							Send
						</N8nButton>
					</form>
					<p v-if="errorMessage" class="panel__error">{{ errorMessage }}</p>
				</footer>
			</div>
		</N8nResizeWrapper>

		<!-- Upgrade Modal -->
		<div v-if="isUpgradeModalOpen" class="upgrade-modal-overlay" @click="store.closeUpgradeModal">
			<div class="upgrade-modal" @click.stop>
				<div class="upgrade-modal__header">
					<h3>Upgrade Your Plan</h3>
					<N8nIconButton icon="x" type="tertiary" size="small" @click="store.closeUpgradeModal" />
				</div>
				<div class="upgrade-modal__content">
					<p class="upgrade-modal__message">
						You've reached your monthly limit. Upgrade to continue using vibe8n.
					</p>
					<p v-if="rateLimitError?.reset_at" class="upgrade-modal__reset">
						Your limit resets on {{ new Date(rateLimitError.reset_at).toLocaleDateString() }}
					</p>

					<div class="upgrade-modal__plans">
						<div
							v-for="plan in upgradePlans"
							:key="plan.id"
							:class="['plan-card', { 'plan-card--popular': plan.popular }]"
						>
							<div v-if="plan.popular" class="plan-card__badge">Most Popular</div>
							<div class="plan-card__header">
								<h4>{{ plan.name }}</h4>
								<div class="plan-card__price">
									${{ plan.price }}<span>/{{ plan.interval }}</span>
								</div>
							</div>
							<ul class="plan-card__features">
								<li v-for="(feature, index) in plan.features" :key="index">{{ feature }}</li>
							</ul>
							<N8nButton
								type="primary"
								size="large"
								@click="handleUpgrade(plan.id as 'starter' | 'scale')"
							>
								Upgrade to {{ plan.name }}
							</N8nButton>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Approval Modal -->
		<div v-if="pendingApproval" class="approval-modal-overlay" @click="store.closeApprovalModal">
			<div class="approval-modal" @click.stop>
				<div class="approval-modal__header">
					<h3>Action Requires Approval</h3>
					<N8nIconButton icon="x" type="tertiary" size="small" @click="store.closeApprovalModal" />
				</div>
				<div class="approval-modal__content">
					<div class="approval-modal__tool">
						<span class="approval-modal__label">Tool:</span>
						<code class="approval-modal__tool-name">{{ pendingApproval.tool_name }}</code>
					</div>
					<div class="approval-modal__risk">
						<span class="approval-modal__label">Risk Level:</span>
						<span
							class="approval-modal__risk-badge"
							:style="{ color: getRiskLevelColor(pendingApproval.risk_level) }"
						>
							{{ pendingApproval.risk_level.toUpperCase() }}
						</span>
					</div>
					<div
						v-if="Object.keys(pendingApproval.arguments).length > 0"
						class="approval-modal__arguments"
					>
						<span class="approval-modal__label">Arguments:</span>
						<pre class="approval-modal__code">{{
							JSON.stringify(pendingApproval.arguments, null, 2)
						}}</pre>
					</div>

					<div class="approval-modal__remember">
						<label for="remember-choice">Remember my choice:</label>
						<select id="remember-choice" v-model="rememberChoice" class="approval-modal__select">
							<option value="once">Just this time</option>
							<option value="session">For this session</option>
							<option value="always">Always for this tool</option>
						</select>
					</div>

					<div class="approval-modal__actions">
						<N8nButton type="secondary" size="large" @click="handleReject"> Reject </N8nButton>
						<N8nButton type="primary" size="large" @click="handleApprove"> Approve </N8nButton>
					</div>
				</div>
			</div>
		</div>
	</SlideTransition>
</template>

<style scoped lang="scss">
.panel-wrapper {
	height: 100vh;
}

.panel {
	height: 100%;
	display: flex;
	flex-direction: column;
	background: var(--color-surface-primary);
	border-left: 1px solid var(--color-foreground-base);
}

.panel__header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: var(--spacing-m);
	border-bottom: 1px solid var(--color-foreground-base);
}

.panel__title {
	margin: 0;
	font-size: var(--font-size-m);
	font-weight: var(--font-weight-bold);
}

.panel__subtitle {
	margin: 0;
	font-size: var(--font-size-2xs);
	color: var(--color-text-light);
}

.panel__actions {
	display: flex;
	align-items: center;
	gap: var(--spacing-xs);
}

.panel__body {
	flex: 1;
	overflow-y: auto;
	padding: var(--spacing-m);
	background: var(--color-surface-secondary);
}

.messages {
	list-style: none;
	padding: 0;
	margin: 0;
	display: flex;
	flex-direction: column;
	gap: var(--spacing-m);
}

.messages__item {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-3xs);
}

.messages__label {
	font-size: var(--font-size-2xs);
	font-weight: var(--font-weight-bold);
	color: var(--color-text-light);
}

.messages__item--user .messages__label {
	color: rgba(255, 255, 255, 0.75);
}

.messages__bubble {
	border-radius: var(--border-radius-large);
	padding: var(--spacing-s);
	background: var(--color-surface-secondary);
	box-shadow: var(--shadow-s);
	color: var(--color-text-base);
	max-width: 100%;
	overflow-wrap: anywhere;
}

.messages__markdown {
	white-space: pre-wrap;
	font-family: var(--font-family-monospace);
	font-size: var(--font-size-s);
	line-height: var(--font-line-height-regular);
}

.messages__markdown :deep(> *:first-child) {
	margin-top: 0;
}

.messages__markdown :deep(p) {
	margin: 0;
	font-size: inherit;
}

.messages__markdown :deep(h1),
.messages__markdown :deep(h2),
.messages__markdown :deep(h3),
.messages__markdown :deep(h4),
.messages__markdown :deep(h5),
.messages__markdown :deep(h6) {
	margin: 0;
	font-size: var(--font-size-m);
}

.messages__markdown :deep(strong) {
	font-weight: var(--font-weight-extrabold);
}

.messages__markdown :deep(li) {
	font-size: inherit;
}

.messages__item--user .messages__bubble {
	background: var(--color-primary);
	color: #fff;
	border: none;
}

.messages__item--assistant .messages__bubble {
	background: var(--color-secondary-tint-2);
	color: var(--color-text-base);
}

.messages__item--error .messages__bubble {
	background: var(--color-danger-tint-2);
	color: var(--color-danger);
}

.messages__bubble pre {
	margin: 0;
	font-family: var(--font-family-monospace);
	font-size: var(--font-size-s);
	white-space: pre-wrap;
	word-break: break-word;
	overflow-wrap: anywhere;
	color: inherit;
}

.messages__bubble time {
	display: block;
	margin-top: var(--spacing-3xs);
	font-size: var(--font-size-3xs);
	color: var(--color-text-light);
}

.messages__item--user .messages__bubble time {
	color: rgba(255, 255, 255, 0.75);
}

.messages__item--user .messages__bubble pre {
	color: #fff;
}

.thinking-item {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-3xs);
}

.thinking {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-2xs);
}

.thinking__toggle {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: var(--spacing-2xs);
	width: 100%;
	padding: var(--spacing-s);
	border-radius: var(--border-radius-large);
	box-shadow: none;
	background-color: transparent !important;
	border: 1px solid var(--color-foreground-base) !important;
	color: var(--color-text-base) !important;
}

.thinking__toggle:hover,
.thinking__toggle:focus-visible {
	background-color: transparent !important;
	border-color: var(--color-primary) !important;
	color: var(--color-primary) !important;
}

.thinking__toggle--active {
	box-shadow: var(--shadow-s);
	border-color: var(--color-primary) !important;
	color: var(--color-primary) !important;
}

.thinking__badge {
	display: inline-flex;
	align-items: center;
	justify-content: center;
	min-width: 1.5rem;
	padding: 0 var(--spacing-4xs);
	border-radius: var(--border-radius-base);
	background: var(--color-foreground-base);
	color: var(--color-surface-primary);
	font-size: var(--font-size-3xs);
	font-weight: var(--font-weight-bold);
}

.thinking__timeline {
	list-style: none;
	margin: 0;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: var(--spacing-4xs);
}

.thinking__item {
	display: flex;
	flex-direction: column;
	align-items: flex-start;
	gap: var(--spacing-3xs);
	background: var(--color-surface-secondary);
	border-radius: var(--border-radius-base);
	padding: var(--spacing-2xs) var(--spacing-s);
	color: var(--color-text-light);
	font-family: var(--font-family-monospace);
	font-size: var(--font-size-s);
}

.thinking__summary {
	width: 100%;
	white-space: normal;
	overflow-wrap: anywhere;
}

.thinking__item time {
	display: block;
	margin-top: var(--spacing-3xs);
	font-size: var(--font-size-3xs);
	color: var(--color-text-light);
}

.fade-enter-active,
.fade-leave-active {
	opacity: 1;
	transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
	opacity: 0;
}

.panel__footer {
	padding: var(--spacing-m);
	border-top: 1px solid var(--color-foreground-base);
	display: flex;
	flex-direction: column;
	gap: var(--spacing-s);
}

.panel__form {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-s);
}

.panel__error {
	color: var(--color-danger);
	font-size: var(--font-size-2xs);
	margin: 0;
}

.panel__auth,
.panel__settings {
	display: flex;
	align-items: center;
	justify-content: center;
	padding: var(--spacing-2xl);
}

.settings-content {
	width: 100%;
	max-width: 100%;
	display: flex;
	flex-direction: column;
	gap: var(--spacing-l);
}

.auth-form {
	width: 100%;
	max-width: 320px;
}

.auth-form__content {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-l);
}

.auth-form__title {
	margin: 0;
	font-size: var(--font-size-l);
	font-weight: var(--font-weight-bold);
	color: var(--color-text-dark);
	text-align: center;
}

.auth-form__description {
	margin: 0;
	font-size: var(--font-size-s);
	color: var(--color-text-light);
	text-align: center;
}

.auth-form form {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-s);
}

.auth-form__divider {
	width: 100%;
	height: 1px;
	background: var(--color-foreground-base);
	margin: var(--spacing-m) 0 var(--spacing-s) 0;
}

.auth-form__input-label {
	margin: 0 0 var(--spacing-3xs) 0;
	font-size: var(--font-size-2xs);
	color: var(--color-text-light);
	text-align: left;
}

.api-key-info {
	padding: var(--spacing-m);
	background: var(--color-surface-secondary);
	border-radius: var(--border-radius-base);
	border: 1px solid var(--color-foreground-base);
}

.api-key-info__label {
	margin: 0 0 var(--spacing-2xs) 0;
	font-size: var(--font-size-2xs);
	font-weight: var(--font-weight-bold);
	color: var(--color-text-light);
	text-transform: uppercase;
}

.api-key-info__value {
	margin: 0;
	font-family: var(--font-family-monospace);
	font-size: var(--font-size-s);
	color: var(--color-text-base);
}

.api-key-form__label {
	margin: 0 0 var(--spacing-xs) 0;
	font-size: var(--font-size-s);
	font-weight: var(--font-weight-bold);
	color: var(--color-text-base);
}

.api-key-form {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-s);
}

.api-key-form form {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-s);
}

.api-key-form__actions {
	display: flex;
	gap: var(--spacing-xs);
}

.api-key-actions {
	padding-top: var(--spacing-m);
	border-top: 1px solid var(--color-foreground-base);
	display: flex;
	flex-direction: column;
	gap: var(--spacing-s);
}

.api-key-actions button[type='tertiary'] {
	color: var(--color-danger) !important;
}

.upgrade-modal-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.5);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 10000;
}

.upgrade-modal {
	background: var(--color-surface-primary);
	border-radius: var(--border-radius-large);
	box-shadow: var(--shadow-s);
	max-width: 600px;
	width: 90%;
	max-height: 80vh;
	overflow-y: auto;
}

.upgrade-modal__header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: var(--spacing-l);
	border-bottom: 1px solid var(--color-foreground-base);
}

.upgrade-modal__header h3 {
	margin: 0;
	font-size: var(--font-size-l);
	font-weight: var(--font-weight-bold);
	color: var(--color-text-dark);
}

.upgrade-modal__content {
	padding: var(--spacing-l);
}

.upgrade-modal__message {
	margin: 0 0 var(--spacing-s) 0;
	font-size: var(--font-size-m);
	color: var(--color-text-base);
	text-align: center;
}

.upgrade-modal__reset {
	margin: 0 0 var(--spacing-l) 0;
	font-size: var(--font-size-s);
	color: var(--color-text-light);
	text-align: center;
}

.upgrade-modal__plans {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
	gap: var(--spacing-m);
	margin-top: var(--spacing-l);
}

.plan-card {
	position: relative;
	padding: var(--spacing-l);
	border: 1px solid var(--color-foreground-base);
	border-radius: var(--border-radius-large);
	display: flex;
	flex-direction: column;
	gap: var(--spacing-m);
	transition: all 0.2s ease;
}

.plan-card:hover {
	border-color: var(--color-primary);
	box-shadow: var(--shadow-s);
}

.plan-card--popular {
	border-color: var(--color-primary);
	background: var(--color-primary-tint-3);
}

.plan-card__badge {
	position: absolute;
	top: -10px;
	right: var(--spacing-m);
	background: var(--color-primary);
	color: white;
	padding: var(--spacing-4xs) var(--spacing-xs);
	border-radius: var(--border-radius-base);
	font-size: var(--font-size-3xs);
	font-weight: var(--font-weight-bold);
	text-transform: uppercase;
}

.plan-card__header {
	text-align: center;
}

.plan-card__header h4 {
	margin: 0 0 var(--spacing-xs) 0;
	font-size: var(--font-size-l);
	font-weight: var(--font-weight-bold);
	color: var(--color-text-dark);
}

.plan-card__price {
	font-size: var(--font-size-2xl);
	font-weight: var(--font-weight-bold);
	color: var(--color-primary);
}

.plan-card__price span {
	font-size: var(--font-size-s);
	font-weight: var(--font-weight-regular);
	color: var(--color-text-light);
}

.plan-card__features {
	list-style: none;
	padding: 0;
	margin: 0;
	flex: 1;
}

.plan-card__features li {
	padding: var(--spacing-2xs) 0;
	font-size: var(--font-size-s);
	color: var(--color-text-base);
	position: relative;
	padding-left: var(--spacing-l);
}

.plan-card__features li::before {
	content: '✓';
	position: absolute;
	left: 0;
	color: var(--color-success);
	font-weight: var(--font-weight-bold);
}

/* Approval Modal Styles */
.approval-modal-overlay {
	position: fixed;
	top: 0;
	left: 0;
	right: 0;
	bottom: 0;
	background: rgba(0, 0, 0, 0.5);
	display: flex;
	align-items: center;
	justify-content: center;
	z-index: 9999;
	padding: var(--spacing-l);
}

.approval-modal {
	background: var(--color-surface-primary);
	border-radius: var(--border-radius-large);
	max-width: 500px;
	width: 100%;
	box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.approval-modal__header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	padding: var(--spacing-m);
	border-bottom: 1px solid var(--color-foreground-base);
}

.approval-modal__header h3 {
	margin: 0;
	font-size: var(--font-size-l);
	font-weight: var(--font-weight-bold);
	color: var(--color-text-dark);
}

.approval-modal__content {
	padding: var(--spacing-l);
	display: flex;
	flex-direction: column;
	gap: var(--spacing-m);
}

.approval-modal__tool,
.approval-modal__risk {
	display: flex;
	align-items: center;
	gap: var(--spacing-xs);
}

.approval-modal__label {
	font-size: var(--font-size-s);
	font-weight: var(--font-weight-bold);
	color: var(--color-text-light);
}

.approval-modal__tool-name {
	font-family: 'Monaco', 'Courier New', monospace;
	font-size: var(--font-size-s);
	background: var(--color-background-light);
	padding: var(--spacing-4xs) var(--spacing-2xs);
	border-radius: var(--border-radius-small);
	color: var(--color-text-dark);
}

.approval-modal__risk-badge {
	font-size: var(--font-size-xs);
	font-weight: var(--font-weight-bold);
	text-transform: uppercase;
	letter-spacing: 0.5px;
}

.approval-modal__arguments {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-xs);
}

.approval-modal__code {
	background: var(--color-background-dark);
	padding: var(--spacing-s);
	border-radius: var(--border-radius-base);
	font-family: 'Monaco', 'Courier New', monospace;
	font-size: var(--font-size-2xs);
	color: var(--color-text-base);
	overflow-x: auto;
	margin: 0;
	max-height: 200px;
	overflow-y: auto;
}

.approval-modal__remember {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-xs);
	padding-top: var(--spacing-s);
	border-top: 1px solid var(--color-foreground-base);
}

.approval-modal__remember label {
	font-size: var(--font-size-s);
	font-weight: var(--font-weight-bold);
	color: var(--color-text-base);
}

.approval-modal__select {
	padding: var(--spacing-xs);
	border: 1px solid var(--color-foreground-base);
	border-radius: var(--border-radius-base);
	font-size: var(--font-size-s);
	background: var(--color-surface-primary);
	color: var(--color-text-dark);
	cursor: pointer;
}

.approval-modal__select:focus {
	outline: none;
	border-color: var(--color-primary);
}

.approval-modal__actions {
	display: flex;
	gap: var(--spacing-s);
	padding-top: var(--spacing-s);
	border-top: 1px solid var(--color-foreground-base);
}

.approval-modal__actions button {
	flex: 1;
}

/* Settings Section Styles */
.settings-section {
	padding-bottom: var(--spacing-m);
	margin-bottom: var(--spacing-m);
	border-bottom: 1px solid var(--color-foreground-base);
}

.settings-section:last-child {
	border-bottom: none;
	margin-bottom: 0;
	padding-bottom: 0;
}

.settings-section__title {
	margin: 0 0 var(--spacing-xs) 0;
	font-size: var(--font-size-s);
	font-weight: var(--font-weight-bold);
	color: var(--color-text-dark);
}

.settings-section__status {
	margin: 0 0 var(--spacing-s) 0;
	font-size: var(--font-size-2xs);
	color: var(--color-text-light);
}

.settings-section__status--success {
	color: var(--color-success);
}

.settings-section__status code {
	font-family: 'Monaco', 'Courier New', monospace;
	font-size: var(--font-size-2xs);
	background: var(--color-background-light);
	padding: var(--spacing-5xs) var(--spacing-3xs);
	border-radius: var(--border-radius-small);
	color: var(--color-text-dark);
}

.settings-form {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-xs);
}

.settings-actions {
	display: flex;
	gap: var(--spacing-xs);
	align-items: center;
}

.form-error {
	margin: 0;
	padding: var(--spacing-xs);
	background: var(--color-danger-tint-2);
	border: 1px solid var(--color-danger-tint-1);
	border-radius: var(--border-radius-base);
	color: var(--color-danger);
	font-size: var(--font-size-2xs);
}

/* Inline Approval Card - Minimal Design */
.messages__item--approval {
	padding: 0;
	margin: var(--spacing-xs) 0;
	transition:
		opacity 0.4s cubic-bezier(0.4, 0, 0.2, 1),
		transform 0.4s cubic-bezier(0.4, 0, 0.2, 1),
		max-height 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.1s,
		margin 0.4s cubic-bezier(0.4, 0, 0.2, 1) 0.1s;
}

.messages__item--approval.messages__item--removing {
	opacity: 0;
	transform: translateX(12px) scale(0.97);
	max-height: 0;
	margin: 0;
	overflow: hidden;
}

.approval-card {
	background: var(--color-surface-secondary);
	border: 1px solid var(--color-foreground-base);
	border-left: 3px solid var(--color-warning);
	border-radius: var(--border-radius-base);
	padding: var(--spacing-s);
	display: block;
	max-width: 100%;
	transition: all 0.3s ease;
}

.approval-card--processing {
	opacity: 0.6;
	pointer-events: none;
}

.approval-card__content {
	display: flex;
	flex-direction: column;
	gap: var(--spacing-s);
}

.approval-card__title {
	font-size: var(--font-size-s);
	color: var(--color-text-dark);
	font-weight: var(--font-weight-bold);
}

.approval-card__title code {
	font-family: var(--font-family-monospace);
	background: var(--color-background-light);
	padding: var(--spacing-4xs) var(--spacing-3xs);
	border-radius: var(--border-radius-small);
	font-size: var(--font-size-xs);
	color: var(--color-text-dark);
}

.approval-card__actions {
	display: flex;
	gap: var(--spacing-xs);
	width: 100%;
}

.approval-card__actions button {
	flex: 1;
	min-width: 0;
}
</style>
