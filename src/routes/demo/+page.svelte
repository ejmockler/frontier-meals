<script lang="ts">
	import { onMount } from 'svelte';
	import Button from '$lib/components/ui/button.svelte';
	import Card from '$lib/components/ui/card.svelte';
	import qrcode from 'qrcode-generator';

	// Demo state machine
	type DemoStep =
		| 'intro'
		| 'signup'
		| 'checkout'
		| 'success'
		| 'telegram'
		| 'telegram-chat'
		| 'qr-email'
		| 'kiosk-scan'
		| 'kiosk-success'
		| 'skip-demo'
		| 'admin-dashboard'
		| 'complete';

	let currentStep = $state<DemoStep>('intro');
	let isTransitioning = $state(false);
	let autoPlayEnabled = $state(false);
	let autoPlayTimer: ReturnType<typeof setTimeout> | null = null;

	// Mock data
	const mockCustomer = {
		name: 'Alex Chen',
		email: 'alex.chen@example.com',
		telegramHandle: 'alexchen',
		dietaryPrefs: ['vegetarian', 'gluten_free']
	};

	// QR code generation
	let qrCodeSvg = $state('');
	let shortCode = $state('FM-2025');

	// Telegram chat messages
	let telegramMessages = $state<Array<{ from: 'bot' | 'user'; text: string; timestamp: Date }>>([]);
	let isTyping = $state(false);

	// Kiosk scanning state
	let kioskScanning = $state(false);
	let kioskDetected = $state(false);

	// Skip management
	let skipDates = $state<string[]>([]);
	let currentMonth = $state(new Date());

	// Admin metrics (mock)
	const adminMetrics = {
		totalCustomers: 127,
		activeSubscriptions: 118,
		todayRedemptions: 89,
		recentActivity: [
			{ name: 'Alex Chen', action: 'meal_redeemed', time: '2m ago' },
			{ name: 'Sarah Johnson', action: 'subscription_created', time: '15m ago' },
			{ name: 'Michael Park', action: 'day_skipped', time: '1h ago' }
		]
	};

	function generateQRCode() {
		const qr = qrcode(0, 'M');
		const token = `demo-token-${Date.now()}`;
		qr.addData(token);
		qr.make();
		qrCodeSvg = qr.createSvgTag(4, 0);
		shortCode = `FM-${Math.floor(1000 + Math.random() * 9000)}`;
	}

	function nextStep() {
		const stepFlow: Record<DemoStep, DemoStep> = {
			intro: 'signup',
			signup: 'checkout',
			checkout: 'success',
			success: 'telegram',
			telegram: 'telegram-chat',
			'telegram-chat': 'qr-email',
			'qr-email': 'kiosk-scan',
			'kiosk-scan': 'kiosk-success',
			'kiosk-success': 'skip-demo',
			'skip-demo': 'admin-dashboard',
			'admin-dashboard': 'complete',
			complete: 'intro'
		};

		isTransitioning = true;
		setTimeout(() => {
			currentStep = stepFlow[currentStep];
			isTransitioning = false;

			// Special actions for certain steps
			if (currentStep === 'qr-email') {
				generateQRCode();
			} else if (currentStep === 'telegram-chat') {
				startTelegramConversation();
			} else if (currentStep === 'kiosk-scan') {
				setTimeout(() => simulateKioskScan(), 1500);
			}

			// Auto-play next step if enabled
			if (autoPlayEnabled && currentStep !== 'complete') {
				const delay = getStepDelay(currentStep);
				autoPlayTimer = setTimeout(() => nextStep(), delay);
			}
		}, 300);
	}

	function prevStep() {
		const stepFlow: Record<DemoStep, DemoStep> = {
			signup: 'intro',
			checkout: 'signup',
			success: 'checkout',
			telegram: 'success',
			'telegram-chat': 'telegram',
			'qr-email': 'telegram-chat',
			'kiosk-scan': 'qr-email',
			'kiosk-success': 'kiosk-scan',
			'skip-demo': 'kiosk-success',
			'admin-dashboard': 'skip-demo',
			complete: 'admin-dashboard',
			intro: 'intro'
		};

		isTransitioning = true;
		setTimeout(() => {
			currentStep = stepFlow[currentStep];
			isTransitioning = false;
		}, 300);
	}

	function restartDemo() {
		if (autoPlayTimer) clearTimeout(autoPlayTimer);
		autoPlayEnabled = false;
		isTransitioning = true;
		setTimeout(() => {
			currentStep = 'intro';
			telegramMessages = [];
			skipDates = [];
			isTransitioning = false;
		}, 300);
	}

	function toggleAutoPlay() {
		autoPlayEnabled = !autoPlayEnabled;
		if (autoPlayEnabled && currentStep !== 'complete') {
			const delay = getStepDelay(currentStep);
			autoPlayTimer = setTimeout(() => nextStep(), delay);
		} else if (autoPlayTimer) {
			clearTimeout(autoPlayTimer);
			autoPlayTimer = null;
		}
	}

	function getStepDelay(step: DemoStep): number {
		const delays: Record<DemoStep, number> = {
			intro: 3000,
			signup: 2000,
			checkout: 3000,
			success: 3000,
			telegram: 2000,
			'telegram-chat': 5000,
			'qr-email': 4000,
			'kiosk-scan': 3000,
			'kiosk-success': 3000,
			'skip-demo': 4000,
			'admin-dashboard': 4000,
			complete: 3000
		};
		return delays[step] || 3000;
	}

	async function startTelegramConversation() {
		telegramMessages = [];
		const messages = [
			{ from: 'bot' as const, text: "👋 Welcome to Frontier Meals! I'm your meal assistant.", delay: 500 },
			{ from: 'bot' as const, text: "Let's set up your preferences. Are you vegetarian or vegan?", delay: 1500 },
			{ from: 'user' as const, text: 'Vegetarian', delay: 2500 },
			{
				from: 'bot' as const,
				text: '🌱 Got it! Do you have any allergies? (gluten, dairy, nuts, soy, shellfish)',
				delay: 3500
			},
			{ from: 'user' as const, text: 'Gluten', delay: 4500 },
			{
				from: 'bot' as const,
				text: "✅ All set! You'll receive daily QR codes at 12 PM PT. Use /skip to skip days, /prefs to update preferences.",
				delay: 5500
			}
		];

		for (const msg of messages) {
			await new Promise((resolve) => setTimeout(resolve, msg.delay));
			if (currentStep === 'telegram-chat') {
				if (msg.from === 'bot') {
					isTyping = true;
					await new Promise((resolve) => setTimeout(resolve, 800));
					isTyping = false;
				}
				telegramMessages = [...telegramMessages, { ...msg, timestamp: new Date() }];
			}
		}
	}

	function simulateKioskScan() {
		kioskScanning = true;
		setTimeout(() => {
			kioskDetected = true;
			setTimeout(() => {
				nextStep();
			}, 1200);
		}, 2000);
	}

	function toggleSkipDate(dateStr: string) {
		if (skipDates.includes(dateStr)) {
			skipDates = skipDates.filter((d) => d !== dateStr);
		} else {
			skipDates = [...skipDates, dateStr];
		}
	}

	function getDaysInMonth(date: Date): Array<{ day: number; dateStr: string; isToday: boolean }> {
		const year = date.getFullYear();
		const month = date.getMonth();
		const daysInMonth = new Date(year, month + 1, 0).getDate();
		const today = new Date().toISOString().split('T')[0];

		return Array.from({ length: daysInMonth }, (_, i) => {
			const day = i + 1;
			const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
			return {
				day,
				dateStr,
				isToday: dateStr === today
			};
		});
	}

	onMount(() => {
		generateQRCode();
		return () => {
			if (autoPlayTimer) clearTimeout(autoPlayTimer);
		};
	});

	// Progress calculation
	const stepOrder: DemoStep[] = [
		'intro',
		'signup',
		'checkout',
		'success',
		'telegram',
		'telegram-chat',
		'qr-email',
		'kiosk-scan',
		'kiosk-success',
		'skip-demo',
		'admin-dashboard',
		'complete'
	];
	const progress = $derived((stepOrder.indexOf(currentStep) / (stepOrder.length - 1)) * 100);
