<script lang="ts">
  import type { PageData } from './$types';
  import {
    HeroSection,
    CommunityGallery,
    HowItWorks,
    FoodShowcase,
    BenefitsGrid,
    SocialProof,
    FinalCTA,
    Container,
    Text,
  } from '$lib/components/landing';

  let { data }: { data: PageData } = $props();

  let loading = $state(false);
  let error = $state('');

  // Format price string from server data
  const priceString = `$${data.defaultPlanPrice}/${data.billingCycle}`;

  function handleScrollToCheckout() {
    // Smooth scroll to checkout section
    document.getElementById('checkout')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }

  function handleLearnMore() {
    // Smooth scroll to how-it-works section, centered in viewport
    document.getElementById('how-it-works')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center'
    });
  }

  async function handleCheckout(reservationId?: string) {
    loading = true;
    error = '';

    try {
      const body: { reservation_id?: string } = {};
      if (reservationId) {
        body.reservation_id = reservationId;
      }

      const response = await fetch('/api/paypal/create-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (data.approvalUrl) {
        window.location.href = data.approvalUrl;
      } else {
        error = data.error || 'Failed to create subscription';
      }
    } catch (err) {
      error = 'An error occurred. Please try again.';
      console.error(err);
    } finally {
      loading = false;
    }
  }

  function handleContact() {
    // Open Telegram contact
    window.open('https://t.me/noahchonlee', '_blank');
  }
</script>

<svelte:head>
  <title>Frontier Meals - Healthy Lunch Subscription at Frontier Tower</title>
  <meta name="description" content="Healthy lunches delivered daily to Frontier Tower. Subscribe once, show up at noon, and enjoy community dining or grab and go." />
</svelte:head>

<div class="min-h-screen bg-[#F5F3EF]">
  <!-- Skip Link for Keyboard Navigation -->
  <a
    href="#main-content"
    class="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-50 focus:px-4 focus:py-2 focus:bg-[#E67E50] focus:text-white focus:rounded-md focus:font-bold cursor-pointer"
  >
    Skip to main content
  </a>

  <!-- Error Banner (if any) -->
  {#if error}
    <div class="fixed top-0 left-0 right-0 z-50 bg-[#C85454] text-white py-3 px-4 text-center">
      <Container>
        <p class="text-sm font-medium">{error}</p>
      </Container>
    </div>
  {/if}

  <!-- Main Content -->
  <main id="main-content">
    <!-- Hero: Identity + Value Proposition -->
    <HeroSection onSubscribe={handleScrollToCheckout} onLearnMore={handleLearnMore} />

    <!-- Community: Emotional resonance + Social proof -->
    <CommunityGallery />

    <!-- How It Works: Mental model + Flexibility (merged) -->
    <div id="how-it-works">
      <HowItWorks />
    </div>

    <!-- Food: Sensory appeal + Quality signal -->
    <FoodShowcase />

    <!-- Benefits: Rational justification -->
    <BenefitsGrid />

    <!-- Social Proof: Trust + Belonging -->
    <SocialProof />

    <!-- Final CTA: Decision capture with Commitment Threshold -->
    <FinalCTA
      onCheckout={handleCheckout}
      onContact={handleContact}
      {loading}
      price={priceString}
    />
  </main>

  <!-- Footer -->
  <footer class="bg-[#1A1816] py-8">
    <Container>
      <div class="text-center space-y-2">
        <Text color="inverse" size="sm" align="center" as="p">
          © 2025 Frontier Meals. Serving Frontier Tower weekdays at noon.
        </Text>
        <Text color="tertiary" size="sm" align="center" as="p">
          Questions? Message <a href="https://t.me/noahchonlee" class="text-[#E67E50] hover:underline focus:outline-none focus:ring-2 focus:ring-[#E67E50] focus:ring-offset-2 focus:ring-offset-[#1A1816] rounded cursor-pointer" aria-label="Contact Noah on Telegram" data-sveltekit-preload-data="false">@noahchonlee</a> on Telegram
        </Text>
        <Text color="tertiary" size="sm" align="center" as="p">
          <a href="/terms-and-privacy" class="text-[#8E8C87] hover:text-[#E67E50] hover:underline focus:outline-none focus:ring-2 focus:ring-[#E67E50] focus:ring-offset-2 focus:ring-offset-[#1A1816] rounded cursor-pointer transition-colors duration-150">Terms & Privacy</a>
        </Text>
      </div>
    </Container>
  </footer>
</div>
