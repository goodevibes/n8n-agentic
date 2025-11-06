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
} = storeToRefs(store);

const apiKeyGenerationUrl = computed(() => store.apiKeyGenerationUrl);

const upgradePlans = computed(() => plans.value.filter((p) => p.id !== 'free'));

const apiKeyInput = ref('');
const isSavingKey = ref(false);
const apiKeyError = ref<string | null>(null);
const maskedApiKey = computed(() => {
	if (!userApiKey.value) return '';
	return userApiKey.value.slice(0, 12) + '...';
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

function toggleApiKeySettings() {
	if (!isApiKeyModalOpen.value) {
		// Opening settings - clear the input
		apiKeyInput.value = '';
		apiKeyError.value = null;
	}
	store.toggleApiKeyModal();
}

function handleSaveApiKey() {
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

							<form @submit.prevent="handleSaveApiKey">
								<p class="auth-form__input-label">Then paste your key below</p>
								<N8nInput
									v-model="apiKeyInput"
									type="password"
									placeholder="v8_..."
									:disabled="isSavingKey"
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

				<!-- API Key Settings Screen (inline) -->
				<section v-else-if="isApiKeyModalOpen" class="panel__body panel__settings">
					<div class="settings-content">
						<div class="api-key-info">
							<p class="api-key-info__label">Current API Key</p>
							<p class="api-key-info__value">{{ maskedApiKey }}</p>
						</div>

						<div class="api-key-form">
							<p class="api-key-form__label">Update API Key</p>
							<form @submit.prevent="handleSaveApiKey">
								<N8nInput
									v-model="apiKeyInput"
									type="password"
									placeholder="Enter new API key..."
									:disabled="isSavingKey"
								/>
								<N8nButton
									type="primary"
									size="large"
									:loading="isSavingKey"
									:disabled="!apiKeyInput.trim()"
									@click="handleSaveApiKey"
								>
									Update Key
								</N8nButton>
							</form>
						</div>

						<div class="api-key-actions">
							<N8nButton type="secondary" size="large" @click="openKeyGenerationWebsite">
								Get New Key
							</N8nButton>
							<N8nButton type="tertiary" @click="handleRemoveApiKey"> Remove API Key </N8nButton>
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
							<li :class="['messages__item', `messages__item--${message.role}`]">
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
</style>
