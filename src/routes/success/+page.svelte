<script lang="ts">
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';
  import Card from '$lib/components/ui/card.svelte';

  let { data } = $props();

  // Extract deep link token from URL
  let deepLinkToken = $derived($page.url.searchParams.get('t'));
  let deepLink = $derived(deepLinkToken ? `https://t.me/frontiermealsbot?start=${deepLinkToken}` : '');

  let copied = $state(false);

  // Discount information
  let discountInfo = $state<{
    code?: string;
    savings?: number;
    savingsPercent?: number;
    originalPrice?: number;
    finalPrice?: number;
  } | null>(null);

  function copyLink() {
    if (deepLink) {
      navigator.clipboard.writeText(deepLink);
      copied = true;
      setTimeout(() => copied = false, 2000);
    }
  }

  onMount(() => {
    if (browser) {
      try {
        const saved = sessionStorage.getItem('discount_reservation');
        if (saved) {
          const parsed = JSON.parse(saved);
          discountInfo = {
            code: parsed.code,
            savings: parsed.savings,
            savingsPercent: parsed.discount?.percent_off,
            originalPrice: parsed.original_price,
            finalPrice: parsed.plan?.price
          };
          // Clear after reading (one-time display)
          sessionStorage.removeItem('discount_reservation');
        }
      } catch (e) {
        console.error('Error reading discount info:', e);
      }
    }
  });
</script>

