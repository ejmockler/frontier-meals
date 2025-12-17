<script lang="ts">
  import Button from '$lib/components/ui/button.svelte';
  import Card from '$lib/components/ui/card.svelte';

  let loading = $state(false);
  let error = $state('');

  async function handleSubscribe() {
    loading = true;
    error = '';

    try {
      const response = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const data = await response.json();

      if (data.url) {
        window.location.href = data.url;
      } else {
        error = 'Failed to create checkout session';
      }
    } catch (err) {
      error = 'An error occurred. Please try again.';
      console.error(err);
    } finally {
      loading = false;
    }
  }
</script>

<div class="min-h-screen bg-[#F5F3EF] frontier-texture flex flex-col">
  <!-- Header -->
  <header class="py-6 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto flex justify-between items-center">
      <h1 class="text-2xl font-extrabold tracking-tight text-[#1A1816]">Frontier Meals</h1>
      <a
        href="/demo"
        class="px-4 py-2 bg-[#E8E6E1] hover:bg-[#D9D7D2] text-[#1A1816] font-bold text-sm rounded-sm border-2 border-[#D9D7D2] transition-all"
      >
        View Demo
      </a>
    </div>
  </header>

  <!-- Hero Section -->
  <main class="flex-1 flex items-center justify-center px-4 sm:px-6 lg:px-8">
    <div class="max-w-3xl w-full space-y-8">
      <div class="text-center">
        <h2 class="text-5xl font-extrabold tracking-tight text-[#1A1816] mb-4">
          Fresh meals,<br />delivered daily
        </h2>
        <p class="text-xl text-[#5C5A56] mb-8">
          Subscribe to Frontier Meals and pick up your fresh, chef-prepared meal every day.
          Skip anytime via Telegram.
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
              <div class="flex-shrink-0 w-6 h-6 rounded-sm bg-[#E67E50] border-2 border-[#D97F3E] flex items-center justify-center mt-0.5">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p class="ml-3 text-[#1A1816] font-medium">Daily QR code for kiosk pickup</p>
            </div>
            <div class="flex items-start">
              <div class="flex-shrink-0 w-6 h-6 rounded-sm bg-[#E8C547] border-2 border-[#E8C547]/50 flex items-center justify-center mt-0.5">
                <svg class="w-4 h-4 text-[#1A1816]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p class="ml-3 text-[#1A1816] font-medium">Manage preferences via Telegram bot</p>
            </div>
            <div class="flex items-start">
              <div class="flex-shrink-0 w-6 h-6 rounded-sm bg-[#E67E50] border-2 border-[#D97F3E] flex items-center justify-center mt-0.5">
                <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p class="ml-3 text-[#1A1816] font-medium">Skip days you won't need a meal</p>
            </div>
            <div class="flex items-start">
              <div class="flex-shrink-0 w-6 h-6 rounded-sm bg-[#E8C547] border-2 border-[#E8C547]/50 flex items-center justify-center mt-0.5">
                <svg class="w-4 h-4 text-[#1A1816]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" stroke-width="3" d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <p class="ml-3 text-[#1A1816] font-medium">Dietary preferences supported</p>
            </div>
          </div>

          {#if error}
            <div class="rounded-sm bg-[#C85454]/10 border-2 border-[#C85454]/50 p-4">
              <p class="text-sm text-[#C85454] font-medium">{error}</p>
            </div>
          {/if}

          <Button
            onclick={handleSubscribe}
            disabled={loading}
            size="lg"
            class="w-full"
          >
            {loading ? 'Loading...' : 'Subscribe Now'}
          </Button>

          <p class="text-xs text-[#5C5A56] text-center">
            By subscribing, you agree to receive daily QR codes via email and manage your subscription through Telegram.
          </p>
        </div>
      </Card>

      <div class="text-center space-y-3">
        <p class="text-sm text-[#5C5A56]">
          Want to see how it works? <a href="/demo" class="text-[#E67E50] hover:text-[#D97F3E] underline font-bold">Try the interactive demo →</a>
        </p>
        <p class="text-sm text-[#5C5A56]">
          Questions? Message <a href="https://t.me/noahchonlee" class="text-[#E67E50] hover:text-[#D97F3E] underline font-medium">@noahchonlee</a> on Telegram
        </p>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="py-6 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto text-center text-sm text-[#8E8C87]">
      © 2025 Frontier Meals. All rights reserved.
    </div>
  </footer>
</div>