</script>

<svelte:head>
	<title>Demo - Frontier Meals</title>
</svelte:head>

<div class="min-h-screen bg-[#F5F3EF] frontier-texture">
	<!-- Fixed Header -->
	<header class="fixed top-0 left-0 right-0 z-50 bg-[#1A1816] border-b-2 border-[#E67E50] shadow-xl">
		<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
			<div class="flex items-center justify-between">
				<div class="flex items-center gap-4">
					<h1 class="text-xl font-extrabold tracking-tight text-white">Frontier Meals Demo</h1>
					<div class="hidden sm:block text-sm text-[#E8C547] font-medium">
						{currentStep.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
					</div>
				</div>

				<div class="flex items-center gap-3">
					<button
						onclick={toggleAutoPlay}
						class="px-4 py-2 bg-{autoPlayEnabled
							? '[#52A675]'
							: '[#E8E6E1]'} hover:bg-{autoPlayEnabled
							? '[#52A675]/90'
							: '[#D9D7D2]'} text-{autoPlayEnabled
							? 'white'
							: '[#1A1816]'} font-bold text-sm rounded-sm border-2 border-{autoPlayEnabled
							? '[#52A675]/70'
							: '[#D9D7D2]'} transition-all"
					>
						{autoPlayEnabled ? '⏸ Pause' : '▶ Auto Play'}
					</button>
					<button
						onclick={restartDemo}
						class="px-4 py-2 bg-[#E67E50] hover:bg-[#D97F3E] text-white font-bold text-sm rounded-sm border-2 border-[#D97F3E] transition-all"
					>
						↻ Restart
					</button>
				</div>
			</div>

			<!-- Progress bar -->
			<div class="mt-3 h-2 bg-[#E8E6E1] rounded-sm overflow-hidden">
				<div
					class="h-full bg-gradient-to-r from-[#E67E50] to-[#E8C547] transition-all duration-500 ease-out"
					style="width: {progress}%"
				></div>
			</div>
		</div>
	</header>

	<!-- Main content -->
	<main class="pt-32 pb-20 px-4 sm:px-6 lg:px-8">
		<div
			class="max-w-6xl mx-auto transition-opacity duration-300"
			class:opacity-0={isTransitioning}
			class:opacity-100={!isTransitioning}
		>
			{#if currentStep === 'intro'}
				<!-- Intro Screen -->
				<div class="text-center space-y-8">
					<div class="text-8xl mb-6">🍽️</div>
					<h2 class="text-6xl font-extrabold tracking-tight text-[#1A1816]">
						Welcome to Frontier Meals
					</h2>
					<p class="text-2xl text-[#5C5A56] max-w-3xl mx-auto">
						This interactive demo walks you through the complete customer journey, from signup to
						daily meal redemption.
					</p>

					<Card variant="concrete" class="p-8 max-w-2xl mx-auto">
						<h3 class="text-2xl font-extrabold tracking-tight text-[#1A1816] mb-6">
							What You'll See
						</h3>
						<div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-left">
							<div class="flex items-start gap-3">
								<div
									class="w-8 h-8 bg-[#E67E50] border-2 border-[#D97F3E] text-white rounded-sm flex items-center justify-center text-sm font-bold flex-shrink-0"
								>
									1
								</div>
								<div>
									<p class="font-bold text-[#1A1816]">Stripe Checkout</p>
									<p class="text-sm text-[#5C5A56]">$400/month subscription</p>
								</div>
							</div>
							<div class="flex items-start gap-3">
								<div
									class="w-8 h-8 bg-[#E8C547] border-2 border-[#E8C547]/50 text-[#1A1816] rounded-sm flex items-center justify-center text-sm font-bold flex-shrink-0"
								>
									2
								</div>
								<div>
									<p class="font-bold text-[#1A1816]">Telegram Bot</p>
									<p class="text-sm text-[#5C5A56]">Account linking & preferences</p>
								</div>
							</div>
							<div class="flex items-start gap-3">
								<div
									class="w-8 h-8 bg-[#E67E50] border-2 border-[#D97F3E] text-white rounded-sm flex items-center justify-center text-sm font-bold flex-shrink-0"
								>
									3
								</div>
								<div>
									<p class="font-bold text-[#1A1816]">Daily QR Codes</p>
									<p class="text-sm text-[#5C5A56]">Delivered at 12 PM PT</p>
								</div>
							</div>
							<div class="flex items-start gap-3">
								<div
									class="w-8 h-8 bg-[#E8C547] border-2 border-[#E8C547]/50 text-[#1A1816] rounded-sm flex items-center justify-center text-sm font-bold flex-shrink-0"
								>
									4
								</div>
								<div>
									<p class="font-bold text-[#1A1816]">Kiosk Scanner</p>
									<p class="text-sm text-[#5C5A56]">QR redemption flow</p>
								</div>
							</div>
							<div class="flex items-start gap-3">
								<div
									class="w-8 h-8 bg-[#E67E50] border-2 border-[#D97F3E] text-white rounded-sm flex items-center justify-center text-sm font-bold flex-shrink-0"
								>
									5
								</div>
								<div>
									<p class="font-bold text-[#1A1816]">Skip Management</p>
									<p class="text-sm text-[#5C5A56]">Via Telegram bot</p>
								</div>
							</div>
							<div class="flex items-start gap-3">
								<div
									class="w-8 h-8 bg-[#E8C547] border-2 border-[#E8C547]/50 text-[#1A1816] rounded-sm flex items-center justify-center text-sm font-bold flex-shrink-0"
								>
									6
								</div>
								<div>
									<p class="font-bold text-[#1A1816]">Admin Dashboard</p>
									<p class="text-sm text-[#5C5A56]">Real-time metrics</p>
								</div>
							</div>
						</div>
					</Card>

					<div class="pt-4">
						<Button onclick={nextStep} size="lg" class="text-xl px-12 py-6">
							Start Demo →
						</Button>
					</div>
				</div>
			{:else if currentStep === 'signup'}
				<!-- Signup Page -->
				<div class="max-w-3xl mx-auto space-y-8">
					<div class="text-center">
						<h2 class="text-5xl font-extrabold tracking-tight text-[#1A1816] mb-4">
							Fresh meals,<br />delivered daily
						</h2>
						<p class="text-xl text-[#5C5A56] mb-8">
							Subscribe to Frontier Meals and pick up your fresh, chef-prepared meal every day.
						</p>
					</div>

					<Card variant="concrete" class="p-8">
						<div class="space-y-6">
							<div class="text-center">
								<p class="text-3xl font-extrabold tracking-tight text-[#1A1816]">$13.33/day</p>
								<p class="text-[#5C5A56]">$400/month • Cancel anytime</p>
							</div>

							<div class="space-y-3">
								<div class="flex items-start">
									<div
										class="flex-shrink-0 w-6 h-6 rounded-sm bg-[#E67E50] border-2 border-[#D97F3E] flex items-center justify-center mt-0.5"
									>
										<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
										</svg>
									</div>
									<p class="ml-3 text-[#1A1816] font-medium">Daily QR code for kiosk pickup</p>
								</div>
								<div class="flex items-start">
									<div
										class="flex-shrink-0 w-6 h-6 rounded-sm bg-[#E8C547] border-2 border-[#E8C547]/50 flex items-center justify-center mt-0.5"
									>
										<svg
											class="w-4 h-4 text-[#1A1816]"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
										</svg>
									</div>
									<p class="ml-3 text-[#1A1816] font-medium">Manage preferences via Telegram bot</p>
								</div>
								<div class="flex items-start">
									<div
										class="flex-shrink-0 w-6 h-6 rounded-sm bg-[#E67E50] border-2 border-[#D97F3E] flex items-center justify-center mt-0.5"
									>
										<svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
										</svg>
									</div>
									<p class="ml-3 text-[#1A1816] font-medium">Skip days you won't need a meal</p>
								</div>
								<div class="flex items-start">
									<div
										class="flex-shrink-0 w-6 h-6 rounded-sm bg-[#E8C547] border-2 border-[#E8C547]/50 flex items-center justify-center mt-0.5"
									>
										<svg
											class="w-4 h-4 text-[#1A1816]"
											fill="none"
											stroke="currentColor"
											viewBox="0 0 24 24"
										>
											<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
										</svg>
									</div>
									<p class="ml-3 text-[#1A1816] font-medium">Dietary preferences supported</p>
								</div>
							</div>

							<div class="relative">
								<Button onclick={nextStep} size="lg" class="w-full relative overflow-hidden group">
									<span class="relative z-10">Subscribe Now</span>
									<div
										class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700"
									></div>
								</Button>
							</div>
						</div>
					</Card>
				</div>
			{:else if currentStep === 'checkout'}
				<!-- Stripe Checkout Simulation -->
				<div class="max-w-2xl mx-auto">
					<Card variant="concrete" class="p-8">
						<div class="space-y-6">
							<div class="flex items-center gap-3 pb-6 border-b-2 border-[#D9D7D2]">
								<div class="w-12 h-12 bg-[#635BFF] rounded-sm flex items-center justify-center">
									<svg class="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 24 24">
										<path
											d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.594-7.305h.003z"
										/>
									</svg>
								</div>
								<div>
									<h3 class="text-xl font-extrabold tracking-tight text-[#1A1816]">Stripe Checkout</h3>
									<p class="text-sm text-[#5C5A56]">Secure payment processing</p>
								</div>
							</div>

							<div class="space-y-4">
								<div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-4">
									<div class="flex justify-between items-center mb-2">
										<span class="font-bold text-[#1A1816]">Frontier Meals Monthly Subscription</span>
										<span class="font-extrabold text-[#1A1816]">$400.00</span>
									</div>
									<p class="text-sm text-[#5C5A56]">Billed monthly • Cancel anytime</p>
								</div>

								<!-- Simulated payment form -->
								<div class="space-y-3">
									<div>
										<label for="demo-email" class="block text-sm font-bold text-[#1A1816] mb-2">Email</label>
										<input
											id="demo-email"
											type="email"
											value={mockCustomer.email}
											readonly
											class="w-full px-4 py-3 bg-white border-2 border-[#D9D7D2] rounded-sm text-[#1A1816]"
										/>
									</div>
									<div>
										<label for="demo-card" class="block text-sm font-bold text-[#1A1816] mb-2">Card information</label>
										<input
											id="demo-card"
											type="text"
											value="4242 4242 4242 4242"
											readonly
											class="w-full px-4 py-3 bg-white border-2 border-[#D9D7D2] rounded-sm text-[#1A1816] font-mono"
										/>
									</div>
									<div class="grid grid-cols-2 gap-3">
										<input
											type="text"
											value="12 / 25"
											readonly
											aria-label="Card expiry"
											class="px-4 py-3 bg-white border-2 border-[#D9D7D2] rounded-sm text-[#1A1816] font-mono"
										/>
										<input
											type="text"
											value="123"
											readonly
											aria-label="Card CVV"
											class="px-4 py-3 bg-white border-2 border-[#D9D7D2] rounded-sm text-[#1A1816] font-mono"
										/>
									</div>
								</div>

								<div class="relative">
									<Button onclick={nextStep} size="lg" class="w-full bg-[#635BFF] hover:bg-[#5851DF] border-[#5851DF]">
										<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
											<path
												stroke-linecap="round"
												stroke-linejoin="round"
												stroke-width="2"
												d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
											/>
										</svg>
										Pay $400.00
									</Button>
								</div>

								<p class="text-xs text-[#8E8C87] text-center">
									Powered by Stripe • Your payment information is secure
								</p>
							</div>
						</div>
					</Card>
				</div>
			{:else if currentStep === 'success'}
				<!-- Success Page -->
				<div class="max-w-2xl mx-auto">
					<Card variant="concrete" class="p-8">
						<div class="text-center space-y-6">
							<div
								class="w-16 h-16 bg-[#52A675] border-2 border-[#52A675]/70 rounded-sm flex items-center justify-center mx-auto shadow-lg animate-bounce"
								style="animation-duration: 0.6s; animation-iteration-count: 3;"
							>
								<svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
									<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
								</svg>
							</div>

							<div>
								<h2 class="text-3xl font-extrabold tracking-tight text-[#1A1816] mb-2">
									Welcome to Frontier Meals!
								</h2>
								<p class="text-[#5C5A56]">Your subscription is now active.</p>
							</div>

							<div class="bg-[#3b82f6]/5 border-2 border-[#3b82f6]/20 rounded-sm p-6 space-y-4">
								<h3 class="font-extrabold tracking-tight text-[#1A1816] text-xl">
									Next Step: Connect Telegram
								</h3>
								<p class="text-[#5C5A56]">
									Click the button below to connect your Telegram account and start receiving daily meal QR
									codes.
								</p>
								<Button onclick={nextStep} class="w-full bg-gradient-to-r from-[#3b82f6] to-[#06b6d4] border-[#3b82f6]/50">
									Open Telegram Bot →
								</Button>
							</div>

							<div class="bg-[#E8E6E1] border-2 border-[#D9D7D2] rounded-sm p-6 text-left space-y-4">
								<h3 class="font-bold tracking-tight text-[#1A1816]">What happens next?</h3>
								<ol class="space-y-3">
									<li class="flex items-start">
										<span
											class="flex-shrink-0 w-6 h-6 bg-[#E67E50] border-2 border-[#D97F3E] text-white rounded-sm flex items-center justify-center text-sm font-bold mr-3"
											>1</span
										>
										<div>
											<p class="font-bold text-[#1A1816]">Connect your Telegram account</p>
											<p class="text-sm text-[#5C5A56]">Click the button above to link your account</p>
										</div>
									</li>
									<li class="flex items-start">
										<span
											class="flex-shrink-0 w-6 h-6 bg-[#E8C547] border-2 border-[#E8C547]/50 text-[#1A1816] rounded-sm flex items-center justify-center text-sm font-bold mr-3"
											>2</span
										>
										<div>
											<p class="font-bold text-[#1A1816]">Complete onboarding in Telegram</p>
											<p class="text-sm text-[#5C5A56]">Select your dietary preferences and allergies</p>
										</div>
									</li>
									<li class="flex items-start">
										<span
											class="flex-shrink-0 w-6 h-6 bg-[#E67E50] border-2 border-[#D97F3E] text-white rounded-sm flex items-center justify-center text-sm font-bold mr-3"
											>3</span
										>
										<div>
											<p class="font-bold text-[#1A1816]">Receive your daily QR code</p>
											<p class="text-sm text-[#5C5A56]">Every day at 12 PM PT via email</p>
										</div>
									</li>
								</ol>
							</div>
						</div>
					</Card>
				</div>
			{:else if currentStep === 'telegram'}
				<!-- Telegram Deep Link -->
				<div class="max-w-2xl mx-auto">
					<Card variant="concrete" class="p-8">
						<div class="text-center space-y-6">
							<div class="text-6xl">📱</div>
							<h2 class="text-3xl font-extrabold tracking-tight text-[#1A1816]">
								Opening Telegram Bot...
							</h2>
							<p class="text-[#5C5A56]">
								You would be redirected to <strong>@frontiermealsbot</strong> with your unique connection
								token.
							</p>

							<div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-4">
								<code class="text-xs text-[#5C5A56] break-all font-mono">
									https://t.me/frontiermealsbot?start=demo-token-{Date.now()}
								</code>
							</div>

							<div class="animate-pulse text-[#3b82f6] font-bold">Connecting...</div>

							<Button onclick={nextStep}>Continue to Chat →</Button>
						</div>
					</Card>
				</div>
			{:else if currentStep === 'telegram-chat'}
				<!-- Telegram Chat Simulation -->
				<div class="max-w-2xl mx-auto">
					<div class="bg-gradient-to-br from-[#3b82f6] to-[#06b6d4] rounded-sm shadow-xl overflow-hidden">
						<!-- Telegram header -->
						<div class="bg-[#2563eb] px-6 py-4 flex items-center gap-3 border-b border-white/10">
							<div class="w-10 h-10 bg-white rounded-full flex items-center justify-center text-2xl">
								🤖
							</div>
							<div class="flex-1">
								<div class="font-bold text-white">Frontier Meals Bot</div>
								<div class="text-xs text-white/70">Active now</div>
							</div>
						</div>

						<!-- Chat messages -->
						<div class="bg-[#0f172a] p-6 min-h-[400px] max-h-[500px] overflow-y-auto">
							<div class="space-y-4">
								{#each telegramMessages as msg}
									<div class="flex {msg.from === 'user' ? 'justify-end' : 'justify-start'}">
										<div
											class="max-w-[80%] px-4 py-3 rounded-sm {msg.from === 'user'
												? 'bg-[#3b82f6] text-white'
												: 'bg-white text-[#1A1816]'} shadow-lg"
										>
											<p class="text-sm">{msg.text}</p>
										</div>
									</div>
								{/each}

								{#if isTyping}
									<div class="flex justify-start">
										<div class="bg-white text-[#1A1816] px-4 py-3 rounded-sm shadow-lg">
											<div class="flex gap-1">
												<div class="w-2 h-2 bg-[#8E8C87] rounded-full animate-bounce"></div>
												<div
													class="w-2 h-2 bg-[#8E8C87] rounded-full animate-bounce"
													style="animation-delay: 0.1s"
												></div>
												<div
													class="w-2 h-2 bg-[#8E8C87] rounded-full animate-bounce"
													style="animation-delay: 0.2s"
												></div>
											</div>
										</div>
									</div>
								{/if}
							</div>
						</div>

						<!-- Input area (disabled for demo) -->
						<div class="bg-[#1e293b] px-6 py-4 border-t border-white/10">
							<div class="flex gap-3">
								<input
									type="text"
									placeholder="Type a message..."
									disabled
									class="flex-1 px-4 py-2 bg-[#0f172a] border border-white/10 rounded-sm text-white placeholder-white/30"
								/>
								<button
									disabled
									class="px-4 py-2 bg-[#3b82f6] text-white rounded-sm opacity-50 cursor-not-allowed"
								>
									Send
								</button>
							</div>
						</div>
					</div>

					<div class="mt-6 text-center">
						<Button onclick={nextStep}>Continue to Daily QR →</Button>
					</div>
				</div>
			{:else if currentStep === 'qr-email'}
				<!-- QR Email Template -->
				<div class="max-w-3xl mx-auto">
					<Card variant="concrete" class="p-8">
						<div class="space-y-6">
							<!-- Email header simulation -->
							<div class="border-b-2 border-[#D9D7D2] pb-4">
								<div class="flex items-center justify-between mb-2">
									<div class="flex items-center gap-3">
										<div class="w-10 h-10 bg-[#E67E50] rounded-sm flex items-center justify-center text-xl">
											📧
										</div>
										<div>
											<div class="font-bold text-[#1A1816]">Frontier Meals</div>
											<div class="text-sm text-[#5C5A56]">meals@frontiermeals.com</div>
										</div>
									</div>
									<div class="text-sm text-[#8E8C87]">12:00 PM</div>
								</div>
								<div class="text-sm text-[#5C5A56]">To: {mockCustomer.email}</div>
								<div class="font-bold text-[#1A1816] mt-2">Your Daily Meal QR Code</div>
							</div>

							<!-- Email body -->
							<div class="space-y-6">
								<div class="text-center">
									<h3 class="text-2xl font-extrabold tracking-tight text-[#1A1816] mb-2">
										Hi {mockCustomer.name}!
									</h3>
									<p class="text-[#5C5A56]">Here's your QR code for today's meal pickup.</p>
								</div>

								<!-- QR Code display -->
								<div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-8">
									<div class="flex flex-col items-center gap-6">
										<div class="bg-white p-4 border-2 border-[#E67E50] rounded-sm shadow-lg">
											{@html qrCodeSvg}
										</div>
										<div class="text-center">
											<div class="text-3xl font-extrabold tracking-tight text-[#1A1816] font-mono">
												{shortCode}
											</div>
											<p class="text-sm text-[#5C5A56] mt-1">Show this code at the kiosk</p>
										</div>
									</div>
								</div>

								<div class="bg-[#E8E6E1] border-2 border-[#D9D7D2] rounded-sm p-6 space-y-3">
									<h4 class="font-bold text-[#1A1816]">Quick Info:</h4>
									<ul class="text-sm text-[#5C5A56] space-y-2">
										<li>⏰ <strong>Valid until:</strong> 11:59 PM PT today</li>
										<li>📍 <strong>Location:</strong> Frontier Tower, Ground Floor</li>
										<li>🌱 <strong>Your preferences:</strong> Vegetarian, Gluten-free</li>
									</ul>
								</div>

								<div class="text-center text-sm text-[#8E8C87]">
									<p>
										Need to skip tomorrow? Message <strong>@frontiermealsbot</strong> on Telegram
									</p>
								</div>
							</div>
						</div>
					</Card>

					<div class="mt-6 text-center">
						<Button onclick={nextStep}>Continue to Kiosk →</Button>
					</div>
				</div>
			{:else if currentStep === 'kiosk-scan'}
				<!-- Kiosk Scanner Simulation -->
				<div class="max-w-4xl mx-auto">
					<div class="bg-[#1A1816] rounded-sm shadow-2xl overflow-hidden border-4 border-[#E67E50]">
						<!-- Kiosk screen -->
						<div class="relative bg-gradient-to-br from-[#F5F3EF] to-[#E8E6E1] aspect-video">
							{#if !kioskDetected}
								<!-- Scanning state -->
								<div class="absolute inset-0 flex items-center justify-center">
									<div class="text-center">
										<h3
											class="text-5xl font-extrabold tracking-tight text-[#1A1816] mb-4 drop-shadow-lg"
										>
											Show your QR code
										</h3>
										<p class="text-2xl text-[#E67E50] font-bold">Scanning...</p>
									</div>
								</div>

								<!-- Scanning animation -->
								<div class="absolute inset-0 pointer-events-none">
									<div class="relative w-full h-full">
										<!-- Corner markers -->
										<div class="absolute top-20 left-20 w-16 h-16">
											<div class="absolute top-0 left-0 w-full h-1 bg-[#E67E50]"></div>
											<div class="absolute top-0 left-0 w-1 h-full bg-[#E67E50]"></div>
										</div>
										<div class="absolute top-20 right-20 w-16 h-16">
											<div class="absolute top-0 right-0 w-full h-1 bg-[#E67E50]"></div>
											<div class="absolute top-0 right-0 w-1 h-full bg-[#E67E50]"></div>
										</div>
										<div class="absolute bottom-20 left-20 w-16 h-16">
											<div class="absolute bottom-0 left-0 w-full h-1 bg-[#E67E50]"></div>
											<div class="absolute bottom-0 left-0 w-1 h-full bg-[#E67E50]"></div>
										</div>
										<div class="absolute bottom-20 right-20 w-16 h-16">
											<div class="absolute bottom-0 right-0 w-full h-1 bg-[#E67E50]"></div>
											<div class="absolute bottom-0 right-0 w-1 h-full bg-[#E67E50]"></div>
										</div>

										<!-- Scanning line -->
										<div
											class="absolute inset-x-20 h-0.5 bg-gradient-to-r from-transparent via-[#E67E50] to-transparent animate-scan-demo"
										></div>
									</div>
								</div>
							{:else}
								<!-- QR Detected -->
								<div class="absolute inset-0 flex items-center justify-center bg-[#52A675]">
									<div class="text-center text-white">
										<div
											class="w-32 h-32 bg-white rounded-sm flex items-center justify-center mx-auto mb-6 animate-bounce"
											style="animation-duration: 0.5s; animation-iteration-count: 2;"
										>
											<svg class="w-20 h-20 text-[#52A675]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
												<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
											</svg>
										</div>
										<h3 class="text-5xl font-extrabold tracking-tight mb-2">QR Detected!</h3>
										<p class="text-2xl">Validating...</p>
									</div>
								</div>
							{/if}
						</div>

						<!-- Kiosk info bar -->
						<div class="bg-[#1A1816] px-6 py-4 border-t-2 border-[#E67E50]">
							<div class="flex items-center justify-between text-white">
								<div class="flex items-center gap-3">
									<div class="text-3xl">🍽️</div>
									<div class="font-bold">Frontier Meals Kiosk</div>
								</div>
								<div class="text-sm text-[#E8C547]">
									{new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
								</div>
							</div>
						</div>
					</div>
				</div>
			{:else if currentStep === 'kiosk-success'}
				<!-- Kiosk Success Screen -->
				<div class="max-w-4xl mx-auto">
					<div class="bg-[#1A1816] rounded-sm shadow-2xl overflow-hidden border-4 border-[#52A675]">
						<div class="relative bg-[#52A675] aspect-video flex items-center justify-center">
							<div class="text-center text-white">
								<div
									class="w-40 h-40 bg-white rounded-sm flex items-center justify-center mx-auto mb-8 shadow-2xl animate-scale-in"
								>
									<svg class="w-24 h-24 text-[#52A675]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="4" d="M5 13l4 4L19 7" />
									</svg>
								</div>
								<h3 class="text-7xl font-extrabold tracking-tight mb-4">
									Welcome, {mockCustomer.name}!
								</h3>
								<p class="text-4xl font-bold">Enjoy your meal</p>
							</div>
						</div>

						<div class="bg-[#1A1816] px-6 py-4 border-t-2 border-[#52A675]">
							<div class="text-center text-white text-sm">
								Meal redeemed successfully • Have a great day!
							</div>
						</div>
					</div>

					<div class="mt-6 text-center">
						<Button onclick={nextStep}>Continue to Skip Demo →</Button>
					</div>
				</div>
			{:else if currentStep === 'skip-demo'}
				<!-- Skip Management via Telegram -->
				<div class="max-w-3xl mx-auto space-y-6">
					<div class="text-center">
						<h2 class="text-4xl font-extrabold tracking-tight text-[#1A1816] mb-2">
							Skip Management
						</h2>
						<p class="text-[#5C5A56]">
							Customers can skip days directly through the Telegram bot
						</p>
					</div>

					<div class="grid md:grid-cols-2 gap-6">
						<!-- Telegram bot interface -->
						<Card variant="concrete" class="p-6">
							<h3 class="font-extrabold tracking-tight text-[#1A1816] mb-4">
								Via Telegram Bot
							</h3>
							<div class="space-y-3">
								<div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-4">
									<div class="flex items-start gap-3">
										<div class="text-2xl">👤</div>
										<div class="flex-1">
											<div class="font-mono text-sm text-[#3b82f6]">/skip</div>
											<div class="text-xs text-[#8E8C87] mt-1">User command</div>
										</div>
									</div>
								</div>

								<div class="bg-[#E8E6E1] border-2 border-[#D9D7D2] rounded-sm p-4">
									<div class="flex items-start gap-3">
										<div class="text-2xl">🤖</div>
										<div class="flex-1">
											<div class="text-sm text-[#1A1816]">
												Which days would you like to skip? Use the calendar below to select dates.
											</div>
											<div class="text-xs text-[#8E8C87] mt-1">Bot response</div>
										</div>
									</div>
								</div>

								<div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-4">
									<p class="text-sm text-[#5C5A56] mb-3">
										<strong>Quick skip buttons:</strong>
									</p>
									<div class="grid grid-cols-2 gap-2">
										<button
											class="px-3 py-2 bg-[#E8E6E1] hover:bg-[#D9D7D2] border-2 border-[#D9D7D2] rounded-sm text-sm font-bold transition-all"
										>
											Tomorrow
										</button>
										<button
											class="px-3 py-2 bg-[#E8E6E1] hover:bg-[#D9D7D2] border-2 border-[#D9D7D2] rounded-sm text-sm font-bold transition-all"
										>
											This Week
										</button>
										<button
											class="px-3 py-2 bg-[#E8E6E1] hover:bg-[#D9D7D2] border-2 border-[#D9D7D2] rounded-sm text-sm font-bold transition-all"
										>
											Next Week
										</button>
										<button
											class="px-3 py-2 bg-[#E8E6E1] hover:bg-[#D9D7D2] border-2 border-[#D9D7D2] rounded-sm text-sm font-bold transition-all"
										>
											Custom
										</button>
									</div>
								</div>
							</div>
						</Card>

						<!-- Calendar view -->
						<Card variant="concrete" class="p-6">
							<h3 class="font-extrabold tracking-tight text-[#1A1816] mb-4">
								Skip Calendar
							</h3>
							<div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-4">
								<div class="text-center mb-4">
									<div class="font-bold text-[#1A1816]">
										{currentMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
									</div>
								</div>

								<div class="grid grid-cols-7 gap-1">
									<!-- Day headers -->
									{#each ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as day}
										<div class="text-center text-xs font-bold text-[#8E8C87] p-1">{day}</div>
									{/each}

									<!-- Days -->
									{#each getDaysInMonth(currentMonth) as { day, dateStr, isToday }}
										<button
											onclick={() => toggleSkipDate(dateStr)}
											class="aspect-square p-1 text-xs font-bold rounded-sm transition-all {skipDates.includes(
												dateStr
											)
												? 'bg-[#E67E50] text-white border-2 border-[#D97F3E]'
												: isToday
													? 'bg-[#E8C547] text-[#1A1816] border-2 border-[#E8C547]/50'
													: 'bg-[#E8E6E1] text-[#1A1816] hover:bg-[#D9D7D2] border-2 border-transparent'}"
										>
											{day}
										</button>
									{/each}
								</div>

								<div class="mt-4 space-y-2 text-xs">
									<div class="flex items-center gap-2">
										<div class="w-4 h-4 bg-[#E8C547] border-2 border-[#E8C547]/50 rounded-sm"></div>
										<span class="text-[#5C5A56]">Today</span>
									</div>
									<div class="flex items-center gap-2">
										<div class="w-4 h-4 bg-[#E67E50] border-2 border-[#D97F3E] rounded-sm"></div>
										<span class="text-[#5C5A56]">Skipped ({skipDates.length})</span>
									</div>
								</div>
							</div>
						</Card>
					</div>

					<div class="text-center">
						<Button onclick={nextStep}>Continue to Admin Dashboard →</Button>
					</div>
				</div>
			{:else if currentStep === 'admin-dashboard'}
				<!-- Admin Dashboard -->
				<div class="space-y-6">
					<div class="text-center">
						<h2 class="text-4xl font-extrabold tracking-tight text-[#1A1816] mb-2">
							Admin Dashboard
						</h2>
						<p class="text-[#5C5A56]">Real-time metrics and customer management</p>
					</div>

					<!-- Metrics grid -->
					<div class="grid grid-cols-1 md:grid-cols-3 gap-6">
						<Card class="p-6">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-sm font-medium text-[#5C5A56]">Total Customers</p>
									<p class="text-3xl font-extrabold tracking-tight text-[#1A1816] mt-2">
										{adminMetrics.totalCustomers}
									</p>
								</div>
								<div
									class="w-12 h-12 bg-[#2D9B9B] border-2 border-[#2D9B9B]/70 rounded-sm flex items-center justify-center"
								>
									<svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"
										/>
									</svg>
								</div>
							</div>
						</Card>

						<Card class="p-6">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-sm font-medium text-[#5C5A56]">Active Subscriptions</p>
									<p class="text-3xl font-extrabold tracking-tight text-[#1A1816] mt-2">
										{adminMetrics.activeSubscriptions}
									</p>
								</div>
								<div
									class="w-12 h-12 bg-[#52A675] border-2 border-[#52A675]/70 rounded-sm flex items-center justify-center"
								>
									<svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
								</div>
							</div>
						</Card>

						<Card class="p-6">
							<div class="flex items-center justify-between">
								<div>
									<p class="text-sm font-medium text-[#5C5A56]">Today's Redemptions</p>
									<p class="text-3xl font-extrabold tracking-tight text-[#1A1816] mt-2">
										{adminMetrics.todayRedemptions}
									</p>
								</div>
								<div
									class="w-12 h-12 bg-[#E67E50] border-2 border-[#D97F3E] rounded-sm flex items-center justify-center"
								>
									<svg class="w-6 h-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path
											stroke-linecap="round"
											stroke-linejoin="round"
											stroke-width="2"
											d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
										/>
									</svg>
								</div>
							</div>
						</Card>
					</div>

					<!-- Recent activity -->
					<Card class="overflow-hidden">
						<div class="p-6 border-b-2 border-[#D9D7D2]">
							<h3 class="text-lg font-extrabold tracking-tight text-[#1A1816]">Recent Activity</h3>
						</div>
						<div class="divide-y-2 divide-[#D9D7D2]">
							{#each adminMetrics.recentActivity as activity}
								<div class="p-4 hover:bg-[#F5F3EF] transition-colors">
									<div class="flex items-center justify-between">
										<div class="flex items-center gap-3">
											<div
												class="px-2 py-1 text-xs font-bold rounded-sm {activity.action ===
												'meal_redeemed'
													? 'bg-[#52A675] text-white border-2 border-[#52A675]/70'
													: activity.action === 'subscription_created'
														? 'bg-[#2D9B9B] text-white border-2 border-[#2D9B9B]/70'
														: 'bg-[#E8C547] text-[#1A1816] border-2 border-[#E8C547]/50'}"
											>
												{activity.action.replace(/_/g, ' ').toUpperCase()}
											</div>
											<span class="font-bold text-[#1A1816]">{activity.name}</span>
										</div>
										<span class="text-sm text-[#8E8C87]">{activity.time}</span>
									</div>
								</div>
							{/each}
						</div>
					</Card>

					<!-- Quick actions -->
					<div class="bg-[#E67E50] border-2 border-[#D97F3E] rounded-sm p-6 text-white shadow-lg">
						<h3 class="text-xl font-extrabold tracking-tight mb-4">Quick Actions</h3>
						<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
							<button
								class="bg-white/10 border-2 border-white/20 hover:bg-white/20 rounded-sm p-4 transition-all text-left"
							>
								<div class="font-bold">Search Customers</div>
								<div class="text-sm text-white/70 mt-1">Find and manage</div>
							</button>
							<button
								class="bg-white/10 border-2 border-white/20 hover:bg-white/20 rounded-sm p-4 transition-all text-left"
							>
								<div class="font-bold">Email Templates</div>
								<div class="text-sm text-white/70 mt-1">Preview & edit</div>
							</button>
							<button
								class="bg-white/10 border-2 border-white/20 hover:bg-white/20 rounded-sm p-4 transition-all text-left"
							>
								<div class="font-bold">Launch Kiosk</div>
								<div class="text-sm text-white/70 mt-1">Scan QR codes</div>
							</button>
							<button
								class="bg-white/10 border-2 border-white/20 hover:bg-white/20 rounded-sm p-4 transition-all text-left"
							>
								<div class="font-bold">Test QR Code</div>
								<div class="text-sm text-white/70 mt-1">Generate test</div>
							</button>
						</div>
					</div>

					<div class="text-center">
						<Button onclick={nextStep}>Complete Demo →</Button>
					</div>
				</div>
			{:else if currentStep === 'complete'}
				<!-- Demo Complete -->
				<div class="max-w-3xl mx-auto text-center space-y-8">
					<div class="text-8xl">🎉</div>
					<h2 class="text-6xl font-extrabold tracking-tight text-[#1A1816]">Demo Complete!</h2>
					<p class="text-2xl text-[#5C5A56]">
						You've experienced the complete Frontier Meals platform journey
					</p>

					<Card variant="concrete" class="p-8">
						<h3 class="text-2xl font-extrabold tracking-tight text-[#1A1816] mb-6">
							What You Saw
						</h3>
						<div class="grid md:grid-cols-2 gap-4 text-left">
							<div class="flex items-start gap-3">
								<div
									class="w-8 h-8 bg-[#52A675] border-2 border-[#52A675]/70 text-white rounded-sm flex items-center justify-center flex-shrink-0"
								>
									<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
									</svg>
								</div>
								<div>
									<p class="font-bold text-[#1A1816]">Stripe Integration</p>
									<p class="text-sm text-[#5C5A56]">Secure subscription checkout</p>
								</div>
							</div>
							<div class="flex items-start gap-3">
								<div
									class="w-8 h-8 bg-[#52A675] border-2 border-[#52A675]/70 text-white rounded-sm flex items-center justify-center flex-shrink-0"
								>
									<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
									</svg>
								</div>
								<div>
									<p class="font-bold text-[#1A1816]">Telegram Bot</p>
									<p class="text-sm text-[#5C5A56]">Automated onboarding</p>
								</div>
							</div>
							<div class="flex items-start gap-3">
								<div
									class="w-8 h-8 bg-[#52A675] border-2 border-[#52A675]/70 text-white rounded-sm flex items-center justify-center flex-shrink-0"
								>
									<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
									</svg>
								</div>
								<div>
									<p class="font-bold text-[#1A1816]">QR Code System</p>
									<p class="text-sm text-[#5C5A56]">Daily code generation</p>
								</div>
							</div>
							<div class="flex items-start gap-3">
								<div
									class="w-8 h-8 bg-[#52A675] border-2 border-[#52A675]/70 text-white rounded-sm flex items-center justify-center flex-shrink-0"
								>
									<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
									</svg>
								</div>
								<div>
									<p class="font-bold text-[#1A1816]">Kiosk Scanner</p>
									<p class="text-sm text-[#5C5A56]">Real-time validation</p>
								</div>
							</div>
							<div class="flex items-start gap-3">
								<div
									class="w-8 h-8 bg-[#52A675] border-2 border-[#52A675]/70 text-white rounded-sm flex items-center justify-center flex-shrink-0"
								>
									<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
									</svg>
								</div>
								<div>
									<p class="font-bold text-[#1A1816]">Skip Management</p>
									<p class="text-sm text-[#5C5A56]">Calendar-based skipping</p>
								</div>
							</div>
							<div class="flex items-start gap-3">
								<div
									class="w-8 h-8 bg-[#52A675] border-2 border-[#52A675]/70 text-white rounded-sm flex items-center justify-center flex-shrink-0"
								>
									<svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
										<path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
									</svg>
								</div>
								<div>
									<p class="font-bold text-[#1A1816]">Admin Dashboard</p>
									<p class="text-sm text-[#5C5A56]">Live metrics & activity</p>
								</div>
							</div>
						</div>
					</Card>

					<div class="flex gap-4 justify-center">
						<Button onclick={restartDemo} size="lg" class="px-12">
							↻ Watch Again
						</Button>
						<Button onclick={() => (window.location.href = '/')} variant="outline" size="lg" class="px-12">
							Go to Live Site
						</Button>
					</div>

					<p class="text-sm text-[#8E8C87]">
						Questions? Contact <a
							href="https://t.me/noahchonlee"
							class="text-[#E67E50] hover:text-[#D97F3E] underline font-medium"
							>@noahchonlee</a
						> on Telegram
					</p>
				</div>
			{/if}
		</div>
	</main>

	<!-- Navigation Controls -->
	{#if currentStep !== 'intro' && currentStep !== 'complete'}
		<div class="fixed bottom-6 left-1/2 -translate-x-1/2 z-50">
			<div class="bg-[#1A1816] border-2 border-[#E67E50] rounded-sm shadow-2xl px-6 py-3 flex gap-3">
				<button
					onclick={prevStep}
					class="px-4 py-2 bg-[#E8E6E1] hover:bg-[#D9D7D2] text-[#1A1816] font-bold rounded-sm border-2 border-[#D9D7D2] transition-all"
				>
					← Back
				</button>
				<button
					onclick={nextStep}
					class="px-4 py-2 bg-[#E67E50] hover:bg-[#D97F3E] text-white font-bold rounded-sm border-2 border-[#D97F3E] transition-all"
				>
					Next →
				</button>
			</div>
		</div>
	{/if}
</div>

<style>
	@keyframes scan-demo {
		0%,
		100% {
			transform: translateY(-100%);
		}
		50% {
			transform: translateY(100%);
		}
	}

	.animate-scan-demo {
		animation: scan-demo 2s linear infinite;
	}

	@keyframes scale-in {
		0% {
			transform: scale(0);
			opacity: 0;
		}
		50% {
			transform: scale(1.1);
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}

	.animate-scale-in {
		animation: scale-in 0.6s ease-out;
	}
</style>