<div class="min-h-screen bg-[#F5F3EF] frontier-texture flex items-center justify-center px-4 py-8">
  <Card variant="concrete" class="max-w-2xl w-full p-8">
    <div class="text-center space-y-6">
      <!-- Success Icon -->
      <div class="w-16 h-16 bg-[#52A675] border-2 border-[#52A675]/70 rounded-sm flex items-center justify-center mx-auto shadow-lg">
        <svg class="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
        </svg>
      </div>

      <!-- Header -->
      <div>
        <h1 class="text-3xl font-extrabold tracking-tight text-[#1A1816] mb-2">Welcome to Frontier Meals! 🍽️</h1>
        <p class="text-[#5C5A56]">We're setting up your subscription now.</p>
      </div>

      {#if discountInfo}
        <!-- Discount Confirmation -->
        <div class="bg-[#d1fae5] border-2 border-[#059669]/30 rounded-sm p-6 space-y-3">
          <div class="flex items-center justify-center gap-2 mb-2">
            <svg class="w-5 h-5 text-[#059669]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
            </svg>
            <h3 class="font-extrabold tracking-tight text-[#1A1816] text-lg">Discount Applied!</h3>
          </div>

          <div class="bg-white/80 rounded-sm border border-[#059669]/20 p-4 space-y-2">
            <div class="flex items-center justify-center gap-2">
              <span class="text-sm text-[#5C5A56]">Code:</span>
              <span class="font-mono font-bold text-[#1A1816] text-lg">{discountInfo.code}</span>
            </div>

            {#if discountInfo.savings && discountInfo.savings > 0}
              <div class="text-center pt-2 border-t border-[#059669]/10">
                <p class="text-sm text-[#5C5A56] mb-1">You saved</p>
                <p class="text-2xl font-extrabold text-[#059669]">
                  ${discountInfo.savings.toFixed(2)}
                  {#if discountInfo.savingsPercent}
                    <span class="text-base font-bold">({discountInfo.savingsPercent}% off)</span>
                  {/if}
                </p>
                {#if discountInfo.finalPrice}
                  <p class="text-sm text-[#5C5A56] mt-2">
                    Your price: <span class="font-bold text-[#1A1816]">${discountInfo.finalPrice.toFixed(2)}/month</span>
                  </p>
                {/if}
              </div>
            {/if}
          </div>
        </div>
      {/if}

      {#if deepLink}
        <!-- Telegram Connection Box -->
        <div class="bg-[#3b82f6]/5 border-2 border-[#3b82f6]/20 rounded-sm p-6 space-y-4">
          <h2 class="font-extrabold tracking-tight text-[#1A1816] text-xl">📱 Next Step: Connect Telegram</h2>

          <p class="text-[#5C5A56]">
            Click the button below to connect your Telegram account and start receiving daily meal QR codes.
          </p>

          <!-- Deep Link Display -->
          <div class="bg-white border-2 border-[#D9D7D2] rounded-sm p-3">
            <code class="text-xs text-[#5C5A56] break-all font-mono">{deepLink}</code>
          </div>

          <!-- Action Buttons -->
          <div class="flex gap-3">
            <a
              href={deepLink}
              target="_blank"
              rel="noopener noreferrer"
              class="flex-1 bg-gradient-to-r from-[#3b82f6] to-[#06b6d4] text-white font-bold py-3 px-6 rounded-sm hover:from-[#2563eb] hover:to-[#0891b2] transition-all shadow-lg hover:shadow-xl text-center border-2 border-[#3b82f6]/50"
            >
              Open Telegram Bot →
            </a>
            <button
              onclick={copyLink}
              class="bg-[#E8E6E1] hover:bg-[#D9D7D2] text-[#1A1816] font-bold py-3 px-6 rounded-sm transition-all border-2 border-[#D9D7D2]"
            >
              {copied ? '✓ Copied!' : 'Copy Link'}
            </button>
          </div>

          <p class="text-xs text-[#5C5A56]">
            💡 <strong>Tip:</strong> This link is valid for 7 days. We've also sent it to your email as a backup.
          </p>
        </div>
      {/if}

      <!-- What Happens Next -->
      <div class="bg-[#E8E6E1] border-2 border-[#D9D7D2] rounded-sm p-6 text-left space-y-4">
        <h2 class="font-bold tracking-tight text-[#1A1816]">What happens next?</h2>

        <ol class="space-y-3">
          <li class="flex items-start">
            <span class="flex-shrink-0 w-6 h-6 bg-[#E67E50] border-2 border-[#D97F3E] text-white rounded-sm flex items-center justify-center text-sm font-bold mr-3">1</span>
            <div>
              <p class="font-bold text-[#1A1816]">Connect your Telegram account</p>
              <p class="text-sm text-[#5C5A56]">Click the button above to link your account</p>
            </div>
          </li>

          <li class="flex items-start">
            <span class="flex-shrink-0 w-6 h-6 bg-[#E8C547] border-2 border-[#E8C547]/50 text-[#1A1816] rounded-sm flex items-center justify-center text-sm font-bold mr-3">2</span>
            <div>
              <p class="font-bold text-[#1A1816]">Complete onboarding in Telegram</p>
              <p class="text-sm text-[#5C5A56]">Select your dietary preferences and allergies</p>
            </div>
          </li>

          <li class="flex items-start">
            <span class="flex-shrink-0 w-6 h-6 bg-[#E67E50] border-2 border-[#D97F3E] text-white rounded-sm flex items-center justify-center text-sm font-bold mr-3">3</span>
            <div>
              <p class="font-bold text-[#1A1816]">Receive your daily QR code</p>
              <p class="text-sm text-[#5C5A56]">Every day at 12 PM PT via email</p>
            </div>
          </li>

          <li class="flex items-start">
            <span class="flex-shrink-0 w-6 h-6 bg-[#E8C547] border-2 border-[#E8C547]/50 text-[#1A1816] rounded-sm flex items-center justify-center text-sm font-bold mr-3">4</span>
            <div>
              <p class="font-bold text-[#1A1816]">Pick up your meal</p>
              <p class="text-sm text-[#5C5A56]">Scan your QR code at any kiosk before 11:59 PM PT</p>
            </div>
          </li>
        </ol>
      </div>

      {#if !deepLink}
        <!-- Fallback if no token in URL -->
        <div class="bg-[#fef3c7] border-2 border-[#f59e0b]/30 rounded-sm p-4">
          <p class="text-sm text-[#92400e]">
            <strong>Check your email</strong> for your Telegram connection link, or contact <a href="https://t.me/noahchonlee" class="underline">@noahchonlee</a> for help.
          </p>
        </div>
      {/if}

      <!-- Help Text -->
      <div class="pt-4">
        <p class="text-sm text-[#5C5A56]">
          Need help? Message <a href="https://t.me/noahchonlee" class="text-[#E67E50] hover:text-[#D97F3E] underline font-medium">@noahchonlee</a> on Telegram
        </p>
      </div>
    </div>
  </Card>
</div>
